# task-branch 設計書 (DD)

AI がプランニングしたタスクを **粒度の異なる3階層のツリー** で管理し、週単位タスクの **依存関係を DAG（ブランチ図）** として可視化する個人用タスク管理アプリ。

- ステータス: Draft v0.3
- 作成日: 2026-09-15
- 対象: 個人利用（メンバーアサインなし）

---

## 1. 目的とスコープ

### 1.1 背景・狙い

AI（Claude Code の `plan` スキル）が今後のタスクを洗い出し・優先順位付けし、その結果を構造化データとして蓄積・可視化する。人間はブラウザで進捗・階層構造・依存関係（枝分かれ）・クリティカルパスを確認する。

### 1.2 中核となる2つの関係（重要）

本アプリのデータは **直交する2種類の関係** を同時に持つ。

| 関係 | 形 | 何を表すか | 例 |
|---|---|---|---|
| **階層（分解）** | ツリー | 粒度の粗いオブジェクトを細かく分解 | 「決済基盤刷新(epic/数ヶ月)」→「認証移行(story/1週)」→「テストケース作成(task)」 |
| **依存（順序）** | DAG | 「Aが終わってからB」という実行順序 | 「認証移行」→「決済移行」 |

- 階層は **`parent_id` によるツリー**。
- 依存は **`task_dependencies` による有向辺**（週単位タスク間で張る）。

### 1.3 3つの粒度（level）

| level | 呼称 | 粒度 | 役割 |
|---|---|---|---|
| `epic` | エピック | 1ヶ月〜数ヶ月 | 大目標。子ストーリーの集約ビュー。依存・CPの対象外（集約のみ） |
| `story` | ストーリー | 1週間程度 | **依存・並列度・クリティカルパスの主対象** |
| `task` | タスク | ストーリー内の細目 | 単純な done/undone 管理。親ストーリーの進捗に寄与 |

- 階層は原則 `epic > story > task` の順にネストする（3段）。
- **依存関係とクリティカルパスは `story`（週単位）レベルでのみ扱う**（ユーザー確定事項）。

### 1.4 満たすべき要件

| # | 要件 | 対応方針 |
|---|---|---|
| R1 | AI がプランニングしたタスクを管理 | `plan` スキルが REST/RPC で CRUD |
| R2 | 並列度を上げたい | 依存のない `task` を並列レーンに。着手可能なものは `next` ステータスで管理 |
| R3 | 終わった / これから進めるタスクを見れる | status フィルタ・ビュー |
| R4 | マインドマップ / Git ブランチ状に可視化 | React Flow。階層ツリー + 依存DAG |
| R5 | 依存は直列、非依存は並列で配置 | トポロジカル順で rank 配置、同 rank を横展開 |
| R6 | クリティカルパスがわかる | 依存チェーンの **最長経路（ホップ数, 重み1）** を強調 |
| R7 | プロジェクト単位で管理 | `projects` でスコープ分離 |
| R8 | メンバーアサイン不要（個人用） | assignee なし |
| R9 | 安価・最速 | Supabase（無料枠）+ 自動生成 API。専用バックエンドを作らない |
| R10 | どこからでも編集可能 | Supabase Cloud にホスト（初期はローカル Supabase で開発） |

### 1.5 スコープの段階（初期 / 将来）

**初期（Phase 1）で作るビュー**: 階層ツリー / ブランチ図(DAG) / リスト / クリティカルパス。

**将来ビュー（設計上あらかじめ拡張可能にしておく）**: ガントチャート / カレンダー / カンバン（§10 参照）。
これらは **コアモデルへの読み取りビュー（射影）として追加**でき、スキーマの破壊的変更を伴わない。

**当面の非スコープ**:
- 見積り時間 / 工数（`estimate` は将来拡張。初期は持たない → CP はホップ数で算出）
- 複数ユーザー / 権限 / コラボ
- 外部カレンダー（Google Calendar 等）双方向同期

---

## 2. アーキテクチャ

```
┌─────────────────────────────┐
│  Claude Code / plan スキル    │  タスク洗い出し・階層化・優先順位付け
└───────────────┬─────────────┘
                │ HTTPS (REST / RPC, apikey)
                ▼
┌─────────────────────────────┐
│  Supabase                    │
│  ├─ PostgREST (自動REST API) │  ← AI からの CRUD 主経路
│  ├─ RPC 関数 (Postgres)      │  ← 依存追加(循環検査) / CP / rank
│  ├─ Postgres (データ本体)     │
│  └─ Auth (APIキー / 将来JWT)  │
└───────────────┬─────────────┘
                │ supabase-js
                ▼
┌─────────────────────────────┐
│  Web UI (React + Vite)       │  階層ツリー・ブランチ図・CP・進捗
│  └─ React Flow + dagre       │
└─────────────────────────────┘
```

