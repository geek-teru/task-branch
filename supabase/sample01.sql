-- Sample project 1: AWS移行 Phase1 アプリケーション移行  (source: sample/sample1 の mermaid gantt)
-- section -> epic, task -> story. マイルストーン / level3 タスクは意図的に省略。
-- status: エピック「本番移行 ドメイン移管」の全ストーリーを 'in_progress'、それより前を 'done'、後ろを 'todo' とする（エピックの status は配下ストーリーから決定）。
-- 単独で再実行可能: このプロジェクト名の既存行を先に削除してから再投入する。
-- 実行例: docker exec -i supabase_db_task-branch psql -U postgres -d postgres < supabase/sample01.sql

begin;

delete from projects where name = 'AWS移行 Phase1 アプリケーション移行';

do $$
declare
  p  uuid;
  ph uuid;
begin
  insert into projects(name, description)
    values ('AWS移行 Phase1 アプリケーション移行', 'AWS移行 Phase1 アプリケーション移行')
    returning id into p;

  -- epic 1: STG環境構築
  insert into tasks(project_id, level, title, status, sort_order) values (p, 'epic', 'STG環境構築', 'done', 1) returning id into ph;
  insert into tasks(project_id, parent_id, level, title, status, start_date, due_date, sort_order) values
    (p, ph, 'story', 'STG環境構築開始 運用設計 実装', 'done', '2025-09-10', '2025-10-31', 1);

  -- epic 2: 計画・設計
  insert into tasks(project_id, level, title, status, sort_order) values (p, 'epic', '計画・設計', 'done', 2) returning id into ph;
  insert into tasks(project_id, parent_id, level, title, status, start_date, due_date, sort_order) values
    (p, ph, 'story', '負荷 脆弱 試験計画', 'done', '2025-10-14', '2025-10-31', 1),
    (p, ph, 'story', 'STGベース移行計画', 'done', '2025-10-14', '2025-10-31', 2);

  -- epic 3: STG移行 ドメイン移管
  insert into tasks(project_id, level, title, status, sort_order) values (p, 'epic', 'STG移行 ドメイン移管', 'done', 3) returning id into ph;
  insert into tasks(project_id, parent_id, level, title, status, start_date, due_date, sort_order) values
    (p, ph, 'story', 'STG外部連携動作確認', 'done', '2025-10-14', '2025-11-21', 1),
    (p, ph, 'story', 'STG 外部連携サービス->Service C 疎通確認', 'done', '2025-11-04', '2025-11-07', 2),
    (p, ph, 'story', 'STG ドメイン移管', 'done', '2025-11-07', '2025-11-14', 3),
    (p, ph, 'story', 'STG ACM証明書発行、ドメイン検証', 'done', '2025-11-07', '2025-11-14', 4),
    (p, ph, 'story', 'STG 決済ゲートウェイ経路切替', 'done', '2025-11-14', '2025-11-21', 5),
    (p, ph, 'story', 'STG Service B オンプレリポジトリのmaster取り込み', 'done', '2025-11-14', '2025-11-21', 6);

  -- epic 4: STG移行 Service C 切り替え
  insert into tasks(project_id, level, title, status, sort_order) values (p, 'epic', 'STG移行 Service C 切り替え', 'done', 4) returning id into ph;
  insert into tasks(project_id, parent_id, level, title, status, start_date, due_date, sort_order) values
    (p, ph, 'story', 'STG Service C カナリアリリース10%', 'done', '2025-11-24', '2025-12-01', 1),
    (p, ph, 'story', 'STG Service C カナリアリリース50%', 'done', '2025-11-24', '2025-12-01', 2),
    (p, ph, 'story', 'STG Service C 100%切り替え リリース観察', 'done', '2025-11-24', '2025-12-01', 3),
    (p, ph, 'story', 'STG Service C バッチ移行', 'done', '2025-11-24', '2025-12-01', 4);

  -- epic 5: STG移行 Service A 切り替え
  insert into tasks(project_id, level, title, status, sort_order) values (p, 'epic', 'STG移行 Service A 切り替え', 'done', 5) returning id into ph;
  insert into tasks(project_id, parent_id, level, title, status, start_date, due_date, sort_order) values
    (p, ph, 'story', 'STG Service A カナリアリリース10%', 'done', '2025-12-01', '2025-12-08', 1),
    (p, ph, 'story', 'STG Service A カナリアリリース50%', 'done', '2025-12-01', '2025-12-08', 2),
    (p, ph, 'story', 'STG Service A 100%切り替え リリース観察', 'done', '2025-12-01', '2025-12-08', 3);

  -- epic 6: STG移行 Service B 切り替え
  insert into tasks(project_id, level, title, status, sort_order) values (p, 'epic', 'STG移行 Service B 切り替え', 'done', 6) returning id into ph;
  insert into tasks(project_id, parent_id, level, title, status, start_date, due_date, sort_order) values
    (p, ph, 'story', 'STG Service B カナリアリリース10%', 'done', '2025-12-08', '2025-12-15', 1),
    (p, ph, 'story', 'STG Service B カナリアリリース50%', 'done', '2025-12-08', '2025-12-15', 2),
    (p, ph, 'story', 'STG Service B 100%切り替え リリース観察', 'done', '2025-12-08', '2025-12-15', 3);

  -- epic 7: STG負荷試験
  insert into tasks(project_id, level, title, status, sort_order) values (p, 'epic', 'STG負荷試験', 'done', 7) returning id into ph;
  insert into tasks(project_id, parent_id, level, title, status, start_date, due_date, sort_order) values
    (p, ph, 'story', 'STG 負荷試験環境構築', 'done', '2025-12-01', '2025-12-12', 1),
    (p, ph, 'story', 'STG 負荷試験', 'done', '2025-12-12', '2025-12-19', 2),
    (p, ph, 'story', 'STG Service A Batch負荷試験', 'done', '2025-12-12', '2026-01-23', 3);

  -- epic 8: 本番環境構築・外部連携試験
  insert into tasks(project_id, level, title, status, sort_order) values (p, 'epic', '本番環境構築・外部連携試験', 'done', 8) returning id into ph;
  insert into tasks(project_id, parent_id, level, title, status, start_date, due_date, sort_order) values
    (p, ph, 'story', 'PRD DX構成検討・NW構築（Service B/Service C/Service A）', 'done', '2025-11-01', '2025-11-14', 1),
    (p, ph, 'story', '本番環境構築開始 動作検証', 'done', '2025-11-10', '2025-12-26', 4),
    (p, ph, 'story', '本番 DX有効化', 'done', '2025-12-22', '2025-12-23', 5),
    (p, ph, 'story', '本番 外部連携試験 DB接続', 'done', '2025-12-15', '2025-12-26', 6),
    (p, ph, 'story', '年末年始', 'done', '2025-12-27', '2026-01-04', 7);

  -- epic 9: 本番移行 ドメイン移管
  insert into tasks(project_id, level, title, status, sort_order) values (p, 'epic', '本番移行 ドメイン移管', 'in_progress', 9) returning id into ph;
  insert into tasks(project_id, parent_id, level, title, status, start_date, due_date, sort_order) values
    (p, ph, 'story', '本番 ドメイン移管', 'in_progress', '2026-01-07', '2026-01-08', 1),
    (p, ph, 'story', '本番 ACM証明書発行、ドメイン検証', 'in_progress', '2026-01-08', '2026-01-09', 2),
    (p, ph, 'story', '本番 ALBリスナー設定', 'in_progress', '2026-01-08', '2026-01-09', 3),
    (p, ph, 'story', '本番 決済ゲートウェイ経路切替', 'in_progress', '2026-01-08', '2026-01-09', 4),
    (p, ph, 'story', '本番 外部連携試験 外部API', 'in_progress', '2026-01-08', '2026-01-16', 5);

  -- epic 10: 本番移行 Service C 切り替え
  insert into tasks(project_id, level, title, status, sort_order) values (p, 'epic', '本番移行 Service C 切り替え', 'todo', 10) returning id into ph;
  insert into tasks(project_id, parent_id, level, title, status, start_date, due_date, sort_order) values
    (p, ph, 'story', '本番 Service C リリース', 'todo', '2026-01-19', '2026-01-20', 1),
    (p, ph, 'story', '本番 Service C プライベート カナリアリリース', 'todo', '2026-01-19', '2026-01-20', 2),
    (p, ph, 'story', '本番 Service C バッチリリース(Service A 以外)', 'todo', '2026-01-20', '2026-01-21', 3),
    (p, ph, 'story', '本番 Service C パブリック カナリアリリース 50%', 'todo', '2026-01-21', '2026-01-22', 4),
    (p, ph, 'story', '本番 Service C バッチリリース(Service A)', 'todo', '2026-02-01', '2026-02-02', 5);

  -- epic 11: 本番移行 Service A 切り替え
  insert into tasks(project_id, level, title, status, sort_order) values (p, 'epic', '本番移行 Service A 切り替え', 'todo', 11) returning id into ph;
  insert into tasks(project_id, parent_id, level, title, status, start_date, due_date, sort_order) values
    (p, ph, 'story', '本番 Service A リリース', 'todo', '2026-01-26', '2026-01-27', 1),
    (p, ph, 'story', '本番 Service A プライベート カナリアリリース 10%', 'todo', '2026-01-26', '2026-01-27', 2),
    (p, ph, 'story', '本番 Service A パブリック カナリアリリース 50%', 'todo', '2026-01-27', '2026-01-28', 3),
    (p, ph, 'story', '本番 Service A Importバッチリリース', 'todo', '2026-01-27', '2026-01-28', 4),
    (p, ph, 'story', '本番 Service A 100%切り替え リリース観察', 'todo', '2026-01-29', '2026-01-30', 5),
    (p, ph, 'story', '本番 Service A Exportバッチリリース', 'todo', '2026-02-01', '2026-02-02', 6);

  -- epic 12: 本番移行 Service B 切り替え
  insert into tasks(project_id, level, title, status, sort_order) values (p, 'epic', '本番移行 Service B 切り替え', 'todo', 12) returning id into ph;
  insert into tasks(project_id, parent_id, level, title, status, start_date, due_date, sort_order) values
    (p, ph, 'story', '本番 Service B リリース', 'todo', '2026-02-16', '2026-02-17', 1),
    (p, ph, 'story', '本番 Service B オンプレの変更取り込み', 'todo', '2026-01-19', '2026-01-30', 2),
    (p, ph, 'story', '本番 Service B プライベート カナリアリリース', 'todo', '2026-02-16', '2026-02-17', 3),
    (p, ph, 'story', '本番 Service B バッチリリース', 'todo', '2026-02-16', '2026-02-17', 4),
    (p, ph, 'story', '本番 Service B パブリック カナリアリリース50%', 'todo', '2026-02-18', '2026-02-19', 5),
    (p, ph, 'story', 'コードフリーズ', 'todo', '2026-02-05', '2026-02-08', 6),
    (p, ph, 'story', '建国記念日', 'todo', '2026-02-10', '2026-02-11', 7);
end $$;

commit;
