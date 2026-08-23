import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useApp } from "../lib/store";
import clsx from "clsx";

export interface ContextMenuItem {
  label: string;
  icon?: ReactNode;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
  shortcut?: string;
  separator?: boolean;
}

const MENU_WIDTH_ESTIMATE = 220;
const MENU_HEIGHT_ESTIMATE = 36 * 6;

/**
 * Right-click context menu. Render <ContextMenuHost /> once near the
 * app root, then any component can call `useContextMenu().show(x, y, items)`
 * to pop it open at the cursor.
 */
export function ContextMenuHost() {
  const cm = useApp((s) => s.contextMenu);
  const close = useApp((s) => s.closeContextMenu);
  if (!cm) return null;
  return <ContextMenu x={cm.x} y={cm.y} items={cm.items} onClose={close} />;
}

function ContextMenu({
  x,
  y,
  items,
  onClose,
}: {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });
  const [visible, setVisible] = useState(false);
  const [activeIdx, setActiveIdx] = useState<number>(() => {
    // Focus first non-disabled, non-separator item.
    return items.findIndex((i) => !i.disabled && !i.separator);
  });

  // Clamp to the viewport. Runs as a layout effect so the first paint is
  // already clamped (no one-frame flash at the raw cursor coords), and
  // re-runs on resize/scroll so the menu can't strand off-screen.
  useLayoutEffect(() => {
    const clamp = () => {
      const el = ref.current;
      if (!el) return;
      const w = el.offsetWidth || MENU_WIDTH_ESTIMATE;
      const h = el.offsetHeight || MENU_HEIGHT_ESTIMATE;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      let left = x;
      let top = y;
      if (left + w > vw - 8) left = Math.max(8, vw - w - 8);
      if (top + h > vh - 8) top = Math.max(8, vh - h - 8);
      setPos({ left, top });
      setVisible(true);
    };
    clamp();
    window.addEventListener("resize", clamp);
    window.addEventListener("scroll", clamp, true);
    return () => {
      window.removeEventListener("resize", clamp);
      window.removeEventListener("scroll", clamp, true);
    };
  }, [x, y, items]);

  // Outside click + Escape close.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    // Defer listener attach by one frame so the right-click that
    // opened us doesn't immediately close us.
    const t = window.setTimeout(() => {
      document.addEventListener("mousedown", onDown, true);
      document.addEventListener("contextmenu", onDown, true);
    }, 0);
    document.addEventListener("keydown", onKey, true);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener("mousedown", onDown, true);
      document.removeEventListener("contextmenu", onDown, true);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [onClose]);

  // Keyboard navigation (Arrow up/down, Enter).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const selectable = items
        .map((it, i) => ({ it, i }))
        .filter((x) => !x.it.separator && !x.it.disabled);
      if (selectable.length === 0) return;
      const currentSelectableIdx = selectable.findIndex(
        (s) => s.i === activeIdx,
      );
      if (e.key === "ArrowDown") {
        e.preventDefault();
        const next = (currentSelectableIdx + 1) % selectable.length;
        setActiveIdx(selectable[next].i);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        const prev =
          (currentSelectableIdx - 1 + selectable.length) % selectable.length;
        setActiveIdx(selectable[prev].i);
      } else if (e.key === "Enter") {
        e.preventDefault();
        const sel = items[activeIdx];
        if (sel && !sel.disabled && !sel.separator) {
          sel.onClick();
          onClose();
        }
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [activeIdx, items, onClose]);

  return (
    <div
      style={{ left: pos.left, top: pos.top, visibility: visible ? "visible" : "hidden" }}
      role="menu"
      className="fixed z-50 min-w-[180px] rounded-md border border-border bg-surface p-1 shadow-modal animate-context_in"
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((item, i) => {
        if (item.separator) {
          return (
            <div
              key={`sep-${i}`}
              className="my-1 h-px bg-border-subtle"
              role="separator"
            />
          );
        }
        const active = i === activeIdx;
        return (
          <button
            key={`${item.label}-${i}`}
            role="menuitem"
            disabled={item.disabled}
            onMouseEnter={() => setActiveIdx(i)}
            onClick={() => {
              if (item.disabled) return;
              item.onClick();
              onClose();
            }}
            className={clsx(
              "flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-xs transition",
              item.disabled
                ? "cursor-not-allowed text-text-dim"
                : item.danger
                ? "text-danger hover:bg-danger/10"
                : "text-text-muted hover:bg-surface-2 hover:text-text",
              active && !item.disabled && "bg-surface-2 text-text",
            )}
          >
            {item.icon && <span className="shrink-0">{item.icon}</span>}
            <span className="flex-1">{item.label}</span>
            {item.shortcut && (
              <span className="kbd ml-auto">{item.shortcut}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Returns the imperative `showContextMenu(x, y, items)` from the store.
 * Example:
 *
 *   const show = useContextMenu();
 *   onContextMenu={(e) => {
 *     e.preventDefault();
 *     show(e.clientX, e.clientY, [
 *       { label: "Open", onClick: () => doOpen() },
 *       { label: "Delete", danger: true, onClick: () => doDelete() },
 *     ]);
 *   }}
 */
export function useContextMenu() {
  return useApp((s) => s.showContextMenu);
}
