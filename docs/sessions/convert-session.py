#!/usr/bin/env python3
"""
Convert Claude Code JSONL session transcript to readable Markdown.
Preserves ALL data — every message, tool call, tool result, thinking block.
"""

import json
import sys
import html
from datetime import datetime

INPUT = "website-builder-session-raw.jsonl"
OUTPUT = "website-builder-session-full.md"

def fmt_time(ts):
    """Format ISO timestamp to readable time."""
    try:
        dt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
        return dt.strftime("%I:%M:%S %p UTC")
    except:
        return ts or ""

def truncate(s, max_len=500):
    """Don't truncate - keep everything."""
    return s

def escape_md(s):
    """Minimal escaping for markdown code blocks."""
    if not s:
        return ""
    return s

def format_tool_input(tool_name, tool_input):
    """Format tool input as readable key-value pairs."""
    if not tool_input:
        return ""
    lines = []
    for k, v in tool_input.items():
        val = v
        if isinstance(v, str) and len(v) > 2000:
            val = v[:2000] + f"\n... ({len(v)} chars total)"
        elif isinstance(v, (dict, list)):
            val = json.dumps(v, indent=2)
            if len(val) > 2000:
                val = val[:2000] + f"\n... ({len(val)} chars total)"
        lines.append(f"  **{k}:** {val}")
    return "\n".join(lines)

def format_tool_result(result):
    """Format tool result content."""
    if not result:
        return "_No output_"
    if isinstance(result, list):
        parts = []
        for item in result:
            if isinstance(item, dict):
                if item.get("type") == "text":
                    text = item.get("text", "")
                    if len(text) > 5000:
                        parts.append(text[:5000] + f"\n... ({len(text)} chars total)")
                    else:
                        parts.append(text)
                elif item.get("type") == "image":
                    parts.append("_[Screenshot/Image]_")
                else:
                    parts.append(json.dumps(item)[:1000])
            else:
                parts.append(str(item)[:1000])
        return "\n".join(parts)
    if isinstance(result, str):
        if len(result) > 5000:
            return result[:5000] + f"\n... ({len(result)} chars total)"
        return result
    return json.dumps(result, indent=2)[:3000]

