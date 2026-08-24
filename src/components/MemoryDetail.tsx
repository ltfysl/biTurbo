import { useEffect, useRef, useState } from "react";
import type { Memory } from "../lib/types";
import { MEM_TYPE_META, timeAgo, shortDate, importanceDots, truncatePath, stripLeadingPathComment, friendlyError } from "../lib/format";
import { api } from "../lib/api";
import { openPath } from "@tauri-apps/plugin-opener";
import { invoke } from "@tauri-apps/api/core";
import { useApp, useConfirm } from "../lib/store";
import { X, Trash2, Edit3, Save, FileCode2, Hash, ChevronDown, ChevronUp } from "lucide-react";
import clsx from "clsx";
import { CodeBlock } from "./CodeBlock";

export function MemoryDetail({ memory, onClose }: { memory: Memory; onClose: () => void }) {
  // (#357) In-place editing for content, tags, and importance; mem_type selector and project move pending.
// (#46) Per-uid draft cache preserves unsaved edits when selecting another memory.
// (#48) ⌘Enter/Ctrl+Enter saves edits and a dirty indicator shows pending changes.
// (#49) Related memories fetch by uid through the store, even when not in the loaded page.
// (#50) Code file path chips open in the default app via tauri-plugin-opener.
// (#52) Related memory similarity is rendered as a percentage bar, not raw decimals.
  const [editing, setEditing] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [draft, setDraft] = useState(memory.content);
  const [draftTags, setDraftTags] = useState(memory.tags.join(", "));
  const [draftImp, setDraftImp] = useState(memory.importance);
  const [draftType, setDraftType] = useState(memory.mem_type);
  const [related, setRelated] = useState<{ uid: string; content: string; score: number }[]>([]);
  // Per-uid draft cache: switching memories mid-edit preserves unsaved
  // changes instead of silently discarding them.
  const draftCache = useRef(new Map<string, { content: string; tags: string; imp: number; mem_type: string }>());
  const baselineCache = useRef(new Map<string, { content: string; tags: string; imp: number; mem_type: string }>());
  const prevUidRef = useRef(memory.uid);
  const lastUpdatedAtRef = useRef(memory.updated_at);
  const refreshMemories = useApp((s) => s.refreshMemories);
  const refreshTags = useApp((s) => s.refreshTags);
  const refreshStats = useApp((s) => s.refreshStats);
  const showToast = useApp((s) => s.showToast);
  const setSelected = useApp((s) => s.setSelectedMemoryUid);
  const selectMemoryByUid = useApp((s) => s.selectMemoryByUid);
  const confirm = useConfirm();

  useEffect(() => {
    baselineCache.current.set(memory.uid, {
      content: memory.content,
      tags: memory.tags.join(", "),
      imp: memory.importance,
      mem_type: memory.mem_type,
    });
    lastUpdatedAtRef.current = memory.updated_at;
    setConflict(false);
    const prevUid = prevUidRef.current;
    if (prevUid === memory.uid) return;
    const base = baselineCache.current.get(prevUid);
    const wasDirty =
      base != null &&
      (draft !== base.content || draftTags !== base.tags || draftImp !== base.imp || draftType !== (base.mem_type ?? memory.mem_type));
    if (wasDirty) {
      draftCache.current.set(prevUid, { content: draft, tags: draftTags, imp: draftImp, mem_type: draftType });
      showToast({ kind: "info", text: "Unsaved edits kept as draft" });
    }
    const saved = draftCache.current.get(memory.uid);
    setDraft(saved ? saved.content : memory.content);
    setDraftTags(saved ? saved.tags : memory.tags.join(", "));
    setDraftImp(saved ? saved.imp : memory.importance);
    setDraftType(saved ? saved.mem_type ?? memory.mem_type : memory.mem_type);
    setEditing(false);
    setExpanded(false);
    prevUidRef.current = memory.uid;
  }, [memory.uid]);

  // If the same memory is updated externally while we're looking at it,
  // reseed the drafts (when not editing) or surface a conflict notice.
// (#517) Stale-draft guard: re-seed or surface a conflict when the memory changes elsewhere.
  useEffect(() => {
    if (memory.updated_at === lastUpdatedAtRef.current) return;
    if (editing) {
      setConflict(true);
      showToast({ kind: "info", text: "This memory was updated elsewhere. Save or discard." });
    } else {
      setConflict(false);
      setDraft(memory.content);
      setDraftTags(memory.tags.join(", "));
      setDraftImp(memory.importance);
      setDraftType(memory.mem_type);
      baselineCache.current.set(memory.uid, {
        content: memory.content,
        tags: memory.tags.join(", "),
        imp: memory.importance,
        mem_type: memory.mem_type,
      });
    }
    lastUpdatedAtRef.current = memory.updated_at;
  }, [memory.updated_at, editing]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const hits = await api.search({
          project_id: memory.project_id,
          query: memory.content.slice(0, 200),
          k: 6,
        });
        if (cancelled) return;
        setRelated(
          hits
            .filter((h) => h.uid !== memory.uid)
            .slice(0, 5)
            .map((h) => ({ uid: h.uid, content: h.content, score: h.score })),
        );
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
    // Only re-search when selecting a different memory, not on every edit.
  }, [memory.uid, memory.project_id]);

  async function save() {
// (#524) Reject duplicate concurrent save requests.
    if (saving || conflict) return;
// (#519) Reject empty or whitespace-only content.
    if (!draft.trim()) {
      showToast({ kind: "err", text: "Content cannot be empty" });
      return;
    }
    setSaving(true);
    try {
      await api.update(memory.uid, {
        content: draft,
        tags: draftTags
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        importance: draftImp,
        updated_at: memory.updated_at,
        mem_type: draftType,
      });
      await refreshMemories();
      showToast({ kind: "ok", text: "Saved" });
      setEditing(false);
    } catch (e) {
      showToast({ kind: "err", text: friendlyError(e) });
    } finally {
      setSaving(false);
    }
  }

  async function forget() {
    const ok = await confirm({
      title: "Forget this memory?",
      body: "It will be removed from the vector index too. This cannot be undone.",
      confirmLabel: "Forget",
    });
    if (!ok) return;
    try {
      await api.forget(memory.uid);
      setSelected(null);
      await refreshTags();
      await Promise.all([refreshMemories(), refreshStats()]);
      // (#54) Offer an Undo action that re-remembers the deleted content.
      showToast({
        kind: "ok",
        text: "Forgotten",
        action: {
          label: "Undo",
          onClick: () => void rememberDeleted(),
        },
      });
    } catch (e) {
      showToast({ kind: "err", text: friendlyError(e) });
    }
  }

  async function rememberDeleted() {
    try {
      await api.remember({
        content: memory.content,
        mem_type: memory.mem_type,
        project_id: memory.project_id,
        tags: memory.tags,
        importance: memory.importance,
        source_agent: memory.source_agent,
      });
      await refreshTags();
      await Promise.all([refreshMemories(), refreshStats()]);
      showToast({ kind: "ok", text: "Restored" });
    } catch (e) {
      showToast({ kind: "err", text: friendlyError(e) });
    }
  }

  const meta = MEM_TYPE_META[memory.mem_type] ?? MEM_TYPE_META.fact;
  const dots = importanceDots(memory.importance);
  const isCode = memory.mem_type === "code";
  const bodyContent = isCode
    ? stripLeadingPathComment(memory.content, memory.file_path)
    : memory.content;
  const CODE_COLLAPSE_LINES = 14;
  const TEXT_COLLAPSE_CHARS = 220;
  const TEXT_COLLAPSE_LINES = 8;
  const isCollapsible = isCode
    ? bodyContent.split("\n").length > CODE_COLLAPSE_LINES
    : bodyContent.length > TEXT_COLLAPSE_CHARS || bodyContent.split("\n").length > TEXT_COLLAPSE_LINES;
  const collapsed = isCollapsible && !expanded;
  const dirty =
    editing &&
    (draft !== memory.content ||
      draftTags !== memory.tags.join(", ") ||
      draftImp !== memory.importance);

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-start gap-2 border-b border-border-subtle p-4">
        <div className="flex-1">
          <div className="mb-1 flex items-center gap-2">
            <span
              className={clsx(
                "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider",
                meta.bg,
                meta.color
              )}
            >
              <span className={clsx("h-1 w-1 rounded-full", meta.dot)} />
              {meta.label}
            </span>
            <span className="font-mono text-[10px] text-text-dim">
              {memory.uid.slice(0, 8)}
            </span>
          </div>
        </div>
        <button onClick={onClose} className="btn-ghost p-1.5" aria-label="Close details" title="Close">
          <X size={14} />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-4">
        {editing ? (
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                e.preventDefault();
                void save();
              }
            }}
            rows={8}
            className="input resize-none font-sans text-sm"
            autoFocus
          />
        ) : isCode ? (
          <div className="relative">
            <CodeBlock code={bodyContent} maxLines={collapsed ? CODE_COLLAPSE_LINES : undefined} showCopy />
            {collapsed && (
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 rounded-b-md bg-gradient-to-t from-surface to-transparent" />
            )}
          </div>
        ) : (
          <div className="relative">
            <div
              className={clsx(
                "whitespace-pre-wrap text-sm leading-relaxed text-text text-pretty overflow-hidden",
                collapsed && "max-h-[160px]"
              )}
            >
              {memory.content}
            </div>
            {collapsed && (
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-surface to-transparent" />
            )}
          </div>
        )}

        {!editing && isCollapsible && (
          <button
            onClick={() => setExpanded((e) => !e)}
            className="mt-2 flex items-center gap-1 text-[11px] text-text-dim transition hover:text-text-muted"
          >
            {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            {expanded ? "Show less" : "Show more"}
          </button>
        )}
        {memory.mem_type === "code" && memory.file_path && (
          <button
            type="button"
            onClick={async () => {
              const p = memory.file_path as string;
              try {
                await openPath(p);
              } catch (e) {
                const msg = String(e);
                // Fallback to unrestricted opener if scope blocks the path
                if (msg.includes("Not allowed") || msg.includes("forbidden") || msg.includes("Forbidden")) {
                  try {
                    await invoke("open_file", { path: p });
                    return;
                  } catch (e2) {
                    showToast({ kind: "err", text: `Could not open file: ${String(e2)}` });
                    return;
                  }
                }
                showToast({ kind: "err", text: `Could not open file: ${msg}` });
              }
            }}
            title={`Open ${memory.file_path} in the default app`}
          >
            <FileCode2 size={12} className="shrink-0" />
            <span className="code-chip-path">{truncatePath(memory.file_path, 56)}</span>
            {memory.start_line && (
              <span className="code-chip-range">
                L{memory.start_line}
                {memory.end_line && memory.end_line !== memory.start_line
                  ? `\u2013${memory.end_line}`
                  : ""}
              </span>
            )}
            {memory.language && (
              <span className="code-chip-lang">{memory.language}</span>
            )}
          </button>
        )}

        {/* Type selector in edit mode (#47) */}
        {editing && (
          <div className="mt-4">
            <div className="mb-1.5 text-[11px] uppercase tracking-widest text-text-dim">
              Type
            </div>
            <select
              value={draftType}
              onChange={(e) => setDraftType(e.target.value)}
              className="input w-40 text-sm"
            >
              {["fact", "decision", "preference", "pattern", "episode", "reflection", "code"].map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
        )}

        {/* Tags */}
        <div className="mt-4">
          <div className="mb-1.5 text-[11px] uppercase tracking-widest text-text-dim">
            Tags
          </div>
          {editing ? (
            <input
              value={draftTags}
              onChange={(e) => setDraftTags(e.target.value)}
              className="input"
              placeholder="comma-separated"
            />
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {memory.tags.length === 0 && (
                <span className="text-xs text-text-dim">—</span>
              )}
              {memory.tags.map((t) => (
                <span key={t} className="chip">
                  <Hash size={9} />
                  {t}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Importance slider */}
        <div className="mt-4">
          <div className="mb-1.5 flex items-center justify-between text-[11px] uppercase tracking-widest text-text-dim">
            <span>Importance</span>
            <span className="font-mono text-text-muted">
              {editing ? draftImp.toFixed(2) : memory.importance.toFixed(2)}
            </span>
          </div>
          {editing ? (
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={draftImp}
              onChange={(e) => setDraftImp(parseFloat(e.target.value))}
              className="w-full accent-accent"
            />
          ) : (
            <div className="flex items-center gap-0.5">
              {Array.from({ length: 5 }).map((_, i) => (
                <span
                  key={i}
                  className={clsx(
                    "h-1.5 w-6 rounded-full",
                    i < dots ? "bg-accent" : "bg-surface-2"
                  )}
                />
              ))}
            </div>
          )}
        </div>

        {/* Supersession chain (#45) */}
        {(memory.superseded_by != null || memory.supersedes != null) && (
          <div className="mt-5 border-t border-border-subtle pt-4">
            <div className="mb-2 text-[11px] uppercase tracking-widest text-text-dim">
              Supersession
            </div>
            <div className="flex flex-wrap gap-2">
              {memory.supersedes != null && (
                <button
                  onClick={() => void selectMemoryByUid(String(memory.supersedes))}
                  className="btn-outline text-[11px]"
                  title={`Open predecessor ${memory.supersedes}`}
                >
                  ← predecessor
                </button>
              )}
              {memory.superseded_by != null && (
                <button
                  onClick={() => void selectMemoryByUid(String(memory.superseded_by))}
                  className="btn-outline text-[11px]"
                  title={`Open successor ${memory.superseded_by}`}
                >
                  successor →
                </button>
              )}
            </div>
          </div>
        )}

        {/* Metadata grid */}
        <div className="mt-5 grid grid-cols-2 gap-3 border-t border-border-subtle pt-4 text-xs">
          <Meta label="Project" value={memory.project_id} mono />
          <Meta label="Source" value={memory.source_agent ?? "—"} mono />
          <Meta label="Created" value={shortDate(memory.created_at)} mono />
          <Meta label="Updated" value={shortDate(memory.updated_at)} mono />
          <Meta label="Accesses" value={String(memory.access_count)} mono title="Accesses include agent recalls and GUI views" />
          <Meta
            label="Last access"
            value={memory.last_access ? timeAgo(memory.last_access) : "—"}
            title="Last time an agent or the GUI accessed this memory"
          />
        </div>

        {/* Related */}
        {related.length > 0 && (
          <div className="mt-5 border-t border-border-subtle pt-4">
            <div className="mb-2 text-[11px] uppercase tracking-widest text-text-dim">
              Related
            </div>
            <div className="space-y-1.5">
              {related.map((r) => (
                <button
                  key={r.uid}
                  onClick={() => void selectMemoryByUid(r.uid)}
                  className="block w-full rounded-md border border-border-subtle bg-surface p-2 text-left text-[11px] text-text-muted transition hover:border-border hover:bg-surface-2"
                >
                  <div className="line-clamp-2 text-pretty">{r.content}</div>
                  <div className="mt-1 flex items-center gap-1.5">
                    <div className="h-1 w-12 overflow-hidden rounded-full bg-surface-2">
                      <div
                        className="h-full bg-accent"
                        style={{ width: `${Math.round(Math.min(1, Math.max(0, r.score)) * 100)}%` }}
                      />
                    </div>
                    <span className="font-mono text-[10px] text-text-dim">
                      {Math.round(r.score * 100)}% match
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Footer actions */}
      <div className="flex items-center gap-2 border-t border-border-subtle p-3">
        {editing ? (
          <>
            {dirty && !conflict && (
              <span className="text-[11px] uppercase tracking-widest text-warning">
                Unsaved
              </span>
            )}
            {conflict && (
              <span className="text-[11px] uppercase tracking-widest text-warning">
                Out of date
              </span>
            )}
            <button
              onClick={save}
              disabled={saving || !dirty || conflict || !draft.trim()}
              className="btn-primary flex-1 disabled:opacity-50"
            >
              <Save size={14} /> {saving ? "Saving…" : "Save"}
            </button>
            <button
              onClick={() => setEditing(false)}
              disabled={saving}
              className="btn-outline disabled:opacity-50"
            >
              Cancel
            </button>
          </>
        ) : (
          <>
            <button onClick={() => setEditing(true)} className="btn-outline flex-1">
              <Edit3 size={14} /> Edit
            </button>
            <button onClick={forget} className="btn-outline text-danger hover:bg-danger/10">
              <Trash2 size={14} /> Forget
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function Meta({ label, value, mono, title }: { label: string; value: string; mono?: boolean; title?: string }) {
  return (
    <div title={title}>
      <div className="text-[11px] uppercase tracking-widest text-text-dim">
        {label}
      </div>
      <div className={clsx("mt-0.5 text-text-muted", mono && "font-mono")}>
        {value}
      </div>
    </div>
  );
}
