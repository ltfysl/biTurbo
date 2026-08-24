import clsx from "clsx";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useApp, useContextMenu } from "../lib/store";
import type { GraphNode, GraphEdge } from "../lib/types";
import {
  Share2,
  Filter,
  Search,
  X,
  ZoomIn,
  ZoomOut,
  RefreshCw,
  Copy,
  ExternalLink,
  FolderGit2,
} from "lucide-react";
import type { ContextMenuItem } from "../components/ContextMenu";
import type {
  LayoutRequest,
  LayoutResult,
  LayoutProgress,
  LayoutError,
} from "./layoutWorker";
import { friendlyError } from "../lib/format";
// (#346) Supersession edges between memory nodes pending.


type Pos = { x: number; y: number };

const NODE_KINDS = ["file", "function", "class", "struct"] as const;
type NodeKind = (typeof NODE_KINDS)[number];

// (#76) Graph empty state points users to the in-app Projects view for indexing.
// (#77) Zero-node graph renders an overlay instead of a blank canvas.
const KIND_COLORS: Record<NodeKind, { fill: string; stroke: string }> = {
  file: { fill: "#D4A574", stroke: "#8a6b4a" },
  function: { fill: "#7DC4E4", stroke: "#3d7488" },
  class: { fill: "#C7A0E0", stroke: "#6d4d8a" },
  struct: { fill: "#E0C58C", stroke: "#8a7434" },
};

const EDGE_COLORS: Record<string, string> = {
  member_of: "#3a342d",
  imports: "#D4A574",
  calls: "#7DC4E4",
  extends: "#C7A0E0",
};

const LAYOUT_W = 1600;
const LAYOUT_H = 1000;
const LAYOUT_CX = LAYOUT_W / 2;
const LAYOUT_CY = LAYOUT_H / 2;

const DRAG_THRESHOLD_PX = 4;