def main():
    messages = []
    with open(INPUT) as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                obj = json.loads(line)
                messages.append(obj)
            except json.JSONDecodeError:
                continue

    md = []
    md.append("# Artha Website Builder — Full Claude Code Session Transcript")
    md.append("")
    md.append("> **Session ID:** `e1712a12-07a3-4378-aed5-c1448f0bc552`")
    md.append("> **Date:** April 15, 2026")
    md.append("> **Project:** Artha — AI Company Builder")
    md.append("> **Goal:** Transform website builder from single landing pages to best-in-class multi-page business websites")
    md.append("")
    md.append("---")
    md.append("")

    msg_num = 0
    tool_use_map = {}  # id -> {name, input}

    for obj in messages:
        obj_type = obj.get("type")

        # Skip queue operations and progress updates for cleaner output
        if obj_type in ("queue-operation", "progress", "last-prompt"):
            continue

        # System messages
        if obj_type == "system":
            md.append("---")
            md.append("")
            md.append("### System")
            md.append("")
            content = obj.get("message", {}).get("content", "")
            if isinstance(content, list):
                for block in content:
                    if isinstance(block, dict) and block.get("type") == "text":
                        text = block.get("text", "")
                        if len(text) > 300:
                            md.append(f"_System prompt ({len(text)} chars) — project context, instructions, memory_")
                        else:
                            md.append(f"```\n{text}\n```")
            elif isinstance(content, str):
                if len(content) > 300:
                    md.append(f"_System prompt ({len(content)} chars)_")
                else:
                    md.append(f"```\n{content}\n```")
            md.append("")
            continue

        # User messages
        msg = obj.get("message", {})
        role = msg.get("role")

        if obj_type == "user" or role == "user":
            content = msg.get("content", "")
            if isinstance(content, list):
                has_tool_result = False
                for block in content:
                    if isinstance(block, dict):
                        if block.get("type") == "tool_result":
                            has_tool_result = True
                            tool_use_id = block.get("tool_use_id", "")
                            tool_info = tool_use_map.get(tool_use_id, {})
                            tool_name = tool_info.get("name", "unknown")
                            result_content = block.get("content", "")
                            is_error = block.get("is_error", False)

                            md.append(f"<details>")
                            md.append(f"<summary>{'❌' if is_error else '✅'} <strong>Tool Result:</strong> <code>{tool_name}</code></summary>")
                            md.append("")
                            md.append("```")
                            md.append(format_tool_result(result_content))
                            md.append("```")
                            md.append("")
                            md.append("</details>")
                            md.append("")
                        elif block.get("type") == "text":
                            text = block.get("text", "")
                            if text.strip():
                                msg_num += 1
                                md.append(f"## User Message #{msg_num}")
                                md.append("")
                                md.append(f"> {text}")
                                md.append("")
                        elif block.get("type") == "image":
                            md.append("_[User shared a screenshot]_")
                            md.append("")
                if not has_tool_result and not any(b.get("type") == "text" for b in content if isinstance(b, dict)):
                    pass  # empty content list
            elif isinstance(content, str) and content.strip():
                msg_num += 1
                md.append(f"## User Message #{msg_num}")
                md.append("")
                md.append(f"> {content}")
                md.append("")
            continue

        # Assistant messages
        if role == "assistant":
            content = msg.get("content", [])
            if isinstance(content, str):
                if content.strip():
                    md.append("### Claude")
                    md.append("")
                    md.append(content)
                    md.append("")
                continue

            if not isinstance(content, list):
                continue

            has_text = False
            for block in content:
                if not isinstance(block, dict):
                    continue

                block_type = block.get("type")

                if block_type == "thinking":
                    thinking = block.get("thinking", "")
                    if thinking.strip():
                        md.append("<details>")
                        md.append("<summary>💭 <strong>Claude's Thinking</strong></summary>")
                        md.append("")
                        md.append("```")
                        if len(thinking) > 3000:
                            md.append(thinking[:3000] + f"\n... ({len(thinking)} chars total)")
                        else:
                            md.append(thinking)
                        md.append("```")
                        md.append("")
                        md.append("</details>")
                        md.append("")

                elif block_type == "text":
                    text = block.get("text", "")
                    if text.strip():
                        if not has_text:
                            md.append("### Claude")
                            md.append("")
                            has_text = True
                        md.append(text)
                        md.append("")

                elif block_type == "tool_use":
                    tool_name = block.get("name", "unknown")
                    tool_input = block.get("input", {})
                    tool_id = block.get("id", "")
                    tool_use_map[tool_id] = {"name": tool_name, "input": tool_input}

                    # Categorize tool calls
                    if "Agent" in tool_name or tool_name == "Agent":
                        desc = tool_input.get("description", "")
                        prompt = tool_input.get("prompt", "")
                        md.append(f"#### 🤖 Agent: {desc}")
                        md.append("")
                        if prompt:
                            md.append("<details>")
                            md.append(f"<summary>Agent prompt ({len(prompt)} chars)</summary>")
                            md.append("")
                            md.append("```")
                            if len(prompt) > 3000:
                                md.append(prompt[:3000] + f"\n... ({len(prompt)} chars)")
                            else:
                                md.append(prompt)
                            md.append("```")
                            md.append("")
                            md.append("</details>")
                            md.append("")
                    elif "Edit" in tool_name and tool_name == "Edit":
                        fp = tool_input.get("file_path", "")
                        old = tool_input.get("old_string", "")
                        new = tool_input.get("new_string", "")
                        md.append(f"#### ✏️ Edit: `{fp.split('/')[-1] if '/' in fp else fp}`")
                        md.append("")
                        md.append(f"File: `{fp}`")
                        md.append("")
                        if old:
                            md.append("<details>")
                            md.append("<summary>View diff</summary>")
                            md.append("")
                            md.append("**Removed:**")
                            md.append("```diff")
                            for line in old.split("\n")[:30]:
                                md.append(f"- {line}")
                            if old.count("\n") > 30:
                                md.append(f"... ({old.count(chr(10))} lines total)")
                            md.append("```")
                            md.append("")
                            md.append("**Added:**")
                            md.append("```diff")
                            for line in new.split("\n")[:30]:
                                md.append(f"+ {line}")
                            if new.count("\n") > 30:
                                md.append(f"... ({new.count(chr(10))} lines total)")
                            md.append("```")
                            md.append("")
                            md.append("</details>")
                            md.append("")
                    elif "Write" in tool_name and tool_name == "Write":
                        fp = tool_input.get("file_path", "")
                        content_str = tool_input.get("content", "")
                        md.append(f"#### 📝 Write: `{fp.split('/')[-1] if '/' in fp else fp}`")
                        md.append("")
                        md.append(f"File: `{fp}` ({len(content_str)} chars)")
                        md.append("")
                        md.append("<details>")
                        md.append("<summary>View file content</summary>")
                        md.append("")
                        md.append("```typescript")
                        if len(content_str) > 5000:
                            md.append(content_str[:5000] + f"\n// ... ({len(content_str)} chars total)")
                        else:
                            md.append(content_str)
                        md.append("```")
                        md.append("")
                        md.append("</details>")
                        md.append("")
                    elif "Read" in tool_name and tool_name == "Read":
                        fp = tool_input.get("file_path", "")
                        md.append(f"#### 📖 Read: `{fp.split('/')[-1] if '/' in fp else fp}`")
                        md.append("")
                    elif "Bash" in tool_name and tool_name == "Bash":
                        cmd = tool_input.get("command", "")
                        desc = tool_input.get("description", "")
                        md.append(f"#### 💻 Bash: {desc or cmd[:80]}")
                        md.append("")
                        md.append(f"```bash\n{cmd}\n```")
                        md.append("")
                    elif "Grep" in tool_name and tool_name == "Grep":
                        pattern = tool_input.get("pattern", "")
                        path = tool_input.get("path", "")
                        md.append(f"#### 🔍 Grep: `{pattern}` in `{path.split('/')[-1] if path else '.'}`")
                        md.append("")
                    elif "Glob" in tool_name and tool_name == "Glob":
                        pattern = tool_input.get("pattern", "")
                        md.append(f"#### 📁 Glob: `{pattern}`")
                        md.append("")
                    elif "TodoWrite" in tool_name:
                        todos = tool_input.get("todos", [])
                        md.append(f"#### 📋 Todo List Update")
                        md.append("")
                        for t in todos:
                            status_icon = {"completed": "✅", "in_progress": "🔄", "pending": "⬜"}.get(t.get("status", ""), "⬜")
                            md.append(f"- {status_icon} {t.get('content', '')}")
                        md.append("")
                    elif "AskUserQuestion" in tool_name:
                        questions = tool_input.get("questions", [])
                        md.append(f"#### ❓ Question to User")
                        md.append("")
                        for q in questions:
                            md.append(f"**{q.get('question', '')}**")
                            md.append("")
                            for opt in q.get("options", []):
                                md.append(f"- **{opt.get('label', '')}** — {opt.get('description', '')}")
                            md.append("")
                    elif "ExitPlanMode" in tool_name:
                        md.append("#### 🚀 Plan Approved — Starting Implementation")
                        md.append("")
                    elif "EnterPlanMode" in tool_name:
                        md.append("#### 📐 Entering Plan Mode")
                        md.append("")
                    else:
                        # Generic tool call
                        short_name = tool_name.split("__")[-1] if "__" in tool_name else tool_name
                        md.append(f"#### 🔧 Tool: `{short_name}`")
                        md.append("")
                        if tool_input:
                            formatted = format_tool_input(tool_name, tool_input)
                            if len(formatted) > 500:
                                md.append("<details>")
                                md.append("<summary>Tool parameters</summary>")
                                md.append("")
                                md.append(formatted)
                                md.append("")
                                md.append("</details>")
                                md.append("")
                            else:
                                md.append(formatted)
                                md.append("")

            continue

        # Attachment messages
        if obj_type == "attachment":
            md.append("_[File attachment]_")
            md.append("")

    # Write output
    with open(OUTPUT, "w") as f:
        f.write("\n".join(md))

    print(f"Done! Wrote {len(md)} lines to {OUTPUT}")

if __name__ == "__main__":
    main()
