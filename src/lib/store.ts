import { create } from "zustand";
import type {
  Memory,
  Project,
  Stats,
  AgentEntry,
  ActivityEntry,
  GraphData,
  IngestProgress,
  MultiIngestDone,
} from "./types";

import { api } from "./api";
import { friendlyError } from "./format";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { ConfirmOptions } from "../components/ConfirmModal";
import type { ContextMenuItem } from "../components/ContextMenu";

// (#296) startIngest/cancelIngest removed from the store; views call ingest APIs directly.
export type View = "overview" | "memories" | "projects" | "graph" | "agents" | "settings";
export type Theme = "dark" | "light" | "system";

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastEntry {
  id: number;
  kind: "ok" | "err" | "info";
  text: string;
  action?: ToastAction;
}

let toastSeq = 0;

interface AppStore {
  view: View;
  setView: (v: View) => void;

  theme: Theme;
  setTheme: (t: Theme) => void;
  toggleTheme: () => void;

  projects: Project[];
  currentProjectId: string;
  setCurrentProjectId: (id: string) => void;
  refreshProjects: () => Promise<void>;

  agents: AgentEntry[];
  refreshAgents: () => Promise<void>;

  stats: Stats | null;
  refreshStats: () => Promise<void>;

  activity: ActivityEntry[];
  refreshActivity: () => Promise<void>;

  searchQuery: string;
  setSearchQuery: (q: string) => void;
  /** Type picked on Overview; Memories consumes and clears it. */
  pendingTypeFilter: string | null;
  setTypeFilter: (t: string | null) => void;

  tags: [string, number][];
  refreshTags: () => Promise<void>;

  memories: Memory[];
  selectedMemoryUid: string | null;
  setSelectedMemoryUid: (uid: string | null) => void;
  /** Full record for a selected uid that is not present in any loaded list. */
  hydratedSelected: Memory | null;
  selectMemoryByUid: (uid: string) => Promise<void>;
  memoryOffset: number;
  hasMoreMemories: boolean;
// (#31) memoriesLoading flag prevents the empty state from flashing before the first fetch completes.
  memoriesLoading: boolean;
  isLoadingMore: boolean;
  loadMoreMemories: () => Promise<void>;
  refreshMemories: () => Promise<void>;

  quickAddOpen: boolean;
  setQuickAddOpen: (open: boolean) => void;

  toasts: ToastEntry[];
  showToast: (t: { kind: "ok" | "err" | "info"; text: string; action?: ToastAction }) => void;
  dismissToast: (id: number) => void;

  graph: GraphData | null;
  refreshGraph: () => Promise<void>;

  ingestJobs: Record<string, IngestProgress>;
  /** project_id → backend job id, captured at ingest start for cancellation. */
  ingestJobIds: Record<string, string>;
  registerIngestJob: (project_id: string, job_id: string) => void;

  bootstrapLoaded: boolean;
  bootstrapOnce: () => Promise<void>;

  confirmState: ConfirmOptions | null;
  confirm: (opts: ConfirmOptions) => Promise<boolean>;
  resolveConfirm: () => void;
  cancelConfirm: () => void;

  contextMenu: { x: number; y: number; items: ContextMenuItem[] } | null;
  showContextMenu: (x: number, y: number, items: ContextMenuItem[]) => void;
  closeContextMenu: () => void;
}
// (#301) Per-slice idle|loading|ready|error status layer pending beyond
// memoriesLoading and bootstrapLoaded; views currently improvise skeletons.


const THEME_KEY = "biturbo.theme";
const VIEW_KEY = "biturbo.view";
const PROJECT_KEY = "biturbo.currentProjectId";

function readStoredTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  try {
    const v = window.localStorage.getItem(THEME_KEY);
    if (v === "light" || v === "dark" || v === "system") return v;
  } catch {
    /* ignore */
  }
  // Default follows the OS; the UI will treat an unset value as "System".
  return "system";
}

function applyThemeToDom(t: Theme) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const isLight = t === "light" || (t === "system" && window.matchMedia("(prefers-color-scheme: light)").matches);
  if (isLight) root.classList.add("light");
  else root.classList.remove("light");
  root.style.colorScheme = isLight ? "light" : "dark";
}

const VIEWS: View[] = ["overview", "memories", "projects", "graph", "agents", "settings"];

function readStoredView(): View {
  if (typeof window === "undefined") return "overview";
  try {
    const v = window.localStorage.getItem(VIEW_KEY);
    if (v && VIEWS.includes(v as View)) return v as View;
  } catch {
    /* ignore */
  }
  return "overview";
}

function readStoredProject(): string {
  if (typeof window === "undefined") return "default";
  try {
    const v = window.localStorage.getItem(PROJECT_KEY);
    if (v) return v;
  } catch {
    /* ignore */
  }
  return "default";
}

