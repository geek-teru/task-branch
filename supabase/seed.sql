-- task-branch: seed data for local development
--
-- このファイル自体で投入するデータはありません。
-- サンプルプロジェクトは各プロジェクト単位の再実行可能スクリプトに分離しており、
-- config.toml の [db.seed] sql_paths で seed.sql の後に順に投入されます（supabase start / db reset）:
--   - sample01.sql … AWS移行 Phase1 アプリケーション移行
--   - sample02.sql … AWS移行 Phase1 データベース移行
-- 個別に入れ直す場合は `docker exec -i supabase_db_task-branch psql -U postgres -d postgres < supabase/sampleNN.sql`。
--
-- サンプルプロジェクトの所有者（projects.owner_id）は、auth.users の最古のユーザー（下のダミーを除く）。
-- いなければ下のローカル専用のダミーユーザーにする。db reset 直後はユーザーがいないためダミーの所有になり、
-- ログインしたあとに sampleNN.sql を入れ直すと自分の所有になる。

-- ローカル専用のダミーユーザー（ログインには使わない）。
insert into auth.users (
  id, instance_id, aud, role, email,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'sample-owner@task-branch.test',
  '', '', '', '',
  now(), now()
) on conflict (id) do nothing;
