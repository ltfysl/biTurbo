import { formatDistanceToNow, format } from "date-fns";

export function timeAgo(ms: number): string {
  return formatDistanceToNow(new Date(ms), { addSuffix: true });
}

export function shortDate(ms: number): string {
  return format(new Date(ms), "MMM d, HH:mm");
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
  const segments = path.split("/");
  const file = segments.pop() ?? "";
  let result = file;
  while (segments.length > 0) {
    const next = segments.pop() + "/" + result;
    if (("…/" + next).length > maxLen) break;
    result = next;
  }
  if (result === path) return result;
  const out = "…/" + result;
  if (out.length <= maxLen) return out;
  // The remaining result (often the filename alone) is still too long.
  // Truncate the final segment while preserving an extension if present.
  const lastSlash = result.lastIndexOf("/");
  const prefix = lastSlash === -1 ? "" : result.slice(0, lastSlash + 1);
  const name = lastSlash === -1 ? result : result.slice(lastSlash + 1);
  const dot = name.lastIndexOf(".");
  const [stem, ext] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ""];
  const budget = maxLen - 3 - prefix.length - ext.length; // 3 for leading "…/"
  if (budget > 2) {
    return "…/" + prefix + stem.slice(0, budget - 1) + "…" + ext;
  }
  return "…/" + (prefix + (ext ? "…" + ext : "…")).slice(0, maxLen - 3);
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

export interface CodeToken {
  text: string;
  kind: "keyword" | "string" | "comment" | "number" | "plain";
}

/** Lightweight, dependency-free tokenizer for a code preview (not a full lexer). */
export function tokenizeCode(line: string): CodeToken[] {
  const tokens: CodeToken[] = [];
  const pattern =
    /(\/\/.*$|^\s*#.*$)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_$][\w$]*)|(\s+)|(.)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(line))) {
    const [, comment, str, num, word, space, other] = match;
    if (comment !== undefined) tokens.push({ text: comment, kind: "comment" });
    else if (str !== undefined) tokens.push({ text: str, kind: "string" });
    else if (num !== undefined) tokens.push({ text: num, kind: "number" });
    else if (word !== undefined)
      tokens.push({ text: word, kind: KEYWORDS.has(word) ? "keyword" : "plain" });
    else if (space !== undefined) tokens.push({ text: space, kind: "plain" });
    else if (other !== undefined) tokens.push({ text: other, kind: "plain" });
  }
  return tokens;
}
