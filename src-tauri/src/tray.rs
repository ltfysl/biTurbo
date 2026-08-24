//! System tray: show/hide main window, live stats, consolidate, open data
//! folder, quit, and hide-on-close.

use std::time::Duration;

use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, Runtime,
};

use tauri_plugin_dialog::{DialogExt, MessageDialogButtons};
use tauri_plugin_updater::UpdaterExt;

use crate::state::AppState;

const TRAY_ID: &str = "main-tray";
const MENU_SHOW: &str = "tray_show";
const MENU_HIDE: &str = "tray_hide";
const MENU_QUIT: &str = "tray_quit";
const MENU_CONSOLIDATE: &str = "tray_consolidate";
const MENU_OPEN_DATA: &str = "tray_open_data";
const MENU_STATS_MEMORIES: &str = "tray_stats_memories";
const MENU_STATS_PROJECTS: &str = "tray_stats_projects";
const MENU_STATS_AGENTS: &str = "tray_stats_agents";
const MENU_VERSION: &str = "tray_version";
const MENU_CHECK_UPDATES: &str = "tray_check_updates";

pub fn setup(app: &tauri::App<tauri::Wry>) -> tauri::Result<()> {
    // — Stats (disabled info items, updated by background thread) —
    let stat_memories =
        MenuItem::with_id(app, MENU_STATS_MEMORIES, "Memories: —", false, None::<&str>)?;
    let stat_projects =
        MenuItem::with_id(app, MENU_STATS_PROJECTS, "Projects: —", false, None::<&str>)?;
    let stat_agents = MenuItem::with_id(app, MENU_STATS_AGENTS, "Agents: —", false, None::<&str>)?;
    let version_label = format!("v{}", env!("CARGO_PKG_VERSION"));
    let version = MenuItem::with_id(app, MENU_VERSION, &version_label, false, None::<&str>)?;
    let check_updates = MenuItem::with_id(
        app,
        MENU_CHECK_UPDATES,
        "Check for Updates…",
        true,
        None::<&str>,
    )?;

    let sep1 = PredefinedMenuItem::separator(app)?;

    // — Window controls —
    let show = MenuItem::with_id(app, MENU_SHOW, "Show biTurbo", true, None::<&str>)?;
    let hide = MenuItem::with_id(app, MENU_HIDE, "Hide", true, None::<&str>)?;

    let sep2 = PredefinedMenuItem::separator(app)?;

    // — Actions —
    let consolidate =
        MenuItem::with_id(app, MENU_CONSOLIDATE, "Consolidate Now", true, None::<&str>)?;
    let open_data = MenuItem::with_id(app, MENU_OPEN_DATA, "Open Data Folder", true, None::<&str>)?;

    let sep3 = PredefinedMenuItem::separator(app)?;

    // — Quit —
    let quit = MenuItem::with_id(app, MENU_QUIT, "Quit", true, None::<&str>)?;

    let menu = Menu::with_items(
        app,
        &[
            &stat_memories,
            &stat_projects,
            &stat_agents,
            &sep1,
            &show,
            &hide,
            &sep2,
            &consolidate,
            &open_data,
            &sep3,
            &version,
            &check_updates,
            &quit,
        ],
    )?;

    let icon = app
        .default_window_icon()
        .cloned()
        .ok_or_else(|| tauri::Error::FailedToReceiveMessage)?;

    let _tray = TrayIconBuilder::<tauri::Wry>::with_id(TRAY_ID)
        .icon(icon)
        .menu(&menu)
        .tooltip("biTurbo")
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            MENU_SHOW => show_main_window(app),
            MENU_HIDE => hide_main_window(app),
            MENU_CONSOLIDATE => {
                if let Some(state) = app.try_state::<AppState>() {
                    let _ = crate::scheduler::enqueue(state.inner(), None);
                }
            }
            MENU_OPEN_DATA => {
                if let Some(state) = app.try_state::<AppState>() {
                    open_data_folder(&state.data_dir);
                }
            }
            MENU_VERSION => { /* disabled info item */ }
            MENU_CHECK_UPDATES => {
                let app = app.clone();
                tauri::async_runtime::spawn(async move {
                    let res = async {
                        let updater = app.updater().map_err(|e| e.to_string())?;
                        let update = updater.check().await.map_err(|e| e.to_string())?;
                        Ok::<_, String>(update)
                    }
                    .await;

                    match res {
                        Ok(Some(update)) => {
                            let version = update.version.clone();
                            let install_app = app.clone();
                            app.dialog()
                                .message(format!("biTurbo {} is available. Install now?", version))
                                .buttons(MessageDialogButtons::YesNo)
                                .show(move |ok| {
                                    if ok {
                                        tauri::async_runtime::spawn(async move {
                                            let _ = async {
                                                let updater = install_app
                                                    .updater()
                                                    .map_err(|e| e.to_string())?;
                                                let update = updater
                                                    .check()
                                                    .await
                                                    .map_err(|e| e.to_string())?;
                                                if let Some(update) = update {
                                                    update
                                                        .download_and_install(
                                                            |_event, _progress| {},
                                                            || {},
                                                        )
                                                        .await
                                                        .map_err(|e| e.to_string())?;
                                                    install_app.restart();
                                                }
                                                Ok::<_, String>(())
                                            }
                                            .await;
                                        });
                                    }
                                });
                        }
                        Ok(None) => {
                            app.dialog()
                                .message("biTurbo is up to date.")
                                .buttons(MessageDialogButtons::Ok)
                                .show(|_| {});
                        }
                        Err(e) => {
                            app.dialog()
                                .message(format!("Update check failed: {e}"))
                                .buttons(MessageDialogButtons::Ok)
                                .show(|_| {});
                        }
                    }
                });
            }
            MENU_QUIT => {
                let app = app.clone();
                let active = app
                    .try_state::<AppState>()
                    .and_then(|s| crate::operations::list(s.inner(), 100).ok())
                    .map(|ops| ops.iter().any(|o| o.status == "running"))
                    .unwrap_or(false);
                if active {
                    let confirm_app = app.clone();
                    app.dialog()
                        .message("A background job is running. Quit anyway?")
                        .buttons(MessageDialogButtons::YesNo)
                        .show(move |ok| {
                            if ok {
                                confirm_app.exit(0);
                            }
                        });
                } else {
                    app.exit(0);
                }
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                toggle_main_window(tray.app_handle());
            }
        })
        .build(app)?;

    // Spawn a background thread that refreshes the stat items and tooltip
    // every 30 seconds. AppState is managed *after* tray::setup returns, so
    // the first iteration(s) will simply skip until the state is available.
    let app_handle = app.handle().clone();
    let stat_mem = stat_memories.clone();
    let stat_proj = stat_projects.clone();
    let stat_ag = stat_agents.clone();
    std::thread::Builder::new()
        .name("biturbo-tray-stats".into())
        .spawn(move || loop {
            // Poll immediately each iteration; if the app state is not yet
            // available after launch, retry in 1 s so the menu does not stay
            // on "—" for the full 30 s interval (#111).
            let (memories, projects, agents) = {
                let Some(state) = app_handle.try_state::<AppState>() else {
                    std::thread::sleep(Duration::from_secs(1));
                    continue;
                };
                let Ok(conn) = state.db.conn() else {
                    std::thread::sleep(Duration::from_secs(1));
                    continue;
                };
                let memories: i64 = conn
                    .query_row("SELECT COUNT(*) FROM memories", [], |r| r.get(0))
                    .unwrap_or(0);
                let projects: i64 = conn
                    .query_row("SELECT COUNT(*) FROM projects", [], |r| r.get(0))
                    .unwrap_or(0);
                let agents: i64 = conn
                    .query_row("SELECT COUNT(*) FROM agents", [], |r| r.get(0))
                    .unwrap_or(0);
                (memories, projects, agents)
            };

            let _ = stat_mem.set_text(format!("Memories: {memories}"));
            let _ = stat_proj.set_text(format!("Projects: {projects}"));
            let _ = stat_ag.set_text(format!("Agents: {agents}"));

            if let Some(tray) = app_handle.tray_by_id(TRAY_ID) {
                let _ = tray.set_tooltip(Some(format!(
                    "biTurbo — {memories} memories · {projects} projects · {agents} agents"
                )));
            }

            std::thread::sleep(Duration::from_secs(30));
        })
        .ok();

    Ok(())
}

pub fn on_window_event<R: Runtime>(window: &tauri::Window<R>, event: &tauri::WindowEvent) {
    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
        let _ = window.hide();
        api.prevent_close();
    }
}

fn show_main_window<R: Runtime>(app: &tauri::AppHandle<R>) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

fn hide_main_window<R: Runtime>(app: &tauri::AppHandle<R>) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.hide();
    }
}

fn toggle_main_window<R: Runtime>(app: &tauri::AppHandle<R>) {
    if let Some(window) = app.get_webview_window("main") {
        let visible = window.is_visible().unwrap_or(false);
        let focused = window.is_focused().unwrap_or(false);
        if visible && focused {
            let _ = window.hide();
        } else {
            let _ = window.show();
            let _ = window.unminimize();
            let _ = window.set_focus();
        }
    }
}

fn open_data_folder(path: &std::path::Path) {
    let _ = if cfg!(target_os = "windows") {
        std::process::Command::new("explorer").arg(path).spawn()
    } else if cfg!(target_os = "macos") {
        std::process::Command::new("open").arg(path).spawn()
    } else {
        std::process::Command::new("xdg-open").arg(path).spawn()
    };
}
