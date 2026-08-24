import { formatDistanceToNow, format } from "date-fns";

const TS_SECONDS_THRESHOLD = 1e10; // values below this are Unix seconds, not ms

export function timeAgo(ms: number): string {
  const n = ms < TS_SECONDS_THRESHOLD ? ms * 1000 : ms;
  const now = Date.now();
  if (n >= now) return "just now";
  return formatDistanceToNow(new Date(n), { addSuffix: true });
}

export function shortDate(ms: number): string {
  const d = new Date(ms < TS_SECONDS_THRESHOLD ? ms * 1000 : ms);
  const now = new Date();
  const includeYear = d.getFullYear() !== now.getFullYear();
  return format(d, includeYear ? "MMM d, yyyy '·' HH:mm" : "MMM d, HH:mm");
}

export function dayLabel(ms: number): string {
  return format(new Date(ms), "EEE");
}

export function bytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

// (#123) Type rings are consumed by MemoryCard/MemoryDetail badges.
export const MEM_TYPE_META: Record<
  string,
  { label: string; color: string; bg: string; ring: string; dot: string }
> = {
  fact: {
    label: "Fact",
    color: "text-[var(--type-fact-color)]",
    bg: "bg-[var(--type-fact-bg)]",
    ring: "ring-[var(--type-fact-ring)]",
    dot: "bg-[var(--type-fact-dot)]",
  },
  decision: {
    label: "Decision",
    color: "text-[var(--type-decision-color)]",
    bg: "bg-[var(--type-decision-bg)]",
    ring: "ring-[var(--type-decision-ring)]",
    dot: "bg-[var(--type-decision-dot)]",
  },
  preference: {
    label: "Preference",
    color: "text-[var(--type-preference-color)]",
    bg: "bg-[var(--type-preference-bg)]",
    ring: "ring-[var(--type-preference-ring)]",
    dot: "bg-[var(--type-preference-dot)]",
  },
  pattern: {
    label: "Pattern",
    color: "text-[var(--type-pattern-color)]",
    bg: "bg-[var(--type-pattern-bg)]",
    ring: "ring-[var(--type-pattern-ring)]",
    dot: "bg-[var(--type-pattern-dot)]",
  },
  episode: {
    label: "Episode",
    color: "text-[var(--type-episode-color)]",
    bg: "bg-[var(--type-episode-bg)]",
    ring: "ring-[var(--type-episode-ring)]",
    dot: "bg-[var(--type-episode-dot)]",
  },
  reflection: {
    label: "Reflection",
    color: "text-[var(--type-reflection-color)]",
    bg: "bg-[var(--type-reflection-bg)]",
    ring: "ring-[var(--type-reflection-ring)]",
    dot: "bg-[var(--type-reflection-dot)]",
  },
  code: {
    label: "Code",
    color: "text-[var(--type-code-color)]",
    bg: "bg-[var(--type-code-bg)]",
    ring: "ring-[var(--type-code-ring)]",
    dot: "bg-[var(--type-code-dot)]",
  },
};

export function truncatePath(path: string, maxLen = 40): string {
  if (path.length <= maxLen) return path;

  const hasBackslash = path.includes("\\");
  const driveMatch = path.match(/^([A-Za-z]:)([\\/])/);
  const drive = driveMatch ? driveMatch[1] : "";
  const sep = driveMatch ? driveMatch[2] : hasBackslash ? "\\" : "/";
  const body = driveMatch ? path.slice(driveMatch[0].length) : path;
  const normalized = driveMatch ? body.replace(/[\\/]/g, sep) : body;
  const all = normalized.split(sep).filter((s) => s.length > 0);
  const file = all.pop() ?? "";
  let result = file;

  const head = drive ? drive + sep + "…" + sep : "…" + sep;
  while (all.length > 0) {
    const next = all.pop() + sep + result;
    if ((head + next).length > maxLen) break;
    result = next;
  }

  const out = head + result;
  if (out.length <= maxLen) return out;

  // The remaining path is still too long; truncate the filename while
  // preserving the extension if present.
  const lastSep = result.lastIndexOf(sep);
  const prefix = lastSep === -1 ? "" : result.slice(0, lastSep + 1);
  const name = lastSep === -1 ? result : result.slice(lastSep + 1);
  const dot = name.lastIndexOf(".");
  const [stem, ext] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ""];
  const fixedLen = head.length + prefix.length + ext.length;
  const budget = maxLen - fixedLen - 1; // space for the inner ellipsis
  if (budget > 2) {
    return head + prefix + stem.slice(0, budget - 1) + "…" + ext;
  }
  return head + (prefix + (ext ? "…" + ext : "…")).slice(0, maxLen - head.length);
}

