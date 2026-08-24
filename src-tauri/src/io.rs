use crate::db::log_activity;
use crate::error::{BiError, BiResult};
use crate::state::AppState;
use ignore::WalkBuilder;
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;
use std::time::Instant;
use tracing;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ImportResult {
    pub files_imported: usize,
    pub memories_created: usize,
    pub errors: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ExportResult {
    pub memories_written: usize,
    pub output_path: String,
}

pub fn import_folder(state: &AppState, project_id: &str, root: &Path) -> BiResult<ImportResult> {
    let mut result = ImportResult::default();
    let conn = state.db.conn()?;

    let files: Vec<PathBuf> = WalkBuilder::new(root)
        .standard_filters(true)
        .git_ignore(true)
        .git_global(true)
        .hidden(false)
        .build()
        .filter_map(|r| r.ok())
        .filter(|e| e.path().is_file())
        .filter_map(|e| {
            let p = e.path().to_path_buf();
            let ext = p.extension()?.to_str()?;
            if matches!(
                ext.to_ascii_lowercase().as_str(),
                "md" | "markdown" | "txt" | "org"
            ) {
                Some(p)
            } else {
                None
            }
        })
        .collect();

    for path in &files {
        let rel = path
            .strip_prefix(root)
            .unwrap_or(path)
            .to_string_lossy()
            .to_string();
        let Ok(source) = std::fs::read_to_string(path) else {
            // Surface unreadable/non-UTF-8 files instead of skipping silently (#240).
            result.errors.push(format!("{rel}: unreadable"));
            continue;
        };
        let abs_path = path.to_string_lossy().to_string();
        let ext = path.extension().and_then(|s| s.to_str()).unwrap_or("md");
        let chunks = chunk_markdown(&source);
        let mut file_ok = false;
        for (i, chunk_text) in chunks.into_iter().enumerate() {
            if chunk_text.trim().is_empty() {
                continue;
            }
            // Dedup key: file_path + exact content (#240). Re-importing a
            // folder must not duplicate every memory nor re-embed them.
            let exists = conn
                .query_row(
                    "SELECT 1 FROM memories WHERE project_id = ?1 AND file_path = ?2 AND content = ?3 LIMIT 1",
                    rusqlite::params![project_id, &abs_path, chunk_text],
                    |_| Ok(()),
                )
                .is_ok();
            if exists {
                file_ok = true;
                continue;
            }
            let input = crate::memory::RememberInput {
                content: chunk_text,
                mem_type: Some("fact".to_string()),
                project_id: Some(project_id.to_string()),
                tags: Some(vec!["imported".to_string(), format!("md:{ext}")]),
                importance: Some(0.5),
                source_agent: Some("import_folder".to_string()),
                file_path: Some(abs_path.clone()),
                ..Default::default()
            };
            match crate::memory::remember(state, input) {
                Ok(_) => {
                    result.memories_created += 1;
                    file_ok = true;
                }
                Err(e) => result.errors.push(format!("{rel} chunk {i}: {e}")),
            }
        }
        // Count the file only when at least one chunk succeeded (#240).
        if file_ok {
            result.files_imported += 1;
        }
    }

    state.db.write(|tx| {
        log_activity(
            tx,
            Some(project_id),
            Some("import_folder"),
            "import",
            None,
            Some(&serde_json::json!({
                "files": result.files_imported,
                "memories": result.memories_created,
            })),
        )?;
        Ok(())
    })?;

    Ok(result)
}

fn chunk_markdown(content: &str) -> Vec<String> {
    let mut chunks: Vec<String> = Vec::new();
    let mut current = String::new();
    let mut current_len = 0usize;
    const MAX_CHUNK: usize = 1500;

    for line in content.lines() {
        if (line.starts_with("# ") || line.starts_with("## ") || line.starts_with("### "))
            && !current.trim().is_empty()
        {
            chunks.push(current.trim().to_string());
            current.clear();
            current_len = 0;
        }
        current.push_str(line);
        current.push('\n');
        current_len += line.len() + 1;
        if current_len > MAX_CHUNK {
            chunks.push(current.trim().to_string());
            current.clear();
            current_len = 0;
        }
    }
    if !current.trim().is_empty() {
        chunks.push(current.trim().to_string());
    }
    if chunks.is_empty() && !content.is_empty() {
        chunks.push(content.to_string());
    }
    chunks
}

pub fn export_memories(
    state: &AppState,
    project_id: Option<&str>,
    output_path: &Path,
) -> BiResult<ExportResult> {
    // Confine exports beneath the app data dir (#481, cf. #418): callers must
    // not be able to create or clobber arbitrary user-writable files.
    let exports_dir = state.data_dir.join("exports");
    std::fs::create_dir_all(&exports_dir)
        .map_err(|e| BiError::Io(format!("create exports dir: {e}")))?;
    let output_path: PathBuf = if output_path.is_absolute() {
        if !output_path.starts_with(&exports_dir) {
            return Err(BiError::Invalid(
                "output_path must stay within the application exports directory".into(),
            ));
        }
        output_path.to_path_buf()
    } else {
        if output_path
            .components()
            .any(|c| matches!(c, std::path::Component::ParentDir))
        {
            return Err(BiError::Invalid("output_path must not contain '..'".into()));
        }
        exports_dir.join(output_path)
    };
    let mems = crate::memory::list(state, project_id, None, 1_000_000, 0)?;
    if let Some(parent) = output_path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| BiError::Io(format!("create {}: {e}", parent.display())))?;
    }
    let file = std::fs::File::create(&output_path)
        .map_err(|e| BiError::Io(format!("create {}: {e}", output_path.display())))?;
    let payload = serde_json::json!({
        "version": env!("CARGO_PKG_VERSION"),
        "exported_at": chrono::Utc::now().timestamp_millis(),
        "project_id": project_id,
        "memories": mems,
    });
    serde_json::to_writer_pretty(file, &payload)
        .map_err(|e| BiError::Io(format!("serialize export: {e}")))?;
    Ok(ExportResult {
        memories_written: mems.len(),
        output_path: output_path.to_string_lossy().to_string(),
    })
}

