## src-tauri

Tauri 2 desktop shell: Rust backend, bundle config, capabilities, and assets.

## Rules

- Application logic lives in `src-tauri/src/`.
- Bundle and window config live in `tauri.conf.json`.
- Capability declarations live in `src-tauri/capabilities/`.
- Sidecar binaries are generated into `src-tauri/binaries/` (gitignored placeholders; real builds produce artifacts in CI).

## Best practices

- Keep `build.rs` minimal.
- Update `Cargo.toml` and `tauri.conf.json` together when adding plugins or permissions.
- Do not commit real binary sidecars; only placeholder files if needed.
