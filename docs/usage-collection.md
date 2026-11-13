# 使用量の集め方の検証（Claude Code のフック / OpenTelemetry）

「使用量の記録」ストーリーの最初のタスク「集め方を検証（Claude Code のフック / OpenTelemetry）」の結果。
AI エージェント（Claude Code）がタスクを進めるのに使ったトークンと費用を、**タスク単位で** task-branch に記録するための取り方を、
Claude Code 2.1.322 で実際に動かして確かめた（2026-11-12）。

## 結論

| 取り方 | 取れるもの | タスクへのひも付け | 向き・不向き |
| --- | --- | --- | --- |
| **A. フック（Stop / SessionEnd）＋ transcript** | API 応答ごとのトークン（入力・出力・キャッシュ読み・キャッシュ作成）とモデル。セッション合計の費用（USD）は終了時の `cost-state` 行 | transcript の中の task-branch の MCP ツール呼び出し（`start_task` → `request_task_review` / `complete_task`）の時刻で区切れる | **推奨**。追加の受け口（Collector）が要らず、フックから task-branch の API に送るだけで済む |
| **B. OpenTelemetry** | `claude_code.api_request` イベントに API 応答ごとのトークンと **`cost_usd`**。メトリクス `claude_code.token.usage` / `claude_code.cost.usage` | `OTEL_RESOURCE_ATTRIBUTES` に `task_branch.task_id=<uuid>` を入れると全イベント・メトリクスに付く。ただし起動時に固定なので、1セッション1タスクのときだけ使える | OTLP の受け口（Collector など）を別に持つ必要がある。費用の内訳は正確 |

- **A を採用する案を推奨する**。理由: (1) task-branch は Supabase + Vercel だけで、OTLP の受け口を持っていない（立てるとクラウドの費用がかかる）。
  (2) do スキルは1セッションで複数のタスクを触ることがあり、A は MCP の呼び出しで区切れるが、B は起動時の属性に固定される。
  (3) トークン数は A と Claude Code 自身の集計（`cost-state`）が一致した（下の「確認結果」）
- A の弱点は、**API 応答ごとの費用が transcript に無い**こと。タスクごとの費用は、トークン数とモデルの単価表から計算するか、
  セッション合計の費用をトークン比で按分する。→ **按分に決めた**（下の「記録先」）
- B は、あとでチームや Devin などの利用を集めるとき（Collector を立てる価値が出たとき）に足す。A と同じ `usage_events` に入れられる形にしておく

## A. フック＋ transcript

### フックの入力

`Stop`（応答のたび）と `SessionEnd`（セッションの終わり）のフックには、標準入力に次の JSON が来る（実測。値は省略）。
**使用量そのものは入っていない**ので、`transcript_path` を読む。

```json
{"session_id":"…","transcript_path":"~/.claude/projects/<作業ディレクトリ>/<session_id>.jsonl","cwd":"…",
 "prompt_id":"…","permission_mode":"default","hook_event_name":"Stop","stop_hook_active":false,
 "last_assistant_message":"2", "…": "…"}
{"session_id":"…","transcript_path":"…","cwd":"…","prompt_id":"…","hook_event_name":"SessionEnd","reason":"other"}
```

### transcript から取れるもの

- `type: "assistant"` の行の `message.usage` に `input_tokens` / `output_tokens` / `cache_read_input_tokens` / `cache_creation_input_tokens`
  （`cache_creation.ephemeral_5m_input_tokens` / `ephemeral_1h_input_tokens` の内訳、`output_tokens_details.thinking_tokens` も）と `message.model`、`requestId`、`timestamp`
- **1つの API 応答が content のブロック（thinking / text / tool_use）ごとに別の行になり、同じ usage が繰り返される**。
  そのまま足すと二重に数えるので、`message.id` で重複を除く
- **サブエージェントの分は別ファイル**（`<session_id>/subagents/agent-<id>.jsonl`）。本体の transcript には入らないので、これも読む
- セッションの終わりに `type: "cost-state"` の行が書かれ、`totalCostUSD` と、モデルごとの `modelUsage`（トークンと `costUSD`）が入る。
  サブエージェントの分も含んだ合計。途中の時点（`Stop`）では無いことがある
- 同じ transcript に MCP ツールの `tool_use`（`name: "mcp__task-branch__start_task"`, `input.task_id`）が残るので、タスクの区間が分かる

### 集計の試作

[`scripts/usage-from-transcript.py`](../scripts/usage-from-transcript.py)（標準ライブラリだけ）。

```bash
python3 scripts/usage-from-transcript.py ~/.claude/projects/<作業ディレクトリ>/<session_id>.jsonl
```

- `message.id` で重複を除き、サブエージェントの transcript も読む
- `start_task(X)` から `request_task_review(X)` / `complete_task(X)` までの間の応答を X に、区間の外を `task_id: null` に入れる
- `cost-state` があれば `session_total` にセッション合計の費用を出す

