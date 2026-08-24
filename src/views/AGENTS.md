## src/views

Top-level page/screen components for each app view.

## Rules

- One view per screen.
- Keep views thin; delegate to `src/components/` and `src/lib/`.
- Graph/Canvas logic can stay in the view, but keep heavy layout work in a Web Worker.
- View files should stay small; split large views into sub-components.

## Best practices

- Reuse generic components from `src/components/` instead of inlining UI.
- Put view-specific one-off components in the view file or a sibling sub-folder.
- Keep data fetching in `src/lib/api.ts` and `src/lib/store.ts`.