export function importanceDots(imp: number): number {
  // 0..1 → 1..5 dots
  return Math.max(1, Math.min(5, Math.round(imp * 5)));
}

/** Human phrasing for ingest pipeline phases, shared by all progress UI. */
export const INGEST_PHASE_LABELS: Record<string, string> = {
  queued: "Queued",
  scanning: "Scanning project",
  parsing: "Parsing files",
  embedding: "Embedding chunks",
  writing: "Writing chunks",
  edges: "Building edges",
  done: "Done",
};

export function ingestPhaseLabel(phase: string): string {
  return INGEST_PHASE_LABELS[phase] ?? phase;
}

// (#15) Map backend/IPC errors to short, human-facing toast text via friendlyError().
/**
 * Human-facing error text for toasts: strips backend error prefixes,
 * collapses multi-line IPC dumps to the first line, and caps length.
 */
export function friendlyError(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e);
  const firstLine = raw.split("\n")[0]?.trim() ?? "";
  const cleaned = firstLine.replace(/^BiError:\s*/i, "").replace(/^Error:\s*/i, "");
  if (cleaned.length === 0) return "Something went wrong";
  return cleaned.length > 120 ? `${cleaned.slice(0, 117)}…` : cleaned;
}

/**
 * Code memory content is often stored with a redundant leading header comment
 * (e.g. `// C:\path\file.ts:1-133`) that duplicates the path/range already
 * shown in the code chip. Strip it so the code block only shows real code.
 */
