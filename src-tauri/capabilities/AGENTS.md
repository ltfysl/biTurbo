## src-tauri/capabilities

Tauri capability definitions declaring permissions for the frontend.

## Rules

- One capability per window or context.
- Keep allow-lists minimal and intentional.
- Do not grant wildcard `/**` permissions without an explicit reason.
- Update when a new Tauri plugin or API surface is added.

## Best practices

- Put default permissions in `default.json` and platform-specific ones in their own files.
- Document why each elevated permission is required.
