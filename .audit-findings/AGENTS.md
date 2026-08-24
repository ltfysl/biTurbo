## .audit-findings

Historical audit artifacts and issue dumps from code-review/audit runs. Treat as read-only reference material.

## Rules

- Do not hand-edit JSON/TXT/SH dumps; regenerate them via audit tools.
- Never include secrets, tokens, or PII in audit outputs.
- Keep this directory append-only or regenerate in bulk; do not commit partially fixed findings.
- Archive or delete old audit runs once they are no longer relevant.

## Best practices

- Summarize large findings in `SUMMARY.md` instead of requiring readers to open raw JSON.
- Name files by the area they cover (e.g., `memory-recall.json`, `mcp-shell.json`).
- Add the audit date or run id to file names when running repeated audits.
