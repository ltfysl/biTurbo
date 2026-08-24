## scripts

One-off or repeatable automation: builds, tests, smoke tests, and releases.

## Rules

- Keep scripts focused on a single task.
- Accept CLI args or environment variables for configuration.
- Exit non-zero on failure.
- Use shared helpers (`mcp-common.ts`) instead of duplicating MCP boilerplate.

## Best practices

- Update `package.json` scripts when adding a new entrypoint.
- Prefer TypeScript/Node for JS/Rust glue; use small Bash only when it is clearer.
- Add a short header comment describing inputs, outputs, and side effects.
