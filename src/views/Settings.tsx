import { useEffect, useMemo, useState } from "react";
import { useApp, useConfirm } from "../lib/store";
import { api } from "../lib/api";
import { getVersion } from "@tauri-apps/api/app";
import {
  Terminal,
  Folder,
  Cpu,
  Copy,
  Check,
  FileCode2,
  Sun,
  Moon,
  Monitor,
  Power,
  AppWindow,
  Download,
  Loader2,
  RefreshCw,
  ArrowUpCircle,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { enable, disable, isEnabled } from "@tauri-apps/plugin-autostart";
import { openPath } from "@tauri-apps/plugin-opener";
import { invoke } from "@tauri-apps/api/core";
import clsx from "clsx";
// (#362) Configurable global hotkey and tray quick-capture settings pending.

export function Settings() {
  const stats = useApp((s) => s.stats);
  const currentProjectId = useApp((s) => s.currentProjectId);
  const projects = useApp((s) => s.projects);
  const showToast = useApp((s) => s.showToast);
  const theme = useApp((s) => s.theme);
  const setTheme = useApp((s) => s.setTheme);
  const confirm = useConfirm();
  const [copied, setCopied] = useState<string | null>(null);
  const [resolvedDataDir, setResolvedDataDir] = useState<string | null>(null);
  const [mcpBinary, setMcpBinary] = useState<{ path: string; is_absolute: boolean } | null>(null);
  const [ruleProjectId, setRuleProjectId] = useState<string | null>(null);
  const [launchOnBoot, setLaunchOnBoot] = useState(false);
  const [bootLoading, setBootLoading] = useState(true);
  const [bootSaving, setBootSaving] = useState(false);
  const [mcpInstalling, setMcpInstalling] = useState<Set<string>>(new Set());
  const [mcpInstalled, setMcpInstalled] = useState<Set<string>>(new Set());
  const [updateChecking, setUpdateChecking] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<{ version: string; body: string; available: boolean } | null>(null);
  const [updateInstalling, setUpdateInstalling] = useState(false);
  const [appVersion, setAppVersion] = useState<string | null>(null);
  const [devOpen, setDevOpen] = useState(false);

  useEffect(() => {
    isEnabled()
      .then(setLaunchOnBoot)
      .catch(() => setLaunchOnBoot(false))
      .finally(() => setBootLoading(false));
  }, []);

  useEffect(() => {
    // Same wire command the official path wrapper uses; called directly so
    // the value reflects this device without extra plugin surface.
    invoke<string>("plugin:path|resolve_directory", { kind: "appDataDir" })
      .then((dir) => setResolvedDataDir(dir))
      .catch(() => setResolvedDataDir(null));
  }, []);

  useEffect(() => {
    api
      .resolveMcpBinaryPath()
      .then(setMcpBinary)
      .catch(() => setMcpBinary(null));
  }, []);
  // (#278) Surface the installed app version before any update check is run.
  useEffect(() => {
    getVersion()
      .then((v) => setAppVersion(v))
      .catch(() => setAppVersion(null));
  }, []);
  const projectRule = useMemo(() => {
    const pid = ruleProjectId ?? currentProjectId;
    const start = "\u003c!-- biturbo-rule:start project=\"" + pid + "\" --\u003e";
    const end = "\u003c!-- biturbo-rule:end --\u003e";
    return `${start}
## biTurbo memory rules for project "${pid}"

You have access to biTurbo, a persistent semantic memory layer via MCP.

### Core loop — follow this EVERY turn (use the resolved \`PID\` from Session below):

1. **RECALL** — call \`recall_for_context(query=<user msg>, project_id=PID, k=8)\`
2. **ANSWER** — respond using the recalled context
3. **REMEMBER** — call \`remember(project_id=PID, ...)\` after every response to store durable information

### When to \`remember\` (store only durable, non-obvious information):

- User states a fact about themselves/environment/project → \`fact\`
- You make a decision with rationale → \`decision\`
- User expresses a preference (style, verbosity, tools) → \`preference\`
- User corrects you → \`fact\` with \`supersedes\`
- You discover a codebase pattern → \`pattern\`
- Something noteworthy happened → \`episode\` with timestamp
- Meta-observation about work → \`reflection\`
- ❌ Transient state — don't remember
- ❌ Public knowledge — don't remember
- ❌ Routine assistant responses with no durable signal — don't remember
- ❌ Secrets, tokens, PII — NEVER

### Memory types:
\`fact\`, \`decision\`, \`preference\`, \`pattern\`, \`episode\`, \`reflection\`, \`code\` (auto)

### Importance (0-1):
- 0.8-1.0: cross-project rules, key decisions
- 0.5-0.7: typical (default 0.6)
- 0.2-0.4: specific/stale details

### Tags: 1-3 per memory. Good: \`auth\`, \`ui\`, \`db\`, \`api\`. Bad: \`important\`, \`todo\`.

### Session — resolve \`PID\` once, reuse for every call this session:
1. \`register_agent(name, kind)\`
2. \`list_projects()\` — note each project's \`id\`/\`name\`
3. \`get_project_name_from_file(root_path=<repo root>)\` — reads the project's \`.biTurbo\` marker file
   - \`{"projectName": X}\` → find the project from step 2 whose \`id\` or \`name\` matches \`X\`; set \`PID\` to that project's \`id\`
   - No match, or \`{"error": ...}\` (e.g. no \`.biTurbo\` file in this repo) → fall back to \`PID = "${pid}"\`
4. EVERY TURN → recall(PID) → answer → remember(PID)
5. END → \`consolidate(project_id=PID)\`, final \`remember(project_id=PID)\`

### Anti-patterns:
- Don't dump 10k memories — use recall_for_context k=5-10
- Don't skip recall — amnesia is worse than no tool
- Don't cross-project leak — always pass the resolved \`project_id=PID\`
- Never store secrets, tokens, PII
${end}`;
  }, [currentProjectId, ruleProjectId]);

  const globalRule = useMemo(() => {
    const start = "\u003c!-- biturbo-rule:start scope=\"global\" --\u003e";
    const end = "\u003c!-- biturbo-rule:end --\u003e";
    return `${start}
## biTurbo memory rules (global / cross-project)

You have access to biTurbo, a persistent semantic memory layer via MCP.
Project-agnostic preferences and cross-project facts live here.

### Core loop — follow this EVERY turn:

1. **RECALL** — call \`recall_for_context(query=<user msg>, project_id="default", k=8)\`
2. **ANSWER** — respond using the recalled context
3. **REMEMBER** — call \`remember()\` after every response to store durable information

### When to \`remember\` (store only durable, non-obvious information):

- User states a cross-project fact → \`fact\`
- You make a decision with rationale → \`decision\`
- User expresses a preference → \`preference\`
- You discover a pattern → \`pattern\`
- Something noteworthy happened → \`episode\`
- ❌ Routine responses with no durable signal — don't remember

### Memory types:
\`fact\`, \`decision\`, \`preference\`, \`pattern\`, \`episode\`, \`reflection\`

### Importance (0-1):
- 0.8-1.0: life rules, key decisions
- 0.5-0.7: typical (default 0.6)

### Session:
- START → \`register_agent\`, \`list_projects()\`
- EVERY TURN → recall → answer → remember
- END → \`consolidate\`
- Note: this rule always uses \`project_id="default"\` — it does not read \`.biTurbo\`. Use the per-project rule block (biTurbo → Settings → Agent rule blocks → "project") for repo-scoped memory that resolves \`PID\` from \`.biTurbo\`.

### Anti-patterns:
- Don't skip recall
- When working in a project, scope memories with that project_id
- Never store secrets, tokens, PII
${end}`;
  }, []);
  // (#268) Use the selected project's name in the rule block header.
  const ruleProjectName = useMemo(() => {
    const pid = ruleProjectId ?? currentProjectId;
    const p = projects.find((x) => x.id === pid);
    return p ? p.name : pid;
  }, [projects, currentProjectId, ruleProjectId]);

  async function toggleLaunchOnBoot() {
    if (bootLoading || bootSaving) return;
    setBootSaving(true);
    try {
      if (launchOnBoot) {
        await disable();
        setLaunchOnBoot(false);
        showToast({ kind: "ok", text: "Launch on startup disabled" });
      } else {
        await enable();
        setLaunchOnBoot(true);
        showToast({ kind: "ok", text: "Launch on startup enabled" });
      }
    } catch (e) {
      showToast({
        kind: "err",
        text: e instanceof Error ? e.message : "Could not update startup setting",
      });
    } finally {
      setBootSaving(false);
    }
  }

  // (#282) Clipboard failures are caught and surfaced with a toast.
  function copy(label: string, text: string) {
    navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopied(label);
        showToast({ kind: "ok", text: `Copied ${label}` });
        setTimeout(() => setCopied(null), 1500);
      })
      .catch(() => showToast({ kind: "err", text: "Clipboard blocked" }));
  }

  // (#390) MCP one-click install targets now include VS Code, JetBrains, and Zed alongside Cursor/Windsurf/Claude/Codex/OpenCode.
  const mcpTargets = [
    { id: "cursor", label: "Cursor" },
    { id: "windsurf", label: "Windsurf" },
    { id: "claude", label: "Claude Code" },
    { id: "codex", label: "Codex" },
    { id: "opencode", label: "OpenCode" },
    { id: "vscode", label: "VS Code" },
    { id: "jetbrains", label: "JetBrains" },
    { id: "zed", label: "Zed" },
  ] as const;

  // (#251) Pre-check MCP install targets that already contain a biturbo entry on load.
  useEffect(() => {
    Promise.all(
      mcpTargets.map((t) =>
        api.mcpConfigStatus(t.id)
          .then((installed) => ({ id: t.id, installed }))
          .catch(() => ({ id: t.id, installed: false })),
      ),
    ).then((results) => {
      const installed = new Set(results.filter((r) => r.installed).map((r) => r.id));
      setMcpInstalled(installed);
    });
  }, []);

  async function installMcp(target: string, label: string) {
    setMcpInstalling((s) => new Set(s).add(target));
    try {
      const res = await api.installMcpConfig(target);
      showToast({
        kind: "ok",
        text: `${res.created ? "Created" : "Merged into"} ${label} config: ${res.path}`,
      });
      setMcpInstalled((prev) => new Set(prev).add(target));
    } catch (e) {
      showToast({ kind: "err", text: `Failed to install ${label}: ${e}` });
    } finally {
      setMcpInstalling((s) => {
        const n = new Set(s);
        n.delete(target);
        return n;
      });
    }
  }

  const dataDir = [
    "macOS:   ~/Library/Application Support/com.biturbo.app",
    "Windows: %APPDATA%\\com.biturbo.app",
    "Linux:   ~/.local/share/com.biturbo.app",
  ].join("\n");

  // The backend resolves the bundled binary's absolute path; fall back to
  // the bare name (PATH lookup) when resolution is unavailable.
  useEffect(() => {
    api
      .resolveMcpBinaryPath()
      .then(setMcpBinary)
      .catch(() => setMcpBinary(null));
  }, []);

  const mcpConfig = `{
  "mcpServers": {
    "biturbo": {
      "command": "${mcpBinary?.path ?? "biturbo-mcp"}",
      "args": [],
      "env": {}
    }
  }
}`;
  // (#287) Sticky in-page section navigation.
  const sectionNav = [
    { id: "data-location", label: "Data" },
    { id: "diagnostics", label: "Diagnostics" },
    { id: "system-tray", label: "Tray" },
    { id: "launch-on-startup", label: "Startup" },
    { id: "appearance", label: "Appearance" },
    { id: "embedding-model", label: "Model" },
    { id: "mcp-server", label: "MCP" },
    { id: "updates", label: "Updates" },
    { id: "developer", label: "Developer" },
  ];

  return (
    <div className="mx-auto max-w-3xl space-y-8 p-8 animate-fade_in">
      <div>
        <h2 className="font-serif text-2xl">Settings</h2>
        <p className="mt-1 text-sm text-text-muted">
          Local data, MCP integration, and the embedding model.
        </p>
      </div>
      {/* (#287) Sticky in-page section navigation. */}
      <nav className="sticky top-0 -mx-8 -mt-8 mb-6 flex flex-wrap gap-2 border-b border-border-subtle bg-bg/90 px-8 py-3 backdrop-blur-sm z-10">
        {sectionNav.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => {
              document.getElementById(s.id)?.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
            className="btn-ghost text-xs"
          >
            {s.label}
          </button>
        ))}
      </nav>

      <Section icon={Folder} title="Data location">
        <p className="text-sm text-text-muted">
          Everything is stored locally. SQLite, turbovec indices, and the embedding model cache.
        </p>
        {resolvedDataDir ? (
          <div className="mt-3 flex items-center gap-2 rounded-md border border-border-subtle bg-surface-2 p-3">
            {/* (#259) Show the actual data dir for this device with Open and Copy. */}
            <span
              className="min-w-0 flex-1 truncate font-mono text-xs text-text-muted"
              title={resolvedDataDir}
            >
              {resolvedDataDir}
            </span>
            <button
              onClick={async () => {
                try {
                  await openPath(resolvedDataDir);
                } catch (e) {
                  const msg = String(e);
                  if (msg.includes("Not allowed") || msg.includes("forbidden") || msg.includes("Forbidden")) {
                    try {
                      await invoke("open_file", { path: resolvedDataDir });
                      return;
                    } catch (e2) {
                      showToast({ kind: "err", text: `Could not open folder: ${String(e2)}` });
                      return;
                    }
                  }
                  showToast({ kind: "err", text: `Could not open folder: ${msg}` });
                }
              }}
            >
              Open folder
            </button>
            <button
              onClick={() => copy("data dir", resolvedDataDir)}
              className="btn-outline text-xs"
              aria-label="Copy data dir path"
            >
              {copied === "data dir" ? <Check size={13} className="text-success" /> : <Copy size={13} />}
            </button>
          </div>
        ) : (
          <div className="relative group mt-3">
            {/* (#254) Data-dir fallback also gets a one-click Copy button. */}
            <button
              onClick={() => copy("data dir", dataDir)}
              className="absolute top-2 right-2 z-10 rounded border border-border-subtle bg-surface-2 p-1.5 text-text-dim opacity-0 transition hover:text-text group-hover:opacity-100"
              aria-label="Copy data dir"
              title="Copy data dir"
            >
              {copied === "data dir" ? <Check size={13} className="text-success" /> : <Copy size={13} />}
            </button>
            <pre className="overflow-x-auto rounded-md border border-border-subtle bg-surface-2 p-3 font-mono text-xs text-text-muted">
              {dataDir}
            </pre>
          </div>
        )}
      </Section>
      <Section icon={FileCode2} title="Diagnostics">
        <p className="text-sm text-text-muted">
          If MCP, ingest, or search is misbehaving, the log file and these details can help support.
        </p>
        {resolvedDataDir ? (
          <div className="mt-3 flex items-center gap-2 rounded-md border border-border-subtle bg-surface-2 p-3">
            <span
              className="min-w-0 flex-1 truncate font-mono text-xs text-text-muted"
              title={`${resolvedDataDir}/logs/biturbo.log`}
            >
              {resolvedDataDir}/logs/biturbo.log
            </span>
            <button
              onClick={async () => {
                const logPath = `${resolvedDataDir}/logs/biturbo.log`;
                try {
                  await openPath(logPath);
                  return;
                } catch {
                  try {
                    await invoke("open_file", { path: logPath });
                  } catch (e) {
                    showToast({ kind: "err", text: `Could not open log: ${String(e)}` });
                  }
                }
              }}
              className="btn-outline text-xs"
            >
              Open log
            </button>
            <button
              onClick={() => {
                const logPath = `${resolvedDataDir}/logs/biturbo.log`;
                const diagnostics = `biTurbo diagnostics
Version: ${appVersion ?? "unknown"}
Data dir: ${resolvedDataDir}
Log path: ${logPath}
Project: ${currentProjectId}
Theme: ${theme}`;
                copy("diagnostics", diagnostics);
              }}
              className="btn-outline text-xs"
            >
              Copy diagnostics
            </button>
          </div>
        ) : (
          <div className="relative group mt-3">
            <pre className="overflow-x-auto rounded-md border border-border-subtle bg-surface-2 p-3 font-mono text-xs text-text-muted">
              {dataDir}
            </pre>
          </div>
        )}
      </Section>

      <Section icon={AppWindow} title="System tray">
        <p className="text-sm text-text-muted">
          biTurbo runs in the menu bar / system tray. Closing the window hides it;
          use the tray icon to show it again. The tray menu shows live memory,
          project, and agent counts, and includes Show, Hide, Consolidate Now,
          Open Data Folder, and Quit actions.
        </p>
      </Section>

      <Section icon={Power} title="Launch on startup">
        <p className="text-sm text-text-muted">
          Start biTurbo automatically when you log in. Supported on macOS and Windows.
        </p>
        <div className="mt-3 flex items-center gap-3">
          <button
            type="button"
            role="switch"
            aria-checked={launchOnBoot}
            aria-label="Launch on startup"
            disabled={bootLoading || bootSaving}
            onClick={toggleLaunchOnBoot}
            className={clsx(
              "relative h-6 w-11 rounded-full transition-colors",
              launchOnBoot ? "bg-accent" : "bg-surface-3",
              (bootLoading || bootSaving) && "opacity-50"
            )}
          >
            <span
              className={clsx(
                "absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform",
                launchOnBoot && "translate-x-5"
              )}
            />
          </button>
          <span className="text-sm text-text">
            {bootLoading
              ? "Checking…"
              : launchOnBoot
                ? "Start on login"
                : "Do not start on login"}
          </span>
        </div>
      </Section>

      <Section icon={theme === "system" ? Monitor : theme === "dark" ? Moon : Sun} title="Appearance">
        <p className="text-sm text-text-muted">
          Pick the interface theme. Saved per device.
        </p>
        <div className="mt-3 flex items-center gap-2">
          <button
            onClick={() => setTheme("dark")}
            className={clsx(
              "btn-outline",
              theme === "dark" && "border-accent/50 bg-accent-soft text-text"
            )}
          >
            <Moon size={13} /> Dark
          </button>
          <button
            onClick={() => setTheme("light")}
            className={clsx(
              "btn-outline",
              theme === "light" && "border-accent/50 bg-accent-soft text-text"
            )}
          >
            <Sun size={13} /> Light
          </button>
          <button
            onClick={() => setTheme("system")}
            className={clsx(
              "btn-outline",
              theme === "system" && "border-accent/50 bg-accent-soft text-text"
            )}
            title="Follow the OS setting"
          >
            <Monitor size={13} /> System
          </button>
        </div>
      </Section>

      <Section icon={Cpu} title="Embedding model">
        <div className="space-y-2 text-sm text-text-muted">
          <Row k="Model" v="BGE-small-en (default)" />
          <Row k="Dimension" v="384" />
          <Row k="Backend" v="ONNX Runtime via fastembed" />
          <Row k="Index size" v={`${((stats?.index_bytes ?? 0) / 1024 / 1024).toFixed(2)} MB`} />
          <Row k="Quantization" v="turbovec 4-bit (16× compression vs float32)" />
        </div>
        <p className="mt-3 text-xs text-text-dim">
          The app-wide default is <span className="kbd">BGE-small-en-v1.5</span> (384 dims).
          Per-project overrides can be set from each project's card on the{" "}
          <span className="kbd">Projects</span> page. Supported models: BGE-small-en, BGE-base-en,
          BGE-large-en, all-MiniLM-L6-v2.
        </p>
      </Section>

      <Section icon={Terminal} title="MCP server">
        <p className="text-sm text-text-muted">
          The standalone <span className="kbd">biturbo-mcp</span> binary speaks MCP over stdio.
          Add it to your agent's MCP config:
        </p>
        <div className="relative group mt-3">
          {/* (#254) MCP JSON snippet gets a one-click Copy button. */}
          <button
            onClick={() => copy("MCP config", mcpConfig)}
            className="absolute top-2 right-2 z-10 rounded border border-border-subtle bg-surface-2 p-1.5 text-text-dim opacity-0 transition hover:text-text group-hover:opacity-100"
            aria-label="Copy MCP config"
            title="Copy MCP config"
          >
            {copied === "MCP config" ? <Check size={13} className="text-success" /> : <Copy size={13} />}
          </button>
          <pre className="overflow-x-auto rounded-md border border-border-subtle bg-surface-2 p-3 font-mono text-xs text-text-muted">
            {mcpConfig}
          </pre>
        </div>
        {mcpBinary && (
          <p className="mt-2 text-xs text-text-dim">
            Resolved binary on this device:{" "}
            <span className="kbd">{mcpBinary.path}</span>{" "}
            {mcpBinary.is_absolute ? "(absolute — safe to use as-is)" : "(resolved via PATH)"}
          </p>
        )}
        <p className="mt-2 text-xs text-text-dim">
          Editing the config by hand? If <span className="kbd">biturbo-mcp</span> isn't on your{" "}
          <span className="kbd">PATH</span>, point <span className="kbd">command</span> at the
          absolute path shown above.
        </p>

        <div className="mt-4">
          <p className="text-sm font-medium text-text">One-click install</p>
          <p className="mt-1 text-xs text-text-dim">
            Auto-detects the binary path and merges into your agent's MCP config (non-destructive).
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {mcpTargets.map((t) => {
              const installing = mcpInstalling.has(t.id);
              const installed = mcpInstalled.has(t.id);
              return (
                <button
                  key={t.id}
                  onClick={() => installMcp(t.id, t.label)}
                  disabled={mcpInstalling.size > 0}
                  className={clsx(
                    "btn-outline inline-flex items-center gap-1.5 text-xs",
                    installed && "border-accent/50 bg-accent-soft",
                  )}
                >
                  {installing ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : installed ? (
                    <Check size={13} />
                  ) : (
                    <Download size={13} />
                  )}
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>
        {/* (#292) Repo-relative file references removed from user-facing copy. */}
        <p className="mt-3 text-sm text-text-muted">
          Once connected, your agent has 27 tools (search, remember, forget, ingest_project,
          consolidate, list_projects, …). See the project docs for the full tool reference
          and troubleshooting.
        </p>
      </Section>

      <Section icon={ArrowUpCircle} title="Updates">
        <p className="text-sm text-text-muted">
          Check for new versions and install them automatically.
        </p>
        <div className="mt-3 space-y-2 text-sm text-text-muted">
          <Row k="Current version" v={appVersion ?? "Loading…"} />
        </div>
        <div className="mt-3 flex items-center gap-3">
          <button
            onClick={async () => {
              setUpdateChecking(true);
              setUpdateInfo(null);
              try {
                const info = await invoke<{ version: string; body: string; available: boolean }>("check_for_updates");
                setUpdateInfo(info);
                if (!info.available) {
                  showToast({ kind: "ok", text: "You're on the latest version" });
                }
              } catch (e) {
                showToast({ kind: "err", text: e instanceof Error ? e.message : "Update check failed" });
              } finally {
                setUpdateChecking(false);
              }
            }}
            disabled={updateChecking || updateInstalling}
            className="btn-outline inline-flex items-center gap-1.5 text-xs"
          >
            {updateChecking ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
            Check for updates
          </button>
          {updateInfo?.available && (
            <button
              onClick={async () => {
                const ok = await confirm({
                  title: "Install update and restart?",
                  body: `biTurbo ${updateInfo.version} will be downloaded and the app will relaunch to finish the update.`,
                  confirmLabel: "Install and restart",
                });
                if (!ok) return;
                setUpdateInstalling(true);
                showToast({
                  kind: "info",
                  text: "Downloading update — the app will restart automatically",
                });
                try {
                  await invoke("install_update");
                } catch (e) {
                  showToast({ kind: "err", text: e instanceof Error ? e.message : "Update failed" });
                } finally {
                  setUpdateInstalling(false);
                }
              }}
              disabled={updateInstalling}
              className="btn-outline inline-flex items-center gap-1.5 text-xs border-accent/50 bg-accent-soft"
            >
              {updateInstalling ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
              {updateInstalling ? "Installing…" : `Install v${updateInfo.version}`}
            </button>
          )}
        </div>
        {updateInfo?.available && updateInfo.body && (
          <ReleaseNotes body={updateInfo.body} />
        )}
      </Section>

      <Section icon={Terminal} title="Developer">
        <p className="text-sm text-text-muted">
          Advanced tooling for agent integration. Most users don't need this.
        </p>
        <button
          type="button"
          onClick={() => setDevOpen((v) => !v)}
          className="mt-3 inline-flex items-center gap-2 text-xs btn-ghost"
        >
          {devOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          {devOpen ? "Hide developer content" : "Show developer content"}
        </button>

        {devOpen && (
          <div className="mt-4 space-y-6">
            <div>
              <p className="text-sm text-text-muted">
                Full tool reference and troubleshooting are in the project docs.
              </p>
            </div>

            <div>
              <h4 className="mb-1 font-serif text-text">Agent rule blocks</h4>
              <p className="text-sm text-text-muted">
                Drop these into <span className="kbd">AGENTS.md</span>,{" "}
                <span className="kbd">CLUADE.md</span>,{" "}
                <span className="kbd">.cursorrules</span>, or whatever your agent reads on
                startup. They'll wire your agent into biTurbo with the right MCP tool surface and
                behavior rules.
              </p>

              <div className="mt-4">
                <label className="mb-1 block text-[11px] uppercase tracking-widest text-text-dim">
                  Project for the rule block
                </label>
                <select
                  value={ruleProjectId ?? currentProjectId}
                  onChange={(e) => setRuleProjectId(e.target.value)}
                  className="input w-64"
                >
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.id})
                    </option>
                  ))}
                </select>
              </div>

              <div className="mt-4 space-y-4">
                <RuleBlock
                  label={`project · ${ruleProjectName}`}
                  text={projectRule}
                  copied={copied === "project"}
                  onCopy={() => copy("project rule", projectRule)}
                  hint={
                    projects.some((p) => p.id === (ruleProjectId ?? currentProjectId))
                      ? `Paste in the root of your ${ruleProjectId ?? currentProjectId} repo.`
                      : "No active project — defaults to your current selection."
                  }
                />

                <RuleBlock
                  label="global"
                  text={globalRule}
                  copied={copied === "global"}
                  onCopy={() => copy("global rule", globalRule)}
                  hint="Paste in your home AGENTS.md or wherever your agent reads cross-project rules."
                />
              </div>
            </div>
          </div>
        )}
      </Section>
    </div>
  );
}

