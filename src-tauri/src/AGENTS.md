## src-tauri/src

Rust backend source: memory storage, semantic search, code ingest, MCP, operations, and state.

## Rules

- One module per responsibility.
- Keep modules focused; split if a file exceeds ~400 lines.
- Use `BiResult` and `BiError` for error handling.
- Keep raw SQLite and schema details inside `db.rs`.
- No business logic in `main.rs` or `lib.rs` entry points.

## Best practices

- Extract shared helpers into focused modules instead of duplicating code.
- Use parking_lot locks safely; hold locks for the shortest time possible.
- Write unit tests for pure logic and `#[cfg(test)]` modules for data helpers.
- Keep MCP command dispatch thin; delegate to domain modules.
