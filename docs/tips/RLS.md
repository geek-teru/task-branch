# Supabase の RLS の仕組み

task-branch に RLS（Row Level Security）を入れる前に、仕組みを順番に整理する。

## 目次

1. [RLS とは](#1-rls-とは)
2. [create policy の書き方](#2-create-policy-の書き方)
3. [RLS ポリシーの具体例](#3-rls-ポリシーの具体例)
4. [Supabase の anon, authenticated とは](#4-supabase-の-anon-authenticated-とは)
5. [auth.uid() とは](#5-authuid-とは)
6. [サンプルデータで評価する](#6-サンプルデータで評価する)
7. [RLS の注意点](#7-rls-の注意点)

## 1. RLS とは

**Postgres 標準の機能**。テーブルごとに「どの行を読める・書けるか」をポリシーとして持たせる。

```sql
alter table tasks enable row level security;   -- ① RLS を有効にする
create policy ... on tasks ...;                -- ② ポリシーを作る
```

- ① だけでポリシーが無いと、**全行が見えなくなる**（全拒否）
- ポリシーが複数あるときは `or` でつながる（どれか1つで許可されればよい）
- 書く場所はマイグレーション SQL。アプリ側のコードはほぼ変わらない

部品の提供元は次のとおり。

| 部品 | 提供元 |
|---|---|
| `enable row level security`、`create policy` | Postgres 標準 |
| `anon`、`authenticated` ロール | Supabase が作った Postgres のロール |
| `auth.uid()`、`auth.jwt()` | Supabase が作った Postgres の関数 |

## 2. create policy の書き方

```sql
create policy tasks_select   -- ポリシーの名前（ラベル）
  on tasks                   -- 対象のテーブル
  for select                 -- どの操作に効くか
  to authenticated           -- どのロールに効くか
  using (条件);              -- 行ごとに評価する条件
```

| 句 | 書けるもの | 意味 |
|---|---|---|
| `for` | `select` / `insert` / `update` / `delete` / `all` | どの操作に効くか。省略すると `all` |
| `to` | `authenticated` / `anon` / `public` など（カンマで複数可） | どのロールに効くか。省略すると `public`（全ロール） |
| `using (条件)` | true / false を返す式 | **既にある行**のうち、どれを対象にできるか（select / update / delete） |
| `with check (条件)` | true / false を返す式 | **書き込む行**が許されるか（insert / update 後の値） |

- `insert` には `with check` だけ、`select` / `delete` には `using` だけを書く
- `update` で `with check` を省略すると、`using` と同じ条件が書き込む行にも使われる

## 3. RLS ポリシーの具体例

`auth.uid()` は、リクエストしたアプリユーザーの id を返す関数（5章で説明）。

### 例1：誰でも読める

```sql
create policy projects_read_all on projects
  for select
  to anon, authenticated
  using (true);              -- 全行が true → 全行読める
```

未ログインの人も含めて、全員が全行を読める。書き込みはどのポリシーも許していないので、できない。

### 例2：ログインしていれば全部できる

```sql
create policy projects_all on projects
  for all
  to authenticated
  using (true)
  with check (true);
```

ログインしていれば、誰のデータでも読み書きできる。未ログインの人は何もできない。

### 例3：自分のプロジェクトだけ読み書きできる

```sql
create policy projects_owner on projects
  for all
  to authenticated
  using      (owner_id = auth.uid())   -- 自分の行だけ読める・更新できる・削除できる
  with check (owner_id = auth.uid());  -- 自分名義の行しか作れない・他人名義に変えられない
```

### 例4：操作ごとに分ける

```sql
-- 読むのは、ログインしていれば全行
create policy projects_select on projects
  for select to authenticated
  using (true);

-- 作るのは、自分名義だけ
create policy projects_insert on projects
  for insert to authenticated
  with check (owner_id = auth.uid());

-- 更新・削除は、自分の行だけ
create policy projects_update on projects
  for update to authenticated
  using (owner_id = auth.uid());

create policy projects_delete on projects
  for delete to authenticated
  using (owner_id = auth.uid());
```

他人のプロジェクトも見えるが、変えられるのは自分のものだけになる。

### 例5：自分のプロジェクトのタスクだけ読める

tasks には所有者の列が無いので、タスクが属するプロジェクトをたどって判定する。

```sql
create policy tasks_select on tasks
  for select to authenticated
  using (exists (
    select 1 from projects p
     where p.id = tasks.project_id      -- このタスクのプロジェクトの
       and p.owner_id = auth.uid()      -- 持ち主が自分か
  ));
```

ログイン済みの人が `select * from tasks where id = 'T1'` を実行すると、T1 のプロジェクトの持ち主が自分のときだけ T1 が返る。そうでなければ 0 行になる。

## 4. Supabase の anon, authenticated とは

**Supabase が用意した Postgres のロール（DB ユーザー）**。`create policy` の `to` に書く。素の Postgres にはこの名前のロールは無い。

Supabase のプロジェクトにある主なロールは次のとおり。

| ロール | どのリクエストがこのロールになるか | ユースケース |
|---|---|---|
| `anon` | アプリに**未ログイン**の人のリクエスト（anon key だけが付いている） | ログインなしで見られる・使える機能。公開ページ（ブログ記事、商品一覧）、未ログインでも送れるフォーム（問い合わせ、ウェイトリスト登録） |
| `authenticated` | アプリに**ログイン済み**の人のリクエスト（ユーザーの JWT が付いている） | ログインした人が使う機能。task-branch の画面と MCP サーバーはすべてこれ |
| `service_role` | service_role キーが付いたリクエスト。**RLS を無視する** | 管理用スクリプト（AI ユーザーの作成など）。ブラウザや MCP サーバーには持たせない |
| `postgres` | API を通さず、DB に直接接続したとき。**RLS を受けない** | マイグレーション（`supabase db push`）、シード、psql での調査 |

task-branch は全画面がログイン必須なので、`anon` 向けのポリシーは作らない（ポリシーが無ければ `anon` は何もできない）。

- ここでの「ログイン」は**アプリへのログイン**（Supabase Auth）のこと。DB へのログインではない
- ロールは人ごとには作られない。ログインした人は全員、同じ `authenticated` になる
- そのため `to authenticated` で分かるのは「ログインしているか」まで。「誰か」は `using` の中で `auth.uid()` を使って判定する

```sql
create policy projects_owner on projects
  for all
  to authenticated                     -- ログインしているか（ロールで判定）
  using      (owner_id = auth.uid())   -- 誰か（JWT で判定）
  with check (owner_id = auth.uid());
```

`auth.uid()` と、リクエストがどうやってこのロールに切り替わるかは5章で説明する。

## 5. auth.uid() とは

**リクエストしたアプリユーザーの id を返す SQL の関数**。`auth` スキーマにある `uid` という関数を、引数なしで呼んでいる（`スキーマ名.関数名()`）。

Supabase が用意している定義は、おおよそ次のとおり。

```sql
create function auth.uid() returns uuid as $$
  select (current_setting('request.jwt.claims', true)::jsonb ->> 'sub')::uuid;
$$ language sql stable;
```

**なぜSQLの関数でJWTのクレームがとれるか**

PostgREST が、SQL を実行する前に HTTP の情報（JWT）を DB の変数にセットしている。

PostgREST は、1回の HTTP リクエストにつき、同じ DB 接続・同じトランザクションの中で次の SQL を順に実行する。

```sql
begin;
-- ① JWT の role クレームを見てロールを切り替える
set local role authenticated;
-- ② JWT の中身を DB の変数（request.jwt.claims）にセット
select set_config('request.jwt.claims', '{"sub":"aaaa-1111", ...}', true);
-- ③ リクエスト本体（RLS が適用され auth.uid() が呼び出される）
select * from tasks where id = 'T1';
commit;
```

- ①と②で、PostgREST が JWT の内容を **DB の設定値にコピー**する
- ③の中の `auth.uid()` は、HTTP ではなく、**同じトランザクションに置かれたその設定値**を読んでいる
- `set_config` の最後の引数 `true` により、設定値はそのトランザクションの中だけで有効になる。別の人のリクエストとは混ざらない

プログラムでいえば、関数を呼ぶ前にグローバル変数へ値を入れておき、関数の中でそれを読むのと同じ。Postgres 自身は HTTP も JWT も知らない。

### 式の分解

| 部分 | 意味 | 結果 |
|---|---|---|
| `current_setting('request.jwt.claims', true)` | ②で入れた設定値を読む。`true` は「無くてもエラーにしない」 | `'{"sub":"aaaa-1111","role":"authenticated",...}'`（文字列） |
| `::jsonb` | 文字列を JSON 型に変換する | `{"sub":"aaaa-1111", ...}`（JSON） |
| `->> 'sub'` | JSON から `sub` キーの値を文字列で取り出す | `'aaaa-1111'` |
| `(...)::uuid` | 文字列を uuid 型に変換する | `aaaa-1111`（uuid） |

### 提供元

| 部品 | 提供元 |
|---|---|
| `auth.uid()`（`auth` スキーマごと） | Supabase |
| `request.jwt.claims` という設定値 | PostgREST（Supabase が使っている API サーバー） |
| `current_setting()`、`set_config()` | Postgres 標準 |

素の Postgres には `auth.uid()` は無い。

## 6. サンプルデータで評価する

### データ

| アプリのユーザー | id | JWT の中身 |
|---|---|---|
| あなた | `aaaa-1111` | `sub: aaaa-1111` |
| あなたの AI | `cccc-3333` | `sub: cccc-3333`、`app_metadata: {actor_type: "ai", owner_id: "aaaa-1111"}` |
| Bob | `bbbb-2222` | `sub: bbbb-2222` |

**projects**

| id | name | owner_id |
|---|---|---|
| P1 | task-branch | aaaa-1111 |
| P2 | kabu-watcher | aaaa-1111 |
| P3 | bob-app | bbbb-2222 |

**tasks**

| id | project_id | title |
|---|---|---|
| T1 | P1 | 認証と RLS |
| T2 | P1 | RLS ポリシーを設定 |
| T3 | P2 | 通知の実装 |
| T4 | P3 | Bob のタスク |

### ポリシー（まずは人だけで考える）

```sql
alter table projects enable row level security;
create policy projects_owner on projects
  for all to authenticated
  using      (owner_id = auth.uid())
  with check (owner_id = auth.uid());

alter table tasks enable row level security;
create policy tasks_owner on tasks
  for all to authenticated
  using (exists (
    select 1 from projects p
     where p.id = tasks.project_id      -- この行のプロジェクトの
       and p.owner_id = auth.uid()      -- 持ち主が自分か
  ));
```

### SELECT

アプリのコードは全員同じ。

```ts
const { data } = await supabase.from('tasks').select('*')  // where は書かない
```

Postgres は、リクエストの条件に**ポリシーの条件を足して**実行する。各行について「その行のプロジェクトの owner = `auth.uid()`」を評価し、true の行だけを返す。

| 投げた人 | ポリシー判定 | 結果 |
|---|---|---|
| あなた（`auth.uid()` = aaaa） | T1: P1 の owner は aaaa → aaaa = aaaa → true<br>T2: P1 の owner は aaaa → aaaa = aaaa → true<br>T3: P2 の owner は aaaa → aaaa = aaaa → true<br>T4: P3 の owner は bbbb → bbbb ≠ aaaa → false | T1, T2, T3 |
| Bob（`auth.uid()` = bbbb） | T1: P1 の owner は aaaa → aaaa ≠ bbbb → false<br>T2: P1 の owner は aaaa → aaaa ≠ bbbb → false<br>T3: P2 の owner は aaaa → aaaa ≠ bbbb → false<br>T4: P3 の owner は bbbb → bbbb = bbbb → true | T4 |
| 未ログイン（anon） | `to authenticated` なので anon に効くポリシーが無い → 全行 false | 0 行 |

ID を直接指定しても同じ。Bob が `GET /rest/v1/tasks?id=eq.T1` を投げると、`where id = 'T1'` にポリシーの条件が足され、T1 は false なので `[]` が返る。エラー（403）ではなく、**存在しないのと同じ見え方**になる。

### INSERT / UPDATE / DELETE

| 操作 | 投げた人 | ポリシー判定 | 結果 |
|---|---|---|---|
| `insert into projects (name, owner_id) values ('x', 'aaaa-1111')` | あなた（aaaa） | with check：新しい行の owner は aaaa → aaaa = aaaa → true | 1 行作成 |
| `insert into projects (name, owner_id) values ('x', 'bbbb-2222')` | あなた（aaaa） | with check：新しい行の owner は bbbb → bbbb ≠ aaaa → false | エラー `new row violates row-level security policy` |
| `update tasks set title = 'x' where id = 'T1'` | あなた（aaaa） | using：T1 は P1、P1 の owner は aaaa → aaaa = aaaa → true | 1 行更新 |
| `update tasks set title = 'x' where id = 'T4'` | あなた（aaaa） | using：T4 は P3、P3 の owner は bbbb → bbbb ≠ aaaa → false | **0 行更新**（エラーにならない。T4 は見えない行扱い） |
| `delete from projects where id = 'P3'` | あなた（aaaa） | using：P3 の owner は bbbb → bbbb ≠ aaaa → false | **0 行削除**（エラーにならない） |

見えない行への更新・削除はエラーにならない。アプリでは「更新件数が 0 なら失敗」として扱う必要がある。

## 7. RLS の注意点

次の経路では RLS が効かない。ここが穴になる。

| 経路 | 理由 | 対策 |
|---|---|---|
| `service_role` キー | RLS を無視するロール | ブラウザ・MCP サーバーに持たせない |
| `security definer` の関数（RPC） | 関数を作ったロール（postgres）の権限で動く | 既定の `security invoker` のままにする |
| ビュー | 既定で作成者の権限で動く | `create view ... with (security_invoker = true)` |
| RLS を有効にし忘れたテーブル | 制限が無い | 全テーブルで `enable row level security` を確認する |
| 自前の API サーバーで service_role を使う | DB 側では素通り | アプリ側で所有者を確認する（task-branch はこの構成ではない） |
