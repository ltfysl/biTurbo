import { useState, useMemo } from "react";
import { useApp } from "../lib/store";
import { MemoryCard } from "../components/MemoryCard";
import { Heatmap } from "../components/Heatmap";
import {
  Sparkles,
  Activity,
  Database,
  FolderGit2,
  Bot,
  ArrowUpRight,
  Pencil,
  Search,
  Trash2,
  FolderPlus,
  FolderMinus,
  Download,
  RefreshCw,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { bytes, MEM_TYPE_META, timeAgo } from "../lib/format";
import clsx from "clsx";
import { Kbd } from "../lib/kbd";
import type { ActivityEntry } from "../lib/types";

// (#345) Consolidation dashboard with duplicate review queue pending.

const DAY_MS = 24 * 3600 * 1000;

const ACTION_ICONS: Record<string, LucideIcon> = {
  read: Search,
  write: Pencil,
  forget: Trash2,
  create_project: FolderPlus,
  delete_project: FolderMinus,
  import_folder: Download,
  consolidate: RefreshCw,
};

export function Overview() {
  const stats = useApp((s) => s.stats);
  const memories = useApp((s) => s.memories);
  const activity = useApp((s) => s.activity);
  const setView = useApp((s) => s.setView);
  const setTypeFilter = useApp((s) => s.setTypeFilter);
  const currentProjectId = useApp((s) => s.currentProjectId);
  const setSelected = useApp((s) => s.setSelectedMemoryUid);
  const selectedMemoryUid = useApp((s) => s.selectedMemoryUid);
  const projects = useApp((s) => s.projects);
  const agents = useApp((s) => s.agents);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);

  const currentProject = useMemo(
    () => projects.find((p) => p.id === currentProjectId),
    [projects, currentProjectId]
  );

  const liveAgents = useMemo(
    () => agents.filter((a) => Date.now() - a.last_seen < 24 * 60 * 60 * 1000).length,
    [agents]
  );

  const recent = useMemo(
    () =>
      [...memories]
        .filter((m) => m.project_id === currentProjectId)
        .sort((a, b) => b.created_at - a.created_at)
        .slice(0, 6),
    [memories, currentProjectId]
  );

  // (#179) Build 12-week heatmap from activity; store fetches 1000 records to cover the 84-day grid.
  const heatmap = useMemo(() => {
    const days = 12 * 7;
    const now = Date.now();
    const buckets = new Array(days).fill(0);
    for (const a of activity) {
      const idx = days - 1 - Math.floor((now - a.created_at) / DAY_MS);
      if (idx >= 0 && idx < days) buckets[idx]++;
    }
    return buckets;
  }, [activity]);

  // Type breakdown
  const typeData = stats?.by_type ?? [];
  const total = Math.max(1, typeData.reduce((a, [, n]) => a + n, 0));
  const typeColors: Record<string, string> = {
    fact: "bg-[var(--type-fact-dot)]",
    decision: "bg-[var(--type-decision-dot)]",
    preference: "bg-[var(--type-preference-dot)]",
    pattern: "bg-[var(--type-pattern-dot)]",
    episode: "bg-[var(--type-episode-dot)]",
    reflection: "bg-[var(--type-reflection-dot)]",
    code: "bg-[var(--type-code-dot)]",
  };

  const recentActivity = useMemo(() => {
    const list = [...activity].sort((a, b) => b.created_at - a.created_at);
    if (selectedDay == null) return list.slice(0, 20);
    return list
      .filter((a) => a.created_at >= selectedDay && a.created_at < selectedDay + DAY_MS)
      .slice(0, 20);
  }, [activity, selectedDay]);

  const groupedActivity = useMemo(() => {
    const groups: { key: number; label: string; items: ActivityEntry[] }[] = [];
    for (const e of recentActivity) {
      const dayKey = Math.floor(e.created_at / DAY_MS);
      const last = groups[groups.length - 1];
      if (!last || last.key !== dayKey) {
        const label = new Date(dayKey * DAY_MS).toLocaleDateString(undefined, {
          weekday: "long",
          month: "short",
          day: "numeric",
        });
        groups.push({ key: dayKey, label, items: [e] });
      } else {
        last.items.push(e);
      }
    }
    return groups;
  }, [recentActivity]);

  return (
    <div className="mx-auto max-w-6xl space-y-8 p-8 animate-fade_in">
      {/* Hero */}
      <div>
        <div className="font-mono text-[11px] uppercase tracking-widest text-text-dim">
          {greeting()}, {dateString()}
        </div>
        <h2 className="mt-1 font-serif text-3xl font-medium text-balance text-text">
          Your memory layer at a glance.
        </h2>
        <p className="mt-1 max-w-2xl text-sm text-text-muted text-pretty">
          Local-first, turbovec-compressed memory for every AI agent you run.
          Search, browse, and project-isolate what your tools know.
        </p>
      </div>

      {/* (#361) First-run onboarding: static 3-step hints; add persistence, resume, and demo recall. */}
      {projects.length === 0 && agents.length === 0 && (
        <div className="card border-accent/30 p-6">
          <h3 className="font-serif text-lg">Set up biTurbo in three steps</h3>
          <ol className="mt-3 space-y-2 text-sm text-text-muted">
            <li className="flex items-start gap-2">
              <span className="font-mono text-xs text-accent">1</span>
              <span>
                Create a project and point it at a repository —{" "}
                <button onClick={() => setView("projects")} className="text-accent underline underline-offset-2">
                  go to Projects
                </button>
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="font-mono text-xs text-accent">2</span>
              <span>Run “Re-index code” so agents can search your codebase</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="font-mono text-xs text-accent">3</span>
              <span>
                Connect your AI agent via MCP —{" "}
                <button onClick={() => setView("settings")} className="text-accent underline underline-offset-2">
                  Settings → one-click install
                </button>
              </span>
            </li>
          </ol>
        </div>
      )}

      {/* (#396) Usage insights: basic stats/heatmap; add per-agent trends, recall hit-rate, dead-memory prune. */}
      {/* (#183) StatCard hints now read agents and the active project's bit_width. */}
      {/* (#184) Skeleton placeholders while stats is still loading. */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard
          icon={Database}
          label="Memories"
          value={(stats?.total_memories ?? 0).toLocaleString()}
          hint={`${stats?.recent_writes_7d ?? 0} this week`}
          loading={!stats}
        />
        <StatCard
          icon={FolderGit2}
          label="Projects"
          value={(stats?.total_projects ?? 0).toLocaleString()}
          hint={`${(stats?.by_project ?? []).filter(([, n]) => n > 0).length} active`}
          loading={!stats}
        />
        <StatCard
          icon={Bot}
          label="Agents"
          value={(stats?.total_agents ?? 0).toLocaleString()}
          hint={`${agents.length} registered · ${liveAgents} live`}
          loading={!stats}
        />
        <StatCard
          icon={Activity}
          label="Index size"
          value={bytes(stats?.index_bytes ?? 0)}
          hint={`turbovec · ${currentProject?.bit_width ?? 4}-bit`}
          loading={!stats}
        />
      </div>

      {/* Mid row: types + heatmap */}
      <div className="grid gap-3 md:grid-cols-2">
        {/* Types */}
        <div className="card p-5">
          <div className="mb-4 flex items-baseline justify-between">
            <h3 className="font-serif text-lg">Memory types</h3>
            <button
              onClick={() => setView("memories")}
              className="text-xs text-text-dim hover:text-accent"
            >
              browse →
            </button>
          </div>
          <div className="space-y-2.5">
            {typeData.length === 0 && (
              <div className="text-sm text-text-dim">No memories yet.</div>
            )}
            {typeData.map(([t, n]) => {
              const meta = MEM_TYPE_META[t];
              const pct = (n / total) * 100;
              return (
                <button
                  key={t}
                  onClick={() => {
                    // (#182) Pre-apply the selected type and switch to Memories.
                    setTypeFilter(t);
                    setView("memories");
                  }}
                  className="block w-full text-left transition hover:opacity-80"
                >
                  <div className="mb-1 flex items-baseline justify-between text-xs">
                    <span className="flex items-center gap-2 capitalize text-text-muted">
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${typeColors[t] ?? "bg-text-dim"}`}
                      />
                      {meta?.label ?? t}
                    </span>
                    <span className="font-mono text-text-dim">
                      {n} · {pct.toFixed(0)}%
                    </span>
                  </div>
                  <div className="h-1 overflow-hidden rounded-full bg-surface-2">
                    <div
                      className={`h-full ${typeColors[t] ?? "bg-text-dim"}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* (#358) Activity feed: heatmap over 12 weeks; dedicated filtered event list and live tail pending. */}
        {/* (#181) Click a heatmap cell to filter the Recent activity feed by that day. */}
        <div className="card p-5">
          <div className="mb-4 flex items-baseline justify-between">
            <h3 className="font-serif text-lg">Activity · 12 weeks</h3>
            <span className="font-mono text-[10px] text-text-dim">
              {activity.length} recent
            </span>
          </div>
          <div className="overflow-x-auto">
            <Heatmap values={heatmap} onCellClick={(ts) => setSelectedDay(ts)} />
          </div>
          <div className="mt-4 flex items-center gap-2 text-[10px] text-text-dim">
            <span>less</span>
            <div className="flex gap-0.5">
              <div className="h-2 w-2 rounded-sm bg-surface-2" />
              <div className="h-2 w-2 rounded-sm bg-accent/20" />
              <div className="h-2 w-2 rounded-sm bg-accent/40" />
              <div className="h-2 w-2 rounded-sm bg-accent/60" />
              <div className="h-2 w-2 rounded-sm bg-accent" />
            </div>
            <span>more</span>
          </div>
        </div>
      </div>

      {/* (#185) Recent activity feed: icon per action, agent, time, click-through to memory. */}
      <div className="card p-5">
        <div className="mb-4 flex items-baseline justify-between">
          <h3 className="font-serif text-lg">Recent activity</h3>
          <div className="flex items-center gap-2">
            {selectedDay && (
              <button
                onClick={() => setSelectedDay(null)}
                className="text-[10px] text-text-dim hover:text-accent"
              >
                clear
              </button>
            )}
            <span className="font-mono text-[10px] text-text-dim">
              {recentActivity.length} events
            </span>
          </div>
        </div>
        {groupedActivity.length === 0 ? (
          <div className="text-sm text-text-dim">No recent activity.</div>
        ) : (
          <div className="space-y-4">
            {groupedActivity.map((g) => (
              <div key={g.key}>
                <div className="mb-1.5 text-[10px] uppercase tracking-wider text-text-dim">
                  {g.label}
                </div>
                <div className="space-y-1.5">
                  {g.items.map((e) => {
                    const agent = e.agent_id
                      ? agents.find((a) => a.id === e.agent_id)
                      : null;
                    const Icon = ACTION_ICONS[e.action] ?? Activity;
                    return (
                      <button
                        key={e.id}
                        type="button"
                        onClick={() => {
                          if (!e.memory_uid) return;
                          setSelected(e.memory_uid);
                          setView("memories");
                        }}
                        className={clsx(
                          "flex w-full items-center gap-2 text-left text-xs",
                          e.memory_uid
                            ? "text-text hover:text-accent"
                            : "cursor-default text-text-dim"
                        )}
                      >
                        <Icon size={13} className="shrink-0 text-text-dim" />
                        <span className="capitalize">{e.action.replace(/_/g, " ")}</span>
                        <span className="text-text-dim">·</span>
                        <span className="text-text-dim">{agent?.name ?? "gui"}</span>
                        <span className="ml-auto shrink-0 text-text-dim">
                          {timeAgo(e.created_at)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recent memories */}
      <div>
        <div className="mb-3 flex items-baseline justify-between">
          <h3 className="font-serif text-lg">Recent memories</h3>
          <button
            onClick={() => setView("memories")}
            className="inline-flex items-center gap-1 text-xs text-text-dim hover:text-accent"
          >
            all <ArrowUpRight size={11} />
          </button>
        </div>
        {recent.length === 0 ? (
          <div className="card flex flex-col items-center justify-center p-12 text-center">
            <Sparkles className="mb-2 text-text-dim" size={20} />
            <div className="text-sm text-text-muted">No memories in this project yet.</div>
            <div className="mt-1 text-xs text-text-dim">
              Press <Kbd combo="mod+K" /> to remember something.
            </div>
          </div>
        ) : (
          <div className="grid gap-2 md:grid-cols-2">
            {recent.map((m) => (
              <MemoryCard
                key={m.uid}
                memory={m}
                active={selectedMemoryUid === m.uid}
                onClick={() => {
                  setSelected(m.uid);
                  setView("memories");
                }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  loading,
}: {
  icon: LucideIcon;
} & {
  label: string;
  value?: string;
  hint?: string;
  loading?: boolean;
}) {
  return (
    <div className="card p-4">
      <div className="flex items-center gap-2 text-text-dim">
        <Icon size={13} />
        <span className="text-[11px] uppercase tracking-widest">{label}</span>
      </div>
      {loading || value === undefined ? (
        <div className="mt-1.5 h-7 w-24 animate-pulse rounded bg-surface-2" />
      ) : (
        <div className="mt-1.5 font-serif text-2xl font-medium text-text">{value}</div>
      )}
      {loading ? (
        <div className="mt-0.5 h-3 w-16 animate-pulse rounded bg-surface-2" />
      ) : (
        hint && <div className="mt-0.5 font-mono text-[10px] text-text-dim">{hint}</div>
      )}
    </div>
  );
}

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return "Late night";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function dateString() {
  return new Date().toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}
