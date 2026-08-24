#!/usr/bin/env python3
"""Generate docs/tools-table.md from the single source of truth in mcp.rs."""
import json
import re
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
MCP_RS = REPO / "src-tauri" / "src" / "mcp.rs"
OUT = REPO / "docs" / "tools-table.md"

def extract_schemas():
    text = MCP_RS.read_text()
    m = re.search(r'const SCHEMAS_JSON: &str = r#"(\[.*?\])"#;', text, re.S)
    if not m:
        raise RuntimeError("Could not find SCHEMAS_JSON in mcp.rs")
    return json.loads(m.group(1))

def schema_to_table(tool):
    name = tool["name"]
    desc = tool.get("description", "").strip().rstrip(".")
    required = tool.get("inputSchema", {}).get("required", [])
    props = tool.get("inputSchema", {}).get("properties", {})
    args = ", ".join(f"{k}: {v.get('type', 'any')}" for k, v in props.items())
    example_props = {}
    for k in required or props:
        if k == "content":
            example_props[k] = "your note"
        elif k == "uid":
            example_props[k] = "<uid>"
        elif k == "project_id":
            example_props[k] = "<project>"
        elif k == "query":
            example_props[k] = "search text"
        elif k == "root_path":
            example_props[k] = "/path/to/project"
        elif props[k].get("type") == "array":
            example_props[k] = []
        elif props[k].get("type") == "number":
            example_props[k] = 0
        elif props[k].get("type") == "boolean":
            example_props[k] = True
        else:
            example_props[k] = ""
    example = json.dumps({"name": name, "arguments": example_props}, indent=2)
    return f"### `{name}`\n\n{desc}\n\n| Argument | Type | Required |\n|---|---|---|\n" + "\n".join(
        f"| `{k}` | {v.get('type', 'any')} | {'yes' if k in required else 'no'} |"
        for k, v in props.items()
    ) + f"\n\nExample:\n\n```json\n{example}\n```\n"

def main():
    tools = extract_schemas()
    total = len(tools)
    lines = [
        "# biTurbo MCP Tools",
        "",
        f"This table is generated from `src-tauri/src/mcp.rs` (`SCHEMAS_JSON`).",
        "It is the single source of truth for the {total} tools exposed by the MCP server.",
        "",
        "Run `python3 scripts/generate_tool_docs.py` to regenerate.",
        "",
    ]
    lines += [schema_to_table(t) for t in tools]
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text("\n".join(lines) + "\n")
    print(f"Wrote {OUT} with {total} tools")

if __name__ == "__main__":
    main()
