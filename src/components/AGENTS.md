## src/components

Reusable, generic React UI components.

## Rules

- Keep components small; aim for <200 lines.
- One component per file.
- Props over global state; do not embed business logic.
- Use `clsx` and Tailwind classes for styling.

## Best practices

- Extract shared primitives (Button, Card, Modal) before copying JSX.
- Keep component APIs small and consistent.
- Place view-specific or one-off components in `src/views/`, not here.
