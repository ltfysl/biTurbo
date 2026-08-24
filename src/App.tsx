import { useCallback, useEffect, useState } from "react";
import { useApp, type View } from "./lib/store";
import { Sidebar } from "./components/Sidebar";
import { TopBar } from "./components/TopBar";
import { QuickAdd } from "./components/QuickAdd";
import { Overview } from "./views/Overview";
import { Memories } from "./views/Memories";
import { Projects } from "./views/Projects";
import { Graph } from "./views/Graph";
import { Agents } from "./views/Agents";
import { Settings } from "./views/Settings";
import { Toast } from "./components/Toast";
import { ConfirmModalHost } from "./components/ConfirmModal";
import { ContextMenuHost } from "./components/ContextMenu";

// (#24) Drag-and-drop file/folder handling is pending Tauri drag-drop events.
export default function App() {
  const view = useApp((s) => s.view);
  const currentProjectId = useApp((s) => s.currentProjectId);
  const showToast = useApp((s) => s.showToast);
  const [ready, setReady] = useState(false);
  const [bootError, setBootError] = useState<string | null>(null);

  const bootstrapOnce = useApp((s) => s.bootstrapOnce);
  const refreshMemories = useApp((s) => s.refreshMemories);
  const refreshTags = useApp((s) => s.refreshTags);
  const refreshGraph = useApp((s) => s.refreshGraph);

  // Single batched IPC call on mount — replaces 7 sequential calls.
  const boot = useCallback(async () => {
    setReady(false);
    setBootError(null);
    try {
      await bootstrapOnce();
    } catch (e) {
      setBootError(e instanceof Error ? e.message : String(e));
    } finally {
      setReady(true);
    }
  }, [bootstrapOnce]);

  useEffect(() => {
    void boot();
  }, [boot]);

  // Re-fetch project-scoped data when the active project changes.
  useEffect(() => {
    if (!ready) return;
    refreshMemories().catch((e) => showToast({ kind: "err", text: `Failed to load memories: ${e}` }));
    refreshTags().catch(() => {});
    refreshGraph().catch(() => {});
  }, [currentProjectId, ready, refreshMemories, refreshTags, refreshGraph]);

  // Global keyboard (#16): number keys 1-6 switch views; mod+K opens QuickAdd; mod+/ focuses search.
  useEffect(() => {
    const viewOrder: View[] = ["overview", "memories", "projects", "graph", "agents", "settings"];
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      const editing = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key === "k") {
        e.preventDefault();
        useApp.getState().setQuickAddOpen(true);
      } else if (meta && e.key === "/") {
        e.preventDefault();
        const st = useApp.getState();
        if (st.view !== "memories") {
          st.setView("memories");
        }
        window.setTimeout(() => {
          document.getElementById("global-search")?.focus();
        }, 0);
      } else if (e.key === "Escape") {
        useApp.getState().setQuickAddOpen(false);
      } else if (!editing && !meta && !e.altKey && e.key >= "1" && e.key <= "6") {
        useApp.getState().setView(viewOrder[parseInt(e.key, 10) - 1]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!ready) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4">
        <img src="/logo.png" alt="biTurbo" className="h-14 w-14 animate-pulse object-cover" />
        <div className="font-serif text-lg text-text">biTurbo</div>
        <div
          className="h-1 w-32 overflow-hidden rounded-full bg-surface-2"
          role="progressbar"
          aria-label="Loading biTurbo"
        >
          <div className="h-full w-1/3 animate-pulse rounded-full bg-accent" />
        </div>
        <div className="text-xs text-text-muted">Loading your memory layer…</div>
      </div>
    );
  }

  if (bootError) {
    return (
      <div className="flex h-screen items-center justify-center p-8">
        <div className="card w-full max-w-md p-6 text-center">
          <div className="font-serif text-lg text-text">biTurbo could not load your data</div>
          <p className="mt-2 text-sm text-text-muted">
            The local database did not respond. Your memories are safe on disk — retry, or
            check the log file in the data folder if this keeps happening.
          </p>
          <pre className="mt-3 overflow-x-auto rounded-md border border-border-subtle bg-surface-2 p-3 text-left font-mono text-xs text-text-muted">
            {bootError}
          </pre>
          <button onClick={() => void boot()} className="btn-primary mt-4">
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-bg text-text">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar />
        <main className="flex-1 overflow-y-auto">
          {view === "overview" && <Overview />}
          {view === "memories" && <Memories />}
          {view === "projects" && <Projects />}
          {view === "graph" && <Graph />}
          {view === "agents" && <Agents />}
          {view === "settings" && <Settings />}
        </main>
      </div>
      <QuickAdd />
      <Toast />
      <ConfirmModalHost />
      <ContextMenuHost />
    </div>
  );
}
