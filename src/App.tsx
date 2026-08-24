import { useCallback, useEffect, useState } from "react";
import { useApp, type View } from "./lib/store";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
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
import { ErrorBoundary } from "./components/ErrorBoundary";

// Batch 5: issues #102, #104, #106, #108-#109, #121-#134, #164-#172, #201-#203, #247-#248.
// Implemented in this commit: #104, #106, #109, #131, #165-#166, #167, #169, #201.
// Already addressed in this branch: #102, #122-#130, #132-#133, #168, #170-#172, #202, #247-#248.
// Referenced for follow-up: #108 (tray lifecycle), #121 (full i18n), #134, #164, #170 (virtualization), #203 (CSS palette).
// Batch 5: issues #249-#278 — addressed or referenced in this commit.
// Implemented in this branch: #249 (#523 area), #250, #251, #254, #259, #264, #268, #273, #278.
// Referenced for follow-up: #252-#253, #255-#258, #260-#263, #265-#267, #269-#277.
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

  // (#109) Tray / background consolidate feedback is surfaced through toasts.
  useEffect(() => {
    const unlisteners: UnlistenFn[] = [];
    void (async () => {
      unlisteners.push(
        await listen("consolidate:done", (ev) => {
          const report = ev.payload as { merged?: number; superseded?: number } | undefined;
          const detail = report
            ? ` · ${(report.merged ?? 0) + (report.superseded ?? 0)} memories changed`
            : "";
          useApp.getState().showToast({ kind: "ok", text: `Consolidation complete${detail}` });
        }),
      );
      unlisteners.push(
        await listen("consolidate:error", (ev) => {
          const msg = typeof ev.payload === "string" ? ev.payload : "Consolidation failed";
          useApp.getState().showToast({ kind: "err", text: msg });
        }),
      );
    })();
    return () => {
      for (const u of unlisteners) u();
    };
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
          {view === "overview" && (
            <ErrorBoundary name="Overview">
              <Overview />
            </ErrorBoundary>
          )}
          {view === "memories" && (
            <ErrorBoundary name="Memories">
              <Memories />
            </ErrorBoundary>
          )}
          {view === "projects" && (
            <ErrorBoundary name="Projects">
              <Projects />
            </ErrorBoundary>
          )}
          {view === "graph" && (
            <ErrorBoundary name="Graph">
              <Graph />
            </ErrorBoundary>
          )}
          {view === "agents" && (
            <ErrorBoundary name="Agents">
              <Agents />
            </ErrorBoundary>
          )}
          {view === "settings" && (
            <ErrorBoundary name="Settings">
              <Settings />
            </ErrorBoundary>
          )}
        </main>
      </div>
      <QuickAdd />
      <Toast />
      <ConfirmModalHost />
      <ContextMenuHost />
    </div>
  );
}
