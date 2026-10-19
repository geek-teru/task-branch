-- task-branch: エピック階層を削除し、story > task の2段にする（DESIGN.md §1.3.1 の段階③）
--   画面・サンプルデータ・設計書の2段化と同じリリースで入れる（履歴テーブルの名前が変わるため）。
--   - ストーリーの sort_order を、エピックがあったときの並び（エピック順 → エピック内の順、親なしは最後）で振り直す
--   - 配下にストーリーがないエピックは、そのままストーリーに変換する（名前・説明・context・activated_at・履歴を残す）
--   - それ以外のストーリーは親なしにしてから、エピックを削除する（エピックの履歴・コメントも消える）
--   - level・check_task_hierarchy()・tasks_context_columns を2段にする
--   - epic_context_revisions を story_context_revisions（列 story_id）に付け替える。トリガ関数とポリシーも合わせる
--   - get_progress() からエピックの進捗をなくし、export_project() を最上位 stories の2段（version 4）にする

-- ---------------------------------------------------------------------------
-- sort_order: プロジェクトごとに 1 から振り直す。ストーリーがないエピックは、エピックの位置に1件として入る。
-- ---------------------------------------------------------------------------
with keyed as (
  select x.id,
         row_number() over (
           partition by x.project_id
           order by x.root_last, x.group_order, x.group_created, x.group_id, x.item_order, x.item_created, x.id
         ) as new_order
    from (
      select s.id, s.project_id,
             case when e.id is null then 1 else 0 end as root_last,
             e.sort_order as group_order, e.created_at as group_created, e.id as group_id,
             s.sort_order as item_order, s.created_at as item_created
        from tasks s
        left join tasks e on e.id = s.parent_id and e.level = 'epic'
       where s.level = 'story'
      union all
      select e.id, e.project_id,
             0,
             e.sort_order, e.created_at, e.id,
             0, e.created_at
        from tasks e
       where e.level = 'epic'
         and not exists (select 1 from tasks s where s.parent_id = e.id and s.level = 'story')
    ) x
)
update tasks t
   set sort_order = k.new_order
  from keyed k
 where t.id = k.id;

-- ---------------------------------------------------------------------------
-- ストーリーがないエピックをストーリーに変換する（id が同じなので context の履歴もそのまま付いてくる）。
-- ---------------------------------------------------------------------------
update tasks e
   set level = 'story'
 where e.level = 'epic'
   and not exists (select 1 from tasks s where s.parent_id = e.id and s.level = 'story');

-- ---------------------------------------------------------------------------
-- 残りのエピックからストーリーを外し、エピックを削除する。
--   エピックの context と activated_at は段階②（0016）で配下のストーリーへ複製済み。
-- ---------------------------------------------------------------------------
update tasks s
   set parent_id = null
  from tasks e
 where s.parent_id = e.id
   and s.level = 'story'
   and e.level = 'epic';

delete from tasks where level = 'epic';

-- ---------------------------------------------------------------------------
-- tasks: level は story / task だけ。context / activated_at は story だけが持てる。
-- ---------------------------------------------------------------------------
alter table tasks drop constraint if exists tasks_level_check;
alter table tasks
  add constraint tasks_level_check check (level in ('story', 'task'));

alter table tasks drop constraint if exists tasks_context_columns;
alter table tasks
  add constraint tasks_context_columns
    check (level = 'story' or (context is null and activated_at is null));

-- ---------------------------------------------------------------------------
-- check_task_hierarchy(): story は親なし（ルート）、task の親は同じプロジェクトの story。
-- ---------------------------------------------------------------------------
create or replace function check_task_hierarchy() returns trigger as $$
declare
  parent_level text;
  parent_project uuid;
begin
  if new.level = 'story' then
    if new.parent_id is not null then
      raise exception 'story must be a root (parent_id must be null)';
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

  if new.level = 'task' and parent_level <> 'story' then
    raise exception 'task parent must be a story (got %)', parent_level;
  end if;

  return new;
end;
$$ language plpgsql;