- **バックエンドは自作しない**。Supabase が REST API・認証・ホスティングを提供。
- 複雑なロジック（循環検出・クリティカルパス・進捗集約）は **Postgres 関数（RPC）** に集約し、AI・フロント双方から同じ関数を呼ぶ。
- ローカル開発は `supabase start`（Docker）。本番は同一マイグレーションを Supabase Cloud に `db push`。

### 2.1 技術スタック（推奨）

| 層 | 技術 | 理由 |
|---|---|---|
| DB / API / 認証 | Supabase (Postgres 15 + PostgREST + GoTrue) | 無料枠、自動 REST、ローカル↔クラウド同一構成 |
| マイグレーション | Supabase CLI (`supabase/migrations`) | 再現可能なスキーマ管理 |
| フロント | React 18 + TypeScript + Vite | 軽量・高速・無料デプロイ可 |
| グラフ描画 | React Flow + dagre | 階層ツリー / DAG / CP 強調に最適 |
| Supabase 接続 | `@supabase/supabase-js` | 標準クライアント |
| デプロイ(将来) | Vercel / Cloudflare Pages + Supabase Cloud | 無料枠 |

---

## 3. データモデル

### 3.1 ER 概要

```
projects 1 ──< tasks(自己参照ツリー parent_id)
                 └──< task_dependencies (task レベル間の有向辺)
```

- `tasks` 1テーブルで3階層すべてを表現し、`level` と `parent_id` で区別する。

### 3.2 テーブル定義

#### projects

| カラム | 型 | 制約 | 説明 |
|---|---|---|---|
| id | uuid | PK, default gen_random_uuid() | |
| name | text | not null | プロジェクト名 |
| description | text | | 概要 |
| created_at | timestamptz | default now() | |
| updated_at | timestamptz | default now() | |

#### tasks

| カラム | 型 | 制約 | 説明 |
|---|---|---|---|
| id | uuid | PK, default gen_random_uuid() | |
| project_id | uuid | FK→projects.id, not null | |
| parent_id | uuid | FK→tasks.id, null可 | 親（階層）。null はルート(epic想定) |
| level | text | not null | `epic` / `story` / `task` |
| title | text | not null | 名称 |
| description | text | | 詳細・AI が書いた計画内容 |
| status | text | not null, default 'todo' | `todo` / `next` / `in_progress` / `done`（`next`=先行タスクが in_progress になり着手可能） |
| sort_order | int | not null, default 0 | 同階層内 / カンバン列内の表示順 |
| start_date | date | null可 | 開始予定日（**ガント/カレンダー用**。初期は未使用） |
| due_date | date | null可 | 期限日（**ガント/カレンダー用**。初期は未使用） |
| metadata | jsonb | not null, default '{}' | 将来拡張用の自由属性（色・タグ・外部ID等）。スキーマ変更なしで拡張 |
| created_at | timestamptz | default now() | |
| updated_at | timestamptz | default now() | |
| completed_at | timestamptz | | done 遷移時刻 |

制約・ルール:
- `level` は CHECK で3値に固定。
- 階層整合性（`epic > story > task` 以外の親子を禁止）は **トリガ or RPC** で担保。
- `task` は葉。子を持たない。
- 親の進捗は子から集約（§3.4）。
- **拡張フィールド（`start_date` / `due_date` / `metadata`）は nullable で初期は未使用**。ガント/カレンダー等のビュー追加時にそのまま利用でき、既存機能に影響しない。
- 見積り（`estimate`）は未導入。導入時は `estimate_value numeric` + `estimate_unit text` を追加する想定（§10）。

#### task_dependencies

`story`（週単位）レベル間の有向辺（`predecessor` 完了後に `successor` 実行）。

| カラム | 型 | 制約 | 説明 |
|---|---|---|---|
| id | uuid | PK, default gen_random_uuid() | |
| project_id | uuid | FK→projects.id, not null | |
| predecessor_id | uuid | FK→tasks.id, not null | 先行ストーリー（level=story） |
| successor_id | uuid | FK→tasks.id, not null | 後続ストーリー（level=story） |
| created_at | timestamptz | default now() | |

- UNIQUE(predecessor_id, successor_id)、CHECK(predecessor_id <> successor_id)。
- 両端が `level='story'` であることを **RPC `add_dependency` で検証**。
- **循環（サイクル）防止**も同 RPC 内で検査し DAG を保証。

### 3.3 派生概念（計算で導出）

- **rank（階層／並列レーン）**: 依存元のない story を rank 0 とし、`rank(t)=max(rank(先行))+1`。同 rank は並列配置可（R5）。
- **クリティカルパス**: 依存 DAG の **最長経路（各 story の重み=1、ホップ数）**（R6）。将来 `estimate` 追加時は重み付き最長経路へ拡張。

