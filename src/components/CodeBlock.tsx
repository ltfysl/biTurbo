import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { tokenizeCode } from "../lib/format";

const TOKEN_CLASS: Record<string, string> = {
  keyword: "italic",
  string: "italic",
  comment: "text-text-dim italic",
  number: "italic",
  plain: "text-text-muted",
};

function TokenSpan({ kind, children }: { kind: string; children: React.ReactNode }) {
  const style: React.CSSProperties = {};
  if (kind === "keyword" || kind === "string" || kind === "number") {
    style.color = `var(--token-${kind})`;
  }
  return (
    <span style={style} className={TOKEN_CLASS[kind] ?? ""}>
      {children}
    </span>
  );
}

interface CodeBlockProps {
  code: string;
  maxLines?: number;
  className?: string;
  /** (#51) Show a hover copy button. */
  showCopy?: boolean;
}

export function CodeBlock({ code, maxLines, className, showCopy }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const lines = code.split("\n");
  const shown = maxLines ? lines.slice(0, maxLines) : lines;
  const truncated = maxLines != null && lines.length > maxLines;
  const lineClass = maxLines ? "code-block-line" : "code-block-line wrap";

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Fallback: silently ignore; the host can use the native text selection.
    }
  }

  return (
    <div className={`relative group ${className ?? ""}`}>
      {showCopy && (
        <button
          onClick={copyCode}
          className="absolute top-2 right-2 z-10 rounded border border-border-subtle bg-surface-2 p-1.5 text-text-dim opacity-0 transition hover:text-text group-hover:opacity-100"
          title={copied ? "Copied" : "Copy code"}
          aria-label={copied ? "Copied" : "Copy code"}
        >
          {copied ? <Check size={13} className="text-success" /> : <Copy size={13} />}
        </button>
      )}
      <pre className={`code-block ${className ?? ""}`}>
        <code>
        {shown.map((line, i) => (
          <div key={i} className={lineClass}>
            {tokenizeCode(line).map((tok, j) => (
              <TokenSpan key={j} kind={tok.kind}>
                {tok.text}
              </TokenSpan>
            ))}
            {line.length === 0 && "\u00A0"}
          </div>
        ))}
        {truncated && <div className="code-block-line text-text-dim">…</div>}
        </code>
      </pre>
    </div>
  );
}
