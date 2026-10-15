-- task-branch: ストーリーにコンテキスト・着手日時・更新履歴を持たせる（DESIGN.md §1.3.1 の段階①）
--   階層を story > task の2段にする移行の1段目。エピックはまだ残し、旧画面はそのまま動く。
--   - context / activated_at を story にも持てるようにする（制約の付け替え）
--   - context の更新履歴を story でも残す（テーブル epic_context_revisions・列 epic_id はそのまま。名前は段階③で付け替える）
--   - story を親なし（ルート）でも作れるようにする
--   - export_project の stories に context / activated_at を足し、親なしストーリーを最上位の stories に出す
--   データ（エピックのコンテキストの複製）はここでは動かさない（段階②）。

-- ---------------------------------------------------------------------------
-- tasks: context / activated_at は epic と story が持てる。
-- ---------------------------------------------------------------------------
alter table tasks drop constraint if exists tasks_epic_only_columns;
alter table tasks
  add constraint tasks_context_columns
    check (level in ('epic', 'story') or (context is null and activated_at is null));

-- ---------------------------------------------------------------------------
-- save_epic_context_revision(): story の context の保存でも版を残す。
-- ---------------------------------------------------------------------------
create or replace function save_epic_context_revision() returns trigger as $$
begin
  if new.level in ('epic', 'story') and new.context is not null
     and (tg_op = 'INSERT' or new.context is distinct from old.context) then
    insert into epic_context_revisions (epic_id, version, context, edited_by_type, edited_by_id)
    values (
      new.id,
      coalesce((select max(version) from epic_context_revisions where epic_id = new.id), 0) + 1,
      new.context,
      current_actor_type(),
      current_actor_id()
    );
  end if;
  return new;
end;
$$ language plpgsql;

-- ---------------------------------------------------------------------------
-- check_task_hierarchy(): story は親なし（ルート）も許す。親があるなら epic のみ。task の親は story のまま。
-- ---------------------------------------------------------------------------
create or replace function check_task_hierarchy() returns trigger as $$
declare
  parent_level text;
  parent_project uuid;
begin
  if new.level = 'epic' then
    if new.parent_id is not null then
      raise exception 'epic must be a root (parent_id must be null)';
    end if;
    return new;
  end if;

  if new.level = 'story' and new.parent_id is null then
    return new;
  end if;

  if new.parent_id is null then
    raise exception '% must have a parent', new.level;
  end if;

  select level, project_id into parent_level, parent_project
  from tasks where id = new.parent_id;

  if parent_level is null then
    raise exception 'parent task % not found', new.parent_id;
  end if;
  if parent_project <> new.project_id then
    raise exception 'parent must belong to the same project';
  end if;

  if new.level = 'story' and parent_level <> 'epic' then
    raise exception 'story parent must be an epic (got %)', parent_level;
  end if;
  if new.level = 'task' and parent_level <> 'story' then
    raise exception 'task parent must be a story (got %)', parent_level;
  end if;

  return new;
end;
$$ language plpgsql;

-- ---------------------------------------------------------------------------
-- export_project(project): stories に context / activated_at を足し、親なしストーリーを最上位の stories に出す。
--   epics はそのまま残す（形は段階③で決める）。
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
      'context', s.context,
      'activated_at', s.activated_at,
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
    ), '[]'::jsonb),
    'stories', coalesce((select sn.stories from story_nodes sn where sn.parent_id is null), '[]'::jsonb)
  )
  from projects p
  where p.id = project;
$$ language sql stable;
