## .github/workflows

GitHub Actions CI/CD definitions.

## Rules

- Pin action versions or verify trusted SHA hashes.
- Keep jobs focused and composable.
- Do not commit secrets; use GitHub `secrets` only.
- Test new workflows locally with `act` or on a fork when possible.

## Best practices

- Reuse setup steps (checkout, toolchain, node, model cache) across jobs.
- Run `typecheck`, `lint`, `clippy`, and tests on every PR.