function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: LucideIcon;
  title: string;
  children: React.ReactNode;
}) {
  const id = title.toLowerCase().replace(/\s+/g, "-");
  return (
    <div id={id} className="card p-5">
      <div className="mb-3 flex items-center gap-2 text-text-muted">
        <Icon size={14} className="text-accent" />
        <h3 className="font-serif text-lg text-text">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between border-b border-border-subtle py-1.5 last:border-0">
      <span className="text-text-dim">{k}</span>
      <span className="font-mono text-text">{v}</span>
    </div>
  );
}

// (#273) Render release notes with minimal safe markdown instead of raw text.
function ReleaseNotes({ body }: { body: string }) {
  return (
    <div className="mt-3 max-h-80 overflow-y-auto rounded-md border border-border-subtle bg-surface-2 p-3 text-xs text-text-muted">
      {body.split("\n").map((line, i) => {
        const trimmed = line.trim();
        if (trimmed.startsWith("# ")) {
          return (
            <h4 key={i} className="mt-2 font-medium text-text">
              {trimmed.slice(2)}
            </h4>
          );
        }
        if (trimmed.startsWith("## ")) {
          return (
            <h5 key={i} className="mt-1 font-medium text-text">
              {trimmed.slice(3)}
            </h5>
          );
        }
        if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
          return (
            <li key={i} className="ml-4 list-disc">
              {trimmed.slice(2)}
            </li>
          );
        }
        if (trimmed.startsWith("`") && trimmed.endsWith("`")) {
          return (
            <code key={i} className="rounded bg-surface-3 px-1">
              {trimmed.slice(1, -1)}
            </code>
          );
        }
        if (trimmed.length === 0) {
          return <div key={i} className="h-2" />;
        }
        return <p key={i} className="whitespace-pre-wrap">{line}</p>;
      })}
    </div>
  );
}

