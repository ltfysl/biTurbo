# biTurbo MCP Tools

This table is generated from `src-tauri/src/mcp.rs` (`SCHEMAS_JSON`).
It is the single source of truth for the {total} tools exposed by the MCP server.

Run `python3 scripts/generate_tool_docs.py` to regenerate.

### `remember`

Store a memory. mem_type: fact|decision|preference|pattern|episode|reflection|code

| Argument | Type | Required |
|---|---|---|
| `content` | string | yes |
| `mem_type` | string | no |
| `project_id` | string | no |
| `tags` | array | no |
| `importance` | number | no |
| `source_agent` | string | no |
| `supersedes` | string | no |

Example:

```json
{
  "name": "remember",
  "arguments": {
    "content": "your note"
  }
}
```

### `forget`

Delete a memory by uid

| Argument | Type | Required |
|---|---|---|
| `uid` | string | yes |

Example:

```json
{
  "name": "forget",
  "arguments": {
    "uid": "<uid>"
  }
}
```

### `update`

Edit a memory. Any omitted field is unchanged

| Argument | Type | Required |
|---|---|---|
| `uid` | string | yes |
| `content` | string | no |
| `mem_type` | string | no |
| `tags` | array | no |
| `importance` | number | no |

Example:

```json
{
  "name": "update",
  "arguments": {
    "uid": "<uid>"
  }
}
```

### `get_memory`

Fetch one memory by uid

| Argument | Type | Required |
|---|---|---|
| `uid` | string | yes |

Example:

```json
{
  "name": "get_memory",
  "arguments": {
    "uid": "<uid>"
  }
}
```

### `search`

Semantic search. Pass project_id or root_path (reads .biTurbo). mem_type filters. k=top-N (default 10)

| Argument | Type | Required |
|---|---|---|
| `query` | string | yes |
| `project_id` | string | no |
| `root_path` | string | no |
| `mem_type` | string | no |
| `k` | number | no |

Example:

```json
{
  "name": "search",
  "arguments": {
    "query": "search text"
  }
}
```

### `list`

List memories with optional filters. Newest first. Default 50

| Argument | Type | Required |
|---|---|---|
| `project_id` | string | no |
| `mem_type` | string | no |
| `limit` | number | no |
| `offset` | number | no |

Example:

```json
{
  "name": "list",
  "arguments": {
    "project_id": "<project>",
    "mem_type": "",
    "limit": 0,
    "offset": 0
  }
}
```

### `list_tags`

Map tags to usage counts, sorted descending by count

| Argument | Type | Required |
|---|---|---|
| `project_id` | string | no |

Example:

```json
{
  "name": "list_tags",
  "arguments": {
    "project_id": "<project>"
  }
}
```

### `recall_for_context`

Build a <biTurboContext> block of top-k relevant memories. Pass project_id or root_path (reads .biTurbo)

| Argument | Type | Required |
|---|---|---|
| `query` | string | yes |
| `project_id` | string | no |
| `root_path` | string | no |
| `mem_type` | string | no |
| `k` | number | no |

Example:

```json
{
  "name": "recall_for_context",
  "arguments": {
    "query": "search text"
  }
}
```

### `recall_explain`

Recall ranked memories with source ranks, matched terms, feedback boost, and a recall id

| Argument | Type | Required |
|---|---|---|
| `query` | string | yes |
| `project_id` | string | no |
| `root_path` | string | no |
| `mem_type` | string | no |
| `k` | number | no |

Example:

```json
{
  "name": "recall_explain",
  "arguments": {
    "query": "search text"
  }
}
```

### `submit_recall_feedback`

Record useful or not-useful feedback for one recalled memory

| Argument | Type | Required |
|---|---|---|
| `recall_id` | string | yes |
| `memory_uid` | string | yes |
| `value` | number | yes |
| `source` | string | no |

Example:

```json
{
  "name": "submit_recall_feedback",
  "arguments": {
    "recall_id": "",
    "memory_uid": "",
    "value": 0
  }
}
```

### `list_projects`

List all projects

| Argument | Type | Required |
|---|---|---|


Example:

```json
{
  "name": "list_projects",
  "arguments": {}
}
```

### `get_project`

Fetch one project by id

| Argument | Type | Required |
|---|---|---|
| `id` | string | yes |

Example:

```json
{
  "name": "get_project",
  "arguments": {
    "id": ""
  }
}
```

### `create_project`

Create a new project

| Argument | Type | Required |
|---|---|---|
| `name` | string | yes |
| `id` | string | no |
| `description` | string | no |
| `root_path` | string | no |
| `bit_width` | number | no |

Example:

```json
{
  "name": "create_project",
  "arguments": {
    "name": ""
  }
}
```

### `delete_project`

Delete a project and all its memories. 'default' cannot be deleted

| Argument | Type | Required |
|---|---|---|
| `project_id` | string | yes |

Example:

```json
{
  "name": "delete_project",
  "arguments": {
    "project_id": "<project>"
  }
}
```

### `ingest_project`

Index a code directory via tree-sitter (22 languages, including rust/typescript/python/go/kotlin/sql/dart/lua/scala/r/powershell)

| Argument | Type | Required |
|---|---|---|
| `project_id` | string | yes |
| `root_path` | string | yes |

Example:

