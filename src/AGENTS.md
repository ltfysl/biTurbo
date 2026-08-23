## src

React + Vite frontend entry point and global styles.

## Rules

- Keep `main.tsx` and `App.tsx` small; they are entry points, not business logic.
- Global styles only in `index.css`.
- Route/view composition belongs in `App.tsx`.

## Best practices

- Import views from `src/views/` and shared UI from `src/components/`.
- Keep types and data access in `src/lib/`.
- Prefer functional components and hooks; avoid class components.
