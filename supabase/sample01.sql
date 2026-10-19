-- Sample project 1: AWS移行 Phase1 アプリケーション移行  (source: sample/sample1 の mermaid gantt)
-- task -> story（親なし）。section はコメントの区切りだけにする。マイルストーン / level3 タスクは意図的に省略。
-- status: 区切り「本番移行 ドメイン移管」の全ストーリーを 'in_progress'、それより前を 'done'、後ろを 'todo' とする。
-- 単独で再実行可能: このプロジェクト名の既存行を先に削除してから再投入する。
-- 実行例: docker exec -i supabase_db_task-branch psql -U postgres -d postgres < supabase/sample01.sql

begin;

delete from projects where name = 'AWS移行 Phase1 アプリケーション移行';

do $$
declare
  p  uuid;
  -- 所有者: 最古のユーザー（ダミーを除く）。いなければダミー（seed.sql）
  owner uuid := coalesce(
    (select id from auth.users where id <> '00000000-0000-0000-0000-000000000001' order by created_at limit 1),
    '00000000-0000-0000-0000-000000000001');
begin
  insert into projects(name, description, owner_id)
    values ('AWS移行 Phase1 アプリケーション移行', 'AWS移行 Phase1 アプリケーション移行', owner)
    returning id into p;

  -- STG環境構築
  insert into tasks(project_id, level, title, status, start_date, due_date, sort_order) values
    (p, 'story', 'STG環境構築開始 運用設計 実装', 'done', '2025-09-10', '2025-10-31', 1);

  -- 計画・設計
  insert into tasks(project_id, level, title, status, start_date, due_date, sort_order) values
    (p, 'story', '負荷 脆弱 試験計画', 'done', '2025-10-14', '2025-10-31', 2),
    (p, 'story', 'STGベース移行計画', 'done', '2025-10-14', '2025-10-31', 3);

  -- STG移行 ドメイン移管
  insert into tasks(project_id, level, title, status, start_date, due_date, sort_order) values
    (p, 'story', 'STG外部連携動作確認', 'done', '2025-10-14', '2025-11-21', 4),
    (p, 'story', 'STG 外部連携サービス->Service C 疎通確認', 'done', '2025-11-04', '2025-11-07', 5),
    (p, 'story', 'STG ドメイン移管', 'done', '2025-11-07', '2025-11-14', 6),
    (p, 'story', 'STG ACM証明書発行、ドメイン検証', 'done', '2025-11-07', '2025-11-14', 7),
    (p, 'story', 'STG 決済ゲートウェイ経路切替', 'done', '2025-11-14', '2025-11-21', 8),
    (p, 'story', 'STG Service B オンプレリポジトリのmaster取り込み', 'done', '2025-11-14', '2025-11-21', 9);

  -- STG移行 Service C 切り替え
  insert into tasks(project_id, level, title, status, start_date, due_date, sort_order) values
    (p, 'story', 'STG Service C カナリアリリース10%', 'done', '2025-11-24', '2025-12-01', 10),
    (p, 'story', 'STG Service C カナリアリリース50%', 'done', '2025-11-24', '2025-12-01', 11),
    (p, 'story', 'STG Service C 100%切り替え リリース観察', 'done', '2025-11-24', '2025-12-01', 12),
    (p, 'story', 'STG Service C バッチ移行', 'done', '2025-11-24', '2025-12-01', 13);

  -- STG移行 Service A 切り替え
  insert into tasks(project_id, level, title, status, start_date, due_date, sort_order) values
    (p, 'story', 'STG Service A カナリアリリース10%', 'done', '2025-12-01', '2025-12-08', 14),
    (p, 'story', 'STG Service A カナリアリリース50%', 'done', '2025-12-01', '2025-12-08', 15),
    (p, 'story', 'STG Service A 100%切り替え リリース観察', 'done', '2025-12-01', '2025-12-08', 16);

  -- STG移行 Service B 切り替え
  insert into tasks(project_id, level, title, status, start_date, due_date, sort_order) values
    (p, 'story', 'STG Service B カナリアリリース10%', 'done', '2025-12-08', '2025-12-15', 17),
    (p, 'story', 'STG Service B カナリアリリース50%', 'done', '2025-12-08', '2025-12-15', 18),
    (p, 'story', 'STG Service B 100%切り替え リリース観察', 'done', '2025-12-08', '2025-12-15', 19);

  -- STG負荷試験
  insert into tasks(project_id, level, title, status, start_date, due_date, sort_order) values
    (p, 'story', 'STG 負荷試験環境構築', 'done', '2025-12-01', '2025-12-12', 20),
    (p, 'story', 'STG 負荷試験', 'done', '2025-12-12', '2025-12-19', 21),
    (p, 'story', 'STG Service A Batch負荷試験', 'done', '2025-12-12', '2026-01-23', 22);

  -- 本番環境構築・外部連携試験
  insert into tasks(project_id, level, title, status, start_date, due_date, sort_order) values
    (p, 'story', 'PRD DX構成検討・NW構築（Service B/Service C/Service A）', 'done', '2025-11-01', '2025-11-14', 23),
    (p, 'story', '本番環境構築開始 動作検証', 'done', '2025-11-10', '2025-12-26', 24),
    (p, 'story', '本番 DX有効化', 'done', '2025-12-22', '2025-12-23', 25),
    (p, 'story', '本番 外部連携試験 DB接続', 'done', '2025-12-15', '2025-12-26', 26),
    (p, 'story', '年末年始', 'done', '2025-12-27', '2026-01-04', 27);

  -- 本番移行 ドメイン移管
  insert into tasks(project_id, level, title, status, start_date, due_date, sort_order) values
    (p, 'story', '本番 ドメイン移管', 'in_progress', '2026-01-07', '2026-01-08', 28),
    (p, 'story', '本番 ACM証明書発行、ドメイン検証', 'in_progress', '2026-01-08', '2026-01-09', 29),
    (p, 'story', '本番 ALBリスナー設定', 'in_progress', '2026-01-08', '2026-01-09', 30),
    (p, 'story', '本番 決済ゲートウェイ経路切替', 'in_progress', '2026-01-08', '2026-01-09', 31),
    (p, 'story', '本番 外部連携試験 外部API', 'in_progress', '2026-01-08', '2026-01-16', 32);

  -- 本番移行 Service C 切り替え
  insert into tasks(project_id, level, title, status, start_date, due_date, sort_order) values
    (p, 'story', '本番 Service C リリース', 'todo', '2026-01-19', '2026-01-20', 33),
    (p, 'story', '本番 Service C プライベート カナリアリリース', 'todo', '2026-01-19', '2026-01-20', 34),
    (p, 'story', '本番 Service C バッチリリース(Service A 以外)', 'todo', '2026-01-20', '2026-01-21', 35),
    (p, 'story', '本番 Service C パブリック カナリアリリース 50%', 'todo', '2026-01-21', '2026-01-22', 36),
    (p, 'story', '本番 Service C バッチリリース(Service A)', 'todo', '2026-02-01', '2026-02-02', 37);

  -- 本番移行 Service A 切り替え
  insert into tasks(project_id, level, title, status, start_date, due_date, sort_order) values
    (p, 'story', '本番 Service A リリース', 'todo', '2026-01-26', '2026-01-27', 38),
    (p, 'story', '本番 Service A プライベート カナリアリリース 10%', 'todo', '2026-01-26', '2026-01-27', 39),
    (p, 'story', '本番 Service A パブリック カナリアリリース 50%', 'todo', '2026-01-27', '2026-01-28', 40),
    (p, 'story', '本番 Service A Importバッチリリース', 'todo', '2026-01-27', '2026-01-28', 41),
    (p, 'story', '本番 Service A 100%切り替え リリース観察', 'todo', '2026-01-29', '2026-01-30', 42),
    (p, 'story', '本番 Service A Exportバッチリリース', 'todo', '2026-02-01', '2026-02-02', 43);

  -- 本番移行 Service B 切り替え
  insert into tasks(project_id, level, title, status, start_date, due_date, sort_order) values
    (p, 'story', '本番 Service B リリース', 'todo', '2026-02-16', '2026-02-17', 44),
    (p, 'story', '本番 Service B オンプレの変更取り込み', 'todo', '2026-01-19', '2026-01-30', 45),
    (p, 'story', '本番 Service B プライベート カナリアリリース', 'todo', '2026-02-16', '2026-02-17', 46),
    (p, 'story', '本番 Service B バッチリリース', 'todo', '2026-02-16', '2026-02-17', 47),
    (p, 'story', '本番 Service B パブリック カナリアリリース50%', 'todo', '2026-02-18', '2026-02-19', 48),
    (p, 'story', 'コードフリーズ', 'todo', '2026-02-05', '2026-02-08', 49),
    (p, 'story', '建国記念日', 'todo', '2026-02-10', '2026-02-11', 50);
end $$;

commit;
