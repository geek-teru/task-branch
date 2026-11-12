#!/usr/bin/env python3
"""Claude Code の transcript（セッションの JSONL）から、トークンの使用量をタスクごとに集計する（検証用の試作）。

使い方: python3 scripts/usage-from-transcript.py <transcript.jsonl>
  - transcript は ~/.claude/projects/<作業ディレクトリ>/<session_id>.jsonl
    （フックの入力の transcript_path でも渡される）
  - サブエージェントの分は <session_id>/subagents/agent-*.jsonl にあり、これも読む
  - 出力は JSON（標準出力）。docs/usage-collection.md の「集計の試作」を参照

集計のしかた:
  - assistant の行の message.usage を数える。1つの API 応答が content のブロックごとに
    複数行に分かれて同じ usage が繰り返されるため、message.id で重複を除く
  - タスクへのひも付けは、task-branch の MCP ツールの呼び出し
    （start_task で始まり、request_task_review / complete_task で終わる）の時刻で区切る。
    区間の外の使用量は task_id = null に入れる
  - 費用（USD）は transcript の行ごとには無い。セッションの合計だけ、終了時に書かれる
    cost-state 行（totalCostUSD / modelUsage）から取る
"""
import glob
import json
import os
import sys
from collections import defaultdict

TOOL_PREFIX = "mcp__task-branch__"
START = {"start_task"}
END = {"request_task_review", "complete_task"}
FIELDS = (
    "input_tokens",
    "output_tokens",
    "cache_read_input_tokens",
    "cache_creation_input_tokens",
)


def read_jsonl(path):
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                try:
                    yield json.loads(line)
                except json.JSONDecodeError:
                    continue


def task_events(rows):
    """(timestamp, 'start'|'end', task_id) を時刻順で返す。"""
    events = []
    for r in rows:
        if r.get("type") != "assistant":
            continue
        for block in (r.get("message") or {}).get("content") or []:
            if not isinstance(block, dict) or block.get("type") != "tool_use":
                continue
            name = block.get("name") or ""
            if not name.startswith(TOOL_PREFIX):
                continue
            tool = name[len(TOOL_PREFIX):]
            task_id = (block.get("input") or {}).get("task_id")
            if not task_id:
                continue
            if tool in START:
                events.append((r.get("timestamp") or "", "start", task_id))
            elif tool in END:
                events.append((r.get("timestamp") or "", "end", task_id))
    events.sort(key=lambda e: e[0])
    return events


def active_task(events, ts):
    current = None
    for t, kind, task_id in events:
        if t > ts:
            break
        if kind == "start":
            current = task_id
        elif kind == "end" and current == task_id:
            current = None
    return current


def main():
    if len(sys.argv) != 2:
        print(__doc__, file=sys.stderr)
        sys.exit(2)
    path = sys.argv[1]
    main_rows = list(read_jsonl(path))
    session_dir = os.path.splitext(path)[0]
    sub_paths = sorted(glob.glob(os.path.join(session_dir, "subagents", "agent-*.jsonl")))

    events = task_events(main_rows)
    seen = set()
    by_task = defaultdict(lambda: defaultdict(lambda: defaultdict(int)))
    cost_state = None

    def add(rows, source):
        nonlocal cost_state
        for r in rows:
            if r.get("type") == "cost-state":
                cost_state = r
                continue
            if r.get("type") != "assistant":
                continue
            msg = r.get("message") or {}
            usage = msg.get("usage")
            key = msg.get("id") or r.get("requestId")
            if not usage or not key or key in seen:
                continue
            seen.add(key)
            task_id = active_task(events, r.get("timestamp") or "")
            bucket = by_task[task_id][msg.get("model") or "unknown"]
            for field in FIELDS:
                bucket[field] += int(usage.get(field) or 0)
            bucket["requests"] += 1
            bucket["subagent_requests"] += 1 if source == "subagent" else 0

    add(main_rows, "main")
    for p in sub_paths:
        add(read_jsonl(p), "subagent")

    result = {
        "session_id": next((r.get("sessionId") for r in main_rows if r.get("sessionId")), None),
        "subagent_transcripts": len(sub_paths),
        "tasks": [
            {"task_id": task_id, "models": {m: dict(v) for m, v in models.items()}}
            for task_id, models in by_task.items()
        ],
        "session_total": None,
    }
    if cost_state:
        result["session_total"] = {
            "cost_usd": cost_state.get("totalCostUSD"),
            "models": {
                m: {
                    "input_tokens": u.get("inputTokens"),
                    "output_tokens": u.get("outputTokens"),
                    "cache_read_input_tokens": u.get("cacheReadInputTokens"),
                    "cache_creation_input_tokens": u.get("cacheCreationInputTokens"),
                    "cost_usd": u.get("costUSD"),
                }
                for m, u in (cost_state.get("modelUsage") or {}).items()
            },
        }
    json.dump(result, sys.stdout, ensure_ascii=False, indent=2)
    print()


if __name__ == "__main__":
    main()
