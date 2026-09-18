-- task-branch: core schema
-- projects 1 --< tasks (self-referencing tree via parent_id)

create extension if not exists "pgcrypto"; -- gen_random_uuid()

-- ---------------------------------------------------------------------------
-- projects
-- ---------------------------------------------------------------------------
create table if not exists projects (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- tasks (all 3 levels: epic / story / task)
-- ---------------------------------------------------------------------------
create table if not exists tasks (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references projects(id) on delete cascade,
  parent_id    uuid references tasks(id) on delete cascade,
  level        text not null check (level in ('epic','story','task')),
  title        text not null,
  description  text,
  status       text not null default 'todo' check (status in ('todo','in_progress','done')),
  sort_order   int  not null default 0,
  -- extensibility (nullable, unused initially): gantt / calendar
  start_date   date,
  due_date     date,
  -- free-form future attributes (color, tags, external ids, view settings...)
  metadata     jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists idx_tasks_project on tasks(project_id);
create index if not exists idx_tasks_parent  on tasks(parent_id);
create index if not exists idx_tasks_level    on tasks(project_id, level);
create index if not exists idx_tasks_status   on tasks(project_id, status);

-- ---------------------------------------------------------------------------
-- updated_at maintenance + completed_at auto-set
-- ---------------------------------------------------------------------------
create or replace function touch_updated_at() returns trigger as $$
begin
  new.updated_at := now();
  -- auto stamp completion time on transition into 'done'; clear it otherwise
  if new.status = 'done' then
    if tg_op = 'INSERT' or old.status is distinct from 'done' then
      new.completed_at := coalesce(new.completed_at, now());
    end if;
  else
    new.completed_at := null;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_tasks_touch on tasks;
create trigger trg_tasks_touch before insert or update on tasks
  for each row execute function touch_updated_at();

create or replace function touch_projects_updated_at() returns trigger as $$
begin
  new.updated_at := now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_projects_touch on projects;
create trigger trg_projects_touch before update on projects
  for each row execute function touch_projects_updated_at();

-- ---------------------------------------------------------------------------
-- hierarchy integrity: epic > story > task, and parent within same project
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

drop trigger if exists trg_tasks_hierarchy on tasks;
create trigger trg_tasks_hierarchy before insert or update of level, parent_id, project_id on tasks
  for each row execute function check_task_hierarchy();