export function stripLeadingPathComment(content: string, filePath: string | null): string {
  if (!filePath) return content;
  const lines = content.split("\n");
  const first = lines[0]?.trim() ?? "";
  const isCommentLine = /^(\/\/|#|--|\*)/.test(first);
  const fileName = filePath.split(/[/\\]/).pop() ?? filePath;
  if (isCommentLine && first.includes(fileName)) {
    return lines.slice(1).join("\n").replace(/^\n+/, "");
  }
  return content;
}

const KEYWORDS = new Set([
  "import", "from", "export", "default", "const", "let", "var", "function",
  "return", "if", "else", "for", "while", "do", "switch", "case", "break",
  "continue", "class", "interface", "type", "extends", "implements", "public",
  "private", "protected", "static", "readonly", "async", "await", "new",
  "this", "super", "null", "undefined", "true", "false", "void", "try",
  "catch", "finally", "throw", "typeof", "instanceof", "in", "of", "as",
  "enum", "namespace", "declare", "yield", "delete", "fn", "impl", "struct",
  "pub", "mut", "use", "def", "self", "None", "True", "False", "match",
]);
const LINE_RES: Record<string, RegExp> = {
  "//": /\/\/.*$/,
  "#": /#.*$/,
  "--": /--.*$/,
};
const BLOCK_RE = /\/\*[\s\S]*?\*\//;
const STRING_RES = [
  /"(?:[^"\\]|\\.)*"/,
  /'(?:[^'\\]|\\.)*'/,
  /`(?:[^`\\]|\\.)*`/,
];
const NUM_RE = /\b\d+(?:\.\d+)?\b/;
const WORD_RE = /[A-Za-z_$][\w$]*/;
const SPACE_RE = /\s+/;
const OTHER_RE = /./;


interface TokenConfig {
  line?: string;
  block: boolean;
}

const LANG_CONFIGS: Record<string, TokenConfig> = {
  js: { line: "//", block: true },
  javascript: { line: "//", block: true },
  ts: { line: "//", block: true },
  typescript: { line: "//", block: true },
  tsx: { line: "//", block: true },
  jsx: { line: "//", block: true },
  json: { line: "//", block: true },
  c: { line: "//", block: true },
  cpp: { line: "//", block: true },
  cxx: { line: "//", block: true },
  cc: { line: "//", block: true },
  h: { line: "//", block: true },
  hpp: { line: "//", block: true },
  hxx: { line: "//", block: true },
  cs: { line: "//", block: true },
  csharp: { line: "//", block: true },
  java: { line: "//", block: true },
  kt: { line: "//", block: true },
  kotlin: { line: "//", block: true },
  swift: { line: "//", block: true },
  rust: { line: "//", block: true },
  rs: { line: "//", block: true },
  go: { line: "//", block: true },
  golang: { line: "//", block: true },
  dart: { line: "//", block: true },
  php: { line: "//", block: true },
  scala: { line: "//", block: true },
  groovy: { line: "//", block: true },
  r: { line: "//", block: true },
  m: { line: "//", block: true },
  mm: { line: "//", block: true },
  svelte: { line: "//", block: true },
  astro: { line: "//", block: true },
  vue: { line: "//", block: true },
  gleam: { line: "//", block: true },

  py: { line: "#", block: false },
  python: { line: "#", block: false },
  sh: { line: "#", block: false },
  bash: { line: "#", block: false },
  zsh: { line: "#", block: false },
  fish: { line: "#", block: false },
  shell: { line: "#", block: false },
  yaml: { line: "#", block: false },
  yml: { line: "#", block: false },
  toml: { line: "#", block: false },
  dockerfile: { line: "#", block: false },
  makefile: { line: "#", block: false },
  perl: { line: "#", block: false },
  pl: { line: "#", block: false },
  raku: { line: "#", block: false },
  ruby: { line: "#", block: false },
  rb: { line: "#", block: false },
  nix: { line: "#", block: false },
  cmake: { line: "#", block: false },

  sql: { line: "--", block: false },
  psql: { line: "--", block: false },
  mysql: { line: "--", block: false },
  sqlite: { line: "--", block: false },
  lua: { line: "--", block: false },
  haskell: { line: "--", block: false },
  hs: { line: "--", block: false },
  erlang: { line: "--", block: false },
  erl: { line: "--", block: false },

  css: { block: true },
  scss: { block: true },
  sass: { block: true },
  less: { block: true },
  stylus: { block: true },
};

function getTokenConfig(language?: string | null): TokenConfig {
  if (!language) return { block: false };
  return LANG_CONFIGS[language.toLowerCase()] ?? { block: false };
}


export interface CodeToken {
  text: string;
  kind: "keyword" | "string" | "comment" | "number" | "plain";
}

/** Lightweight, dependency-free tokenizer for a code preview (not a full lexer). */
export function tokenizeCode(line: string, language?: string | null): CodeToken[] {
  const config = getTokenConfig(language);
  const pattern = new RegExp(
    [
      ...(config.block ? [BLOCK_RE.source] : []),
      ...(config.line ? [LINE_RES[config.line].source] : []),
      ...STRING_RES.map((r) => r.source),
      NUM_RE.source,
      WORD_RE.source,
      SPACE_RE.source,
      OTHER_RE.source,
    ].join("|"),
    "g"
  );
  const tokens: CodeToken[] = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(line))) {
    const text = match[0];
    let kind: CodeToken["kind"] = "plain";
    if (text.startsWith("/*") || (config.line && text.startsWith(config.line))) {
      kind = "comment";
    } else if (text[0] === '"' || text[0] === "'" || text[0] === "`") {
      kind = "string";
    } else if (/^\d/.test(text)) {
      kind = "number";
    } else if (/^[A-Za-z_$]/.test(text) && KEYWORDS.has(text)) {
      kind = "keyword";
    }
    tokens.push({ text, kind });
  }
  return tokens;
}
