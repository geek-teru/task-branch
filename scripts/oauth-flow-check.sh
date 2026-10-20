#!/usr/bin/env bash
# OAuth 2.1 の認可コードフロー（PKCE）を MCP クライアントと同じ手順で通し、JWT の中身を確かめる。
# 動的登録 → 認可（ブラウザで同意）→ トークン → REST 呼び出し → リフレッシュ（→ MCP）の順に進む。
# 使い方: bash scripts/oauth-flow-check.sh [Supabase の URL] [anon key] [MCP の URL]
#   既定はローカル（http://127.0.0.1:54321 と ローカル publishable key）
#   同意画面へ進むには、フロント（make dev）も起動しておく
#   MCP の URL（例 http://localhost:3000/api/mcp）を渡すと、取ったトークンで MCP のツールも呼ぶ（make mcp-dev）
set -euo pipefail

URL="${1:-http://127.0.0.1:54321}"
KEY="${2:-sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH}"
MCP_URL="${3:-}"
REDIRECT_URI="http://localhost:8976/callback"

json() { # key -> 標準入力の JSON から値を取り出す
  python3 -c 'import sys,json;print(json.load(sys.stdin).get(sys.argv[1]) or "")' "$1"
}

b64url() { openssl base64 -A | tr '+/' '-_' | tr -d '='; }

jwt_part() { # jwt index -> その部分を整形した JSON
  python3 -c '
import sys,json,base64
p=sys.argv[1].split(".")[int(sys.argv[2])]
print(json.dumps(json.loads(base64.urlsafe_b64decode(p+"="*(-len(p)%4))),indent=2,ensure_ascii=False))' "$1" "$2"
}

post() { # path body -> レスポンス（失敗したら本文を出して止まる）
  local res code
  res=$(curl -s -w '\n%{http_code}' "$URL$1" -H "apikey: $KEY" -H "Content-Type: application/json" -d "$2")
  code=${res##*$'\n'}; res=${res%$'\n'*}
  if [ "${code:0:1}" != 2 ]; then echo "❌ POST $1 → $code" >&2; echo "$res" >&2; exit 1; fi
  echo "$res"
}

echo "== 1. クライアントの動的登録"
client=$(post /auth/v1/oauth/clients/register \
  "{\"client_name\":\"oauth-flow-check\",\"redirect_uris\":[\"$REDIRECT_URI\"],\"token_endpoint_auth_method\":\"none\"}")
client_id=$(echo "$client" | json client_id)
echo "client_id: $client_id"

echo
echo "== 2. 認可（PKCE S256）"
verifier=$(openssl rand 32 | b64url)
challenge=$(printf '%s' "$verifier" | openssl dgst -sha256 -binary | b64url)
state=$(openssl rand 16 | b64url)
echo "次の URL をブラウザで開き、同意してください:"
echo
echo "$URL/auth/v1/oauth/authorize?response_type=code&client_id=$client_id&redirect_uri=$REDIRECT_URI&code_challenge=$challenge&code_challenge_method=S256&state=$state"
echo
echo "戻り先（$REDIRECT_URI?...）は開けないページになります。アドレスバーの URL を貼り付けてください:"
read -r callback
code=$(python3 -c 'import sys,urllib.parse as u;q=u.parse_qs(u.urlparse(sys.argv[1]).query);print(q.get("code",[""])[0])' "$callback")
got_state=$(python3 -c 'import sys,urllib.parse as u;q=u.parse_qs(u.urlparse(sys.argv[1]).query);print(q.get("state",[""])[0])' "$callback")
[ -n "$code" ] || { echo "❌ code がありません: $callback" >&2; exit 1; }
[ "$got_state" = "$state" ] || { echo "❌ state が一致しません" >&2; exit 1; }
echo "code を取得（state 一致）"

echo
echo "== 3. トークン"
token=$(post /auth/v1/oauth/token \
  "{\"grant_type\":\"authorization_code\",\"code\":\"$code\",\"code_verifier\":\"$verifier\",\"client_id\":\"$client_id\",\"redirect_uri\":\"$REDIRECT_URI\"}")
access=$(echo "$token" | json access_token)
refresh=$(echo "$token" | json refresh_token)
echo "access_token / refresh_token を取得"

echo
echo "== 4. access_token の中身"
echo "-- header"
jwt_part "$access" 0
echo "-- payload"
jwt_part "$access" 1 | python3 -c '
import sys,json
p=json.load(sys.stdin)
print(json.dumps({k:p.get(k) for k in ["alg","sub","role","aud","client_id","app_metadata"] if k in p},indent=2,ensure_ascii=False))'

echo
echo "== 5. access_token で REST を呼ぶ（自分のプロジェクトだけが返る）"
curl -s "$URL/rest/v1/projects?select=id,name" -H "apikey: $KEY" -H "Authorization: Bearer $access"
echo

echo
echo "== 6. リフレッシュ"
refreshed=$(post /auth/v1/oauth/token \
  "{\"grant_type\":\"refresh_token\",\"refresh_token\":\"$refresh\",\"client_id\":\"$client_id\"}")
new_access=$(echo "$refreshed" | json access_token)
[ -n "$new_access" ] && [ "$new_access" != "$access" ] || { echo "❌ 新しい access_token が取れません" >&2; exit 1; }
echo "新しい access_token を取得（client_id: $(jwt_part "$new_access" 1 | json client_id)）"

if [ -n "$MCP_URL" ]; then
  mcp() { # body [token] -> MCP の応答（ステータス行 + 本文）
    local auth=()
    [ -n "${2:-}" ] && auth=(-H "Authorization: Bearer $2")
    curl -s -w '\nHTTP %{http_code}' "$MCP_URL" "${auth[@]}" \
      -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" -d "$1"
    echo
  }

  echo
  echo "== 7. MCP: トークンなし（401 と WWW-Authenticate）"
  curl -s -o /dev/null -D - -X POST "$MCP_URL" | grep -iE '^(HTTP|www-authenticate)'

  echo
  echo "== 8. MCP: initialize"
  mcp '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"oauth-flow-check","version":"0"}}}' "$new_access"

  echo
  echo "== 9. MCP: tools/list"
  mcp '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' "$new_access"

  echo
  echo "== 10. MCP: tools/call list_projects（自分のプロジェクトだけが返る）"
  mcp '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"list_projects","arguments":{}}}' "$new_access"
fi

echo
echo "✅ 完了"