```json
{
  "name": "ingest_project",
  "arguments": {
    "project_id": "<project>",
    "root_path": "/path/to/project"
  }
}
```

### `start_ingest`

Start an asynchronous supervised ingest and return its operation record

| Argument | Type | Required |
|---|---|---|
| `project_id` | string | yes |
| `root_path` | string | yes |

Example:

```json
{
  "name": "start_ingest",
  "arguments": {
    "project_id": "<project>",
    "root_path": "/path/to/project"
  }
}
```

### `operation_status`

Get one persisted operation by id

| Argument | Type | Required |
|---|---|---|
| `id` | string | yes |

Example:

```json
{
  "name": "operation_status",
  "arguments": {
    "id": ""
  }
}
```

### `list_operations`

List recent supervised operations

| Argument | Type | Required |
|---|---|---|
| `limit` | number | no |

Example:

```json
{
  "name": "list_operations",
  "arguments": {
    "limit": 0
  }
}
```

### `cancel_operation`

Request operation cancellation at its next safe checkpoint

| Argument | Type | Required |
|---|---|---|
| `id` | string | yes |

Example:

```json
{
  "name": "cancel_operation",
  "arguments": {
    "id": ""
  }
}
```

### `retry_operation`

Retry a failed or cancelled operation from its persisted input checkpoint

| Argument | Type | Required |
|---|---|---|
| `id` | string | yes |

Example:

```json
{
  "name": "retry_operation",
  "arguments": {
    "id": ""
  }
}
```

### `consolidate`

Run memory maintenance: decay, dedup (cosine >= 0.95), merge

| Argument | Type | Required |
|---|---|---|
| `project_id` | string | no |

Example:

```json
{
  "name": "consolidate",
  "arguments": {
    "project_id": "<project>"
  }
}
```

### `consolidate_status`

Status of the background consolidate scheduler (running/idle, last run, next run)

| Argument | Type | Required |
|---|---|---|


Example:

```json
{
  "name": "consolidate_status",
  "arguments": {}
}
```

### `stats`

Global stats

| Argument | Type | Required |
|---|---|---|


Example:

```json
{
  "name": "stats",
  "arguments": {}
}
```

### `bootstrap`

One-call page mount: stats + projects + recent + tags + agents + consolidate status

| Argument | Type | Required |
|---|---|---|


Example:

```json
{
  "name": "bootstrap",
  "arguments": {}
}
```

### `recent_activity`

Recent activity entries

| Argument | Type | Required |
|---|---|---|
| `limit` | number | no |

Example:

```json
{
  "name": "recent_activity",
  "arguments": {
    "limit": 0
  }
}
```

### `register_agent`

Register or update this agent's record. Call once per session

| Argument | Type | Required |
|---|---|---|
| `name` | string | yes |
| `kind` | string | yes |
| `meta` | object | no |

Example:

```json
{
  "name": "register_agent",
  "arguments": {
    "name": "",
    "kind": ""
  }
}
```

### `get_project_name_from_file`

Read projectName from .biTurbo file in project root. Returns {"projectName": "..."} or {"error": "..."}

| Argument | Type | Required |
|---|---|---|
| `root_path` | string | yes |

Example:

```json
{
  "name": "get_project_name_from_file",
  "arguments": {
    "root_path": "/path/to/project"
  }
}
```

### `get_project_graph`

Return a project graph with nodes and edges

| Argument | Type | Required |
|---|---|---|
| `project_id` | string | yes |

Example:

```json
{
  "name": "get_project_graph",
  "arguments": {
    "project_id": "<project>"
  }
}
```

### `import_folder`

Import memories from a folder into a project

| Argument | Type | Required |
|---|---|---|
| `project_id` | string | yes |
| `root_path` | string | yes |

Example:

```json
{
  "name": "import_folder",
  "arguments": {
    "project_id": "<project>",
    "root_path": "/path/to/project"
  }
}
```

### `export_memories`

Export project memories (or all if project_id omitted) to a relative output_path

| Argument | Type | Required |
|---|---|---|
| `project_id` | string | no |
| `output_path` | string | yes |
| `overwrite` | boolean | no |

Example:

```json
{
  "name": "export_memories",
  "arguments": {
    "output_path": ""
  }
}
```

### `enable_watch`

Watch a project root path for filesystem changes

| Argument | Type | Required |
|---|---|---|
| `project_id` | string | yes |
| `root_path` | string | yes |

Example:

```json
{
  "name": "enable_watch",
  "arguments": {
    "project_id": "<project>",
    "root_path": "/path/to/project"
  }
}
```

### `disable_watch`

Stop watching a project

| Argument | Type | Required |
|---|---|---|
| `project_id` | string | yes |

Example:

```json
{
  "name": "disable_watch",
  "arguments": {
    "project_id": "<project>"
  }
}
```

### `watch_status`

List currently watched project roots

| Argument | Type | Required |
|---|---|---|


Example:

```json
{
  "name": "watch_status",
  "arguments": {}
}
```

### `set_project_embed_model`

Set the embedding model for a project (null to reset to default)

| Argument | Type | Required |
|---|---|---|
| `project_id` | string | yes |
| `model` | string | no |

Example:

```json
{
  "name": "set_project_embed_model",
  "arguments": {
    "project_id": "<project>"
  }
}
```