export const useApp = create<AppStore>((set, get) => ({
  view: readStoredView(),
  setView: (v) => {
    try { window.localStorage.setItem(VIEW_KEY, v); } catch { /* ignore */ }
    set({ view: v });
  },

  theme: readStoredTheme(),
  setTheme: (t) => {
    try {
      if (t === "system") {
        window.localStorage.removeItem(THEME_KEY);
      } else {
        window.localStorage.setItem(THEME_KEY, t);
      }
    } catch {
      /* ignore */
    }
    applyThemeToDom(t);
    set({ theme: t });
  },
  toggleTheme: () => {
    const order: Theme[] = ["dark", "light", "system"];
    const next = order[(order.indexOf(get().theme) + 1) % order.length];
    get().setTheme(next);
  },

  projects: [],
  currentProjectId: readStoredProject(),
  setCurrentProjectId: (id) => {
    try { window.localStorage.setItem(PROJECT_KEY, id); } catch { /* ignore */ }
    set({ currentProjectId: id, selectedMemoryUid: null });
  },
  refreshProjects: async () => {
    const projects = await api.listProjects();
    set({ projects });
    // If the active project no longer exists (e.g. just deleted), fall
    // back to a surviving project so scoped views don't keep filtering
    // by a dead id.
    const current = get().currentProjectId;
    if ((!current || !projects.some((p) => p.id === current)) && projects.length > 0) {
      const fallback = projects.find((p) => p.id === "default") ?? projects[0];
      set({ currentProjectId: fallback.id, selectedMemoryUid: null });
    }
  },

  agents: [],
  refreshAgents: async () => set({ agents: await api.listAgents() }),

  stats: null,
  refreshStats: async () => set({ stats: await api.stats() }),

  activity: [],
  refreshActivity: async () => set({ activity: await api.recentActivity(1000) }),
  searchQuery: "",
  setSearchQuery: (q) => set({ searchQuery: q }),
  pendingTypeFilter: null,
  setTypeFilter: (t) => set({ pendingTypeFilter: t }),


  tags: [],
  refreshTags: async () => {
    const tags = await api.listTags(get().currentProjectId);
    set({ tags });
  },

  memories: [],
  memoriesLoading: false,
  selectedMemoryUid: null,
  setSelectedMemoryUid: (uid) => set({ selectedMemoryUid: uid }),
  hydratedSelected: null,
  selectMemoryByUid: async (uid) => {
    set({ selectedMemoryUid: uid, hydratedSelected: null });
    try {
      const m = await api.getMemory(uid);
      if (get().selectedMemoryUid === uid) {
        set({ hydratedSelected: m });
      }
    } catch (e) {
      get().showToast({ kind: "err", text: friendlyError(e) });
    }
  },
  memoryOffset: 0,
  hasMoreMemories: false,
  isLoadingMore: false,
  loadMoreMemories: async () => {
    if (get().isLoadingMore) return;
    const projectId = get().currentProjectId;
    const offset = get().memoryOffset;
    set({ isLoadingMore: true });
    try {
      const batch = await api.listMemories({
        project_id: projectId,
        limit: 50,
        offset,
      });
      // Ignore stale results if the user switched projects while the page
      // was in flight.
      if (get().currentProjectId !== projectId) return;
      set((s) => {
        const combined = [...s.memories, ...batch];
        // (#165) Do not drop older cards from the top; keep the accumulated
        // list so load-more grows predictably. Memory limit is up to the
        // frontend's visible list and the user can search/filter instead.
        return {
          memories: combined,
          memoryOffset: offset + batch.length,
          hasMoreMemories: batch.length === 50,
        };
      });
    } finally {
      set({ isLoadingMore: false });
    }
  },
  refreshMemories: async () => {
    set({ memoriesLoading: true });
    try {
      const mems = await api.listMemories({
        project_id: get().currentProjectId,
        limit: 50,
        offset: 0,
      });
      set({
        memories: mems,
        memoryOffset: mems.length,
        hasMoreMemories: mems.length === 50,
      });
    } finally {
      set({ memoriesLoading: false });
    }
  },

  quickAddOpen: false,
  setQuickAddOpen: (open) => set({ quickAddOpen: open }),

  toasts: [],
  showToast: (t) => {
    const id = ++toastSeq;
    // Errors linger longer; the queue caps so bursts can't flood the UI.
    const ttl = t.kind === "err" ? 6500 : 3500;
    set((s) => ({ toasts: [...s.toasts.slice(-3), { id, ...t }] }));
    setTimeout(() => get().dismissToast(id), ttl);
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })),

  graph: null,
  refreshGraph: async () => {
    const g = await api.getProjectGraph(get().currentProjectId);
    set({ graph: g });
  },

  ingestJobs: {},
  ingestJobIds: {},
  registerIngestJob: (project_id, job_id) =>
    set((s) => ({ ingestJobIds: { ...s.ingestJobIds, [project_id]: job_id } })),

  bootstrapLoaded: false,
  bootstrapOnce: async () => {
    if (get().bootstrapLoaded) return;
    const b = await api.bootstrap();
    const projects = b.projects;
    const storedProject = get().currentProjectId;
    // (#306) Persisted last-used project is honored; first-indexed is the fallback.
    const currentProjectId = projects.some((p) => p.id === storedProject)
      ? storedProject
      : (projects.find((p) => p.indexed_count > 0)?.id ?? projects[0]?.id ?? "default");
    set({
      stats: b.stats,
      projects,
      currentProjectId,
      activity: b.recent,
      tags: b.tags,
      agents: b.agents,
      bootstrapLoaded: true,
    });
  },

  confirmState: null,
  confirm: (opts) => {
    return new Promise<boolean>((resolve) => {
      _confirmQueue.push({ opts, resolve });
      if (_confirmQueue.length === 1) {
        set({ confirmState: opts });
      }
    });
  },
  resolveConfirm: () => {
    const current = _confirmQueue.shift();
    if (current) {
      current.resolve(true);
      const next = _confirmQueue[0]?.opts ?? null;
      set({ confirmState: next });
    }
  },
  cancelConfirm: () => {
    const current = _confirmQueue.shift();
    if (current) {
      current.resolve(false);
      const next = _confirmQueue[0]?.opts ?? null;
      set({ confirmState: next });
    }
  },

  contextMenu: null,
  showContextMenu: (x, y, items) => set({ contextMenu: { x, y, items } }),
  closeContextMenu: () => set({ contextMenu: null }),
}));

