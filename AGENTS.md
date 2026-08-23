## Learned User Preferences

## Learned Workspace Facts

- biTurbo is a Tauri desktop app (macOS / Windows / Linux).
- Installed app locations:
  - macOS: `/Applications/biTurbo.app`
  - Windows: `%LOCALAPPDATA%\biTurbo\biTurbo.exe`
  - Linux: `/usr/bin/biturbo` (or wherever the package installs it)
- The MCP server binary is bundled inside the app (Tauri `externalBin`):
  - macOS: `/Applications/biTurbo.app/Contents/MacOS/biturbo-mcp`
  - Windows: `%LOCALAPPDATA%\biTurbo\biturbo-mcp.exe`
  - Linux: `biturbo-mcp` (on `$PATH` after package install)
- Cursor MCP config belongs in `~/.cursor/mcp.json` or project `.cursor/mcp.json`; `command` must be an absolute path to `biturbo-mcp`.
- GUI and MCP share the same data directory:
  - macOS: `~/Library/Application Support/com.biturbo.app`
  - Windows: `%APPDATA%\com.biturbo.app`
  - Linux: `~/.local/share/com.biturbo.app`
- Bundle identifier is `com.biturbo.app`.
- Dev MCP binary paths: `src-tauri/target/debug/biturbo-mcp` or `src-tauri/target/release/biturbo-mcp`.
- Local signed build (no notarization): `pnpm tauri:build`.
- Unsigned build: `pnpm tauri build -- --no-sign`.
- macOS notarized release build: `pnpm tauri:build:notarized` with `APPLE_ID`, `APPLE_PASSWORD` (app-specific password), and `APPLE_TEAM_ID` exported.

## Agent Working Rules

- Recall project context with `recall_for_context(project_id="biturbo")` before non-trivial work.
- Read this root `AGENTS.md` and the nearest per-folder `AGENTS.md` before editing.
- Keep files small and focused: aim for <300 lines, split when a module does too much.
- Reuse existing components, helpers, and types; do not duplicate patterns.
- Outsource non-UI logic to `src/lib/` (frontend), shared Rust modules, or `scripts/`; keep UI components thin.
- Follow existing conventions: React + Vite + Tailwind, Rust module layout, naming, error handling.
- Add or update tests for meaningful behavior changes.
- Update the relevant `AGENTS.md` when a folder's responsibilities change.
- Never commit secrets, tokens, PII, or build artifacts.
- Run lint, typecheck, `cargo clippy`, and tests before claiming completion.