-- ---------------------------------------------------------------------------
-- epic_context_revisions → story_context_revisions（epic_id → story_id）。制約名も合わせる。
-- ---------------------------------------------------------------------------
alter table epic_context_revisions rename to story_context_revisions;
alter table story_context_revisions rename column epic_id to story_id;
alter table story_context_revisions rename constraint epic_context_revisions_pkey to story_context_revisions_pkey;
alter table story_context_revisions rename constraint epic_context_revisions_epic_id_version_key to story_context_revisions_story_id_version_key;
alter table story_context_revisions rename constraint epic_context_revisions_epic_id_fkey to story_context_revisions_story_id_fkey;
alter table story_context_revisions rename constraint epic_context_revisions_edited_by_type_check to story_context_revisions_edited_by_type_check;

-- context の保存で版を足すトリガ。story だけが対象。
drop trigger if exists trg_tasks_context_revision on tasks;
drop function if exists save_epic_context_revision();

create or replace function save_story_context_revision() returns trigger as $$
begin
  if new.level = 'story' and new.context is not null
     and (tg_op = 'INSERT' or new.context is distinct from old.context) then
    insert into story_context_revisions (story_id, version, context, edited_by_type, edited_by_id)
    values (
      new.id,
      coalesce((select max(version) from story_context_revisions where story_id = new.id), 0) + 1,
      new.context,
      current_actor_type(),
      current_actor_id()
    );
  end if;
  return new;
end;
$$ language plpgsql;

create trigger trg_tasks_context_revision after insert or update of context on tasks
  for each row execute function save_story_context_revision();

-- RLS: 中身は 0012 と同じ（所有者だけが読み、足せる。update / delete はポリシーを作らない）。名前だけ付け替える。
drop policy if exists epic_context_revisions_select on story_context_revisions;
drop policy if exists epic_context_revisions_insert on story_context_revisions;

drop policy if exists story_context_revisions_select on story_context_revisions;
create policy story_context_revisions_select on story_context_revisions
  for select to authenticated
  using (exists (
    select 1 from tasks t
      join projects p on p.id = t.project_id
     where t.id = story_context_revisions.story_id
       and p.owner_id = current_owner_id()
  ));

drop policy if exists story_context_revisions_insert on story_context_revisions;
create policy story_context_revisions_insert on story_context_revisions
  for insert to authenticated
  with check (
    edited_by_id = auth.uid()
    and edited_by_type = current_actor_type()
    and exists (
      select 1 from tasks t
        join projects p on p.id = t.project_id
       where t.id = story_context_revisions.story_id
         and p.owner_id = current_owner_id()
    )
  );

-- ---------------------------------------------------------------------------
-- get_progress(project): story の進捗だけを返す（戻り値の形は変えない）。
--   story progress = done / closed のタスク数 / タスク数（タスクがなければ自身の status）
-- ---------------------------------------------------------------------------
create or replace function get_progress(project uuid)
returns table(id uuid, level text, progress numeric) as $$
  select
    t.id,
    'story'::text as level,
    case
      when count(s.id) > 0
        then count(s.id) filter (where s.status in ('done', 'closed'))::numeric / count(s.id)
      when t.status in ('done', 'closed') then 1
      else 0
    end as progress
  from tasks t
  left join tasks s on s.parent_id = t.id and s.level = 'task'
  where t.project_id = project and t.level = 'story'
  group by t.id, t.status;
$$ language sql stable;

-- ---------------------------------------------------------------------------
-- export_project(project): { project, stories: [ { ..., tasks: [...] } ] } の2段（version 4）。epics はなくす。
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
  )
  select jsonb_build_object(
    'format', 'task-branch/project',
    'version', 4,
    'exported_at', now(),
    'project', jsonb_build_object(
      'id', p.id,
      'name', p.name,
      'description', p.description,
      'created_at', p.created_at
    ),
    'stories', coalesce((
      select jsonb_agg(jsonb_build_object(
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
      ) order by s.sort_order, s.created_at)
      from tasks s
      left join pr on pr.id = s.id
      left join task_nodes tn on tn.parent_id = s.id
      where s.project_id = project and s.level = 'story'
    ), '[]'::jsonb)
  )
  from projects p
  where p.id = project;
$$ language sql stable;