pub fn set_project_embed_model(
    state: &AppState,
    project_id: &str,
    model: Option<&str>,
) -> BiResult<()> {
    crate::operations::start_model_rebuild(state, project_id, model)?;
    Ok(())
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct WatchStatus {
    pub enabled_projects: usize,
    pub watching: Vec<String>,
}

#[derive(Default)]
struct WatchState {
    running: bool,
    queued: bool,
    last_ingest: Option<Instant>,
}

type WatchHandle = Arc<Mutex<Option<notify::RecommendedWatcher>>>;
type WatchJobState = Arc<Mutex<WatchState>>;
static WATCHERS: once_cell::sync::Lazy<
    parking_lot::RwLock<std::collections::HashMap<String, (WatchHandle, WatchJobState)>>,
> = once_cell::sync::Lazy::new(|| parking_lot::RwLock::new(std::collections::HashMap::new()));

pub fn enable_watch(state: &AppState, project_id: &str, root: &Path) -> BiResult<()> {
    let now = chrono::Utc::now().timestamp_millis();
    state.db.write(|tx| {
        tx.execute(
            "UPDATE projects SET watch_enabled = 1, updated_at = ?1 WHERE id = ?2",
            rusqlite::params![now, project_id],
        )?;
        Ok(())
    })?;
    if let Err(e) = spawn_watcher(state, project_id, root) {
        // Roll back the persisted flag so a broken watcher is not treated as
        // watched forever (#235).
        let reverted = chrono::Utc::now().timestamp_millis();
        let _ = state.db.write(|tx| {
            tx.execute(
                "UPDATE projects SET watch_enabled = 0, updated_at = ?1 WHERE id = ?2",
                rusqlite::params![reverted, project_id],
            )?;
            Ok(())
        });
        return Err(e);
    }
    Ok(())
}

pub fn disable_watch(_state: &AppState, project_id: &str) -> BiResult<()> {
    let now = chrono::Utc::now().timestamp_millis();
    _state.db.write(|tx| {
        tx.execute(
            "UPDATE projects SET watch_enabled = 0, updated_at = ?1 WHERE id = ?2",
            rusqlite::params![now, project_id],
        )?;
        Ok(())
    })?;
    WATCHERS.write().remove(project_id);
    Ok(())
}

pub fn watch_status() -> WatchStatus {
    let g = WATCHERS.read();
    let watching: Vec<String> = g.keys().cloned().collect();
    WatchStatus {
        enabled_projects: watching.len(),
        watching,
    }
}

/// Minimum interval between watcher-triggered ingests (#242): during builds or
/// checkouts events arrive continuously and the old queued-flag ping-pong ran
/// back-to-back full project ingests.
const WATCH_INGEST_COOLDOWN: Duration = Duration::from_secs(5);

/// Filter raw notify event paths through VCS/ignore rules (#242).
fn watch_paths_relevant(
    gitignore: &Option<ignore::gitignore::Gitignore>,
    root: &Path,
    paths: &[PathBuf],
) -> bool {
    if paths.is_empty() {
        return true;
    }
    paths.iter().any(|p| {
        if p.components()
            .any(|c| matches!(c.as_os_str().to_str(), Some(".git") | Some(".jj")))
        {
            return false;
        }
        if let Some(gi) = gitignore {
            let rel = p.strip_prefix(root).unwrap_or(p);
            if matches!(gi.matched(rel, p.is_dir()), ignore::Match::Ignore(_)) {
                return false;
            }
        }
        true
    })
}

fn spawn_watcher(state: &AppState, project_id: &str, root: &Path) -> BiResult<()> {
    let project_id_owned = project_id.to_string();
    let root_owned = root.to_path_buf();
    let state_for_cb: Arc<AppState> = Arc::new(state.clone());
    let job_state: WatchJobState = Arc::new(Mutex::new(WatchState::default()));
    let job_state_for_cb = job_state.clone();

    let pid_for_event = project_id_owned.clone();
    let root_for_event = root_owned.clone();
    let state_for_event = state_for_cb.clone();

    let mut gitignore_builder = ignore::gitignore::GitignoreBuilder::new(&root_owned);
    let _ = gitignore_builder.add(root_owned.join(".gitignore"));
    let _ = gitignore_builder.add(root_owned.join(".biturboignore"));
    let gitignore = gitignore_builder.build().ok();

    let mut watcher =
        match notify::recommended_watcher(move |res: notify::Result<notify::Event>| {
            let Ok(event) = res else { return };
            if !matches!(
                event.kind,
                notify::EventKind::Create(_)
                    | notify::EventKind::Modify(_)
                    | notify::EventKind::Remove(_)
            ) {
                return;
            }
            if !watch_paths_relevant(&gitignore, &root_for_event, &event.paths) {
                return;
            }

            let mut state = job_state_for_cb.lock();
            if state.running {
                state.queued = true;
                return;
            }
            if state
                .last_ingest
                .is_some_and(|t| t.elapsed() < WATCH_INGEST_COOLDOWN)
            {
                state.queued = true;
                return;
            }
            state.running = true;
            drop(state);

            let state_clone = state_for_event.clone();
            let pid = pid_for_event.clone();
            let root = root_for_event.clone();
            let job_state_for_task = job_state_for_cb.clone();
            // Full ingests are heavy (tree-sitter + ONNX): run them on the
            // blocking pool instead of parking a tokio worker thread (#234).
            // Detached on purpose; dropping the JoinHandle explicitly keeps
            // clippy's let_underscore_future quiet about the ignored future.
            std::mem::drop(tauri::async_runtime::spawn_blocking(move || {
                std::thread::sleep(Duration::from_secs(2));
                let started = Instant::now();
                if let Err(e) =
                    crate::operations::run_watch_ingest_blocking(&state_clone, &pid, &root)
                {
                    tracing::error!("watcher ingest for '{}' failed: {e}", pid);
                }
                let mut state = job_state_for_task.lock();
                state.running = false;
                state.last_ingest = Some(started);
                if state.queued {
                    state.queued = false;
                    state.running = true;
                    drop(state);
                    let elapsed = started.elapsed();
                    if elapsed < WATCH_INGEST_COOLDOWN {
                        std::thread::sleep(WATCH_INGEST_COOLDOWN - elapsed);
                    }
                    if let Err(e) =
                        crate::operations::run_watch_ingest_blocking(&state_clone, &pid, &root)
                    {
                        tracing::error!("watcher ingest for '{}' failed: {e}", pid);
                    }
                    let mut state = job_state_for_task.lock();
                    state.running = false;
                    state.last_ingest = Some(Instant::now());
                }
            }));
        }) {
            Ok(w) => w,
            Err(e) => {
                return Err(BiError::Io(format!(
                    "create watcher for '{project_id}': {e}"
                )));
            }
        };

    use notify::Watcher;
    watcher
        .watch(root, notify::RecursiveMode::Recursive)
        .map_err(|e| BiError::Io(format!("watch {}: {e}", root.display())))?;
    WATCHERS.write().insert(
        project_id_owned,
        (Arc::new(Mutex::new(Some(watcher))), job_state),
    );
    Ok(())
}

pub fn resume_watches(state: &AppState) {
    let Ok(conn) = state.db.conn() else {
        return;
    };
    let Ok(mut stmt) = conn.prepare(
        "SELECT id, root_path FROM projects WHERE watch_enabled = 1 AND root_path IS NOT NULL",
    ) else {
        return;
    };
    let rows: Vec<(String, String)> = stmt
        .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))
        .ok()
        .map(|it| it.filter_map(|x| x.ok()).collect())
        .unwrap_or_default();
    for (id, root) in rows {
        if !WATCHERS.read().contains_key(&id) {
            if let Err(e) = spawn_watcher(state, &id, Path::new(&root)) {
                tracing::error!("failed to resume watcher for '{id}': {e}");
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::project;

    fn temp_data_dir() -> PathBuf {
        std::env::temp_dir().join(format!("biturbo-io-test-{}", uuid::Uuid::new_v4()))
    }

    #[test]
    fn importing_folder_counts_each_memory_once() {
        let data_dir = temp_data_dir();
        let root = data_dir.join("notes");
        std::fs::create_dir_all(&root).unwrap();
        std::fs::write(root.join("one.md"), "# Durable note\nOnly one chunk.").unwrap();
        let state = AppState::open(&data_dir).unwrap();

        let imported = import_folder(&state, &state.default_project_id, &root).unwrap();
        let p = project::get(&state, &state.default_project_id).unwrap();
        assert_eq!(p.memory_count as usize, imported.memories_created);

        std::fs::remove_dir_all(data_dir).ok();
    }

    #[test]
    fn disabling_watch_persists_across_state_reopen() {
        let data_dir = temp_data_dir();
        let root = data_dir.join("watched");
        std::fs::create_dir_all(&root).unwrap();
        let state = AppState::open(&data_dir).unwrap();
        let project_id = state.default_project_id.clone();

        enable_watch(&state, &project_id, &root).unwrap();
        assert!(project::get(&state, &project_id).unwrap().watch_enabled);
        disable_watch(&state, &project_id).unwrap();
        assert!(!project::get(&state, &project_id).unwrap().watch_enabled);

        let reopened = AppState::open(&data_dir).unwrap();
        assert!(!project::get(&reopened, &project_id).unwrap().watch_enabled);
        std::fs::remove_dir_all(data_dir).ok();
    }
}
