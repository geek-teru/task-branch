-- Sample project 2: AWS移行 Phase1 データベース移行  (source: sample/sample2 の mermaid gantt)
-- task -> story（親なし）。section はコメントの区切りだけにする。マイルストーン / level3 タスクは意図的に省略。
-- status: ストーリー「Service B 切り替え/切り戻し 手順作成」を 'in_progress'、それより前を 'done'、後ろを 'todo' とする。
-- 単独で再実行可能: このプロジェクト名の既存行を先に削除してから再投入する。
-- 実行例: docker exec -i supabase_db_task-branch psql -U postgres -d postgres < supabase/sample02.sql

begin;

delete from projects where name = 'AWS移行 Phase1 データベース移行';

do $$
declare
  p  uuid;
  -- 所有者: 最古のユーザー（ダミーを除く）。いなければダミー（seed.sql）
  owner uuid := coalesce(
    (select id from auth.users where id <> '00000000-0000-0000-0000-000000000001' order by created_at limit 1),
    '00000000-0000-0000-0000-000000000001');
begin
  insert into projects(name, description, owner_id)
    values ('AWS移行 Phase1 データベース移行', 'AWS移行 Phase1 データベース移行', owner)
    returning id into p;

  -- ステージング環境構築
  insert into tasks(project_id, level, title, status, start_date, due_date, sort_order) values
    (p, 'story', 'STG オンプレ側DB設定変更', 'done', '2026-04-01', '2026-04-15', 1),
    (p, 'story', 'STG AWS側Aurora環境構築', 'done', '2026-04-01', '2026-04-15', 2),
    (p, 'story', 'STG AWS側Auroraテスト環境構築', 'done', '2026-04-01', '2026-04-15', 3),
    (p, 'story', 'STG DMS 有効化', 'done', '2026-04-16', '2026-04-30', 4),
    (p, 'story', 'STG 結合試験(テスト環境)', 'done', '2026-04-16', '2026-04-30', 5);

  -- 運用設計・実装
  insert into tasks(project_id, level, title, status, start_date, due_date, sort_order) values
    (p, 'story', 'STG 運用 設計 監視・通知設計', 'done', '2026-05-01', '2026-05-14', 6),
    (p, 'story', 'STG 運用 設計 CICD基盤設計', 'done', '2026-05-01', '2026-05-14', 7),
    (p, 'story', 'STG 運用 構築 CICD基盤構築', 'done', '2026-05-15', '2026-05-21', 8),
    (p, 'story', 'STG DB再構築', 'done', '2026-05-15', '2026-05-21', 9),
    (p, 'story', 'STG 運用 構築 監視・通知構築', 'done', '2026-05-22', '2026-05-28', 10),
    (p, 'story', 'STG 運用 テスト', 'done', '2026-05-29', '2026-06-04', 11);

  -- 移行方式設計
  insert into tasks(project_id, level, title, status, start_date, due_date, sort_order) values
    (p, 'story', 'STG 移行影響調査', 'done', '2026-05-01', '2026-05-14', 12),
    (p, 'story', 'STG 移行方式詳細設計', 'done', '2026-05-01', '2026-05-14', 13),
    (p, 'story', 'STG 無停止方式詳細設計', 'done', '2026-05-22', '2026-06-04', 14),
    (p, 'story', '本部長・CTOレビュー', 'done', '2026-05-15', '2026-06-04', 15);

  -- 負荷試験・QA試験
  insert into tasks(project_id, level, title, status, start_date, due_date, sort_order) values
    (p, 'story', 'STG Service A 負荷試験(テスト環境)', 'done', '2026-05-22', '2026-05-28', 16),
    (p, 'story', 'STG Service B 負荷試験(テスト環境)', 'done', '2026-05-29', '2026-06-04', 17),
    (p, 'story', 'STG QAテスト', 'done', '2026-06-05', '2026-06-11', 18);

  -- 本番環境 構築
  insert into tasks(project_id, level, title, status, start_date, due_date, sort_order) values
    (p, 'story', 'PRD Service A,Service C,Service B オンプレ DB設定変更', 'done', '2026-06-05', '2026-06-18', 19),
    (p, 'story', 'PRD Service A,Service C,Service B Aurora構築', 'done', '2026-06-05', '2026-06-18', 20),
    (p, 'story', 'PRD Service A,Service C,Service B Aurora運用適用', 'done', '2026-06-19', '2026-06-25', 21),
    (p, 'story', 'PRD Service A,Service C,Service B 各種DBオブジェクト作成', 'done', '2026-06-26', '2026-07-02', 22),
    (p, 'story', 'PRD Service A,Service C,Service B tmp環境 構築', 'done', '2026-06-26', '2026-07-02', 23),
    (p, 'story', 'PRD Service A,Service B DMSフルロード', 'done', '2026-07-03', '2026-07-09', 24),
    (p, 'story', 'PRD Service C DMSフルロード', 'done', '2026-07-10', '2026-07-16', 25);

  -- Service A DB切り替え
  insert into tasks(project_id, level, title, status, start_date, due_date, sort_order) values
    (p, 'story', 'Service A 切り替え方式確定', 'done', '2026-06-05', '2026-06-18', 26),
    (p, 'story', 'Service A 切り替え方式 部内レビュー', 'done', '2026-06-19', '2026-06-25', 27),
    (p, 'story', 'Service A 切り替え/切り戻し 手順作成', 'done', '2026-06-19', '2026-06-25', 28),
    (p, 'story', 'RC Service A 切替/切り戻し/再切替', 'done', '2026-06-29', '2026-07-03', 29),
    (p, 'story', 'STG Service A 切替/切り戻し/再切替', 'done', '2026-07-06', '2026-07-10', 30),
    (p, 'story', 'PRD Service A 切替', 'done', '2026-07-13', '2026-07-17', 31);

  -- Service C DB切り替え
  insert into tasks(project_id, level, title, status, start_date, due_date, sort_order) values
    (p, 'story', 'Service C 切り替え方式確定', 'done', '2026-06-19', '2026-06-25', 32),
    (p, 'story', 'Service C 切り替え方式 部内レビュー', 'done', '2026-06-26', '2026-07-02', 33),
    (p, 'story', 'Service C 切り替え/切り戻し 手順作成', 'done', '2026-07-03', '2026-07-16', 34),
    (p, 'story', 'RC Service C 切替/切り戻し/再切替', 'done', '2026-07-20', '2026-07-24', 35),
    (p, 'story', 'STG Service C 切替/切り戻し/再切替', 'done', '2026-07-27', '2026-07-31', 36),
    (p, 'story', 'Service A,Service C 月次バッチ実行', 'done', '2026-07-27', '2026-07-31', 37),
    (p, 'story', 'PRD Service C 切替', 'done', '2026-08-03', '2026-08-07', 38),
    (p, 'story', '夏季休暇', 'done', '2026-08-08', '2026-08-16', 39);

  -- Service B 切り替え
  insert into tasks(project_id, level, title, status, start_date, due_date, sort_order) values
    (p, 'story', 'Service B 移行計画 移行スコープ定義', 'done', '2026-08-17', '2026-08-20', 40),
    (p, 'story', 'Service B 移行計画 リスク分析', 'done', '2026-08-21', '2026-09-03', 41),
    (p, 'story', 'Service B 移行計画 切り替え方式作成', 'done', '2026-09-04', '2026-09-17', 42),
    (p, 'story', 'Service B 移行計画 部内レビュー', 'done', '2026-09-18', '2026-10-15', 43),
    (p, 'story', 'Service B 切り替え/切り戻し 手順作成', 'in_progress', '2026-09-18', '2026-10-15', 44),
    (p, 'story', 'RC Service B 切替/切り戻し/再切替', 'todo', '2026-10-16', '2026-10-22', 45),
    (p, 'story', 'STG Service B 切替・切り戻し・再切替', 'todo', '2026-10-23', '2026-10-29', 46),
    (p, 'story', 'STG Service B 切替手順作成', 'todo', '2026-10-30', '2026-11-06', 47),
    (p, 'story', 'PRD Service B 切替本番', 'todo', '2026-11-09', '2026-11-13', 48);
end $$;

commit;
