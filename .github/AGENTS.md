## .github

GitHub project configuration.

## Rules

- Store only GitHub-specific configuration (workflows, issue templates, funding, etc.).
- No application source code.
- Pin actions to trusted versions or SHA hashes.

## Best practices

- Keep workflow definitions in `.github/workflows/`.
- Update workflows when build/test commands change in `package.json` or `src-tauri/Cargo.toml`.
