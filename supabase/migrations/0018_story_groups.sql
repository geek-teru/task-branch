-- task-branch: ストーリーのグループ（DESIGN.md §3.2 / §3.5）
--   ガントチャートでストーリーをまとめて見せるための入れ物。状態・期間・コンテキストは持たない
--   （期間は中のストーリーから画面で算出する）。
--   tasks.group_id は level = 'story' の行だけが持てる。グループを消すとストーリーはグループなしに戻る。
--   get_task_graph は nodes に group_id を足し、groups を返す。列とキーを足すだけなので、適用前の画面とも互換。

-- ---------------------------------------------------------------------------
-- story_groups
-- ---------------------------------------------------------------------------
create table if not exists story_groups (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references projects(id) on delete cascade,
  name        text not null check (length(btrim(name)) > 0),
  sort_order  int  not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_story_groups_project on story_groups(project_id, sort_order);

-- touch_updated_at() は tasks の status を見るので使えない。列を持たない projects と同じ関数を使う。
drop trigger if exists trg_story_groups_touch on story_groups;
create trigger trg_story_groups_touch before update on story_groups
  for each row execute function touch_projects_updated_at();

-- ---------------------------------------------------------------------------
-- tasks.group_id: ストーリーが属するグループ（null ＝ グループなし）
-- ---------------------------------------------------------------------------
alter table tasks
  add column if not exists group_id uuid references story_groups(id) on delete set null;

create index if not exists idx_tasks_group on tasks(group_id);

comment on column tasks.group_id is 'story のみ。属するグループ（story_groups.id）。null はグループなし';

-- group_id を持てるのは story だけ。グループとストーリーは同じプロジェクトに属すること。
create or replace function check_task_group() returns trigger as $$
declare
  group_project uuid;
begin
  if new.group_id is null then
    return new;
  end if;

  if new.level <> 'story' then
    raise exception 'only a story can belong to a group (got %)', new.level;
  end if;

  select project_id into group_project from story_groups where id = new.group_id;

  if group_project is null then
    raise exception 'story group % not found', new.group_id;
  end if;
  if group_project <> new.project_id then
    raise exception 'story group must belong to the same project';
  end if;

  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_tasks_group on tasks;
create trigger trg_tasks_group before insert or update of group_id, level, project_id on tasks
  for each row execute function check_task_group();

-- グループのプロジェクトは付け替えさせない（中のストーリーとプロジェクトがずれるため）。
create or replace function check_story_group() returns trigger as $$
begin
  if new.project_id is distinct from old.project_id then
    raise exception 'the project of a story group cannot be changed';
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_story_groups_check on story_groups;
create trigger trg_story_groups_check before update of project_id on story_groups
  for each row execute function check_story_group();

-- ---------------------------------------------------------------------------
-- RLS: 属するプロジェクトの所有者だけが読み書きできる（tasks_owner と同じ）。
-- ---------------------------------------------------------------------------
alter table story_groups enable row level security;

drop policy if exists story_groups_owner on story_groups;
create policy story_groups_owner on story_groups
  for all to authenticated
  using (exists (
    select 1 from projects p
     where p.id = story_groups.project_id
       and p.owner_id = current_owner_id()
  ))
  with check (exists (
    select 1 from projects p
     where p.id = story_groups.project_id
       and p.owner_id = current_owner_id()
  ));

-- ---------------------------------------------------------------------------
-- get_task_graph(project): nodes に group_id を足し、groups を返す。
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
