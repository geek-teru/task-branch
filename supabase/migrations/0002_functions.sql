-- task-branch: RPC functions (logic centralized in Postgres; called by both AI and UI)

-- ---------------------------------------------------------------------------
-- get_progress(project): progress ratio (0..1) for each epic and story.
--   story progress = done tasks / total tasks (or own status if no tasks)
--   epic progress = avg of child story progress
-- ---------------------------------------------------------------------------
create or replace function get_progress(project uuid)
returns table(id uuid, level text, progress numeric) as $$
  with task_progress as (
    select
      t.id,
      case
        when count(s.id) > 0
          then count(s.id) filter (where s.status = 'done')::numeric / count(s.id)
        when t.status = 'done' then 1
        else 0
      end as progress
    from tasks t
    left join tasks s on s.parent_id = t.id and s.level = 'task'
    where t.project_id = project and t.level = 'story'
    group by t.id, t.status
  ),
  epic_progress as (
    select ph.id, coalesce(avg(tp.progress), 0) as progress
    from tasks ph
    left join tasks tk on tk.parent_id = ph.id and tk.level = 'story'
    left join task_progress tp on tp.id = tk.id
    where ph.project_id = project and ph.level = 'epic'
    group by ph.id
  )
  select id, 'story'::text as level, progress from task_progress
  union all
  select id, 'epic'::text as level, progress from epic_progress;
$$ language sql stable;

-- ---------------------------------------------------------------------------
-- get_task_graph(project): everything the views need in one call:
--   nodes (tasks + progress).
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