// Pending confirm queue lives outside zustand state on purpose:
// if it lived in state, every confirm-related state change would
// re-render every subscriber, even those that only care about other
// state. With a queue, multiple await-confirm callers resolve in FIFO
// order and the modal only re-renders when the visible prompt changes.
const _confirmQueue: { opts: ConfirmOptions; resolve: (ok: boolean) => void }[] = [];

/**
 * Imperative confirm helper. Resolves to true on confirm, false on
 * cancel/Escape/backdrop click. Use from any component:
 *
 *   const ok = await useConfirm()({ title: "Delete?", body: "..." });
 */
export function useConfirm() {
  return useApp((s) => s.confirm);
}

export function useContextMenu() {
  return useApp((s) => s.showContextMenu);
}

if (typeof window !== "undefined") {
  applyThemeToDom(readStoredTheme());
  const unlistens: UnlistenFn[] = [];
  const schemeMq = window.matchMedia("(prefers-color-scheme: light)");
  const onSchemeChange = () => {
    if (useApp.getState().theme === "system") applyThemeToDom("system");
  };
  if (schemeMq.addEventListener) {
    schemeMq.addEventListener("change", onSchemeChange);
    unlistens.push(() => schemeMq.removeEventListener("change", onSchemeChange));
  }
  void (async () => {
    unlistens.push(
      await listen<IngestProgress>("ingest:progress", (e) => {
        const p = e.payload;
        useApp.setState((s) => ({
          ingestJobs: {
            ...s.ingestJobs,
            [p.project_id]: p,
          },
        }));
      }),
    );
    unlistens.push(
      await listen<{
        job_id: string;
        project_id: string;
        files_indexed: number;
        chunks_indexed: number;
        edges_created: number;
        elapsed_ms: number;
      }>("ingest:done", (e) => {
        const d = e.payload;
        useApp.setState((s) => ({
          ingestJobs: {
            ...s.ingestJobs,
            [d.project_id]: {
              ...s.ingestJobs[d.project_id],
              phase: "done",
              current: s.ingestJobs[d.project_id]?.total ?? 0,
            } as IngestProgress,
          },
        }));
        setTimeout(() => {
          useApp.setState((s) => {
            const { [d.project_id]: _, ...rest } = s.ingestJobs;
            return { ingestJobs: rest };
          });
        }, 1500);
        useApp.getState().showToast({
          kind: "ok",
          text: `Indexed ${d.files_indexed} files · ${d.chunks_indexed} chunks · ${Math.round(d.elapsed_ms / 100) / 10}s`,
        });
        void useApp.getState().refreshStats();
        void useApp.getState().refreshProjects();
        if (useApp.getState().currentProjectId === d.project_id) {
          void useApp.getState().refreshGraph();
        }
      }),
    );
    unlistens.push(
      await listen<MultiIngestDone>("multi-ingest:done", (e) => {
        const d = e.payload;
        useApp.getState().showToast({
          kind: "ok",
          text: `Indexed ${d.total_files_indexed} projects · ${d.total_chunks_indexed} chunks · ${Math.round(d.elapsed_ms / 100) / 10}s`,
        });
        void useApp.getState().refreshStats();
        void useApp.getState().refreshProjects();
        void useApp.getState().refreshActivity();
      }),
    );
    unlistens.push(
      await listen<{ job_id: string; project_id: string; error: string }>(
        "ingest:error",
        (e) => {
          const d = e.payload;
          setTimeout(() => {
            useApp.setState((s) => {
              const { [d.project_id]: _, ...rest } = s.ingestJobs;
              return { ingestJobs: rest };
            });
          }, 1500);
          useApp.getState().showToast({
            kind: "err",
            text: `Ingest failed: ${d.error}`,
          });
        },
      ),
    );
  })();
  window.addEventListener("beforeunload", () => unlistens.forEach((u) => u()));
}