export function Graph() {
  const graph = useApp((s) => s.graph);
  const refreshGraph = useApp((s) => s.refreshGraph);
  const setAppView = useApp((s) => s.setView);
  const currentProjectId = useApp((s) => s.currentProjectId);
  const showToast = useApp((s) => s.showToast);
  const setSelected = useApp((s) => s.setSelectedMemoryUid);
  const showMenu = useContextMenu();
  // (#363) Graph ergonomics: node kind + edge filters, wheel zoom, and pan; fit, minimap, pinning, PNG export, touch pending.
  const [filter, setFilter] = useState<Set<string>>(new Set(NODE_KINDS));
  const [edgeFilter, setEdgeFilter] = useState<Set<string>>(new Set(Object.keys(EDGE_COLORS)));
  const [query, setQuery] = useState("");
  const [matchIndex, setMatchIndex] = useState(-1);
  const [hover, setHover] = useState<string | null>(null);
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number } | null>(null);
  const [posMap, setPosMap] = useState<Record<string, Pos>>({});
  const [view, setView] = useState({ x: 0, y: 0, k: 0.5 });
  const [busy, setBusy] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    x: number;
    y: number;
    vx: number;
    vy: number;
  } | null>(null);
  const pointerMoved = useRef(false);
  const [size, setSize] = useState({ w: 800, h: 600 });
  // Node order of the in-flight layout request: the worker answers with
  // positions parallel to this array.
  const requestNodesRef = useRef<{ uid: string }[]>([]);

  const data = useMemo(() => {
    if (!graph) return null;
    const visibleNodes = graph.nodes.filter((n) => filter.has(n.kind));
    const visibleIds = new Set(visibleNodes.map((n) => n.uid));
    const visibleEdges = graph.edges.filter(
      (e) =>
        edgeFilter.has(e.edge_type) &&
        visibleIds.has(e.from) &&
        visibleIds.has(e.to),
    );
    return { nodes: visibleNodes, edges: visibleEdges };
  }, [graph, filter, edgeFilter]);

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0].contentRect;
      setSize({ w: Math.max(100, r.width), h: Math.max(100, r.height) });
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // (#196) Zoom is anchored around the chosen viewport point, not the top-left origin.
  const zoomAt = useCallback((factor: number, mx: number, my: number) => {
    setView((v) => {
      const k = Math.max(0.1, Math.min(4, v.k * factor));
      const wx = (mx - v.x) / v.k;
      const wy = (my - v.y) / v.k;
      return { k, x: mx - wx * k, y: my - wy * k };
    });
  }, [setView]);

  // (#195) Attach a native, non-passive wheel listener so preventDefault works and pinch can be handled.
  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    const rect = (e.currentTarget as HTMLCanvasElement).getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const isPinch = e.ctrlKey || e.metaKey;
    const factor = isPinch ? (e.deltaY < 0 ? 1.15 : 0.87) : (e.deltaY < 0 ? 1.1 : 0.9);
    zoomAt(factor, mx, my);
  }, [zoomAt]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.addEventListener("wheel", handleWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", handleWheel);
  }, [handleWheel]);

  // Live count of nodes matching the search box, shown as "n/total".
  const matchCount = useMemo(() => {
    if (!data || !query.trim()) return 0;
    const q = query.trim().toLowerCase();
    return data.nodes.filter(
      (n) => n.label.toLowerCase().includes(q) || (n.file_path ?? "").toLowerCase().includes(q),
    ).length;
  }, [data, query]);

  // (#200) Reset the cycled search match index when the query changes.
  useEffect(() => {
    setMatchIndex(-1);
  }, [query]);

  // Layout pipeline:
  // 1. Render immediately at cheap seed positions (file circle + jittered
  //    children). Always < 5ms even for 10k nodes.
  // 2. Kick off the worker to refine via Barnes-Hut. Cancel any prior
  //    in-flight request so we never apply a stale result to a new filter.
  // Layout pipeline:
  // 1. Render immediately at cheap seed positions (file circle + jittered
  //    children). Always < 5ms even for 10k nodes.
  // 2. Kick off a fresh worker to refine via Barnes-Hut. Terminating the
  //    previous worker cancels any superseded run, so we never apply stale
  //    positions to a new filter.
  useEffect(() => {
    if (!data || data.nodes.length === 0) {
      setPosMap({});
      return;
    }
    const seed = computeSeedPositions(data.nodes);
    setPosMap(seed);

    const reqId = ++layoutReqSeq.current;
    const reqNodes = data.nodes.map((n) => ({
      uid: n.uid,
      kind: n.kind,
      file_path: n.file_path ?? null,
      size: n.size,
    }));
    requestNodesRef.current = reqNodes;

    const worker = new Worker(new URL("./layoutWorker.ts", import.meta.url), {
      type: "module",
      name: "biturbo-layout",
    });
    const onMessage = (ev: MessageEvent<LayoutResult | LayoutProgress | LayoutError>) => {
      const m = ev.data;
      if (!m || m.requestId !== reqId) return;
      if (m.type === "progress" || m.type === "result") {
        const raw: unknown = m.positions;
        const posMapFromWorker: Record<string, Pos> = Array.isArray(raw)
          ? Object.fromEntries(
              requestNodesRef.current
                .map((n, i) => [n.uid, raw[i]] as [string, Pos | undefined])
                .filter((entry): entry is [string, Pos] => entry[1] != null),
            )
          : (raw as Record<string, Pos>);
        setPosMap(posMapFromWorker);
        if (m.type === "result") {
          // (#198) Layout/paint timing is logged to the backend, not shown in the production toolbar.
          send(
            "info",
            `[graph] layout refined · ${m.iterationsDone} iters · ${Math.round(m.elapsedMs)}ms`,
          );
        }
      } else if (m.type === "error") {
        showToast({ kind: "err", text: `Graph layout failed: ${m.message}` });
      }
    };
    worker.addEventListener("message", onMessage);
    worker.postMessage({
      type: "layout",
      requestId: reqId,
      nodes: reqNodes,
      edges: data.edges.map((e) => ({ from: e.from, to: e.to })),
      width: LAYOUT_W,
      height: LAYOUT_H,
      iterations: 120,
      prevPositions: seed,
    } satisfies LayoutRequest);
    return () => {
      worker.removeEventListener("message", onMessage);
      worker.terminate();
    };
  }, [data]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = size.w * dpr;
    canvas.height = size.h * dpr;
    canvas.style.width = `${size.w}px`;
    canvas.style.height = `${size.h}px`;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawScene(ctx, size, data, posMap, view, hover, query);
  }, [size, data, posMap, view, hover, query]);


  async function reload() {
    setBusy(true);
    try {
      await refreshGraph();
      if (useApp.getState().graph) {
        showToast({ kind: "ok", text: "Graph refreshed" });
      } else {
        showToast({ kind: "info", text: "No graph yet; run an ingest first" });
      }
    } catch (e) {
      showToast({ kind: "err", text: friendlyError(e) });
    } finally {
      setBusy(false);
    }
  }

  // (#199) Empty state uses in-app project indexing language instead of an MCP command name.
  if (!graph) {
    return (
      <div className="flex h-full items-center justify-center p-12 text-center">
        <div>
          <Share2 size={28} className="mx-auto mb-3 text-text-dim" />
          <div className="font-serif text-lg">No code index for this project yet.</div>
          <div className="mt-1 text-sm text-text-muted">
            Open <span className="kbd">Projects → Re-index code</span>, or let your agent index the repo.
          </div>
          <div className="mt-4 flex items-center justify-center gap-2">
            <button onClick={() => setAppView("projects")} className="btn-primary">
              <FolderGit2 size={14} />
              Open Projects
            </button>
            <button onClick={reload} className="btn-outline" disabled={busy}>
              <RefreshCw size={14} className={busy ? "animate-spin" : ""} />
              Refresh
            </button>
          </div>
        </div>
      </div>
    );
  }

  const hoverNode = hover && data ? data.nodes.find((n) => n.uid === hover) : null;

  function onKeyDown(e: React.KeyboardEvent) {
    const step = 50 / view.k;
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
      e.preventDefault();
      setView((v) => {
        let dx = 0;
        let dy = 0;
        if (e.key === "ArrowLeft") dx = -step;
        if (e.key === "ArrowRight") dx = step;
        if (e.key === "ArrowUp") dy = -step;
        if (e.key === "ArrowDown") dy = step;
        return { ...v, x: v.x + dx, y: v.y + dy };
      });
    } else if (e.key === "=" || e.key === "+" || e.key === "NumpadAdd") {
      e.preventDefault();
      setView((v) => ({ ...v, k: Math.max(0.1, Math.min(4, v.k * 1.2)) }));
    } else if (e.key === "-" || e.key === "NumpadSubtract") {
      e.preventDefault();
      setView((v) => ({ ...v, k: Math.max(0.1, Math.min(4, v.k / 1.2)) }));
    }
  }

  function fitToView() {
    if (!data || data.nodes.length === 0 || containerRef.current == null) {
      resetView();
      return;
    }
    const xs = data.nodes.map((n) => posMap[n.uid]?.x).filter((x): x is number => x != null);
    const ys = data.nodes.map((n) => posMap[n.uid]?.y).filter((y): y is number => y != null);
    if (xs.length === 0 || ys.length === 0) {
      resetView();
      return;
    }
    const pad = 60;
    const minX = Math.min(...xs) - pad;
    const maxX = Math.max(...xs) + pad;
    const minY = Math.min(...ys) - pad;
    const maxY = Math.max(...ys) + pad;
    const { width, height } = containerRef.current.getBoundingClientRect();
    const k = Math.max(0.1, Math.min(2, Math.min(width / (maxX - minX), height / (maxY - minY))));
    setView({
      k,
      x: width / 2 - ((minX + maxX) / 2) * k,
      y: height / 2 - ((minY + maxY) / 2) * k,
    });
  }

  // (#197) Start tracking pointer movement for a drag threshold.
  function onMouseDown(e: React.MouseEvent) {
    dragRef.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y };
    pointerMoved.current = false;
  }

  // (#197) Track the pointer and suppress click when a drag exceeds the threshold.
  function onMouseMove(e: React.MouseEvent) {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    if (dx * dx + dy * dy > DRAG_THRESHOLD_PX * DRAG_THRESHOLD_PX) {
      pointerMoved.current = true;
    }
    setView((v) => ({
      ...v,
      x: drag.vx + dx,
      y: drag.vy + dy,
    }));
  }

  function onMouseUp() {
    dragRef.current = null;
  }

  function hitTest(mx: number, my: number): string | null {
    if (!data) return null;
    const wx = (mx - view.x) / view.k;
    const wy = (my - view.y) / view.k;
    let best: { uid: string; d2: number } | null = null;
    for (const n of data.nodes) {
      const p = posMap[n.uid];
      if (!p) continue;
      const r = nodeRadius(n);
      const dx = wx - p.x;
      const dy = wy - p.y;
      const d2 = dx * dx + dy * dy;
      if (d2 <= r * r && (!best || d2 < best.d2)) {
        best = { uid: n.uid, d2 };
      }
    }
    return best?.uid ?? null;
  }

  function onMouseMoveHover(e: React.MouseEvent) {
    if (dragRef.current) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const uid = hitTest(mx, my);
    setHover(uid);
    setHoverPos(uid ? { x: mx, y: my } : null);
    if (canvasRef.current) {
      if (!uid) {
        canvasRef.current.style.cursor = "grab";
      } else {
        const n = data?.nodes.find((x) => x.uid === uid);
        canvasRef.current.style.cursor = n && n.kind === "file" ? "default" : "pointer";
      }
    }
  }

  // (#197) Ignore clicks that were part of a pan.
  function onClick(e: React.MouseEvent) {
    if (pointerMoved.current) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const uid = hitTest(e.clientX - rect.left, e.clientY - rect.top);
    if (!uid || !data) return;
    const n = data.nodes.find((x) => x.uid === uid);
    if (n && n.file_path) {
      if (n.kind === "file") {
        showToast({ kind: "info", text: "File nodes group symbols — click a function" });
      } else {
        setSelected(n.uid);
      }
    }
  }

  function onContextMenu(e: React.MouseEvent) {
    e.preventDefault();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const uid = hitTest(e.clientX - rect.left, e.clientY - rect.top);
    if (!uid || !data) return;
    const n = data.nodes.find((x) => x.uid === uid);
    if (!n) return;
    const items: ContextMenuItem[] = [
      {
        label: "Open memory",
        icon: <ExternalLink size={12} />,
        disabled: n.kind === "file" || !n.file_path,
        onClick: () => {
          if (n.kind !== "file" && n.file_path) setSelected(n.uid);
        },
      },
      {
        label: "Copy UID",
        icon: <Copy size={12} />,
        onClick: async () => {
          try {
            await navigator.clipboard.writeText(n.uid);
            showToast({ kind: "ok", text: "UID copied" });
          } catch {
            showToast({ kind: "err", text: "Clipboard blocked — select and press Ctrl/Cmd+C" });
          }
        },
      },
      {
        label: "Copy label",
        icon: <Copy size={12} />,
        onClick: async () => {
          try {
            await navigator.clipboard.writeText(n.label);
            showToast({ kind: "ok", text: "Label copied" });
          } catch {
            showToast({ kind: "err", text: "Clipboard blocked — select and press Ctrl/Cmd+C" });
          }
        },
      },
    ];
    showMenu(e.clientX, e.clientY, items);
  }


  // (#200) Enter / Shift+Enter cycles through search matches and centers the view on each.
  function handleSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter" || !data || !query.trim()) return;
    e.preventDefault();
    const q = query.trim().toLowerCase();
    const matches = data.nodes.filter(
      (n) => n.label.toLowerCase().includes(q) || (n.file_path ?? "").toLowerCase().includes(q),
    );
    if (matches.length === 0) return;
    let next = matchIndex;
    if (e.shiftKey) {
      next = next <= 0 ? matches.length - 1 : next - 1;
    } else {
      next = next + 1 >= matches.length ? 0 : next + 1;
    }
    setMatchIndex(next);
    const n = matches[next];
    const p = posMap[n.uid];
    if (!p) return;
    setView((v) => ({
      ...v,
      x: size.w / 2 - p.x * v.k,
      y: size.h / 2 - p.y * v.k,
    }));
    setHover(n.uid);
  }
  function resetView() {
    setView({ x: 0, y: 0, k: 0.5 });
  }

  return (
    <div className="flex h-full">
      {/* Canvas */}
      <div
        ref={containerRef}
        className="relative flex-1 overflow-hidden bg-bg"
      >
        <canvas
          ref={canvasRef}
          className="absolute inset-0 cursor-grab active:cursor-grabbing"
          tabIndex={0}
          role="img"
          aria-label="Graph of code symbols — arrow keys pan, plus/minus zoom"
          onKeyDown={onKeyDown}
          onMouseDown={onMouseDown}
          onMouseMove={(e) => {
            onMouseMove(e);
            onMouseMoveHover(e);
          }}
          onMouseUp={onMouseUp}
          onClick={onClick}
          onMouseLeave={() => { onMouseUp(); pointerMoved.current = false; setHover(null); setHoverPos(null); if (canvasRef.current) canvasRef.current.style.cursor = "grab"; }}
          onContextMenu={onContextMenu}
        />

        {/* Zero-node overlay */}
        {data && data.nodes.length === 0 && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-12 text-center">
            <div>
              <div className="font-serif text-lg text-text-muted">No nodes to display</div>
              <div className="mt-1 text-sm text-text-muted">
                {filter.size < NODE_KINDS.length
                  ? "All node kinds are filtered out — re-enable them in the sidebar."
                  : "This project has no indexed code yet."}
              </div>
            </div>
          </div>
        )}

        {/* Hover info as a floating tooltip below lg, where the sidebar
            (and its hover panel) is hidden. */}
        {hoverNode && hoverPos && data && data.nodes.length > 0 && (
          <div
            className="pointer-events-none absolute z-10 max-w-xs rounded-md border border-border bg-surface/95 p-2 shadow-modal lg:hidden"
            style={{
              left: Math.min(hoverPos.x + 14, Math.max(8, size.w - 250)),
              top: Math.max(8, hoverPos.y - 56),
            }}
          >
            <div className="mb-1 flex items-center gap-2">
              <span
                className="h-2 w-2 rounded-full"
                style={{ background: KIND_COLORS[hoverNode.kind as NodeKind]?.fill }}
              />
              <span className="text-[11px] uppercase tracking-widest text-text-dim">
                {hoverNode.kind}
              </span>
            </div>
            <div className="font-serif text-sm text-text">{hoverNode.label}</div>
            {hoverNode.file_path && (
              <div className="mt-1 truncate font-mono text-[10px] text-text-dim">
                {hoverNode.file_path}
                {hoverNode.start_line ? `:${hoverNode.start_line}` : ""}
              </div>
            )}
          </div>
        )}

        {/* Controls */}
        <div className="pointer-events-none absolute inset-0 flex flex-col">
          <div className="pointer-events-auto flex items-center gap-2 border-b border-border-subtle bg-bg/80 p-3 backdrop-blur">
            <Share2 size={14} className="text-accent" />
            <div className="font-serif text-lg">Graph</div>
            <span className="font-mono text-[10px] text-text-dim">
              {currentProjectId}
            </span>
            <span className="font-mono text-[10px] text-text-dim">
              · {data?.nodes.length ?? 0} nodes · {data?.edges.length ?? 0} edges
            </span>
            <div className="flex-1" />
            <div className="relative">
              <Search
                size={12}
                className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-text-dim"
              />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                placeholder="Search nodes…"
                className="input w-48 py-1 pl-7 pr-20 text-xs"
              />
              {query.trim() && (
                <>
                  <span
                    className="pointer-events-none absolute right-7 top-1/2 -translate-y-1/2 font-mono text-[10px] text-text-muted"
                    title="Matching nodes"
                  >
                    {matchCount}/{data?.nodes.length ?? 0}
                  </span>
                  <button
                    onClick={() => setQuery("")}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 text-text-dim hover:text-text"
                    title="Clear search"
                    aria-label="Clear search"
                  >
                    <X size={12} />
                  </button>
                </>
              )}
            </div>
            <button onClick={reload} className="btn-ghost" title="Refresh">
              <RefreshCw size={13} className={busy ? "animate-spin" : ""} />
            </button>
            <button onClick={fitToView} className="btn-ghost" title="Fit graph to view">
              fit
            </button>
            <button onClick={resetView} className="btn-ghost" title="Reset view">
              reset
            </button>
          </div>
          <div className="flex-1" />
          <div className="pointer-events-auto absolute bottom-3 right-3 flex flex-col gap-1">
            <button
              onClick={() => zoomAt(1.2, size.w / 2, size.h / 2)}
              className="btn-outline h-8 w-8 p-0"
              title="Zoom in"
            >
              <ZoomIn size={14} />
            </button>
            <button
              onClick={() => zoomAt(0.83, size.w / 2, size.h / 2)}
              className="btn-outline h-8 w-8 p-0"
              title="Zoom out"
            >
              <ZoomOut size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* Sidebar */}
      <div className="hidden w-72 shrink-0 overflow-y-auto border-l border-border-subtle bg-surface/40 p-4 lg:block">
        <div className="mb-4">
          <div className="mb-2 flex items-center gap-2 text-text-muted">
            <Filter size={12} />
            <span className="text-[11px] uppercase tracking-widest">Node kinds</span>
          </div>
          <div className="space-y-1.5">
            {NODE_KINDS.map((k) => (
              <label
                key={k}
                className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-xs hover:bg-surface-2"
              >
                <input
                  type="checkbox"
                  checked={filter.has(k)}
                  onChange={() => {
                    const n = new Set(filter);
                    if (n.has(k)) n.delete(k);
                    else n.add(k);
                    setFilter(n);
                  }}
                  className="accent-accent"
                />
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ background: KIND_COLORS[k].fill }}
                />
                <span className="capitalize text-text-muted">{k}</span>
                <span className="ml-auto font-mono text-[10px] text-text-dim">
                  {graph.nodes.filter((n) => n.kind === k).length}
                </span>
              </label>
            ))}
          </div>
        </div>

        <div className="mb-4">
          <div className="mb-2 text-[11px] uppercase tracking-widest text-text-muted">
            Edge types
          </div>
          <div className="space-y-1">
            {Object.entries(EDGE_COLORS).map(([k, c]) => {
              const n = graph.edges.filter((e) => e.edge_type === k).length;
              const on = edgeFilter.has(k);
              return (
                <label
                  key={k}
                  className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-xs hover:bg-surface-2"
                >
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => {
                      const next = new Set(edgeFilter);
                      if (next.has(k)) next.delete(k);
                      else next.add(k);
                      setEdgeFilter(next);
                    }}
                    className="accent-accent"
                  />
                  <span
                    className="h-0.5 w-6 rounded"
                    style={{ background: c, opacity: on ? 1 : 0.3 }}
                  />
                  <span className={clsx("font-mono", !on && "line-through opacity-50")}>{k}</span>
                  <span className="ml-auto font-mono text-[10px] text-text-dim">{n}</span>
                </label>
              );
            })}
          </div>
        </div>

        {hoverNode && (
          <div className="card p-3">
            <div className="mb-1.5 flex items-center gap-2">
              <span
                className="h-2 w-2 rounded-full"
                style={{ background: KIND_COLORS[hoverNode.kind as NodeKind]?.fill }}
              />
              <span className="text-[11px] uppercase tracking-widest text-text-dim">
                {hoverNode.kind}
              </span>
            </div>
            <div className="font-serif text-sm text-text">{hoverNode.label}</div>
            {hoverNode.file_path && (
              <div className="mt-1.5 truncate font-mono text-[10px] text-text-dim">
                {hoverNode.file_path}
                {hoverNode.start_line && `:${hoverNode.start_line}`}
              </div>
            )}
          </div>
        )}

        <div className="mt-4 rounded-md border border-border-subtle bg-surface-2 p-3 text-[11px] text-text-muted">
          <div className="mb-1 font-medium text-text">Tips</div>
          <ul className="ml-3 list-disc space-y-0.5">
            <li>Drag to pan, wheel to zoom</li>
            <li>Click a function/struct to open detail</li>
            <li>Right-click any node for actions</li>
            <li>Hover to highlight connections</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

