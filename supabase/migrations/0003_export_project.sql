-- task-branch: project export RPC

-- ---------------------------------------------------------------------------
-- export_project(project): one project as a nested JSON document
--   { format, version, exported_at, project: {...},
--     epics: [ { ..., stories: [ { ..., tasks: [ {...} ] } ] } ] }
--   progress is taken from get_progress (epic / story only).
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
    'version', 1,
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
