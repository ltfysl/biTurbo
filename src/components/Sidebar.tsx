import {
  LayoutGrid,
  Brain,
  FolderGit2,
  Share2,
  Bot,
  Settings as SettingsIcon,
  Check,
  Trash2,
  FileSearch,
  Plus,
} from "lucide-react";
import { useApp, useConfirm, useContextMenu } from "../lib/store";
import { api } from "../lib/api";
import type { ContextMenuItem } from "./ContextMenu";
import clsx from "clsx";
import { friendlyError } from "../lib/format";
// (#351) Tag manager (rename/merge/delete across project) and command-palette entry point pending.


const nav = [
  { id: "overview", label: "Overview", icon: LayoutGrid },
  { id: "memories", label: "Memories", icon: Brain },
  { id: "projects", label: "Projects", icon: FolderGit2 },
  { id: "graph", label: "Graph", icon: Share2 },
  { id: "agents", label: "Agents", icon: Bot },
  { id: "settings", label: "Settings", icon: SettingsIcon },
] as const;

export function Sidebar() {
  const view = useApp((s) => s.view);
  const setView = useApp((s) => s.setView);
  const agents = useApp((s) => s.agents);
  // Narrow subscription: only subscribe to total_memories, not the entire stats object.
  const totalMem = useApp((s) => s.stats?.total_memories ?? 0);
  const totalProjects = useApp((s) => s.stats?.total_projects ?? 0);

  const dayAgo = 24 * 60 * 60 * 1000;
  const recentAgents = agents.filter((a) => Date.now() - a.last_seen < dayAgo).length;
  const dotColor = recentAgents > 0 ? "bg-success" : "bg-text-dim";

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-border-subtle bg-surface/40">
      {/* Brand */}
      <div className="flex h-24 items-center gap-10 border-b border-border-subtle px-4">
        <Logo />
        <div className="leading-tight">
          <div className="font-serif text-lg font-medium text-text">biTurbo</div>
          <div className="text-[11px] uppercase tracking-widest text-text-dim">
            memory layer
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto p-2">
        {nav.map((item) => {
          const Icon = item.icon;
          const active = view === item.id;
          return (
          <button
            key={item.id}
            onClick={() => setView(item.id as never)}
            aria-current={active ? "page" : undefined}
            title={item.label}
            className={clsx(
              "flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm transition",
              active
                ? "bg-accent-soft text-text"
                : "text-text-muted hover:bg-surface-2 hover:text-text"
            )}
          >
            <Icon
              size={15}
              className={active ? "text-accent" : "text-text-dim"}
            />
            <span className="flex-1 text-left">{item.label}</span>
          </button>
          );
        })}

        {/* Projects sub-list */}
        <div className="mt-6 px-3">
          <div className="mb-2 flex items-center justify-between text-[11px] uppercase tracking-widest text-text-dim">
            <span>Projects</span>
            <div className="flex items-center gap-1.5">
              <span className="font-mono text-text-dim">{totalProjects}</span>
              <button
                onClick={() => setView("projects")}
                className="rounded p-0.5 text-text-dim hover:bg-surface-2 hover:text-text"
                title="New project"
                aria-label="New project"
              >
                <Plus size={12} />
              </button>
            </div>
          </div>
          <ProjectList />
        </div>
      </nav>

      {/* Footer */}
      <div className="border-t border-border-subtle p-3">
        <div className="flex items-center gap-2 rounded-md bg-surface-2 px-3 py-2">
          <span className="relative flex h-2 w-2">
            {/* Static status dot — no infinite pulse so it does not imply a live backend connection (#18). */}
            <span className={clsx("relative inline-flex h-2 w-2 rounded-full", dotColor)} />
          </span>
          <div className="flex-1 text-xs">
            <div className="font-medium text-text">
              {recentAgents} agent{recentAgents === 1 ? "" : "s"} today
            </div>
            <div className="text-text-dim">{totalMem.toLocaleString()} memories</div>
          </div>
        </div>
      </div>
    </aside>
  );
}

function Logo() {
  return (
    <img
      src="/logo.png"
      alt="biTurbo"
      className="h-7 w-7 shrink-0 object-cover"
    />
  );
}

