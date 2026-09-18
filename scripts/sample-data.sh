#!/usr/bin/env bash
# 複数プロジェクトのサンプルを投入する（追加的。既存データは消さない）。
# 使い方: bash scripts/sample-data.sh [投入するプロジェクト数(既定2)]
#   env: TASK_BRANCH_URL (既定 http://127.0.0.1:54321)
#        TASK_BRANCH_KEY (既定 ローカル publishable key)
set -euo pipefail

URL="${TASK_BRANCH_URL:-http://127.0.0.1:54321}"
KEY="${TASK_BRANCH_KEY:-sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH}"
COUNT="${1:-2}"

H=(-H "apikey: $KEY" -H "Authorization: Bearer $KEY" \
   -H "Content-Type: application/json" -H "Prefer: return=representation")

jid() { python3 -c 'import sys,json;print(json.load(sys.stdin)[0]["id"])'; }

create_project() { # name -> id
  curl -s "$URL/rest/v1/projects" "${H[@]}" -d "{\"name\":\"$1\"}" | jid
}

create_node() { # level project_id parent_id title -> id
  local level="$1" pid="$2" parent="$3" title="$4"
  local pj="null"; [ "$parent" != "null" ] && pj="\"$parent\""
  curl -s "$URL/rest/v1/tasks" "${H[@]}" \
    -d "{\"project_id\":\"$pid\",\"parent_id\":$pj,\"level\":\"$level\",\"title\":\"$title\"}" | jid
}

for n in $(seq 1 "$COUNT"); do
  pid=$(create_project "プロジェクト$n")
  ph=$(create_node  phase "$pid" null       "フェーズ$n")
  tk=$(create_node  task  "$pid" "$ph"       "タスク$n-1")
  st=$(create_node  step  "$pid" "$tk"       "ステップ$n-1-1")
  echo "✅ プロジェクト$n  project=$pid  phase=$ph  task=$tk  step=$st"
done

echo "完了。ブラウザ左上のプロジェクト選択に「プロジェクト1..$COUNT」が追加されます。"
