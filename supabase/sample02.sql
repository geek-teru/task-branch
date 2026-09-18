-- Sample project 2: AWS移行 Phase1 データベース移行  (source: sample/sample2 の mermaid gantt)
-- section -> epic, task -> story. マイルストーン / level3 タスクは意図的に省略。
-- status: ストーリー「Service B 切り替え/切り戻し 手順作成」を 'in_progress'、それより前を 'done'、後ろを 'todo' とする（エピックの status は配下ストーリーから決定）。
-- 単独で再実行可能: このプロジェクト名の既存行を先に削除してから再投入する。
-- 実行例: docker exec -i supabase_db_task-branch psql -U postgres -d postgres < supabase/sample02.sql

begin;

delete from projects where name = 'AWS移行 Phase1 データベース移行';

do $$
declare
  p  uuid;
  ph uuid;
begin
  insert into projects(name, description)
    values ('AWS移行 Phase1 データベース移行', 'AWS移行 Phase1 データベース移行')
    returning id into p;

  -- section ステージング環境構築
  insert into tasks(project_id, level, title, status, sort_order) values (p, 'epic', 'ステージング環境構築', 'done', 1) returning id into ph;
  insert into tasks(project_id, parent_id, level, title, status, start_date, due_date, sort_order) values
    (p, ph, 'story', 'STG オンプレ側DB設定変更', 'done', '2026-04-01', '2026-04-15', 1),
    (p, ph, 'story', 'STG AWS側Aurora環境構築', 'done', '2026-04-01', '2026-04-15', 2),
    (p, ph, 'story', 'STG AWS側Auroraテスト環境構築', 'done', '2026-04-01', '2026-04-15', 3),
    (p, ph, 'story', 'STG DMS 有効化', 'done', '2026-04-16', '2026-04-30', 4),
    (p, ph, 'story', 'STG 結合試験(テスト環境)', 'done', '2026-04-16', '2026-04-30', 5);

  -- section 運用設計・実装
  insert into tasks(project_id, level, title, status, sort_order) values (p, 'epic', '運用設計・実装', 'done', 2) returning id into ph;
  insert into tasks(project_id, parent_id, level, title, status, start_date, due_date, sort_order) values
    (p, ph, 'story', 'STG 運用 設計 監視・通知設計', 'done', '2026-05-01', '2026-05-14', 1),
    (p, ph, 'story', 'STG 運用 設計 CICD基盤設計', 'done', '2026-05-01', '2026-05-14', 2),
    (p, ph, 'story', 'STG 運用 構築 CICD基盤構築', 'done', '2026-05-15', '2026-05-21', 3),
    (p, ph, 'story', 'STG DB再構築', 'done', '2026-05-15', '2026-05-21', 4),
    (p, ph, 'story', 'STG 運用 構築 監視・通知構築', 'done', '2026-05-22', '2026-05-28', 5),
    (p, ph, 'story', 'STG 運用 テスト', 'done', '2026-05-29', '2026-06-04', 6);

  -- section 移行方式設計
  insert into tasks(project_id, level, title, status, sort_order) values (p, 'epic', '移行方式設計', 'done', 3) returning id into ph;
  insert into tasks(project_id, parent_id, level, title, status, start_date, due_date, sort_order) values
    (p, ph, 'story', 'STG 移行影響調査', 'done', '2026-05-01', '2026-05-14', 1),
    (p, ph, 'story', 'STG 移行方式詳細設計', 'done', '2026-05-01', '2026-05-14', 2),
    (p, ph, 'story', 'STG 無停止方式詳細設計', 'done', '2026-05-22', '2026-06-04', 3),
    (p, ph, 'story', '本部長・CTOレビュー', 'done', '2026-05-15', '2026-06-04', 4);

  -- section 負荷試験・QA試験
  insert into tasks(project_id, level, title, status, sort_order) values (p, 'epic', '負荷試験・QA試験', 'done', 4) returning id into ph;
  insert into tasks(project_id, parent_id, level, title, status, start_date, due_date, sort_order) values
    (p, ph, 'story', 'STG Service A 負荷試験(テスト環境)', 'done', '2026-05-22', '2026-05-28', 1),
    (p, ph, 'story', 'STG Service B 負荷試験(テスト環境)', 'done', '2026-05-29', '2026-06-04', 2),
    (p, ph, 'story', 'STG QAテスト', 'done', '2026-06-05', '2026-06-11', 3);

  -- section 本番環境 構築
  insert into tasks(project_id, level, title, status, sort_order) values (p, 'epic', '本番環境 構築', 'done', 5) returning id into ph;
  insert into tasks(project_id, parent_id, level, title, status, start_date, due_date, sort_order) values
    (p, ph, 'story', 'PRD Service A,Service C,Service B オンプレ DB設定変更', 'done', '2026-06-05', '2026-06-18', 1),
    (p, ph, 'story', 'PRD Service A,Service C,Service B Aurora構築', 'done', '2026-06-05', '2026-06-18', 2),
    (p, ph, 'story', 'PRD Service A,Service C,Service B Aurora運用適用', 'done', '2026-06-19', '2026-06-25', 3),
    (p, ph, 'story', 'PRD Service A,Service C,Service B 各種DBオブジェクト作成', 'done', '2026-06-26', '2026-07-02', 4),
    (p, ph, 'story', 'PRD Service A,Service C,Service B tmp環境 構築', 'done', '2026-06-26', '2026-07-02', 5),
    (p, ph, 'story', 'PRD Service A,Service B DMSフルロード', 'done', '2026-07-03', '2026-07-09', 6),
    (p, ph, 'story', 'PRD Service C DMSフルロード', 'done', '2026-07-10', '2026-07-16', 7);

  -- section Service A DB切り替え
  insert into tasks(project_id, level, title, status, sort_order) values (p, 'epic', 'Service A DB切り替え', 'done', 6) returning id into ph;
  insert into tasks(project_id, parent_id, level, title, status, start_date, due_date, sort_order) values
    (p, ph, 'story', 'Service A 切り替え方式確定', 'done', '2026-06-05', '2026-06-18', 1),
    (p, ph, 'story', 'Service A 切り替え方式 部内レビュー', 'done', '2026-06-19', '2026-06-25', 2),
    (p, ph, 'story', 'Service A 切り替え/切り戻し 手順作成', 'done', '2026-06-19', '2026-06-25', 3),
    (p, ph, 'story', 'RC Service A 切替/切り戻し/再切替', 'done', '2026-06-29', '2026-07-03', 4),
    (p, ph, 'story', 'STG Service A 切替/切り戻し/再切替', 'done', '2026-07-06', '2026-07-10', 5),
    (p, ph, 'story', 'PRD Service A 切替', 'done', '2026-07-13', '2026-07-17', 6);

  -- section Service C DB切り替え
  insert into tasks(project_id, level, title, status, sort_order) values (p, 'epic', 'Service C DB切り替え', 'done', 7) returning id into ph;
  insert into tasks(project_id, parent_id, level, title, status, start_date, due_date, sort_order) values
    (p, ph, 'story', 'Service C 切り替え方式確定', 'done', '2026-06-19', '2026-06-25', 1),
    (p, ph, 'story', 'Service C 切り替え方式 部内レビュー', 'done', '2026-06-26', '2026-07-02', 2),
    (p, ph, 'story', 'Service C 切り替え/切り戻し 手順作成', 'done', '2026-07-03', '2026-07-16', 3),
    (p, ph, 'story', 'RC Service C 切替/切り戻し/再切替', 'done', '2026-07-20', '2026-07-24', 4),
    (p, ph, 'story', 'STG Service C 切替/切り戻し/再切替', 'done', '2026-07-27', '2026-07-31', 5),
    (p, ph, 'story', 'Service A,Service C 月次バッチ実行', 'done', '2026-07-27', '2026-07-31', 6),
    (p, ph, 'story', 'PRD Service C 切替', 'done', '2026-08-03', '2026-08-07', 7),
    (p, ph, 'story', '夏季休暇', 'done', '2026-08-08', '2026-08-16', 8);

  -- section Service B 切り替え
  insert into tasks(project_id, level, title, status, sort_order) values (p, 'epic', 'Service B 切り替え', 'in_progress', 8) returning id into ph;
  insert into tasks(project_id, parent_id, level, title, status, start_date, due_date, sort_order) values
    (p, ph, 'story', 'Service B 移行計画 移行スコープ定義', 'done', '2026-08-17', '2026-08-20', 1),
    (p, ph, 'story', 'Service B 移行計画 リスク分析', 'done', '2026-08-21', '2026-09-03', 2),
    (p, ph, 'story', 'Service B 移行計画 切り替え方式作成', 'done', '2026-09-04', '2026-09-17', 3),
    (p, ph, 'story', 'Service B 移行計画 部内レビュー', 'done', '2026-09-18', '2026-10-15', 4),
    (p, ph, 'story', 'Service B 切り替え/切り戻し 手順作成', 'in_progress', '2026-09-18', '2026-10-15', 5),
    (p, ph, 'story', 'RC Service B 切替/切り戻し/再切替', 'todo', '2026-10-16', '2026-10-22', 6),
    (p, ph, 'story', 'STG Service B 切替・切り戻し・再切替', 'todo', '2026-10-23', '2026-10-29', 7),
    (p, ph, 'story', 'STG Service B 切替手順作成', 'todo', '2026-10-30', '2026-11-06', 8),
    (p, ph, 'story', 'PRD Service B 切替本番', 'todo', '2026-11-09', '2026-11-13', 9);
end $$;

commit;