function RuleBlock({
  label,
  text,
  copied,
  onCopy,
  hint,
}: {
  label: string;
  text: string;
  copied: boolean;
  onCopy: () => void;
  hint?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const lines = text.split("\n");
  const hasMore = lines.length > 8;
  const display = expanded ? text : lines.slice(0, 8).join("\n");
  const file = `${label.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.md`;

  function onDownload() {
    const blob = new Blob([text], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = file;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="rounded-md border border-border-subtle bg-surface-2 p-3">
      <div className="mb-2 flex items-center gap-2">
        <span className="font-mono text-[11px] uppercase tracking-widest text-accent">
          {label}
        </span>
        {hint && <span className="text-[10px] text-text-dim">{hint}</span>}
        <div className="flex-1" />
        <button
          onClick={onCopy}
          className="btn-outline text-xs"
        >
          {copied ? <Check size={12} className="text-success" /> : <Copy size={12} />}
          {copied ? "Copied" : "Copy"}
        </button>
        <button
          onClick={onDownload}
          className="btn-outline text-xs"
          title="Download as .md"
          aria-label="Download as .md"
        >
          <Download size={12} />
        </button>
      </div>
      <pre className="overflow-x-auto rounded bg-bg p-3 font-mono text-[11px] leading-relaxed text-text-muted">
        {/* (#268) Collapse rule blocks to 8 lines with a Show more control. */}
        {display}
      </pre>
      {hasMore && (
        <button
          onClick={() => setExpanded((s) => !s)}
          className="mt-2 text-[11px] text-text-dim hover:text-text"
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      )}
    </div>
  );
}
