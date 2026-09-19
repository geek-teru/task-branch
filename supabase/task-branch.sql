-- task-branch 自体の開発管理プロジェクト（プロジェクト → エピック → ストーリー → タスク）。
-- ストーリーは 1 週間単位。2026-09-19 時点の状態（終わった作業は done、残りは todo / in_progress）。
-- 単独で再実行可能: このプロジェクト名の既存行を先に削除してから再投入する。
-- 実行例: docker exec -i supabase_db_task-branch psql -U postgres -d postgres < supabase/task-branch.sql

begin;

delete from projects where name = 'task-branch';

do $$
declare
  p uuid;
  e uuid;
  s uuid;
begin
  insert into projects(name, description)
    values ('task-branch', 'AI で使うことを前提にしたタスク管理ツール自体の開発')
    returning id into p;

  -- ===== epic 1: 基盤（DB・API） =====
  insert into tasks(project_id, level, title, status, sort_order)
    values (p, 'epic', '基盤（DB・API）', 'done', 1) returning id into e;

  insert into tasks(project_id, parent_id, level, title, status, start_date, due_date, sort_order, description)
    values (p, e, 'story', 'スキーマと RPC の整備', 'done', '2026-09-14', '2026-09-20', 1,
            'projects / tasks の 3 階層モデルと、AI・画面共通の RPC')
    returning id into s;
  insert into tasks(project_id, parent_id, level, title, status, sort_order) values
    (p, s, 'task', 'projects / tasks スキーマと階層検証トリガー', 'done', 1),
    (p, s, 'task', '進捗集計 RPC（get_progress / get_task_graph）', 'done', 2),
    (p, s, 'task', 'プロジェクトの JSON エクスポート RPC（export_project）', 'done', 3);

  insert into tasks(project_id, parent_id, level, title, status, start_date, due_date, sort_order, description)
    values (p, e, 'story', 'ローカル開発環境', 'done', '2026-09-14', '2026-09-20', 2,
            'Supabase ローカル + Vite 開発サーバ')
    returning id into s;
  insert into tasks(project_id, parent_id, level, title, status, sort_order) values
    (p, s, 'task', 'Supabase をローカル起動（npx supabase start）', 'done', 1),
    (p, s, 'task', 'Docker Desktop / WSL が起動しない問題の対応', 'done', 2),
    (p, s, 'task', '初期化時にサンプルを投入（config.toml の seed sql_paths）', 'done', 3);

  -- ===== epic 2: 画面（Web UI） =====
  insert into tasks(project_id, level, title, status, sort_order)
    values (p, 'epic', '画面（Web UI）', 'in_progress', 2) returning id into e;

  insert into tasks(project_id, parent_id, level, title, status, start_date, due_date, sort_order, description)
    values (p, e, 'story', 'プロジェクト・ガントチャート画面', 'done', '2026-09-14', '2026-09-20', 1, null)
    returning id into s;
  insert into tasks(project_id, parent_id, level, title, status, sort_order) values
    (p, s, 'task', 'プロジェクトの作成・変更・削除', 'done', 1),
    (p, s, 'task', 'ガントチャート（期間のドラッグ変更・エピック並べ替え）', 'done', 2),
    (p, s, 'task', 'JSON エクスポートボタン', 'done', 3),
    (p, s, 'task', 'ガントチャートは選択中プロジェクトだけ読み込む', 'done', 4);

  insert into tasks(project_id, parent_id, level, title, status, start_date, due_date, sort_order, description)
    values (p, e, 'story', 'ページ分割（react-router-dom）', 'in_progress', '2026-09-14', '2026-09-20', 2,
            'PR #1（feat/page-routing）')
    returning id into s;
  insert into tasks(project_id, parent_id, level, title, status, sort_order) values
    (p, s, 'task', '/projects・/projects/:id/gantt・/gantt のルーティング', 'done', 1),
    (p, s, 'task', 'メニュー名「プロジェクト一覧」→「プロジェクト」', 'done', 2),
    (p, s, 'task', 'PR #1 のレビュー・マージ', 'todo', 3);

  insert into tasks(project_id, parent_id, level, title, status, start_date, due_date, sort_order, description)
    values (p, e, 'story', 'カンバン画面', 'in_progress', '2026-09-14', '2026-09-20', 3,
            'feat/kanban（feat/page-routing の上に作成）')
    returning id into s;
  insert into tasks(project_id, parent_id, level, title, status, sort_order) values
    (p, s, 'task', '進行中ストーリー × status 列のボード', 'done', 1),
    (p, s, 'task', 'ドラッグで status 変更（確認モーダル付き）', 'done', 2),
    (p, s, 'task', 'ストーリーの行からタスクを追加', 'done', 3),
    (p, s, 'task', 'カードクリックで詳細パネル（ガントチャートと共通化）', 'done', 4),
    (p, s, 'task', 'プロジェクトごとの表とプロジェクト絞り込み', 'done', 5),
    (p, s, 'task', 'コミットと PR 作成', 'todo', 6);

  insert into tasks(project_id, parent_id, level, title, status, start_date, due_date, sort_order, description)
    values (p, e, 'story', 'ガントチャートの詳細パネル修正', 'todo', '2026-09-21', '2026-09-27', 4,
            'get_task_graph が created_at / updated_at / completed_at を返さず、詳細パネルの日時が「-」になる')
    returning id into s;
  insert into tasks(project_id, parent_id, level, title, status, sort_order) values
    (p, s, 'task', 'get_task_graph に作成・更新・完了日時を追加', 'todo', 1);

  -- ===== epic 3: サンプルデータ・リポジトリ整備 =====
  insert into tasks(project_id, level, title, status, sort_order)
    values (p, 'epic', 'サンプルデータ・リポジトリ整備', 'done', 3) returning id into e;

  insert into tasks(project_id, parent_id, level, title, status, start_date, due_date, sort_order, description)
    values (p, e, 'story', 'サンプルデータの整備', 'done', '2026-09-14', '2026-09-20', 1, null)
    returning id into s;
  insert into tasks(project_id, parent_id, level, title, status, sort_order) values
    (p, s, 'task', 'サンプルのステータスを現状に合わせる', 'done', 1),
    (p, s, 'task', '監査エピックの削除と夏季休暇の移動', 'done', 2),
    (p, s, 'task', '固有名詞のリネーム（Service A/B/C など）', 'done', 3),
    (p, s, 'task', 'プロジェクト名を AWS移行 Phase1 に変更', 'done', 4);

  insert into tasks(project_id, parent_id, level, title, status, start_date, due_date, sort_order, description)
    values (p, e, 'story', '公開リポジトリの履歴整理', 'done', '2026-09-14', '2026-09-20', 2,
            'リネーム前の固有名詞が残るコミットを消すため、リポジトリを作り直した')
    returning id into s;
  insert into tasks(project_id, parent_id, level, title, status, sort_order) values
    (p, s, 'task', '履歴を 1 コミットに組み直し', 'done', 1),
    (p, s, 'task', 'GitHub リポジトリの再作成と push', 'done', 2);

  -- ===== epic 4: AI 連携（MCP） =====
  insert into tasks(project_id, level, title, status, sort_order)
    values (p, 'epic', 'AI 連携（MCP）', 'todo', 4) returning id into e;

  insert into tasks(project_id, parent_id, level, title, status, start_date, due_date, sort_order, description)
    values (p, e, 'story', 'MCP サーバー：起票と参照', 'todo', '2026-09-21', '2026-09-27', 1, null)
    returning id into s;
  insert into tasks(project_id, parent_id, level, title, status, sort_order) values
    (p, s, 'task', 'MCP サーバーの置き場所と実装方式を決める', 'todo', 1),
    (p, s, 'task', 'create_plan：木構造の一括登録（metadata.external_id で重複防止）', 'todo', 2),
    (p, s, 'task', 'get_task_context：タスクと親・過去メモをまとめて返す', 'todo', 3);

  insert into tasks(project_id, parent_id, level, title, status, start_date, due_date, sort_order, description)
    values (p, e, 'story', 'MCP サーバー：作業の流れ', 'todo', '2026-09-28', '2026-10-04', 2, null)
    returning id into s;
  insert into tasks(project_id, parent_id, level, title, status, sort_order) values
    (p, s, 'task', 'get_next_task：次に着手するタスクを返す', 'todo', 1),
    (p, s, 'task', 'start_task / complete_task：状態更新と作業結果の記録', 'todo', 2);

  insert into tasks(project_id, parent_id, level, title, status, start_date, due_date, sort_order, description)
    values (p, e, 'story', '認証と RLS', 'todo', '2026-10-05', '2026-10-11', 3,
            '今は anon key で全データを読み書きできる。MCP を外から呼ぶ前に必要')
    returning id into s;
  insert into tasks(project_id, parent_id, level, title, status, sort_order) values
    (p, s, 'task', '認証方式を決める', 'todo', 1),
    (p, s, 'task', 'projects / tasks に RLS ポリシーを設定', 'todo', 2);

  -- ===== epic 5: 並列で動く AI への対応 =====
  insert into tasks(project_id, level, title, status, sort_order)
    values (p, 'epic', '並列で動く AI への対応', 'todo', 5) returning id into e;

  insert into tasks(project_id, parent_id, level, title, status, start_date, due_date, sort_order, description)
    values (p, e, 'story', 'タスクの担当確保', 'todo', '2026-10-12', '2026-10-18', 1,
            '複数のエージェントが同じタスクを二重に取らないようにする')
    returning id into s;
  insert into tasks(project_id, parent_id, level, title, status, sort_order) values
    (p, s, 'task', '担当者（エージェント / セッション）の項目を追加', 'todo', 1),
    (p, s, 'task', 'claim を排他的に行う RPC', 'todo', 2);

  insert into tasks(project_id, parent_id, level, title, status, start_date, due_date, sort_order, description)
    values (p, e, 'story', '依存関係とクリティカルパス', 'todo', '2026-10-19', '2026-10-25', 2,
            'DESIGN.md の task_dependencies（未実装）')
    returning id into s;
  insert into tasks(project_id, parent_id, level, title, status, sort_order) values
    (p, s, 'task', 'task_dependencies テーブルと add_dependency（循環検査）', 'todo', 1),
    (p, s, 'task', 'get_critical_path', 'todo', 2),
    (p, s, 'task', 'get_next_task で依存を考慮する', 'todo', 3);

  -- ===== epic 6: 小さい改善 =====
  insert into tasks(project_id, level, title, status, sort_order)
    values (p, 'epic', '小さい改善', 'todo', 6) returning id into e;

  insert into tasks(project_id, parent_id, level, title, status, start_date, due_date, sort_order, description)
    values (p, e, 'story', '完了条件と作業ログ', 'todo', '2026-10-26', '2026-11-01', 1, null)
    returning id into s;
  insert into tasks(project_id, parent_id, level, title, status, sort_order) values
    (p, s, 'task', 'タスクに完了条件の項目を追加', 'todo', 1),
    (p, s, 'task', '作業ログ（AI の記録と人のコメント）のテーブル', 'todo', 2),
    (p, s, 'task', '詳細パネルに完了条件と作業ログを表示', 'todo', 3);

  -- ===== epic 7: トークン使用量の管理（優先度低） =====
  insert into tasks(project_id, level, title, status, sort_order)
    values (p, 'epic', 'トークン使用量の管理', 'todo', 7) returning id into e;

  insert into tasks(project_id, parent_id, level, title, status, start_date, due_date, sort_order, description)
    values (p, e, 'story', '使用量の記録', 'todo', '2026-11-02', '2026-11-08', 1, '優先度低')
    returning id into s;
  insert into tasks(project_id, parent_id, level, title, status, sort_order) values
    (p, s, 'task', '集め方を検証（Claude Code のフック / OpenTelemetry）', 'todo', 1),
    (p, s, 'task', 'usage_events テーブルとタスクへのひも付け', 'todo', 2);

  insert into tasks(project_id, parent_id, level, title, status, start_date, due_date, sort_order, description)
    values (p, e, 'story', '使用量の表示', 'todo', '2026-11-09', '2026-11-15', 2, '優先度低')
    returning id into s;
  insert into tasks(project_id, parent_id, level, title, status, sort_order) values
    (p, s, 'task', 'ストーリー・プロジェクトごとの累計表示', 'todo', 1),
    (p, s, 'task', '予算を超えそうなときの警告', 'todo', 2);
end $$;

commit;
