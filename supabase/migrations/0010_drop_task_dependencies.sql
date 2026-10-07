-- task-branch: drop task_dependencies (DESIGN.md §3)
--   タスク間の依存は登録する手段も表示する画面も無く、使われていない。
--   クリティカルパス・並列レーン・着手可能の判定を作るときに設計し直すので、いったん消す。
--   get_task_graph から edges を、export_project から depends_on を外す（エクスポートは version 3）。
--   画面は edges が無くても空として扱うため、適用前の画面とも互換。

-- ---------------------------------------------------------------------------
-- get_task_graph(project): nodes だけを返す。
-- ---------------------------------------------------------------------------
create or replace function get_task_graph(project uuid)
returns jsonb as $$
declare
  result jsonb;
begin
  select jsonb_build_object(
    'nodes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', t.id,
        'project_id', t.project_id,
        'parent_id', t.parent_id,
        'level', t.level,
        'title', t.title,
        'description', t.description,
        'status', t.status,
        'sort_order', t.sort_order,
        'start_date', t.start_date,
        'due_date', t.due_date,
        'activated_at', t.activated_at,
        'assignee_type', t.assignee_type,
        'assignee_id', t.assignee_id,
        'metadata', t.metadata,
        'progress', pr.progress
      ) order by t.level, t.sort_order)
      from tasks t
      left join get_progress(project) pr on pr.id = t.id
      where t.project_id = project
    ), '[]'::jsonb)
  ) into result;

  return result;
end;
$$ language plpgsql stable;

-- ---------------------------------------------------------------------------
-- export_project(project): task の depends_on を外す。
-- ---------------------------------------------------------------------------
create or replace function export_project(project uuid)
returns jsonb as $$
  with pr as (
    select id, progress from get_progress(project)
  ),
  task_nodes as (
    select t.parent_id, jsonb_agg(jsonb_build_object(
      'id', t.id,
      'title', t.title,
      'description', t.description,
      'status', t.status,
      'assignee_type', t.assignee_type,
      'assignee_id', t.assignee_id,
      'sort_order', t.sort_order,
      'start_date', t.start_date,
      'due_date', t.due_date,
      'metadata', t.metadata
    ) order by t.sort_order, t.created_at) as tasks
    from tasks t
    where t.project_id = project and t.level = 'task'
    group by t.parent_id
  ),
  story_nodes as (
    select s.parent_id, jsonb_agg(jsonb_build_object(
      'id', s.id,
      'title', s.title,
      'description', s.description,
      'status', s.status,
      'sort_order', s.sort_order,
      'start_date', s.start_date,
      'due_date', s.due_date,
      'progress', pr.progress,
      'metadata', s.metadata,
      'tasks', coalesce(tn.tasks, '[]'::jsonb)
    ) order by s.sort_order, s.created_at) as stories
    from tasks s
    left join pr on pr.id = s.id
    left join task_nodes tn on tn.parent_id = s.id
    where s.project_id = project and s.level = 'story'
    group by s.parent_id
  )
  select jsonb_build_object(
    'format', 'task-branch/project',
    'version', 3,
    'exported_at', now(),
    'project', jsonb_build_object(
      'id', p.id,
      'name', p.name,
      'description', p.description,
      'created_at', p.created_at
    ),
    'epics', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', e.id,
        'title', e.title,
        'description', e.description,
        'context', e.context,
        'activated_at', e.activated_at,
        'status', e.status,
        'sort_order', e.sort_order,
        'start_date', e.start_date,
        'due_date', e.due_date,
        'progress', pr.progress,
        'metadata', e.metadata,
        'stories', coalesce(sn.stories, '[]'::jsonb)
      ) order by e.sort_order, e.created_at)
      from tasks e
      left join pr on pr.id = e.id
      left join story_nodes sn on sn.parent_id = e.id
      where e.project_id = project and e.level = 'epic'
    ), '[]'::jsonb)
  )
  from projects p
  where p.id = project;
$$ language sql stable;

-- ---------------------------------------------------------------------------
-- 依存のテーブルと、それに関わる関数・トリガを消す。
-- ---------------------------------------------------------------------------
drop function if exists add_dependency(uuid, uuid);  -- 戻り値がテーブルの型なので先に消す
drop trigger if exists trg_tasks_move_dependencies on tasks;
drop function if exists check_task_move_with_dependencies();
drop table if exists task_dependencies;  -- インデックスとトリガも一緒に消える
drop function if exists check_task_dependency();