// ───────── Drawing ─────────
function drawScene(
  ctx: CanvasRenderingContext2D,
  size: { w: number; h: number },
  data: { nodes: GraphNode[]; edges: GraphEdge[] } | null,
  posMap: Record<string, Pos>,
  view: { x: number; y: number; k: number },
  hover: string | null,
  query: string,
) {
  ctx.clearRect(0, 0, size.w, size.h);

  if (!data) return;

  // Compute visible world rectangle for viewport culling.
  const wx0 = -view.x / view.k;
  const wy0 = -view.y / view.k;
  const wx1 = (size.w - view.x) / view.k;
  const wy1 = (size.h - view.y) / view.k;
  const pad = 40;
  const inView = (x: number, y: number, r: number) =>
    x + r >= wx0 - pad &&
    x - r <= wx1 + pad &&
    y + r >= wy0 - pad &&
    y - r <= wy1 + pad;

  const nodeById = new Map(data.nodes.map((n) => [n.uid, n]));

  // Edges first (so they sit under nodes).
  for (const e of data.edges) {
    const a = posMap[e.from];
    const b = posMap[e.to];
    if (!a || !b) continue;
    const aVisible = inView(a.x, a.y, 20);
    const bVisible = inView(b.x, b.y, 20);
    if (!aVisible && !bVisible) continue;
    const aNode = nodeById.get(e.from);
    const bNode = nodeById.get(e.to);
    if (!aNode || !bNode) continue;
    const isHighlighted = hover === e.from || hover === e.to;
    const dimmed = hover && !isHighlighted;
    const color = EDGE_COLORS[e.edge_type] ?? "#3a342d";
    ctx.strokeStyle = color;
    ctx.globalAlpha = dimmed ? 0.1 : isHighlighted ? 0.9 : 0.4;
    ctx.lineWidth = (isHighlighted ? 1.5 : 0.6) * Math.max(0.5, view.k);
    ctx.beginPath();
    ctx.moveTo(view.x + a.x * view.k, view.y + a.y * view.k);
    ctx.lineTo(view.x + b.x * view.k, view.y + b.y * view.k);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // Nodes.
  const q = query.trim().toLowerCase();
  for (const n of data.nodes) {
    const p = posMap[n.uid];
    if (!p) continue;
    const r = nodeRadius(n);
    if (!inView(p.x, p.y, r)) continue;
    const colors = KIND_COLORS[n.kind as NodeKind] ?? KIND_COLORS.function;
    const isHover = hover === n.uid;
    const isMatch = q && (n.label.toLowerCase().includes(q) ||
      (n.file_path ?? "").toLowerCase().includes(q));
    const faded = q && !isMatch;
    const dimmed = hover && !isHover;
    ctx.globalAlpha = faded || dimmed ? 0.18 : 1;
    if (isHover || isMatch) {
      ctx.fillStyle = colors.stroke;
      ctx.globalAlpha = (faded || dimmed ? 0.18 : 0.3);
      ctx.beginPath();
      ctx.arc(
        view.x + p.x * view.k,
        view.y + p.y * view.k,
        (r + 3) * view.k,
        0,
        Math.PI * 2,
      );
      ctx.fill();
      ctx.globalAlpha = faded || dimmed ? 0.18 : 1;
    }
    ctx.fillStyle = colors.fill;
    ctx.strokeStyle = colors.stroke;
    ctx.lineWidth = (n.kind === "file" ? 2 : 1) * Math.max(0.5, view.k);
    ctx.beginPath();
    ctx.arc(view.x + p.x * view.k, view.y + p.y * view.k, r * view.k, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // (#200) Persistent labels for search matches, not just hover.
    if (isHover || (q && isMatch)) {
      ctx.globalAlpha = 1;
      ctx.fillStyle = cssVar("--text", "#E8E2D6");
      ctx.font = `${11 * view.k}px Inter, system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.fillText(
        n.label,
        view.x + p.x * view.k,
        view.y + (p.y - r - 6) * view.k,
      );
    }
  }
  ctx.globalAlpha = 1;
}

function nodeRadius(n: GraphNode): number {
  if (n.kind === "file") return 10 + Math.min(8, Math.sqrt(n.size));
  return 4 + Math.min(6, Math.log2(n.size + 1) * 1.5);
}

function cssVar(name: string, fallback: string): string {
  if (typeof document === "undefined") return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

// ───────── Seed positions (instant, no force) ─────────
// File nodes on a circle, non-files jittered near their parent file.
// Hash-based deterministic jitter so the layout is stable across reloads.
function computeSeedPositions(nodes: GraphNode[]): Record<string, Pos> {
  const cx = LAYOUT_CX;
  const cy = LAYOUT_CY;
  const fileRadius = Math.min(LAYOUT_W, LAYOUT_H) * 0.32;

  const filePos: Record<string, Pos> = {};
  let fIdx = 0;
  for (const n of nodes) {
    if (n.kind !== "file") continue;
    const ang = (fIdx / Math.max(1, countKind(nodes, "file"))) * Math.PI * 2;
    filePos[n.uid] = {
      x: cx + Math.cos(ang) * fileRadius,
      y: cy + Math.sin(ang) * fileRadius,
    };
    fIdx++;
  }
  const pathToFile = new Map<string, string>();
  for (const n of nodes) {
    if (n.kind === "file" && n.file_path && !pathToFile.has(n.file_path)) {
      pathToFile.set(n.file_path, n.uid);
    }
  }

  const out: Record<string, Pos> = {};
  for (const n of nodes) {
    if (n.kind === "file") {
      out[n.uid] = filePos[n.uid];
    } else {
      const fp = (n.file_path && pathToFile.get(n.file_path)) || null;
      const base = fp ? filePos[fp] : { x: cx, y: cy };
      const h = hash32(n.uid);
      const ang = ((h & 0xffff) / 0xffff) * Math.PI * 2;
      const r = 30 + (((h >>> 16) & 0xffff) / 0xffff) * 30;
      out[n.uid] = { x: base.x + Math.cos(ang) * r, y: base.y + Math.sin(ang) * r };
    }
  }
  return out;
}

function countKind(nodes: GraphNode[], kind: string): number {
  let n = 0;
  for (const x of nodes) if (x.kind === kind) n++;
  return n;
}

function hash32(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// ───────── Web Worker plumbing ─────────
// Request id sequence so we can ignore any late messages from a
// terminated worker.
const layoutReqSeq = { current: 0 };

// Send log via the same Tauri channel main.tsx uses.
function send(level: "info" | "warn" | "error", ...args: unknown[]) {
  try {
    const msg = args
      .map((a) => (typeof a === "string" ? a : JSON.stringify(a)))
      .join(" ");
    window.__TAURI__?.invoke("log_frontend", { level, message: msg });
  } catch {
    /* ignore */
  }
}

declare global {
  interface Window {
    __TAURI__?: { invoke: (cmd: string, args?: unknown) => Promise<unknown> };
  }
}
