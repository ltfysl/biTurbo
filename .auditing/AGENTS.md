## .auditing

Ad-hoc audit log and scratch notes. Temporary workspace for ongoing investigations.

## Rules

- Treat as append-only while an audit is in progress.
- Do not commit secrets, tokens, PII, or user data.
- Move durable findings to `docs/` or `AGENTS.md` once a conclusion is reached.
- Delete or archive stale logs; do not let this directory grow indefinitely.

## Best practices

- Date-stash notes in markdown for quick reading.
- One concern per log file.
