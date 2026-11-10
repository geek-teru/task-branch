-- task-branch: ゲスト用サンプルプロジェクトの作成 RPC（DESIGN.md §4.2）
--   ゲスト（匿名サインインのユーザー）の初回ログイン時に、カンバン・ガント・バックログで触れる
--   サンプルのプロジェクトを1つ作る。日付は呼び出した日（current_date）を起点にずらす。
--   - security invoker: RLS と projects.owner_id の既定値 current_owner_id() をそのまま使う
--   - 匿名ユーザーだけが呼べる（JWT の is_anonymous が true でなければ例外）
--   - 冪等: すでにプロジェクトを持っていれば作らず、最古のプロジェクトの id を返す
--   件数の上限・自動削除は「ゲストの制約の実装」で入れる。ここでは上限に十分収まる件数にする
--   （ストーリー 4・タスク 11）。

create or replace function create_guest_sample_project() returns uuid as $$
declare
  p  uuid;
  s1 uuid;
  s2 uuid;
  s3 uuid;
  s4 uuid;
  d  date := current_date;
begin
  if coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) is not true then
    raise exception 'create_guest_sample_project は匿名ユーザーだけが呼べます'
      using errcode = '42501';
  end if;

  -- 冪等: すでに持っていれば最古のプロジェクトを返す（RLS で自分の行だけが見える）
  select id into p from projects order by created_at, id limit 1;
  if p is not null then
    return p;
  end if;

  insert into projects(name, description)
    values ('サンプル: Web アプリのリリース', 'ゲスト用のサンプル。カンバン・ガント・バックログを自由に触ってみてください。')
    returning id into p;

  -- ストーリー1: 完了
  insert into tasks(project_id, level, title, description, status, start_date, due_date, sort_order, context, activated_at)
    values (p, 'story', '要件定義と画面設計', '作るものを決めて、画面の形に落とす', 'done',
            d - 14, d - 8, 1,
            E'## 背景・課題\n- 何を作るかが人によってばらばらで、着手できない\n\n## ゴール\n- 要件と画面の構成が1枚にまとまっている\n\n## 決定事項\n- 最初のリリースはログインと一覧画面だけにする',
            now() - interval '14 days')
    returning id into s1;
  insert into tasks(project_id, parent_id, level, title, status, start_date, due_date, sort_order) values
    (p, s1, 'task', '要件の洗い出し', 'done', d - 14, d - 12, 1),
    (p, s1, 'task', '画面のワイヤーフレーム作成', 'done', d - 12, d - 10, 2),
    (p, s1, 'task', 'レビューと承認', 'done', d - 10, d - 8, 3);

  -- ストーリー2: 進行中
  insert into tasks(project_id, level, title, description, status, start_date, due_date, sort_order, context, activated_at)
    values (p, 'story', 'ログイン機能の実装', 'メールとパスワードでログインできるようにする', 'in_progress',
            d - 7, d + 3, 2,
            E'## 背景・課題\n- いまは誰でも画面を開けてしまう\n\n## ゴール\n- ログインした人だけが一覧画面を見られる\n\n## 決定事項\n- 認証は外部サービスを使い、自前でパスワードを持たない\n\n## 検討中\n- パスワードを忘れたときの再設定の導線',
            now() - interval '7 days')
    returning id into s2;
  insert into tasks(project_id, parent_id, level, title, status, start_date, due_date, sort_order) values
    (p, s2, 'task', '認証サービスの選定', 'done', d - 7, d - 5, 1),
    (p, s2, 'task', 'ログイン画面の実装', 'in_progress', d - 5, d, 2),
    (p, s2, 'task', 'ログイン状態の保持', 'todo', d - 1, d + 2, 3),
    (p, s2, 'task', 'ログインのテスト', 'todo', d + 1, d + 3, 4);

  -- ストーリー3: 着手前（期間が先）
  insert into tasks(project_id, level, title, description, status, start_date, due_date, sort_order, context)
    values (p, 'story', '一覧画面の実装', 'データの一覧を表示して、絞り込める', 'todo',
            d + 4, d + 10, 3,
            E'## 背景・課題\n- ログイン後に見る画面がまだない\n\n## ゴール\n- 一覧を表示し、キーワードで絞り込める')
    returning id into s3;
  insert into tasks(project_id, parent_id, level, title, status, start_date, due_date, sort_order) values
    (p, s3, 'task', '一覧の表示', 'todo', d + 4, d + 6, 1),
    (p, s3, 'task', 'キーワード検索の追加', 'todo', d + 7, d + 10, 2);

  -- ストーリー4: 着手前（最後）
  insert into tasks(project_id, level, title, description, status, start_date, due_date, sort_order)
    values (p, 'story', 'リリース準備', '本番に出すための仕上げ', 'todo',
            d + 11, d + 17, 4)
    returning id into s4;
  insert into tasks(project_id, parent_id, level, title, status, start_date, due_date, sort_order) values
    (p, s4, 'task', '本番環境の準備', 'todo', d + 11, d + 14, 1),
    (p, s4, 'task', 'リリース手順書の作成', 'todo', d + 14, d + 17, 2);

  return p;
end;
$$ language plpgsql;

-- 呼べるのは authenticated だけ（匿名ユーザーも authenticated ロール）。public の既定の execute は外す。
revoke execute on function create_guest_sample_project() from public;
grant execute on function create_guest_sample_project() to authenticated;
