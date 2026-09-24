# task-branch

AI がプランニングしたタスクを **エピック → ストーリー → タスク** の3階層で管理し、
週単位タスクを **ガントチャート** で可視化する個人用タスク管理アプリ。

設計の詳細は [DESIGN.md](./DESIGN.md) を参照。

## 構成

```
task-branch/
├─ DESIGN.md                # 設計書 (DD)
├─ supabase/
│  ├─ config.toml           # ローカル Supabase 設定
│  ├─ migrations/           # スキーマ + RPC
│  │  ├─ 0001_schema.sql
│  │  └─ 0002_functions.sql
│  └─ seed.sql              # サンプルデータ
├─ web/                     # React + Vite フロント
└─ plan-skill/SKILL.md      # plan スキル定義（.claude/skills/plan/ へ配置）
```

## セットアップ

> ネットワーク（npm レジストリ / Docker Hub）へのアクセスが必要です。

### 1. ローカル Supabase を起動

```bash
# Supabase CLI（未導入なら）
brew install supabase/tap/supabase   # または npm i -g supabase

cd task-branch
supabase start                       # Docker で Postgres/API/Studio を起動
# 起動後に表示される API URL / anon key を控える
```

`supabase start` は `migrations/` を適用し、`seed.sql` を投入します。
（既に起動済みで再適用したい場合は `supabase db reset`。）

Google ログインをローカルで試す場合は、起動前に OAuth クライアントの値を環境変数に入れます
（`config.toml` は値を直接持たず、この2つを参照します）。

```bash
export SUPABASE_AUTH_GOOGLE_CLIENT_ID="..."
export SUPABASE_AUTH_GOOGLE_SECRET="..."
supabase start
```

Google Cloud 側の「承認済みのリダイレクト URI」には、本番とローカルの2本を登録しておきます。

```
https://<project-ref>.supabase.co/auth/v1/callback
http://localhost:54321/auth/v1/callback
```

`config.toml` を変えたときは `supabase stop` → `supabase start` で読み直します
（`db reset` では auth の設定は反映されません）。

### 2. フロントエンド

```bash
cd web
cp .env.example .env
# .env に supabase start が表示した URL / anon key を設定
npm install
npm run dev                          # http://localhost:5173
```

### 3. plan スキルの配置

`plan-skill/SKILL.md` を Claude Code のスキルとして配置します。

```bash
mkdir -p .claude/skills/plan
cp plan-skill/SKILL.md .claude/skills/plan/SKILL.md
```

スキルが使う環境変数:

```bash
export TASK_BRANCH_URL="http://localhost:54321"   # supabase start の API URL
export TASK_BRANCH_KEY="<anon key>"
```

## ビュー

| ビュー | 内容 |
|---|---|
| プロジェクト一覧 | プロジェクトの作成・編集・削除 |
| ガントチャート | epic / story を開始日・期限のタイムラインで表示。バーのドラッグで期間変更、ステータス変更、エピックの並び替え |

将来ビュー（カレンダー / カンバン）は、コアモデルへの読み取り射影として追加できます（DESIGN.md §8）。

## 本番（将来）

```bash
supabase link --project-ref <cloud-ref>
supabase db push
```

フロントの `.env` を Supabase Cloud の URL / key に切り替えるだけで「どこからでも編集」できます。
