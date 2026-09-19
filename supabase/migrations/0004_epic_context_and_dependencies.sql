-- task-branch: epic document / comments / revisions, task assignee, task dependencies (DESIGN.md §3)

-- ---------------------------------------------------------------------------
-- who is acting: human or AI, taken from the request JWT (PostgREST).
--   AI accounts carry app_metadata.actor_type = 'ai'; everything else is human.
--   Outside PostgREST (psql, seed) there are no claims → human.
-- ---------------------------------------------------------------------------
create or replace function current_actor_type() returns text as $$
  select case
    when coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
           -> 'app_metadata' ->> 'actor_type' = 'ai' then 'ai'
    else 'human'
  end;
$$ language sql stable;

create or replace function current_actor_id() returns uuid as $$
  select nullif(
    coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb ->> 'sub', ''
  )::uuid;
$$ language sql stable;

-- ---------------------------------------------------------------------------
-- tasks: new columns
--   context       epic only. Markdown document, the source of truth for the epic.
--   activated_at  epic only. null = backlog (inactive), set = active.
--   assignee_*    task only. human / ai, and the human assignee.
-- ---------------------------------------------------------------------------
alter table tasks
  add column if not exists context       text,
  add column if not exists activated_at  timestamptz,
  add column if not exists assignee_type text,
  add column if not exists assignee_id   uuid;

-- Existing epics that already have stories are being worked on → treat them as active.
-- Epics without stories stay in the backlog (activated_at = null).
update tasks e
   set activated_at = e.created_at
 where e.level = 'epic'
   and e.activated_at is null
   and exists (select 1 from tasks s where s.parent_id = e.id and s.level = 'story');

alter table tasks
  add constraint tasks_assignee_type_check
    check (assignee_type in ('human', 'ai')),
  add constraint tasks_epic_only_columns
    check (level = 'epic' or (context is null and activated_at is null)),
  add constraint tasks_task_only_columns
    check (level = 'task' or (assignee_type is null and assignee_id is null)),
  add constraint tasks_assignee_id_is_human
    check (assignee_id is null or assignee_type = 'human');

-- ---------------------------------------------------------------------------
-- task_dependencies: predecessor (前提) → successor (後続), tasks in the same story
-- ---------------------------------------------------------------------------
create table if not exists task_dependencies (
  id             uuid primary key default gen_random_uuid(),
  project_id     uuid not null references projects(id) on delete cascade,
  predecessor_id uuid not null references tasks(id) on delete cascade,
  successor_id   uuid not null references tasks(id) on delete cascade,
  created_at     timestamptz not null default now(),
  unique (predecessor_id, successor_id),
  check (predecessor_id <> successor_id)
);

create index if not exists idx_task_dependencies_project   on task_dependencies(project_id);
create index if not exists idx_task_dependencies_successor on task_dependencies(successor_id);

-- Validated in a trigger so direct REST inserts are checked as well as add_dependency().
create or replace function check_task_dependency() returns trigger as $$
declare
  pred tasks%rowtype;
  succ tasks%rowtype;
begin
  select * into pred from tasks where id = new.predecessor_id;
  select * into succ from tasks where id = new.successor_id;

  if pred.level <> 'task' or succ.level <> 'task' then
    raise exception 'dependencies can only link tasks (got % → %)', pred.level, succ.level;
  end if;
  if pred.parent_id is distinct from succ.parent_id then
    raise exception 'dependencies can only link tasks in the same story';
  end if;
  if pred.project_id <> new.project_id or succ.project_id <> new.project_id then
    raise exception 'dependency project_id must match its tasks';
  end if;

  -- Cycle check: is the predecessor already reachable from the successor?
  if exists (
    with recursive reach(id) as (
      select d.successor_id from task_dependencies d where d.predecessor_id = new.successor_id
      union
      select d.successor_id from task_dependencies d join reach r on d.predecessor_id = r.id
    )
    select 1 from reach where id = new.predecessor_id
  ) then
    raise exception 'dependency would create a cycle';
  end if;

  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_task_dependencies_check on task_dependencies;
