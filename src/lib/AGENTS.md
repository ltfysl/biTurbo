## src/lib

Frontend shared code: types, Tauri API bindings, formatting, and the Zustand store.

## Rules

- No JSX in this folder.
- All Tauri `invoke` calls live in `api.ts`.
- Shared types live in `types.ts`.
- Global state and actions live in `store.ts`.
- Pure helper functions live in `format.ts`.

## Best practices

- Avoid importing from `src/components/` or `src/views/` to prevent circular dependencies.
- Add small, focused unit tests for pure helpers.
- Keep the store slices close to the views that consume them.