function ProjectList() {
  const projects = useApp((s) => s.projects);
  const currentProjectId = useApp((s) => s.currentProjectId);
  const setCurrentProjectId = useApp((s) => s.setCurrentProjectId);
  const setView = useApp((s) => s.setView);
  const showToast = useApp((s) => s.showToast);
  const refreshProjects = useApp((s) => s.refreshProjects);
  const refreshStats = useApp((s) => s.refreshStats);
  const refreshGraph = useApp((s) => s.refreshGraph);
  const showMenu = useContextMenu();
  const confirm = useConfirm();
  // (#194) Sidebar project toasts (ingest, delete) always use the project name, never the raw id.

  async function ingestNow(projectId: string, rootPath: string, name: string) {
    try {
      const job = await api.startIngest(projectId, rootPath);
      useApp.getState().registerIngestJob(projectId, job.id);
      showToast({ kind: "ok", text: `Indexing ${name}…` });
    } catch (e) {
      showToast({ kind: "err", text: friendlyError(e) });
    }
  }

// (#61) Deleting the active project falls back to the first remaining project.
  async function deleteProject(id: string, name: string) {
    const ok = await confirm({
      title: `Delete project "${name}"?`,
      body: (
        <>
          All memories and the code index for <b>{name}</b> will be
          permanently removed. This cannot be undone.
        </>
      ),
      confirmLabel: "Delete project",
    });
    if (!ok) return;
    try {
      await api.deleteProject(id);
      // Switch away from a deleted project before refreshing so scoped
      // views and filters never operate on a dead id.
      if (id === currentProjectId) {
        const remaining = projects.filter((p) => p.id !== id);
        const fallback = remaining.find((p) => p.id === "default")?.id ?? remaining[0]?.id ?? "default";
        setCurrentProjectId(fallback);
      }
      await Promise.all([refreshProjects(), refreshStats(), refreshGraph().catch(() => {})]);
      showToast({ kind: "ok", text: `Deleted ${name}` });
    } catch (e) {
      showToast({ kind: "err", text: friendlyError(e) });
    }
  }

  function buildMenu(
    e: React.MouseEvent,
    p: { id: string; name: string; root_path: string | null },
  ) {
    e.preventDefault();
    e.stopPropagation();
    const items: ContextMenuItem[] = [
      {
        label: "Set as current",
        icon: <Check size={12} />,
        disabled: p.id === currentProjectId,
        onClick: () => setCurrentProjectId(p.id),
      },
      {
        label: "Open memories",
        icon: <Brain size={12} />,
        onClick: () => {
          setCurrentProjectId(p.id);
          setView("memories");
        },
      },
      {
        label: "Ingest now",
        icon: <FileSearch size={12} />,
        disabled: !p.root_path,
        onClick: () => p.root_path && void ingestNow(p.id, p.root_path, p.name),
      },
      { label: "", separator: true, onClick: () => {} },
      {
        label: "Delete",
        icon: <Trash2 size={12} />,
        danger: true,
        disabled: p.id === "default",
        onClick: () => void deleteProject(p.id, p.name),
      },
    ];
    showMenu(e.clientX, e.clientY, items);
  }

  return (
    <div className="space-y-0.5">
      {projects.map((p) => {
        const active = p.id === currentProjectId;
        return (
          <button
            key={p.id}
            onClick={() => {
              setCurrentProjectId(p.id);
            }}
            onContextMenu={(e) => buildMenu(e, p)}
            className={clsx(
              "group flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs transition",
              active
                ? "bg-surface-2 text-text"
                : "text-text-muted hover:bg-surface-2/60 hover:text-text"
            )}
          >
            <span
              className={clsx(
                "h-1.5 w-1.5 rounded-full",
                active ? "bg-accent" : "bg-text-dim group-hover:bg-text-muted"
              )}
            />
            <span className="flex-1 truncate">{p.name}</span>
            <span className="font-mono text-[11px] text-text-dim">
              {p.memory_count}
            </span>
          </button>
        );
      })}
    </div>
  );
}
