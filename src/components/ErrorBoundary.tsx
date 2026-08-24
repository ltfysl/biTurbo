import { Component, type ReactNode } from "react";
import { useApp } from "../lib/store";
declare global {
  interface Window {
    __TAURI__?: { invoke: (cmd: string, args?: unknown) => Promise<unknown> };
  }
}

interface Props {
  name: string;
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // (#131) Surface view crashes as frontend logs so they are not silent.
    const { name } = this.props;
    const msg = `[ErrorBoundary:${name}] ${error.message}`;
    try {
      window.__TAURI__?.invoke("log_frontend", { level: "error", message: msg });
    } catch {
      console.error(msg, info);
    }
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="flex h-full flex-col items-center justify-center p-8 text-center">
        <div className="font-serif text-lg text-text">This view crashed</div>
        <p className="mt-1 text-sm text-text-muted">
          Something went wrong in {this.props.name}. Your data is safe.
        </p>
        <pre className="mt-3 w-full max-w-md overflow-x-auto rounded-md border border-border-subtle bg-surface-2 p-3 font-mono text-xs text-text-muted">
          {error.message}
        </pre>
        <ResetButton />
      </div>
    );
  }
}

function ResetButton() {
  const setView = useApp((s) => s.setView);
  return (
    <button
      onClick={() => {
        setView("overview");
        // React preserves class state through an error, so force a hard reset
        // by navigating to Overview and letting the user switch back.
      }}
      className="btn-primary mt-4"
    >
      Back to Overview
    </button>
  );
}