> 着手可能なストーリーは、派生計算ではなく `next` ステータスで管理する（R2）。ストーリーを `in_progress` にすると、その直接の後続ストーリーが `next` に遷移する。

### 3.4 進捗の集約（ロールアップ）

- `task` の done 数 / 総数 → 親 `story` の進捗率。
- `story` の done 数 / 総数（または status）→ 親 `epic` の進捗率。
- 集約は RPC / ビューで計算し、UI に返す。手動 status 上書きも許容。

---

## 4. API 設計（AI / フロント共通）

### 4.1 CRUD（PostgREST 自動生成）

| 操作 | メソッド / エンドポイント |
|---|---|
| プロジェクト作成 | `POST /rest/v1/projects` |
| オブジェクト作成（全level共通） | `POST /rest/v1/tasks`（level と parent_id を指定） |
| ツリー取得 | `GET /rest/v1/tasks?project_id=eq.<id>&order=sort_order` |
| 状態更新 | `PATCH /rest/v1/tasks?id=eq.<id>` |
| 依存の閲覧 | `GET /rest/v1/task_dependencies?project_id=eq.<id>` |

ヘッダ: `apikey: <key>`, `Authorization: Bearer <key>`。

### 4.2 RPC 関数（ロジックを DB に集約）

| 関数 | 用途 | 概要 |
|---|---|---|
| `add_dependency(pred uuid, succ uuid)` | 依存追加 | 両端が story か検証。循環になるならエラー（DAG保証） |
| `get_task_graph(project uuid)` | 可視化用 | tasks（階層込）+ edges + rank をまとめて返す（R4/R5） |
| `get_critical_path(project uuid)` | CP 抽出 | story 依存 DAG の最長経路（ホップ数）のストーリー列を返す（R6） |
| `get_progress(project uuid)` | 進捗集約 | epic/story の進捗率を返す（§3.4） |

- 循環検出・最長経路・集約は Postgres の再帰 CTE（`WITH RECURSIVE`）で実装。
- AI・UI が同じ RPC を使い、計算結果を一致させる。

### 4.3 `plan` スキルの動作イメージ

1. ユーザー要望を分解し、`epic`（数ヶ月）→ `story`（週）→ `task`（細目）に階層化。
2. `projects` を作成 or 選択。
3. 各オブジェクトを `tasks` に登録（level / parent_id / title / description）。
4. week ストーリー間の依存を `add_dependency` で登録（循環はエラーで弾かれる）。
5. 進行に応じ `PATCH` で status 更新（task を done にすると親の進捗が上がる）。

---

## 5. 可視化 UI 設計

### 5.1 画面構成

- **プロジェクト選択** → **ボード**（メイン）
- ビュー切替:
  - **階層ツリー（マインドマップ）**: epic → story → task を展開。React Flow で放射状/ツリー。
  - **ブランチ図（DAG）**: 選択した epic 配下の week ストーリーを、依存で結んだ Git ブランチ状に表示。rank を軸に直列は縦、並列は横（R4/R5）。
  - **リスト**: status 別（done / in_progress / next / todo）。これから進める・終わったを一覧（R3）。
  - **クリティカルパス**: CP 上の story を太線・強調色でハイライト、直列連鎖長を表示（R6）。

### 5.2 表現

- **色**: status（todo=グレー / next=アンバー / in_progress=青 / done=緑）。
- **level で形状/サイズ**: epic=大, story=中, task=小（チェックボックス）。
- **枠強調**: クリティカルパス上の story。
- **バッジ**: 進捗率（親）、`next` ステータス（今すぐ着手可）。

### 5.3 レイアウト

- 階層ツリー: dagre のツリーレイアウト。
- DAG: dagre 有向整列（rank=階層）。直列＝縦方向、並列（同 rank）＝横方向。

### 5.4 ビュー層のアーキテクチャ（拡張性の要）

- **正規化した1つのデータソース**（tasks + dependencies + RPC の集約結果）をフロントで一度取得し、
  各ビューは**同じデータを描画方法だけ変えて表示する純粋な射影**として実装する。
- 共通の型（例: `TaskNode`, `Dependency`, `ProjectGraph`）を定義し、各ビューは
  `render(data): UI` の**アダプタ**として追加する。ビュー追加でデータ層・API は変更不要。
- ビュー切替は URL / タブで管理。ビューごとの表示設定（表示 level、期間、フィルタ等）は
  `metadata` またはローカル設定に保持し、コアスキーマに混ぜない。

```
        ┌── ツリー   ┐
ProjectGraph(正規化) ─┼── DAG      ┼─ 各ビューは読み取り射影（アダプタ）
 (tasks/deps/rank)   ├── リスト    │   ← 将来: ガント/カレンダー/カンバンを同様に追加
        │            └── CP       ┘
```

---

## 6. ローカル開発 → 本番

