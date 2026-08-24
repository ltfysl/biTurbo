// Barnes–Hut force-directed layout worker.
// Receives { nodes, edges, iterations, width, height } and posts progress updates
// then a final { positions: Record<uid, {x,y}>, iterationsDone, elapsedMs }.

/// <reference lib="webworker" />

export interface LayoutNode {
  uid: string;
  kind: string;
  file_path: string | null;
  size: number;
}

export interface LayoutEdge {
  from: string;
  to: string;
}

export interface LayoutRequest {
  type: "layout";
  requestId: number;
  nodes: LayoutNode[];
  edges: LayoutEdge[];
  width: number;
  height: number;
  iterations: number;
  // Optional warm-start from previous run.
  prevPositions?: Record<string, { x: number; y: number }> | null;
}

export interface LayoutProgress {
  type: "progress";
  requestId: number;
  positions: Record<string, { x: number; y: number }>;
  iteration: number;
}

export interface LayoutResult {
  type: "result";
  requestId: number;
  positions: Record<string, { x: number; y: number }>;
  iterationsDone: number;
  elapsedMs: number;
}

export interface LayoutError {
  type: "error";
  requestId: number;
  message: string;
}

const ctx: DedicatedWorkerGlobalScope = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = (ev: MessageEvent<LayoutRequest>) => {
  const req = ev.data;
  if (!req || req.type !== "layout") return;
  const t0 = performance.now();
  try {
    const positions = barnesHutLayout(
      req.nodes,
      req.edges,
      req.width,
      req.height,
      req.iterations,
      req.prevPositions ?? null,
      (positions, it) => {
        const msg: LayoutProgress = {
          type: "progress",
          requestId: req.requestId,
          positions,
          iteration: it,
        };
        ctx.postMessage(msg);
      },
    );
    // (#198) Worker reports elapsedMs for backend logging; it is not shown in the production toolbar.
    const msg: LayoutResult = {
      type: "result",
      requestId: req.requestId,
      positions,
      iterationsDone: req.iterations,
      elapsedMs: performance.now() - t0,
    };
    ctx.postMessage(msg);
  } catch (err) {
    const msg: LayoutError = {
      type: "error",
      requestId: req.requestId,
      message: err instanceof Error ? err.message : String(err),
    };
    ctx.postMessage(msg);
  }
};

// ---------------------------------------------------------------------------
// Barnes–Hut quadtree
// ---------------------------------------------------------------------------

interface Pos {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

class Quad {
  cx: number;
  cy: number;
  half: number; // half-width of this cell
  // Sum of masses and weighted positions for centre-of-mass
  mass = 0;
  comX = 0;
  comY = 0;
  // Children (only if internal)
  nw: Quad | null = null;
  ne: Quad | null = null;
  sw: Quad | null = null;
  se: Quad | null = null;
  // Leaf occupant (when no children)
  leafUid: string | null = null;
  // Whether the leaf node still has its position inside this cell
  hasNode = false;

  constructor(cx: number, cy: number, half: number) {
    this.cx = cx;
    this.cy = cy;
    this.half = half;
  }

  contains(x: number, y: number): boolean {
    return (
      x >= this.cx - this.half &&
      x < this.cx + this.half &&
      y >= this.cy - this.half &&
      y < this.cy + this.half
    );
  }

  // Insert a node (uid, x, y) — splits the cell if needed.
  insert(uid: string, x: number, y: number, mass: number, depth: number, pos: Pos[]): void {
    if (!this.hasNode) {
      this.leafUid = uid;
      this.hasNode = true;
      this.mass = mass;
      this.comX = x;
      this.comY = y;
      return;
    }
    // Already an internal node? Recurse into the right child.
    if (this.nw) {
      this.insertChild(uid, x, y, mass, depth, pos);
      return;
    }
    // Two occupants in the same leaf. Subdivide.
    const oldUid = this.leafUid!;
    const oldX = this.comX;
    const oldY = this.comY;
    const oldMass = this.mass;
    this.leafUid = null;
    const h = this.half / 2;
    this.nw = new Quad(this.cx - h, this.cy - h, h);
    this.ne = new Quad(this.cx + h, this.cy - h, h);
    this.sw = new Quad(this.cx - h, this.cy + h, h);
    this.se = new Quad(this.cx + h, this.cy + h, h);
    this.insertChild(oldUid, oldX, oldY, oldMass, depth, pos);
    this.insertChild(uid, x, y, mass, depth, pos);
  }

