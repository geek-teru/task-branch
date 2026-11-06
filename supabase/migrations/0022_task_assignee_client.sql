-- task-branch: タスクの担当に接続中の AI エージェントを指定する（DESIGN.md §3.2 / §5.2）
--   tasks.assignee_client_id に OAuth の client_id を持つ。assignee_type = 'ai' のときだけ値を持てる。
--   接続を解除しても担当を残すので、auth.oauth_clients への FK は付けない（画面で「解除済みのエージェント」と出す）。
--   get_task_graph は nodes にキーを足すだけなので、適用前の画面とも互換。

alter table tasks
  add column if not exists assignee_client_id text;

comment on column tasks.assignee_client_id is 'task のみ。AI が担当する場合のエージェント（OAuth の client_id）。null は AI（未指定）';

-- assignee_type が null のときも弾くため、= ではなく is not distinct from で比べる（= だと null になり check を通る）。
alter table tasks
  drop constraint if exists tasks_assignee_client_is_ai,
  add constraint tasks_assignee_client_is_ai
    check (assignee_client_id is null or assignee_type is not distinct from 'ai');

-- ---------------------------------------------------------------------------
-- get_task_graph(project): nodes に assignee_client_id を足す。
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
        'group_id', t.group_id,
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
        'assignee_client_id', t.assignee_client_id,
        'metadata', t.metadata,
        'progress', pr.progress
      ) order by t.level, t.sort_order)
      from tasks t
      left join get_progress(project) pr on pr.id = t.id
      where t.project_id = project
    ), '[]'::jsonb),
    'groups', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', g.id,
        'name', g.name,
        'sort_order', g.sort_order
      ) order by g.sort_order, g.created_at)
      from story_groups g
      where g.project_id = project
    ), '[]'::jsonb)
  ) into result;

  return result;
end;
$$ language plpgsql stable;