`--events` を付けると、API 応答 1 件 = 1 要素の配列を出す。そのまま RPC `record_usage_events(events)` に渡せる（下の「記録先」）。

本番に入れるときは、このロジックを `SessionEnd`（と、長いセッションに備えて `Stop`）のフックから呼び、
結果を task-branch の API（MCP ツールか RPC）に送る。同じ応答を二重に送らないよう、`message.id`（または `requestId`）を一意キーにする。
フックの設定はユーザーの `~/.claude/settings.json` に置く（リポジトリには例だけを置く）。

### 記録先（usage_events）

「usage_events テーブルとタスクへのひも付け」で決めた形（`supabase/migrations/0035_usage_events.sql`、DESIGN.md §3.2 usage_events）。

- テーブル `usage_events` に API 応答 1 件 = 1 行。一意キーは (持ち主, `request_key` = message.id)。何度送っても 1 行
- 書き込みは RPC `record_usage_events(events jsonb)`（1 回 500 件まで、返り値 `{inserted, updated, skipped}`）だけ。読めるのは持ち主だけ
- task_id は送り手が上の区間で決める。DB は持ち主のプロジェクトのタスクだけ受け付け、それ以外は null で記録する
- 費用は、`cost-state` のモデルごとの `costUSD` を、そのモデルの応答にトークンの重み（入力 1・出力 5・キャッシュ読み 0.1・キャッシュ作成 1.25。Claude の各モデルで共通の単価の比）で按分する。
  単価表を持たずに済み、合計はセッションの費用と一致する。`cost-state` が無い時点（`Stop` の途中など）で送ると `cost_usd` は null。あとで `SessionEnd` から費用付きで送り直すと、null の行だけ埋まる（トークンは上書きしない）
- フックから送る仕組み（トークンの持ち方・設定例）は未実装

## B. OpenTelemetry

```bash
CLAUDE_CODE_ENABLE_TELEMETRY=1 \
OTEL_METRICS_EXPORTER=console OTEL_LOGS_EXPORTER=console \
OTEL_RESOURCE_ATTRIBUTES="task_branch.task_id=<タスクの uuid>" \
claude -p "…"
```

- 本番では `OTEL_*_EXPORTER=otlp` と `OTEL_EXPORTER_OTLP_ENDPOINT` で Collector に送る（今回は console で確かめた）
- ログ（イベント）`claude_code.api_request` に API 応答ごとの `model` / `input_tokens` / `output_tokens` / `cache_read_tokens` /
  `cache_creation_tokens`（5m / 1h の内訳）/ **`cost_usd`** / `duration_ms` / `request_id` / `prompt.id` / `query_source`
- サブエージェントの応答は `query_source: "agent:builtin:general-purpose"` と `agent_id` 付きで同じストリームに出る
- メトリクス `claude_code.token.usage`（属性 `type`: input / output / cacheRead / cacheCreation）、`claude_code.cost.usage`（USD）、
  `claude_code.session.count`、`claude_code.active_time.total`
- `OTEL_RESOURCE_ATTRIBUTES` の値は resource と各データポイントの属性に付いた。タスクを切り替えても変えられない
- **イベントの属性にアカウントのメールアドレス・アカウント ID・組織 ID が入る**。外部の Collector に送るときは、
  Collector 側で落とすか、`OTEL_LOG_USER_PROMPTS` などの設定と合わせて送る範囲を決める

## 確認結果

1. フック（`Stop` / `SessionEnd` / `PostToolUse`）を `--settings` で付けて `claude -p` を Haiku で 1 回実行し、標準入力の JSON を保存した。
   `Stop` と `SessionEnd` の入力は上のとおりで、使用量は入っていなかった
2. 同じ実行の OpenTelemetry（console）で `claude_code.api_request` に `cost_usd: 0.00271617` が出た。transcript の `cost-state` の
   `totalCostUSD` も `0.00271617` で一致した
3. Agent ツール（サブエージェント）を使う実行で、OTel の `api_request` 4 件の `cost_usd` の合計（0.00244658 + 0.00058074 + 0.0032567 + 0.00052995 = 0.00681397）が
   `cost-state` の `totalCostUSD`（0.00681397）と一致した
4. 3 の transcript を試作スクリプトにかけると、トークン数が `cost-state` の `modelUsage` と一致した（入力 10 / 出力 311 / キャッシュ読み 107,647 / キャッシュ作成 37,670、応答 4 件のうちサブエージェント 1 件）
5. このタスクを実施したセッション自身の transcript にかけると、`start_task` 以降の応答が `task_id: d4a557c9-…` に分かれた

## 未確認・残課題

- `Stop` のたびに送る場合の重複除き（API 側の一意キー）と、`SessionEnd` が呼ばれない終わり方（強制終了）での取りこぼし
- Windows（Claude Code のネイティブ版）での transcript の置き場所とフックの実行（今回は Linux のクラウド環境だけで確かめた）
- Devin など Claude Code 以外のエージェントの使用量（フックも OTel も Claude Code のもの）
