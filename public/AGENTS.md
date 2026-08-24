## public

Static assets served as-is by Vite.

## Rules

- Only place assets the app needs at runtime (icons, logos, manifest files).
- Optimize images before committing.
- No application source code or secrets.

## Best practices

- Use PNG/SVG/WebP for icons and logos.
- Keep total bundle size small; avoid videos or huge raster images.
- Update `logo.png` and `favicon.png` together when branding changes.
