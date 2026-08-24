import { useEffect, useRef, type ReactNode } from "react";
import { AlertTriangle, X } from "lucide-react";
import clsx from "clsx";
import { useApp } from "../lib/store";

/**
 * Imperative confirmation modal.
 *
 *   const ok = await confirm({ title: "Delete?", body: "..." });
 *   if (!ok) return;
 *
 * Render <ConfirmModalHost /> once near the app root so any
 * component can call `confirm()` from the store.
 */
export interface ConfirmOptions {
  title: string;
  body: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "danger" | "neutral";
}

export function ConfirmModalHost() {
  const state = useApp((s) => s.confirmState);
  const resolve = useApp((s) => s.resolveConfirm);
  const cancel = useApp((s) => s.cancelConfirm);
  return state ? (
    <ConfirmModal
      opts={state}
      onResolve={resolve}
      onCancel={cancel}
    />
  ) : null;
}

function ConfirmModal({
  opts,
  onResolve,
  onCancel,
}: {
  opts: ConfirmOptions;
  onResolve: () => void;
  onCancel: () => void;
}) {
  const confirmRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const tone = opts.tone ?? "danger";

  // Keep Tab cycling within the modal.
  function trapTab(e: React.KeyboardEvent) {
    if (e.key !== "Tab" || !dialogRef.current) return;
    const focusables = dialogRef.current.querySelectorAll<HTMLElement>(
      'button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])',
    );
    if (focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement as HTMLElement | null;
    const inside = active != null && dialogRef.current.contains(active);
    if (e.shiftKey) {
      if (active === first || !inside) {
        e.preventDefault();
        last.focus();
      }
    } else {
      if (active === last || !inside) {
        e.preventDefault();
        first.focus();
      }
    }
  }

  // Focus the safe action on open (Cancel for destructive confirms so a
  // reflexive Enter can't trigger an irreversible action), restore focus
  // on close.
  useEffect(() => {
    previouslyFocused.current = (document.activeElement as HTMLElement) ?? null;
    const initial = tone === "danger" ? cancelRef.current : confirmRef.current;
    initial?.focus();
    return () => {
      // After close, hand focus back to whatever opened the modal.
      const opener = previouslyFocused.current;
      if (opener && document.body.contains(opener)) {
        opener.focus();
      }
    };
  }, []);

  // Escape cancels.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCancel();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onCancel]);

  const confirmLabel = opts.confirmLabel ?? "Delete";
  const cancelLabel = opts.cancelLabel ?? "Cancel";


  return (
    <div
      ref={dialogRef}
      className="fixed inset-0 z-50 flex items-center justify-center backdrop p-4 animate-backdrop_in backdrop-blur-sm"
      onMouseDown={(e) => {
        // Backdrop click cancels.
        if (e.target === e.currentTarget) onCancel();
      }}
      onKeyDown={trapTab}
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
    >
      <div className="w-full max-w-md rounded-lg border border-border bg-surface shadow-modal animate-modal_in">
        <div className="flex items-start gap-3 p-5">
          {tone === "danger" && (
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-danger/15 text-danger">
              <AlertTriangle size={18} />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h2
              id="confirm-title"
              className="font-serif text-lg font-medium text-text"
            >
              {opts.title}
            </h2>
            <div className="mt-1.5 text-sm text-text-muted text-pretty">
              {opts.body}
            </div>
          </div>
          <button
            onClick={onCancel}
            className="btn-ghost -m-1 p-1.5"
            aria-label="Close"
          >
            <X size={14} />
          </button>
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-border-subtle px-5 py-3">
          <button
            ref={cancelRef}
            onClick={onCancel}
            className="btn-outline"
          >
            {cancelLabel}
          </button>
// (#521) No "Working…" pending state; the resolver is called synchronously.
          <button
            ref={confirmRef}
            onClick={onResolve}
            className={clsx(
              "btn",
              tone === "danger"
                ? "bg-danger text-bg hover:bg-danger/90"
                : "btn-primary"
            )}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