create trigger trg_task_dependencies_check before insert or update on task_dependencies
  for each row execute function check_task_dependency();

-- Moving a task to another story would leave cross-story edges behind; refuse instead of dropping them silently.
create or replace function check_task_move_with_dependencies() returns trigger as $$
begin
  if new.parent_id is distinct from old.parent_id and exists (
    select 1 from task_dependencies where predecessor_id = new.id or successor_id = new.id
  ) then
    raise exception 'remove the dependencies of task % before moving it to another story', new.id;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_tasks_move_dependencies on tasks;
create trigger trg_tasks_move_dependencies before update of parent_id on tasks
  for each row execute function check_task_move_with_dependencies();

-- add_dependency(pred, succ): entry point for AI / UI. Validation lives in the trigger.
create or replace function add_dependency(pred uuid, succ uuid)
returns task_dependencies as $$
  insert into task_dependencies (project_id, predecessor_id, successor_id)
  select t.project_id, pred, succ from tasks t where t.id = pred
  returning *;
$$ language sql;

-- ---------------------------------------------------------------------------
-- epic_comments: append-only notes / opinions on an epic (context is the source of truth)
-- ---------------------------------------------------------------------------
create table if not exists epic_comments (
  id          uuid primary key default gen_random_uuid(),
  epic_id     uuid not null references tasks(id) on delete cascade,
  author_type text not null default current_actor_type() check (author_type in ('human', 'ai')),
  author_id   uuid default current_actor_id(),
  body        text not null,
  created_at  timestamptz not null default now()
);

create index if not exists idx_epic_comments_epic on epic_comments(epic_id, created_at);

create or replace function check_epic_comment() returns trigger as $$
begin
  if tg_op = 'UPDATE' then
    raise exception 'epic comments are append-only';
  end if;
  if not exists (select 1 from tasks where id = new.epic_id and level = 'epic') then
    raise exception 'comments can only be attached to an epic';
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_epic_comments_check on epic_comments;
create trigger trg_epic_comments_check before insert or update on epic_comments
  for each row execute function check_epic_comment();

-- ---------------------------------------------------------------------------
-- epic_context_revisions: every saved version of tasks.context (latest included)
-- ---------------------------------------------------------------------------
create table if not exists epic_context_revisions (
  id             uuid primary key default gen_random_uuid(),
  epic_id        uuid not null references tasks(id) on delete cascade,
  version        int  not null,
  context        text not null,
  edited_by_type text not null check (edited_by_type in ('human', 'ai')),
  edited_by_id   uuid,
  created_at     timestamptz not null default now(),
  unique (epic_id, version)
);

-- Saved by a trigger so human and AI edits (UI, MCP, direct REST) are all captured.
create or replace function save_epic_context_revision() returns trigger as $$
begin
  if new.level = 'epic' and new.context is not null
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

drop trigger if exists trg_tasks_context_revision on tasks;
create trigger trg_tasks_context_revision after insert or update of context on tasks
  for each row execute function save_epic_context_revision();

-- ---------------------------------------------------------------------------
-- get_task_graph(project): nodes (with assignee / activation) + dependency edges.
--   context is intentionally left out (long text; fetched only where needed).
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
    ), '[]'::jsonb),
    'edges', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', d.id,
        'predecessor_id', d.predecessor_id,
        'successor_id', d.successor_id
      ) order by d.created_at)
      from task_dependencies d
      where d.project_id = project
    ), '[]'::jsonb)
  ) into result;

  return result;
end;
$$ language plpgsql stable;

-- ---------------------------------------------------------------------------
-- export_project(project): add epic context / activation, task assignee and dependencies.
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
      'depends_on', coalesce((
        select jsonb_agg(d.predecessor_id order by d.created_at)
        from task_dependencies d where d.successor_id = t.id
      ), '[]'::jsonb),
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
    'version', 2,
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
