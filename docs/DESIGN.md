# task-branch 設計書 (DD)

AI がプランニングしたタスクを **粒度の異なる3階層のツリー** で管理し、タスクの **依存関係を DAG（ブランチ図）** として可視化するタスク管理アプリ。

- ステータス: Draft v0.3
- 作成日: 2026-09-15
- 対象: 個人利用（メンバーアサインなし）

## 目次

- [1. 目的とスコープ](#1-目的とスコープ)
  - [1.1 背景・狙い](#11-背景狙い)
  - [1.2 中核となる2つの関係（重要）](#12-中核となる2つの関係重要)
  - [1.3 3つの粒度（level）](#13-3つの粒度level)
  - [1.4 満たすべき要件](#14-満たすべき要件)
  - [1.5 スコープの段階（初期 / 将来）](#15-スコープの段階初期--将来)
- [2. アーキテクチャ](#2-アーキテクチャ)
  - [2.1 技術スタック（推奨）](#21-技術スタック推奨)
- [3. データモデル](#3-データモデル)
  - [3.1 ER 概要](#31-er-概要)
  - [3.2 テーブル定義](#32-テーブル定義)
  - [3.3 派生概念（計算で導出）](#33-派生概念計算で導出)
  - [3.4 進捗の集約（ロールアップ）](#34-進捗の集約ロールアップ)
  - [3.5 RLS ポリシー](#35-rls-ポリシー)
- [4. API 設計（AI / フロント共通）](#4-api-設計ai--フロント共通)
  - [4.1 CRUD（PostgREST 自動生成）](#41-crudpostgrest-自動生成)
  - [4.2 RPC 関数（ロジックを DB に集約）](#42-rpc-関数ロジックを-db-に集約)
  - [4.3 `planning` / `do` スキルの動作イメージ](#43-planning--do-スキルの動作イメージ)
- [5. 可視化 UI 設計](#5-可視化-ui-設計)
  - [5.1 画面構成](#51-画面構成)
  - [5.2 表現](#52-表現)
  - [5.3 レイアウト](#53-レイアウト)
  - [5.4 ビュー層のアーキテクチャ（拡張性の要）](#54-ビュー層のアーキテクチャ拡張性の要)
- [6. ローカル開発 → 本番](#6-ローカル開発--本番)
  - [6.1 ローカル（初期）](#61-ローカル初期)
  - [6.2 本番（将来）](#62-本番将来)
  - [6.3 リポジトリ構成（予定）](#63-リポジトリ構成予定)
- [7. セキュリティ（個人用の割り切り）](#7-セキュリティ個人用の割り切り)
  - [7.1 AI 専用アカウントとトークン](#71-ai-専用アカウントとトークン)
- [8. 拡張性設計（将来ビュー: ガント / カレンダー / カンバン）](#8-拡張性設計将来ビュー-ガント--カレンダー--カンバン)
  - [8.1 各ビューが必要とするもの](#81-各ビューが必要とするもの)
  - [8.2 拡張ポイントと方針](#82-拡張ポイントと方針)
  - [8.3 破壊的変更を避ける原則](#83-破壊的変更を避ける原則)
- [9. 未決事項 / 要確認](#9-未決事項--要確認)
- [10. 次のステップ](#10-次のステップ)

---

## 1. 目的とスコープ

### 1.1 背景・狙い

AI（Claude Code の `planning` スキル）が今後のタスクを洗い出し・優先順位付けし、その結果を構造化データとして蓄積・可視化する。実装と進捗の更新は `do` スキルが行う。どちらのスキルもリポジトリの外（`~/.claude/skills/`）に置き、今は task-branch の画面を操作して読み書きする（§4.3）。人間はブラウザで進捗・階層構造・依存関係（枝分かれ）・クリティカルパスを確認する。

### 1.2 中核となる2つの関係（重要）

本アプリのデータは **直交する2種類の関係** を同時に持つ。

| 関係             | 形     | 何を表すか                         | 例                                                                               |
| ---------------- | ------ | ---------------------------------- | -------------------------------------------------------------------------------- |
| **階層（分解）** | ツリー | 粒度の粗いオブジェクトを細かく分解 | 「決済基盤刷新(epic/数ヶ月)」→「認証移行(story/1週)」→「テストケース作成(task)」 |
| **依存（順序）** | DAG    | 「Aが終わってからB」という実行順序 | 「OAuth クライアント作成」→「Supabase 設定」→「ログイン画面作成」                |

- 階層は **`parent_id` によるツリー**。
- 依存のデータの持ち方（テーブル・検証・RPC）は未設計。クリティカルパス・並列レーン・着手可能の判定を実装するときに設計する。

### 1.3 3つの粒度（level）

原則 `epic > story > task` の順にネストする（3段）。

| 観点                       | エピック（`epic`）                                                                                                 | ストーリー（`story`）                                                                                                                         | タスク（`task`）                                                                                              |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| 粒度                       | 1つのコンテキスト                                                                                                  | 1〜2週間（1スプリント）                                                                                                                       | 数時間                                                                                                        |
| 役割                       | 課題・問題点・改善点などの**コンテキスト（要件）**を持ち、ストーリー・タスクを洗い出す元になる                     | エピックの実現に必要なことを洗い出したもの。1スプリントで完了させる                                                                           | ストーリーをさらに細分化した作業                                                                              |
| 作り方                     | 人が作るか、AI と壁打ちしながら作る。壁打ちの結論はドキュメント（`context`）に書く                                 | エピックを active にしてから洗い出す（AI と壁打ちしてもよい）。バックログのエピックの下には、アイデアのメモとして**ラフなストーリー**を置ける | ストーリーから洗い出す                                                                                        |
| 状態                       | **バックログ（inactive）/ 進行中（active）/ 完了**。完了は配下の進捗率 100% で**自動**（手で閉じる操作は持たない） | `todo` / `in_progress` / `done` / `closed` を手で動かす                                                                                       | `todo` / `in_progress` / `done` / `closed` を手で動かす                                                       |
| 管理のしかた               | 作成後はあまり手を入れない。status ではなく、配下のストーリーから算出した**進捗率**で見る                          | スプリントごとの振り返り、日々の進捗確認                                                                                                      | 日々の進捗確認                                                                                                |
| 情報の持ち方               | **短い説明**（`description`）＋ **ドキュメント**（`context`、Markdown。正の情報）。ドキュメントは更新履歴を持つ    | 短い説明（`description`）                                                                                                                     | 短い説明（`description`）＋ コメント                                                                          |
| 依存関係・クリティカルパス | 持たない                                                                                                           | 持たない（ストーリー間の順序は §9 Q2）                                                                                                        | 前提タスク → 後続タスク。張れるのは**同じストーリー内のタスク間**だけ。クリティカルパスはストーリー内で求める |
| 担当                       | 持たない                                                                                                           | 持たない                                                                                                                                      | 人か AI か。人の場合は誰か                                                                                    |
| 見える場所                 | バックログ：バックログの一覧だけ／進行中：ガントチャート・カンバン・マップ／完了：完了として表示                   | 親のエピックが進行中のときに、実行中のビューに出る（ラフなストーリーはバックログの一覧だけ）                                                  | 親のストーリーと同じ                                                                                          |

**補足：エピックの状態の移り変わり**

エピックとバックログは同じ構造（名前・コンテキスト・状態）で、状態だけが違う。

```
バックログ ──着手する（active にする）──▶ 進行中 ──配下の進捗率 100%（自動）──▶ 完了
    ▲                                        │
    └──────────棚上げする（inactive に戻す）──┘
```

| 状態                   | 決め方                                |
| ---------------------- | ------------------------------------- |
| バックログ（inactive） | `activated_at` が空                   |
| 進行中（active）       | `activated_at` あり、進捗率 100% 未満 |
| 完了                   | `activated_at` あり、進捗率 100%      |

- 着手してからストーリー・タスクへ分解する。細分化を着手の直前まで遅らせることで、計画が古くなるのを防ぐ。

### 1.4 満たすべき要件

| #   | 要件                                    | 対応方針                                                                                                     |
| --- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| R1  | AI がプランニングしたタスクを管理       | `planning` スキルが画面を操作して登録（将来は MCP サーバー経由で REST/RPC）                                  |
| R2  | 並列度を上げたい                        | 依存のない `task` を並列レーンに。着手可能かどうか（前提タスクがすべて `done` か `closed` か）は依存から導出 |
| R3  | 終わった / これから進めるタスクを見れる | status フィルタ・ビュー                                                                                      |
| R4  | マインドマップ / Git ブランチ状に可視化 | 階層ツリー + タスクの依存DAG（ブランチ図）                                                                   |
| R5  | 依存は直列、非依存は並列で配置          | トポロジカル順で rank 配置。前後関係は横、同 rank（並列）は縦に並べる                                        |
| R6  | クリティカルパスがわかる                | タスクの依存チェーンの **最長経路（ホップ数, 重み1）** を強調                                                |
| R7  | プロジェクト単位で管理                  | `projects` でスコープ分離                                                                                    |
| R8  | 誰がやるかを管理                        | タスクに担当（人 / AI、人の場合は誰か）を持たせる                                                            |
| R9  | 安価・最速                              | Supabase（無料枠）+ 自動生成 API。専用バックエンドを作らない                                                 |
| R10 | どこからでも編集可能                    | Supabase Cloud にホスト（初期はローカル Supabase で開発）                                                    |

### 1.5 スコープの段階（初期 / 将来）

**初期（Phase 1）で作るビュー**: 階層ツリー / ブランチ図(DAG) / リスト / クリティカルパス。

**将来ビュー（設計上あらかじめ拡張可能にしておく）**: ガントチャート / カレンダー / カンバン（§10 参照）。
これらは **コアモデルへの読み取りビュー（射影）として追加**でき、スキーマの破壊的変更を伴わない。

**当面の非スコープ**:

- 見積り時間 / 工数（`estimate` は将来拡張。初期は持たない → CP はホップ数で算出）
- 権限・コラボ機能の詳細（担当として人を割り当てることは行う。ユーザー登録・共有の範囲は §9）
- 外部カレンダー（Google Calendar 等）双方向同期

---

## 2. アーキテクチャ

```
┌─────────────────────────────┐
│  Claude Code                 │  planning スキル: 計画を登録 / do スキル: 実装・進捗の更新
│  planning / do スキル         │
└───────────────┬─────────────┘
                │ Playwright MCP で画面を操作（将来は MCP サーバー経由で REST / RPC）
                ▼
┌─────────────────────────────┐
│  Web UI (React + Vite)       │  階層ツリー・ブランチ図・CP・進捗
│  └─ React Flow + dagre       │
└───────────────┬─────────────┘
                │ supabase-js
                ▼
┌─────────────────────────────┐
│  Supabase                    │
│  ├─ PostgREST (自動REST API) │  ← CRUD の主経路
│  ├─ RPC 関数 (Postgres)      │  ← グラフ取得 / 進捗集約 / エクスポート
│  ├─ Postgres (データ本体)     │
│  └─ Auth (APIキー / 将来JWT)  │
└─────────────────────────────┘
```

- **バックエンドは自作しない**。Supabase が REST API・認証・ホスティングを提供。
- 複雑なロジック（循環検出・クリティカルパス・進捗集約）は **Postgres 関数（RPC）** に集約し、AI・フロント双方から同じ関数を呼ぶ。
- ローカル開発は `supabase start`（Docker）。本番は同一マイグレーションを Supabase Cloud に `db push`。

### 2.1 技術スタック（推奨）

| 層               | 技術                                        | 理由                                         |
| ---------------- | ------------------------------------------- | -------------------------------------------- |
| DB / API / 認証  | Supabase (Postgres 15 + PostgREST + GoTrue) | 無料枠、自動 REST、ローカル↔クラウド同一構成 |
| マイグレーション | Supabase CLI (`supabase/migrations`)        | 再現可能なスキーマ管理                       |
| フロント         | React 18 + TypeScript + Vite                | 軽量・高速・無料デプロイ可                   |
| グラフ描画       | React Flow + dagre                          | 階層ツリー / DAG / CP 強調に最適             |
| Supabase 接続    | `@supabase/supabase-js`                     | 標準クライアント                             |
| デプロイ(将来)   | Vercel / Cloudflare Pages + Supabase Cloud  | 無料枠                                       |

---

## 3. データモデル

### 3.1 ER 概要

```
所有者（ユーザー） 1 ──< projects
projects 1 ──< tasks(自己参照ツリー parent_id)
                 ├──< epic_context_revisions (epic のドキュメントの更新履歴)
                 ├──< task_comments (task へのコメント。本文は編集できる)
                 └──> 担当者（人の場合。ユーザー）
```

- `tasks` 1テーブルで3階層すべてを表現し、`level` と `parent_id` で区別する。

### 3.2 テーブル定義

#### projects

| カラム      | 型          | 制約                                                   | 説明                                                                              |
| ----------- | ----------- | ------------------------------------------------------ | --------------------------------------------------------------------------------- |
| id          | uuid        | PK, default gen_random_uuid()                          |                                                                                   |
| name        | text        | not null                                               | プロジェクト名                                                                    |
| description | text        |                                                        | 概要                                                                              |
| owner_id    | uuid        | FK→auth.users.id, not null, default current_owner_id() | 所有者（人のユーザー）。AI が作っても持ち主の人になる。付け替えはできない（§3.5） |
| created_at  | timestamptz | default now()                                          |                                                                                   |
| updated_at  | timestamptz | default now()                                          |                                                                                   |

- インデックス：(owner_id)。
- 所有者の列を持つのは projects だけ。tasks・task_comments・epic_context_revisions は、属するプロジェクトの所有者をたどって判定する（§3.5）。

#### tasks

| カラム        | 型          | 制約                          | 説明                                                                                                                                                                                                                                                                                                                 |
| ------------- | ----------- | ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| id            | uuid        | PK, default gen_random_uuid() |                                                                                                                                                                                                                                                                                                                      |
| project_id    | uuid        | FK→projects.id, not null      |                                                                                                                                                                                                                                                                                                                      |
| parent_id     | uuid        | FK→tasks.id, null可           | 親（階層）。null はルート(epic想定)                                                                                                                                                                                                                                                                                  |
| level         | text        | not null                      | `epic` / `story` / `task`                                                                                                                                                                                                                                                                                            |
| title         | text        | not null                      | 名称                                                                                                                                                                                                                                                                                                                 |
| description   | text        |                               | 短い説明（一覧やカードに出す 1〜2 行）                                                                                                                                                                                                                                                                               |
| context       | text        | null可                        | **epic のみ**。ドキュメント（Markdown）。壁打ちの結論をまとめた**正の情報**。見出しの型：背景・課題／ゴール／スコープと非スコープ／方針／決定事項／未決事項。保存のたびにその版を `epic_context_revisions` に残す（最新版も含む）                                                                                    |
| status        | text        | not null, default 'todo'      | `todo` / `in_progress` / `done` / `closed`（作業の進み具合）。`done` は終わったが未承認（カンバンに残し、デイリースクラムで報告する）、`closed` は承認を得て管理から外したもの（カンバンの列には出さず、トグルでのみ表示）。進捗では `done` と `closed` をどちらも完了として数える。エピックは手で動かさない（§1.3） |
| activated_at  | timestamptz | null可                        | **epic のみ**。null ＝ inactive（バックログ）、日時あり ＝ active（エピック）。着手した日時を兼ねる。進み具合の `status` とは別の軸なので列を分ける。完了は列で持たず、active かつ配下の進捗率 100% から導出する                                                                                                     |
| assignee_type | text        | null可                        | **task のみ**。`human`（人）/ `ai`（AI）。既定値は §9                                                                                                                                                                                                                                                                |
| assignee_id   | uuid        | null可                        | **task のみ**。人が担当する場合の担当者（ユーザー）                                                                                                                                                                                                                                                                  |
| sort_order    | int         | not null, default 0           | 同階層内 / カンバン列内の表示順                                                                                                                                                                                                                                                                                      |
| start_date    | date        | null可                        | 開始予定日（**ガント/カレンダー用**。初期は未使用）                                                                                                                                                                                                                                                                  |
| due_date      | date        | null可                        | 期限日（**ガント/カレンダー用**。初期は未使用）                                                                                                                                                                                                                                                                      |
| metadata      | jsonb       | not null, default '{}'        | 将来拡張用の自由属性（色・タグ・外部ID等）。スキーマ変更なしで拡張                                                                                                                                                                                                                                                   |
| created_at    | timestamptz | default now()                 |                                                                                                                                                                                                                                                                                                                      |
| updated_at    | timestamptz | default now()                 |                                                                                                                                                                                                                                                                                                                      |
| completed_at  | timestamptz |                               | done 遷移時刻。`done` / `closed` の間は保持する                                                                                                                                                                                                                                                                      |
| closed_at     | timestamptz |                               | closed 遷移時刻（承認した日時）。`closed` 以外では null                                                                                                                                                                                                                                                              |

制約・ルール:

- `level` は CHECK で3値に固定。
- 階層整合性（`epic > story > task` 以外の親子を禁止）は **トリガ or RPC** で担保。
- `task` は葉。子を持たない。
- 親の進捗は子から集約（§3.4）。
- **拡張フィールド（`start_date` / `due_date` / `metadata`）は nullable で初期は未使用**。ガント/カレンダー等のビュー追加時にそのまま利用でき、既存機能に影響しない。
- 見積り（`estimate`）は未導入。導入時は `estimate_value numeric` + `estimate_unit text` を追加する想定（§10）。
- `context` は長文になるため、一覧系の取得（カンバン・ガントチャート・`get_task_graph` など）では読み込まない。詳細・バックログの画面と、AI にエピックの文脈を渡すときだけ取得する。

#### task_comments

タスクへのコメント。作業メモ・確認したこと・やりとりを残す。

| カラム      | 型          | 制約                                      | 説明                       |
| ----------- | ----------- | ----------------------------------------- | -------------------------- |
| id          | uuid        | PK, default gen_random_uuid()             |                            |
| task_id     | uuid        | FK→tasks.id, not null, on delete cascade  | 対象のタスク（level=task） |
| author_type | text        | not null, default current_actor_type()    | `human` / `ai`             |
| author_id   | uuid        | null可, default current_actor_id()        | 投稿者（ユーザー）         |
| body        | text        | not null, check (length(btrim(body)) > 0) | 本文（プレーンテキスト）   |
| created_at  | timestamptz | not null, default now()                   |                            |
| updated_at  | timestamptz | not null, default now()                   |                            |

- インデックス：(task_id, created_at)。
- 対象は `level = 'task'` のみ。ストーリー・エピックには付けられない（トリガ `check_task_comment()` で弾く）。
- 編集・削除できるのは、書いた本人だけ（§3.5）。人と AI は別の投稿者として扱い、人も AI のコメントは編集・削除できない。変えられるのは本文だけで、`task_id` / `author_type` / `author_id` / `created_at` は変えさせない。更新時に `updated_at` を now() にする。
- 削除は物理削除。編集履歴は持たない。
- 本文はプレーンテキスト（Markdown は解釈しない）。
- RLS は §3.5。

#### epic_context_revisions

エピックのドキュメント（`context`）の更新履歴。差分の確認と巻き戻しに使う。

| カラム         | 型          | 制約                          | 説明                            |
| -------------- | ----------- | ----------------------------- | ------------------------------- |
| id             | uuid        | PK, default gen_random_uuid() |                                 |
| epic_id        | uuid        | FK→tasks.id, not null         | 対象のエピック                  |
| version        | int         | not null                      | 版番号（エピックごとに 1 から） |
| context        | text        | not null                      | その版の本文                    |
| edited_by_type | text        | not null                      | `human` / `ai`                  |
| edited_by_id   | uuid        | null可                        | 人の場合の更新者                |
| created_at     | timestamptz | default now()                 |                                 |

- UNIQUE(epic_id, version)。
- `tasks.context` を保存するたびに、トリガでその版を保存する（最新版も含む。人・AI どちらの更新でも漏れなく残す）。
- 人か AI かは、リクエストの JWT の `app_metadata.actor_type`（`ai` なら AI）で判定する（`current_actor_type()`）。認証が無い場合や psql からの更新は人として扱う。コメントの `author_type` / `author_id` も同じ関数を既定値にする。

### 3.3 派生概念（計算で導出）

いずれも依存から導出する。依存のデータの持ち方は未設計で、実装時に設計する（§1.2）。

- **rank（列／並列レーン）**: ストーリー内で前提タスクのない task を rank 0 とし、`rank(t)=max(rank(前提))+1`。同 rank のタスクは並列に進められる（R5）。
- **クリティカルパス**: ストーリー内のタスク依存 DAG の **最長経路（各 task の重み=1、ホップ数）**（R6）。将来 `estimate` 追加時は重み付き最長経路へ拡張。
- **着手可能**: 前提タスクがすべて `done` か `closed` の task。status としては持たず、依存から導出する（R2）。

### 3.4 進捗の集約（ロールアップ）

- `task` の完了数 / 総数 → 親 `story` の進捗率。完了数は `done` と `closed` の合計（クローズしても進捗が下がらないように）。
- task が1件もない `story` は、自身の status が `done` か `closed` なら 1、それ以外は 0。
- `story` の進捗率の平均 → 親 `epic` の進捗率。**エピックはこの進捗率で管理し、status を手で動かす運用はしない**（§1.3）。
- 集約は RPC / ビューで計算し、UI に返す。ストーリー・タスクの手動 status 変更は許容。

### 3.5 RLS ポリシー

本人と本人の AI だけがデータに触れるようにする。人か AI か・誰のデータかは、リクエストの JWT から判定する。

#### JWT 形式

`app_metadata` は Supabase Auth が JWT に自動で入れる項目（実体は `auth.users.raw_app_meta_data`）。`provider` / `providers` は Supabase が入れ、`actor_type` / `owner_id` は AI 専用アカウントの作成時に service_role で入れる（§7.1）。人のアカウントには何も足さない。
本人が書き換えられる `user_metadata` は権限の判定に使わない。

人（Google でログイン。uid = `aaaa`）:

```json
{
  "sub": "aaaa",
  "role": "authenticated",
  "app_metadata": { "provider": "google", "providers": ["google"] }
}
```

AI（AI 専用アカウント。uid = `cccc`、持ち主 = `aaaa`）:

```json
{
  "sub": "cccc",
  "role": "authenticated",
  "app_metadata": {
    "provider": "email",
    "providers": ["email"],
    "actor_type": "ai",
    "owner_id": "aaaa"
  }
}
```

- AI の例は AI 専用アカウントを作る前提。MCP の認証を OAuth 2.1 にし、人のアカウントで同意する形にする場合は、`sub` が人になり、AI はトークンの `client_id` で見分ける。そのときはストーリー「MCP 向け OAuth 認可の構築」でこの節を書き直す。

#### 関数

PostgREST は、リクエストの JWT の中身を `request.jwt.claims` にセットしてから SQL を実行する。下の関数とポリシーはこれを読む。

列の既定値とポリシーから呼ぶ。どれも JWT を読むだけで、表は読まない。アプリからは呼ばない。

| 関数                   | 返すもの                                                                                                          | 使う場所                                                                      |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `current_actor_type()` | `ai`（JWT の `app_metadata.actor_type` が `ai`）／ それ以外は `human`                                             | `task_comments.author_type`・`epic_context_revisions.edited_by_type` の既定値 |
| `current_actor_id()`   | JWT の `sub`（`auth.uid()` と同じ）。JWT が無ければ null                                                          | `task_comments.author_id`・`epic_context_revisions.edited_by_id` の既定値     |
| `current_owner_id()`   | 実効の所有者。JWT の `app_metadata.owner_id` があればそれ、無ければ `auth.uid()`。人は本人、AI は持ち主の人になる | `projects.owner_id` の既定値、ポリシー                                        |

```sql
create or replace function current_owner_id() returns uuid as $$
  select coalesce(
    (auth.jwt() -> 'app_metadata' ->> 'owner_id')::uuid,  -- AI なら持ち主の id
    auth.uid()                                              -- 人なら自分の id
  );
$$ language sql stable;
```

上の JWT での結果:

| 関数                   | 人                                           | AI                   | JWT なし（psql・シード） |
| ---------------------- | -------------------------------------------- | -------------------- | ------------------------ |
| `current_actor_type()` | `human`                                      | `ai`                 | `human`                  |
| `current_actor_id()`   | `aaaa`                                       | `cccc`               | null                     |
| `auth.uid()`           | `aaaa`                                       | `cccc`               | null                     |
| `current_owner_id()`   | `aaaa`（`owner_id` が無いので `auth.uid()`） | `aaaa`（`owner_id`） | null                     |

- 所有者の決め方は `current_owner_id()` 1か所にまとめる。ポリシーには同じ式を書かない。
- `current_owner_id()` は人と AI で同じ値になる。所有者の判定に使う。
- `auth.uid()` / `current_actor_id()` は人と AI で別の値になる。投稿者の記録と「書いた本人」の判定に使う。
- `app_metadata` は service_role でしか書けないため、AI が `owner_id` を書き換えて他人のデータに入ることはできない（§7.1）。
- どれも security invoker（既定）。security definer にはしない。
- JWT なしは postgres ロールでの接続で、RLS を受けない。`projects.owner_id` の既定値が null になるため、psql やシードでプロジェクトを作るときは `owner_id` を明示する。

#### RLS ポリシー

全テーブルで RLS を有効にする。ポリシーはすべて `to authenticated` に対して作り、`anon` 向けは作らない（未ログインでは何もできない）。
ポリシーを作らない操作は RLS で拒否される。画面に機能が無くても API（PostgREST）から直接呼べるため、させない操作はポリシーを作らないことで止める。

| テーブル               | insert                                          | select | update                              | delete     |
| ---------------------- | ----------------------------------------------- | ------ | ----------------------------------- | ---------- |
| projects               | ログイン済みなら誰でも。`owner_id` は自分に固定 | 所有者 | 所有者。`owner_id` の付け替えは不可 | 所有者     |
| tasks                  | 所有者                                          | 所有者 | 所有者                              | 所有者     |
| epic_context_revisions | 所有者                                          | 所有者 | 不可                                | 不可       |
| task_comments          | 所有者                                          | 所有者 | 書いた本人                          | 書いた本人 |

- 「所有者」は、行が属するプロジェクトの `owner_id = current_owner_id()`。人なら本人、AI なら持ち主の人のプロジェクトが対象になる（本人と本人の AI が同じ範囲を触れる）。
- 「書いた本人」は `author_id = auth.uid()`。人と AI は別の投稿者として扱う。
- 「不可」はポリシーを作らない。

ポリシー定義:

##### projects

所有者だけが読み書きできる。どの操作も条件が同じなので `for all` の1本にする。`with check` にも同じ条件を書き、他人名義での作成と所有者の付け替えを弾く。

```sql
alter table projects enable row level security;

create policy projects_owner on projects
  for all to authenticated
  using      (owner_id = current_owner_id())
  with check (owner_id = current_owner_id());
```

##### tasks

属するプロジェクトの所有者だけが読み書きできる。`with check` にも書き、他人のプロジェクトへの作成・移動を弾く。

```sql
alter table tasks enable row level security;

create policy tasks_owner on tasks
  for all to authenticated
  using (exists (
    select 1 from projects p
     where p.id = tasks.project_id
       and p.owner_id = current_owner_id()
  ))
  with check (exists (
    select 1 from projects p
     where p.id = tasks.project_id
       and p.owner_id = current_owner_id()
  ));
```

##### epic_context_revisions

エピック → プロジェクトをたどって所有者だけが読み、足せる。足すときは更新者が自分であることも確かめる（トリガが入れる値と一致する）。update / delete はポリシーを作らない。

```sql
alter table epic_context_revisions enable row level security;

create policy epic_context_revisions_select on epic_context_revisions
  for select to authenticated
  using (exists (
    select 1 from tasks t
      join projects p on p.id = t.project_id
     where t.id = epic_context_revisions.epic_id
       and p.owner_id = current_owner_id()
  ));

create policy epic_context_revisions_insert on epic_context_revisions
  for insert to authenticated
  with check (
    edited_by_id = auth.uid()
    and edited_by_type = current_actor_type()
    and exists (
      select 1 from tasks t
        join projects p on p.id = t.project_id
       where t.id = epic_context_revisions.epic_id
         and p.owner_id = current_owner_id()
    )
  );
```

##### task_comments

タスク → プロジェクトをたどって所有者だけが読み、投稿できる。投稿は投稿者が自分であることも確かめ、なりすましを弾く。編集・削除は書いた本人だけ。

```sql
alter table task_comments enable row level security;

create policy task_comments_select on task_comments
  for select to authenticated
  using (exists (
    select 1 from tasks t
      join projects p on p.id = t.project_id
     where t.id = task_comments.task_id
       and p.owner_id = current_owner_id()
  ));

create policy task_comments_insert on task_comments
  for insert to authenticated
  with check (
    author_id = auth.uid()
    and author_type = current_actor_type()
    and exists (
      select 1 from tasks t
        join projects p on p.id = t.project_id
       where t.id = task_comments.task_id
         and p.owner_id = current_owner_id()
    )
  );

create policy task_comments_update on task_comments
  for update to authenticated
  using      (author_id = auth.uid())
  with check (author_id = auth.uid());

create policy task_comments_delete on task_comments
  for delete to authenticated
  using (author_id = auth.uid());
```

- `epic_context_revisions` の insert は、エピックの保存時にトリガ（`save_epic_context_revision()`）が利用者の権限で行う。そのため insert のポリシーが要る。
- RPC（`get_progress` / `get_task_graph` / `export_project`）とトリガは security invoker のままにし、RLS の下で動かす。ビューを作るときは `security_invoker = true` にする。
- `parent_id` に他人のタスクを指定することは、トリガ `check_task_hierarchy()` が「親は同じプロジェクト」を確かめるため起きない。
- 既存の projects の `owner_id` はマイグレーションでは埋めず、本番で手動の update で埋める（利用者の uid をリポジトリに残さないため）。埋めたあと、`0013_projects_owner_not_null.sql` で `not null` を付けた。

---

## 4. API 設計（AI / フロント共通）

### 4.1 CRUD（PostgREST 自動生成）

| 操作                            | メソッド / エンドポイント                                |
| ------------------------------- | -------------------------------------------------------- |
| プロジェクト作成                | `POST /rest/v1/projects`                                 |
| オブジェクト作成（全level共通） | `POST /rest/v1/tasks`（level と parent_id を指定）       |
| ツリー取得                      | `GET /rest/v1/tasks?project_id=eq.<id>&order=sort_order` |
| 状態更新                        | `PATCH /rest/v1/tasks?id=eq.<id>`                        |

ヘッダ: `apikey: <key>`, `Authorization: Bearer <key>`。

### 4.2 RPC 関数（ロジックを DB に集約）

| 関数                            | 用途     | 概要                                                                                                             |
| ------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------- |
| `get_task_graph(project uuid)`  | 可視化用 | tasks（階層・担当・進捗込）を `{nodes}` で返す。依存（edges）と rank は依存の設計時に足す（R4/R5）               |
| `get_critical_path(story uuid)` | CP 抽出  | ストーリー内のタスク依存 DAG の最長経路（ホップ数）のタスク列を返す（R6）                                        |
| `get_progress(project uuid)`    | 進捗集約 | epic/story の進捗率（0〜1）を `table(id, level, progress)` で返す。`done` と `closed` を完了として数える（§3.4） |

- 循環検出・最長経路・集約は Postgres の再帰 CTE（`WITH RECURSIVE`）で実装。
- AI・UI が同じ RPC を使い、計算結果を一致させる。

### 4.3 `planning` / `do` スキルの動作イメージ

スキルはリポジトリの外（`~/.claude/skills/planning`、`~/.claude/skills/do`）に置く。今は API を直接呼ばず、Playwright MCP で task-branch の画面（<https://task-branch.vercel.app>）を操作して読み書きする。将来は MCP サーバー経由で REST / RPC を呼ぶ形に切り替える。

**`planning` スキル（計画の登録）**

1. 作りたいものを壁打ちし、目的・スコープ・技術スタックを決める。
2. プロジェクトを作成（`/projects`）or 選択。既存なら、バックログ・ガント・カンバンで現状を把握してから足す。
3. エピックを登録し（`/backlog`）、決めた内容をエピックのコンテキストに書く。
4. エピック詳細からストーリーを登録する（開始日・期限つき）。
5. カンバン（`/kanban`）の進行中ストーリーの行からタスクを登録する。

**`do` スキル（実装と進捗の更新）**

1. カンバンでタスクを選び、`in_progress` にして着手する。
2. 決まった仕様はタスクの詳細に、進捗・課題・PR のリンクはタスクのコメントに残す。
3. PR を作ったらタスクを `done` にする（親ストーリーの進捗が上がる）。承認を得たら `closed` にする（進捗は下がらない）。

- タスク間の依存は未設計のため、今はどちらのスキルも登録しない。

---

## 5. 可視化 UI 設計

### 5.1 画面構成

- **プロジェクト選択** → **ボード**（メイン）
- **バックログ**: inactive のエピックの一覧。並び順（`sort_order`）＝優先順位。ここから active にして着手する。
- ガントチャート・カンバン・マップ（ブランチ図）などの実行中のビューは、**active のエピック配下だけ**を表示する。inactive のエピックの下のラフなストーリーは、バックログの一覧でだけ見える。
- 進捗率 100% のエピックは、完了として表示する（自動）。
- ビュー切替:
  - **階層ツリー（マインドマップ）**: epic → story → task を展開。React Flow で放射状/ツリー。
  - **ブランチ図（DAG）**: ストーリー配下のタスクを、依存で結んだ Git ブランチ状に表示。rank を軸に**前後関係は横（左→右）、並列（同 rank）は縦**（R4/R5）。担当（人 / AI）はアイコンで表す。
  - **リスト**: status 別（closed / done / in_progress / todo）。これから進める・終わったを一覧（R3）。
  - **クリティカルパス**: ストーリー内の CP 上の task を太線・強調色でハイライト、直列連鎖長を表示（R6）。

### 5.2 表現

- **色**: status（todo=水色 / in_progress=青 / done=緑 / closed=グレー）。
- **level で形状/サイズ**: epic=大, story=中, task=小（チェックボックス）。
- **枠強調**: クリティカルパス上の task。
- **アイコン**: task の担当（人 / AI）。
- **バッジ**: 進捗率（親）、着手可能 / 前提待ち（依存から導出。表示方法は §9 Q10）。

### 5.3 レイアウト

- 階層ツリー: dagre のツリーレイアウト。
- DAG: rank で列を決める有向整列。前後関係＝横方向（左→右）、並列（同 rank）＝縦方向。分岐・合流は矢印で表す。

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
# → API URL / anon key が発行される。フロントはこれを使う
```

- マイグレーションは `supabase/migrations/*.sql` に記述しバージョン管理。

### 6.2 本番（将来）

本番は Supabase Cloud（DB・API）＋ Vercel（画面）。マイグレーションは GitHub Actions で適用する。

| ワークフロー              | 起動                             | やること                                                                                       |
| ------------------------- | -------------------------------- | ---------------------------------------------------------------------------------------------- |
| `release.yml`             | `main` への push（手動実行も可） | 本番に `supabase db push`。将来、画面のデプロイをこの後ろに足す                                |
| `pull-request.yml`        | `main` 向けの PR                 | `supabase db push --dry-run` で、マージ時に適用される migration を一覧にする（何も変更しない） |
| `supabase-migrations.yml` | 上の 2 つから呼ばれる部品        | `link` → `db push`（`dry_run` 入力で切り替え）                                                 |

- 必要な Secrets：`SUPABASE_ACCESS_TOKEN` / `SUPABASE_DB_PASSWORD` / `SUPABASE_PROJECT_ID`。GitHub の **Environment `prd`** に登録する（リポジトリ全体ではなく環境ごとに持たせ、あとから承認ルールやブランチ制限を付けられるようにする）。
- **`--include-seed` は使わない**：seed のサンプル SQL は「同名のプロジェクトを消してから入れ直す」ため、本番のデータが初期化される。
- **今は画面が先に更新されうる**：画面は Vercel の Git 連携で、migration と同時にデプロイされる。そのため migration は、今公開中の画面と両立する形にする（列・テーブルは先に足し、削除や名前の変更は後のリリースで行う）。
- **将来**：Vercel の自動の本番デプロイを止め、`release.yml` に `deploy` ジョブを `needs: migrate` で足して「migration → 画面のデプロイ」の順にする。

手動で適用する場合（CI が使えないとき）：

```bash
npx supabase link --project-ref <cloud-ref>
npx supabase db push       # 同一マイグレーションをクラウドへ（--include-seed は付けない）
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
   └─ launch.json          # 開発サーバーの起動設定（planning / do スキルはリポジトリ外）
```

---

## 7. セキュリティ（個人用の割り切り）

- ローカル: 本番と同じマイグレーションで同じ RLS が入る。psql（postgres ロール）からの操作は RLS を受けない。
- 本番（クラウド）: RLS を有効化し、本人と本人の AI だけがデータに触れるようにする（§3.5）。
- AI が使う認証情報は MCP サーバーの設定（リポジトリ外の env ファイル）にだけ置き、リポジトリにも AI の会話にも出さない（§7.1）。

### 7.1 AI 専用アカウントとトークン

AI は人と同じ Supabase Auth のユーザーとしてログインし、RLS の下で動く。

| 項目               | 決定                                                                                                                                                                              |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| アカウント         | Supabase Auth の Email プロバイダ（メール＋パスワード）で作る AI 専用ユーザー。Google アカウントは作らない                                                                        |
| 作り方             | 人が管理画面か管理用スクリプト（service_role）で作る。作成時にメール確認済みにし、メールは送らない。パスワードはランダムな長い文字列                                              |
| `app_metadata`     | `actor_type = "ai"`（`current_actor_type()` の判定に使う）と `owner_id = <持ち主の人のユーザー id>`。`app_metadata` は service_role でしか書けないため、AI 自身は書き換えられない |
| トークン           | MCP サーバーが起動時に `signInWithPassword` で JWT を取り、以後は自動更新する                                                                                                     |
| 認証情報の置き場所 | MCP サーバーの設定（リポジトリ外の env ファイル）だけ                                                                                                                             |
| 新規登録           | Email プロバイダは新規登録を無効にし、ログインだけ許す（本番・ローカルとも）                                                                                                      |
| 止め方             | パスワードの変更か、ユーザーの無効化                                                                                                                                              |

- RLS では「実効の所有者 = JWT の `app_metadata.owner_id` があればそれ、なければ `auth.uid()`」として扱う（`current_owner_id()`、§3.5）。これで本人と本人の AI だけがデータに触れる。
- service_role キーは MCP サーバーに持たせない（RLS を素通りするため）。
- 長期の JWT を自分で署名する方式と、独自の API トークン表は採らない。前者は個別に失効できず、後者は作るものが増えるため。

---

## 8. 拡張性設計（将来ビュー: ガント / カレンダー / カンバン）

将来ビューを **コアモデルへの読み取り射影** として追加する前提で、必要データと追加箇所を先取りしておく。
いずれも既存機能を壊さず、追加は「nullable カラムの利用」か「新ビューのアダプタ追加」で完結する。

### 8.1 各ビューが必要とするもの

| ビュー             | 必要データ                               | 本設計での準備状況                                                                                                  |
| ------------------ | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| **ガントチャート** | 開始/終了日 または 開始日+期間、依存関係 | `start_date` / `due_date` を用意済（nullable）。依存は未設計（§1.2）。期間は将来 `estimate`                         |
| **カレンダー**     | 日付（期限 / 予定日）                    | `start_date` / `due_date` を用意済                                                                                  |
| **カンバン**       | 列（status）とカード、列内の並び順       | `status`（既存）＋ `sort_order`（列内順）。列 = status 値（`todo` / `in_progress` / `done`。`closed` は列にしない） |

### 8.2 拡張ポイントと方針

- **日付**: `start_date` / `due_date` は初期未使用。ガント/カレンダー導入時に `planning` スキル・UI が埋める。
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

| #   | 項目                   | メモ                                                                                                                 |
| --- | ---------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Q1  | level の呼称           | `epic` / `story` / `task` で確定（表示名は日本語可）                                                                 |
| Q2  | ストーリー間の順序     | 依存は同じストーリー内のタスク間のみ。ストーリーをまたぐ順序（例: 認証 → RLS）を依存で表すか、期間の並びだけで表すか |
| Q3  | 見積りの再導入         | 初期はホップ数 CP。時間見積りが要るなら `estimate` 追加で重み付き CP へ                                              |
| Q4  | 階層の段数固定         | 3段（epic/story/task）固定でよいか。可変ネストにするか                                                               |
| Q5  | フロントのデプロイ先   | Vercel / Cloudflare Pages（未定）                                                                                    |
| Q6  | 担当の既定値           | 新規タスクの `assignee_type` を人 / AI のどちらにするか。AI が起票するときの判断基準                                 |
| Q7  | AI 担当の識別          | AI の場合もどのエージェント（Devin / Claude Code 等）かを持つか                                                      |
| Q8  | 人の作業待ちの知らせ方 | 次に着手できるのが人の担当タスクだけになったとき、どう知らせるか                                                     |
| Q9  | 担当者（人）の範囲     | 自分専用か、チームで共有するか。ユーザー登録・RLS の設計に影響                                                       |
| Q10 | 前提待ちの見せ方       | 前提が未完了の task に印（鍵アイコン等）を付けるか                                                                   |

---

## 10. 次のステップ

1. 本 DD のレビュー・確定（特に §9）。
2. `supabase init` + スキーマ/RPC のマイグレーション作成。
3. React + Vite + React Flow の UI 雛形（初期4ビュー + §5.4 のビュー層）。
4. `planning` / `do` スキルの定義（リポジトリ外。今は画面操作、将来は MCP サーバー経由で REST/RPC）。
