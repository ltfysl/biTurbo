//! biTurbo — local-first memory layer for AI coding agents.
// Issue #394: expose backend/frontend logs and health diagnostics in UI/CLI.
// Issue #393: add Criterion benchmarks for cold-start, recall, ingest, consolidate.
// Issue #295: Config file support (config.toml) for runtime knobs.

// Issue #337: Content Security Policy hardening in tauri.conf.json (policy already set).
//!
//! Architecture
//! ────────────
//! ┌─────────────────────────────────────────────────────────────┐
//! │  Tauri 2 desktop app  (this crate)                          │
//! │   ├── commands::*        — IPC handlers (GUI ↔ backend)     │
//! │   ├── mcp                 — MCP stdio server for AI agents   │
//! │   ├── memory             — CRUD over memory entries         │
//! │   ├── project            — multi-project isolation          │
//! │   ├── index_engine       — turbovec IdMapIndex wrapper      │
//! │   ├── embed              — fastembed (BGE) embeddings       │
//! │   ├── ingest             — tree-sitter project indexing     │
//! │   ├── consolidate        — decay / dedup / merge            │
//!
//! Data lives in the OS app-data dir (~/Library/Application Support/com.biturbo.app/
//! on macOS, %APPDATA%\com.biturbo.app on Windows, ~/.local/share/com.biturbo.app on
//! Linux). Both the GUI and the MCP server share the same on-disk state.

pub const APP_DIR_NAME: &str = "com.biturbo.app";

pub mod application;
pub mod commands;
pub mod consolidate;
pub mod db;
pub mod embed;
pub mod error;
pub mod index_engine;
pub mod ingest;
pub mod io;
pub mod mcp;
pub mod memory;
pub mod operations;
pub mod persistence;
pub mod project;
pub mod recall;
pub mod scheduler;
pub mod smoke;
pub mod state;
pub mod tray;

pub use error::{BiError, BiResult};
pub use state::AppState;

use std::sync::Arc;
use tauri::Manager;
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons};
use tracing::info;
use tracing_subscriber::fmt::layer;
use tracing_subscriber::layer::SubscriberExt;
use tracing_subscriber::util::SubscriberInitExt;

fn init_logging(data_dir: &std::path::Path) {
    let log_dir = data_dir.join("logs");
    std::fs::create_dir_all(&log_dir).ok();

    let file_appender = tracing_appender::rolling::daily(&log_dir, "biturbo.log");
    let (non_blocking, _guard) = tracing_appender::non_blocking(file_appender);
    // Leak the guard so the non-blocking writer stays alive for the process lifetime.
    std::mem::forget(_guard);

    let env_filter = tracing_subscriber::EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| "biturbo_lib=info,tauri=info".into());

    tracing_subscriber::registry()
        .with(env_filter)
        .with(
            layer()
                .compact()
                .with_target(false)
                .with_writer(std::io::stderr),
        )
        .with(
            layer()
                .compact()
                .with_target(true)
                .with_writer(non_blocking),
        )
        .init();
}

fn show_error_and_exit<R: tauri::Runtime>(app: &tauri::App<R>, msg: String) -> ! {
    let handle = app.handle().clone();
    std::thread::spawn(move || {
        handle
            .dialog()
            .message(msg)
            .buttons(MessageDialogButtons::Ok)
            .blocking_show();
    })
    .join()
    .ok();
    std::process::exit(1);
}

// (#26) Single-instance guard: try to lock a pid file before starting another process.
fn try_acquire_single_instance_lock() -> Option<std::fs::File> {
    let data_dir = match dirs::data_dir() {
        Some(d) => d.join(crate::APP_DIR_NAME),
        None => {
            tracing::error!("no data dir");
            return None;
        }
    };
    std::fs::create_dir_all(&data_dir).ok();
    let lock_path = data_dir.join("biturbo.instance.lock");
    let lock = match std::fs::OpenOptions::new()
        .create(true)
        .truncate(false)
        .write(true)
        .open(&lock_path)
    {
        Ok(f) => f,
        Err(e) => {
            tracing::error!(
                "cannot open instance lock at {}: {}",
                lock_path.display(),
                e
            );
            return None;
        }
    };
    let acquired = match fs4::fs_std::FileExt::try_lock_exclusive(&lock) {
        Ok(acquired) => acquired,
        Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
            tracing::error!("biTurbo is already running");
            return None;
        }
        Err(e) => {
            tracing::error!("cannot lock instance lock: {}", e);
            return None;
        }
    };
    if !acquired {
        tracing::error!("biTurbo is already running");
        return None;
    }
    Some(lock)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let _instance_guard: Option<std::fs::File> = if cfg!(desktop) {
        let guard = try_acquire_single_instance_lock();
        if guard.is_none() {
            return;
        }
        guard
    } else {
        None
    };

    let run_result = tauri::Builder::default()
        .plugin(tauri_plugin_autostart::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            #[cfg(desktop)]
            app.handle()
                .plugin(tauri_plugin_updater::Builder::new().build())?;
            tray::setup(app)?;

            let data_dir = match app.path().app_data_dir() {
                Ok(d) => d,
                Err(e) => {
                    show_error_and_exit(app, format!("cannot resolve app data directory: {e}"))
                }
            };
            std::fs::create_dir_all(&data_dir).ok();

            init_logging(&data_dir);

            std::panic::set_hook(Box::new(|info| {
                let message = format!("{}", info);
                tracing::error!("panic: {message}");
                eprintln!("panic: {message}");
            }));

            info!("biTurbo starting…");

            // (#25) Corrupted/locked SQLite currently exits; a recovery screen with backup options is pending.
            let mut state = match AppState::open(&data_dir) {
                Ok(s) => s,
                Err(e) => show_error_and_exit(app, format!("cannot open biTurbo state: {e}")),
            };
            state.app = Some(app.handle().clone());
            let state_arc = Arc::new(state);
            scheduler::spawn(state_arc.clone());
            if let Err(error) = operations::resume_pending(state_arc.clone()) {
                tracing::error!("failed to resume pending operations: {error}");
            }
            io::resume_watches(&state_arc);
            app.manage((*state_arc).clone());
            info!("biTurbo ready @ {}", data_dir.display());
            Ok(())
        })
        .on_window_event(tray::on_window_event)
        .invoke_handler(tauri::generate_handler![
            commands::ping,
            commands::list_memories,
            commands::get_memory,
            commands::remember,
            commands::forget_memory,
            commands::update_memory,
            commands::search_memories,
            commands::recall_explain,
            commands::submit_recall_feedback,
            commands::list_projects,
            commands::create_project,
            commands::delete_project,
            commands::ensure_project_marker_files,
            commands::get_project,
            commands::start_ingest,
            commands::ingest_multiple_projects,
            commands::operation_status,
            commands::list_operations,
            commands::cancel_operation,
            commands::retry_operation,
            commands::get_project_graph,
            commands::list_tags,
            commands::consolidate_now,
            commands::consolidate_status,
            commands::import_folder,
            commands::export_memories,
            commands::set_watch,
            commands::watch_status,
            commands::set_project_embed_model,
            commands::stats,
            commands::list_agents,
            commands::register_agent,
            commands::recent_activity,
            commands::open_file,
            commands::reveal_file,
            commands::bootstrap,
            commands::resolve_mcp_binary_path,
            commands::install_mcp_config,
            commands::mcp_config_status,
            commands::check_for_updates,
            commands::install_update,
        ])
        .run(tauri::generate_context!());

    if let Err(error) = run_result {
        tracing::error!("error while running tauri application: {error}");
        std::process::exit(1);
    }
}
