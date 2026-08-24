import { useMemo } from "react";

/**
 * Detect the host platform for shortcut rendering (#10). In Tauri the renderer is
 * a regular browser, so `navigator.platform` is the best lightweight signal.
 */
export function isMac(): boolean {
  return typeof navigator !== "undefined" && /Mac/i.test(navigator.platform);
}

/**
 * Render a keyboard shortcut string using the right modifier for the platform.
 * Supported tokens: `mod` (Ctrl / ⌘), `shift`, `alt`, `opt`, `ctrl`.
 * Special key names: `enter` / `return`, `escape`, `arrow` keys.
 */
export function formatShortcut(combo: string): string {
  const mac = isMac();
  return combo
    .toLowerCase()
    .split(/\s*\+\s*/)
    .map((part) => {
      switch (part) {
        case "mod":
          return mac ? "⌘" : "Ctrl";
        case "shift":
          return mac ? "⇧" : "Shift";
        case "alt":
        case "opt":
          return mac ? "⌥" : "Alt";
        case "ctrl":
          return "Ctrl";
        case "enter":
        case "return":
          return mac ? "⏎" : "Enter";
        case "escape":
        case "esc":
          return mac ? "⎋" : "Esc";
        default:
          return part.length === 1 ? part.toUpperCase() : part;
      }
    })
    .join(mac ? "" : "+");
}

/** Small inline keyboard hint. */
export function Kbd({ combo, className = "" }: { combo: string; className?: string }) {
  const text = useMemo(() => formatShortcut(combo), [combo]);
  const kbdClass = useMemo(() => (`kbd ${className}`.trim()), [className]);
  return <span className={kbdClass}>{text}</span>;
}
