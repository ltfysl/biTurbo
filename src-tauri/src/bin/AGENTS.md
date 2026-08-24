## src-tauri/src/bin

Rust binary entry points.

## Rules

- One `main.rs` per binary.
- Keep entry points short: parse env, init logging, run the app or MCP server.
- No business logic in entry-point files.

## Best practices

- `biturbo_mcp.rs` should set up the MCP stdio transport and then hand off to `src-tauri/src/mcp.rs`.
- `main.rs` should set up the Tauri app and then hand off to `src-tauri/src/lib.rs`.
- Read configuration from env or Tauri resources, not hard-coded values.