### 6.1 ローカル（初期）

```bash
npx supabase init          # supabase/ 生成
npx supabase start         # ローカル Supabase 起動 (Docker)
# → API URL / anon key が発行される。フロント & plan スキルはこれを使う
```

- マイグレーションは `supabase/migrations/*.sql` に記述しバージョン管理。

### 6.2 本番（将来）

```bash
npx supabase link --project-ref <cloud-ref>
npx supabase db push       # 同一マイグレーションをクラウドへ
```

- フロントの環境変数（API URL / key）を切り替えるだけで「どこからでも編集」を実現。

### 6.3 リポジトリ構成（予定）

```
task-branch/
├─ DESIGN.md
├─ supabase/
│  ├─ config.toml
│  └─ migrations/          # スキーマ・RPC 関数
├─ web/                    # React + Vite フロント
│  ├─ src/
│  └─ package.json
└─ .claude/
   └─ skills/plan/         # plan スキル定義（後続）
```

---

## 7. セキュリティ（個人用の割り切り）

- 初期（ローカル）: anon key で全操作。RLS はローカルでは緩め。
- 本番（クラウド）: anon key を秘匿し RLS を有効化。個人用のため「authenticated 全許可」から開始し、必要に応じ強化。
- `plan` スキルが使うキーは環境変数管理し、リポジトリにコミットしない。

---

## 8. 拡張性設計（将来ビュー: ガント / カレンダー / カンバン）

将来ビューを **コアモデルへの読み取り射影** として追加する前提で、必要データと追加箇所を先取りしておく。
いずれも既存機能を壊さず、追加は「nullable カラムの利用」か「新ビューのアダプタ追加」で完結する。

### 8.1 各ビューが必要とするもの

| ビュー | 必要データ | 本設計での準備状況 |
|---|---|---|
| **ガントチャート** | 開始/終了日 または 開始日+期間、依存関係 | `start_date` / `due_date` を用意済（nullable）。依存は `task_dependencies`。期間は将来 `estimate` |
| **カレンダー** | 日付（期限 / 予定日） | `start_date` / `due_date` を用意済 |
| **カンバン** | 列（status）とカード、列内の並び順 | `status`（既存）＋ `sort_order`（列内順）。列 = status 値 |

### 8.2 拡張ポイントと方針

- **日付**: `start_date` / `due_date` は初期未使用。ガント/カレンダー導入時に `plan` スキル・UI が埋める。
  依存から自動スケジューリング（先行の due の翌日を後続の start に）する RPC を後付け可能。
- **見積り/期間**: 導入時に `estimate_value numeric` + `estimate_unit text`（`day`/`week`/`point`）を追加。
  クリティカルパスをホップ数から**重み付き最長経路**へ差し替える（RPC 内部のみ変更、IF 不変）。
- **カンバン列（status）の可変化**: 初期は enum 固定。将来カスタム列が要るなら
  `workflow_states(project_id, key, label, sort_order, color)` テーブルを追加し、`status` をそこへ FK 化。
  移行は既存4値を初期データとして投入するだけで済む。
- **ビュー固有設定**: 期間レンジ・表示 level・フィルタ等は `metadata` JSONB かローカル設定に保持し、
  コアスキーマを汚さない。
- **任意属性**: 色・タグ・外部チケットID などは `metadata` に持たせ、確定したら正式カラムへ昇格。

### 8.3 破壊的変更を避ける原則

1. コアモデル（tasks / dependencies）は最小・正規化を維持。ビューはそこへの射影に限定する。
2. 追加は「nullable カラム」か「新テーブル」で行い、既存の読み書きを変えない。
3. 計算ロジックは RPC に閉じ込め、シグネチャを保ったまま内部を差し替える（例: CP の重み付け）。
4. UI はビューをアダプタとして疎結合に追加（§5.4）。

---

## 9. 未決事項 / 要確認

| # | 項目 | メモ |
|---|---|---|
| Q1 | level の呼称 | `epic` / `story` / `task` で確定（表示名は日本語可） |
| Q2 | 依存を epic にも張るか | 現状 story レベルのみ。将来 epic 順序が欲しくなったら拡張 |
| Q3 | 見積りの再導入 | 初期はホップ数 CP。時間見積りが要るなら `estimate` 追加で重み付き CP へ |
| Q4 | 階層の段数固定 | 3段（epic/story/task）固定でよいか。可変ネストにするか |
| Q5 | フロントのデプロイ先 | Vercel / Cloudflare Pages（未定） |

---

## 10. 次のステップ

1. 本 DD のレビュー・確定（特に §9）。
2. `supabase init` + スキーマ/RPC のマイグレーション作成。
3. React + Vite + React Flow の UI 雛形（初期4ビュー + §5.4 のビュー層）。
4. `plan` スキルの定義（Supabase REST/RPC を叩く手順）。