  private insertChild(
    uid: string,
    x: number,
    y: number,
    mass: number,
    depth: number,
    pos: Pos[],
  ): void {
    // Hard cap on depth to prevent pathological splits.
    if (depth > 24) {
      this.mass += mass;
      this.comX = (this.comX * (this.mass - mass) + x * mass) / this.mass;
      this.comY = (this.comY * (this.mass - mass) + y * mass) / this.mass;
      return;
    }
    const q = this.quadrantFor(x, y);
    q.insert(uid, x, y, mass, depth + 1, pos);
    // Recompute our own centre of mass from children.
    let total = 0;
    let cx = 0;
    let cy = 0;
    for (const child of [this.nw!, this.ne!, this.sw!, this.se!]) {
      if (child.hasNode && child.mass > 0) {
        total += child.mass;
        cx += child.comX * child.mass;
        cy += child.comY * child.mass;
      }
    }
    this.mass = total;
    this.comX = total > 0 ? cx / total : this.cx;
    this.comY = total > 0 ? cy / total : this.cy;
  }

  private quadrantFor(x: number, y: number): Quad {
    if (x < this.cx) {
      return y < this.cy ? this.nw! : this.sw!;
    }
    return y < this.cy ? this.ne! : this.se!;
  }
}

function buildTree(positions: Pos[], masses: Float64Array, cx: number, cy: number, half: number): Quad {
  const root = new Quad(cx, cy, half);
  for (let i = 0; i < positions.length; i++) {
    const p = positions[i];
    const m = masses[i];
    if (m <= 0) continue;
    // Clamp into root cell so out-of-bounds nodes still land somewhere sensible.
    const x = Math.max(cx - half, Math.min(cx + half, p.x));
    const y = Math.max(cy - half, Math.min(cy + half, p.y));
    root.insert(String(i), x, y, m, 0, positions);
  }
  return root;
}

function applyForce(
  p: Pos,
  tree: Quad,
  theta: number,
  repulsion: number,
  indexI: number,
  masses: Float64Array,
): void {
  if (!tree.hasNode || tree.mass <= 0) return;
  const dx = tree.comX - p.x;
  const dy = tree.comY - p.y;
  const dist2 = dx * dx + dy * dy;
  if (dist2 < 0.0001) return;
  // Internal cell: if size / distance < theta, treat as single body.
  if (tree.nw) {
    const size = tree.half * 2;
    if ((size * size) / dist2 > theta * theta) {
      // Recurse into children.
      applyForce(p, tree.nw!, theta, repulsion, indexI, masses);
      applyForce(p, tree.ne!, theta, repulsion, indexI, masses);
      applyForce(p, tree.sw!, theta, repulsion, indexI, masses);
      applyForce(p, tree.se!, theta, repulsion, indexI, masses);
      return;
    }
  }
  // Leaf: don't repel from yourself.
  if (!tree.nw && tree.leafUid === String(indexI)) return;
  const dist = Math.sqrt(dist2);
  const f = repulsion * tree.mass / dist2;
  const fx = (dx / dist) * f;
  const fy = (dy / dist) * f;
  const myMass = masses[indexI];
  p.vx += fx / Math.max(0.1, myMass);
  p.vy += fy / Math.max(0.1, myMass);
}

// ---------------------------------------------------------------------------
// Main layout routine
// ---------------------------------------------------------------------------

function barnesHutLayout(
  nodes: LayoutNode[],
  edges: LayoutEdge[],
  W: number,
  H: number,
  iterations: number,
  prevPositions: Record<string, { x: number; y: number }> | null,
  onProgress: (positions: Record<string, { x: number; y: number }>, iteration: number) => void,
): Record<string, { x: number; y: number }> {
  const n = nodes.length;
  if (n === 0) return {};
  const ids = new Array<string>(n);
  const positions = new Array<Pos>(n);
  const masses = new Float64Array(n);

  // Initial placement: file nodes on a circle, others seeded near their file.
  const cx = W / 2;
  const cy = H / 2;
  const fileIndices: number[] = [];
  for (let i = 0; i < n; i++) {
    if (nodes[i].kind === "file") fileIndices.push(i);
  }
  const fileRadius = Math.min(W, H) * 0.32;
  const filePos: Record<string, { x: number; y: number }> = {};
  for (let k = 0; k < fileIndices.length; k++) {
    const i = fileIndices[k];
    const ang = (k / Math.max(1, fileIndices.length)) * Math.PI * 2;
    filePos[nodes[i].uid] = {
      x: cx + Math.cos(ang) * fileRadius,
      y: cy + Math.sin(ang) * fileRadius,
    };
  }
  // Map file_path -> first file uid for non-file children.
  const pathToFileUid = new Map<string, string>();
  for (let k = 0; k < fileIndices.length; k++) {
    const i = fileIndices[k];
    const fp = nodes[i].file_path;
    if (fp && !pathToFileUid.has(fp)) pathToFileUid.set(fp, nodes[i].uid);
  }

  for (let i = 0; i < n; i++) {
    const node = nodes[i];
    ids[i] = node.uid;
    masses[i] = node.kind === "file" ? 8 : 1;
    const prev = prevPositions?.[node.uid];
    if (prev && Number.isFinite(prev.x) && Number.isFinite(prev.y)) {
      positions[i] = { x: prev.x, y: prev.y, vx: 0, vy: 0 };
      continue;
    }
    if (node.kind === "file") {
      const fp = filePos[node.uid];
      positions[i] = { x: fp.x, y: fp.y, vx: 0, vy: 0 };
    } else {
      const fileUid = node.file_path ? pathToFileUid.get(node.file_path) : undefined;
      const fp = fileUid ? filePos[fileUid] : { x: cx, y: cy };
      // Deterministic-ish seed from uid so the layout is reproducible.
      let h = 2166136261;
      for (let c = 0; c < node.uid.length; c++) {
        h ^= node.uid.charCodeAt(c);
        h = Math.imul(h, 16777619);
      }
      const ang = ((h & 0xffff) / 0xffff) * Math.PI * 2;
      const r = 30 + (((h >>> 16) & 0xffff) / 0xffff) * 30;
      positions[i] = {
        x: fp.x + Math.cos(ang) * r,
        y: fp.y + Math.sin(ang) * r,
        vx: 0,
        vy: 0,
      };
    }
  }

  // Build edge list referencing position indices.
  const idToIdx = new Map<string, number>();
  for (let i = 0; i < n; i++) idToIdx.set(ids[i], i);
  const adj: [number, number][] = [];
  for (let e = 0; e < edges.length; e++) {
    const a = idToIdx.get(edges[e].from);
    const b = idToIdx.get(edges[e].to);
    if (a !== undefined && b !== undefined) adj.push([a, b]);
  }

  // Iterations: fewer for large n, but always at least 60.
  const iterCount = Math.max(60, Math.min(iterations, Math.round(220 - Math.log2(n) * 12)));
  const repulsion = 4500;
  const springLen = 70;
  const springK = 0.04;
  const centerK = 0.005;
  const damping = 0.82;
  const theta = 0.85;
  // Root cell sized to comfortably cover the world (2× W × 2× H).
  const half = Math.max(W, H);
  const progressEvery = Math.max(1, Math.floor(iterCount / 4));

  for (let it = 0; it < iterCount; it++) {
    const tree = buildTree(positions, masses, cx, cy, half);
    for (let i = 0; i < n; i++) {
      applyForce(positions[i], tree, theta, repulsion, i, masses);
    }
    for (let e = 0; e < adj.length; e++) {
      const [u, v] = adj[e];
      const a = positions[u];
      const b = positions[v];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const diff = dist - springLen;
      const f = diff * springK;
      const fx = (dx / dist) * f;
      const fy = (dy / dist) * f;
      a.vx += fx;
      a.vy += fy;
      b.vx -= fx;
      b.vy -= fy;
    }
    for (let i = 0; i < n; i++) {
      const p = positions[i];
      p.vx += (cx - p.x) * centerK;
      p.vy += (cy - p.y) * centerK;
    }
    for (let i = 0; i < n; i++) {
      const p = positions[i];
      p.vx *= damping;
      p.vy *= damping;
      p.x += p.vx;
      p.y += p.vy;
      // Clamp to canvas.
      p.x = Math.max(-W, Math.min(2 * W, p.x));
      p.y = Math.max(-H, Math.min(2 * H, p.y));
    }
    if ((it + 1) % progressEvery === 0 || it === iterCount - 1) {
      const snap: Record<string, { x: number; y: number }> = {};
      for (let i = 0; i < n; i++) snap[ids[i]] = { x: positions[i].x, y: positions[i].y };
      onProgress(snap, it + 1);
    }
  }

  const out: Record<string, { x: number; y: number }> = {};
  for (let i = 0; i < n; i++) out[ids[i]] = { x: positions[i].x, y: positions[i].y };
  return out;
}

export {};
