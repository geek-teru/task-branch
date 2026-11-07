-- task-branch: 操作履歴 task_events とその記録トリガ（DESIGN.md §3.2 / §3.5）
--   作成・ステータス変更・着手/棚上げ・コメント追加・コンテキスト更新を、トリガで1行ずつ記録する。
--   アプリ・MCP 側では書かない（漏れを防ぐ）。書き込みはトリガ（security definer）だけ。
--   新しいテーブルとトリガを足すだけなので、適用前の画面・MCP とも互換。

-- ---------------------------------------------------------------------------
-- task_events: ストーリーもタスクも tasks の行なので task_id で指す。
--   level は記録した時点の level。補完分で操作者が不明なものは actor_* が null。
-- ---------------------------------------------------------------------------
create table if not exists task_events (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references projects(id) on delete cascade,
  task_id     uuid not null references tasks(id) on delete cascade,
  level       text not null check (level in ('story', 'task')),
  event_type  text not null check (event_type in
                ('created', 'status_changed', 'activated', 'deactivated', 'commented', 'context_updated')),
  from_status text,
  to_status   text,
  comment_id  uuid references task_comments(id) on delete set null,
  actor_type  text check (actor_type in ('human', 'ai')),
  actor_id    uuid,
  occurred_at timestamptz not null default now()
);

create index if not exists idx_task_events_project on task_events(project_id, occurred_at desc);
create index if not exists idx_task_events_task    on task_events(task_id, occurred_at desc);

-- ---------------------------------------------------------------------------
-- RLS: 所有者の select だけ。insert / update / delete のポリシーは作らない（トリガだけが書く）。
-- ---------------------------------------------------------------------------
alter table task_events enable row level security;

drop policy if exists task_events_select on task_events;
create policy task_events_select on task_events
  for select to authenticated
  using (exists (
    select 1 from projects p
     where p.id = task_events.project_id
       and p.owner_id = current_owner_id()
  ));

-- ---------------------------------------------------------------------------
-- 記録トリガ（security definer。RLS を越えて書く）
-- ---------------------------------------------------------------------------
-- tasks after insert → created（日時は created_at。seed のサンプルも作成日どおりに並ぶ）
create or replace function record_task_created() returns trigger as $$
begin
  insert into task_events (project_id, task_id, level, event_type, actor_type, actor_id, occurred_at)
  values (new.project_id, new.id, new.level, 'created', current_actor_type(), current_actor_id(), new.created_at);
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists trg_tasks_event_created on tasks;
create trigger trg_tasks_event_created after insert on tasks
  for each row execute function record_task_created();

-- tasks after update of status → status_changed
create or replace function record_task_status_changed() returns trigger as $$
begin
  if old.status is distinct from new.status then
    insert into task_events (project_id, task_id, level, event_type, from_status, to_status, actor_type, actor_id)
    values (new.project_id, new.id, new.level, 'status_changed', old.status, new.status,
            current_actor_type(), current_actor_id());
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists trg_tasks_event_status on tasks;
create trigger trg_tasks_event_status after update of status on tasks
  for each row execute function record_task_status_changed();

-- tasks after update of activated_at（story のみ。null ↔ 非 null の変化だけ）→ activated / deactivated
create or replace function record_story_activation() returns trigger as $$
begin
  if new.level = 'story' and (old.activated_at is null) is distinct from (new.activated_at is null) then
    insert into task_events (project_id, task_id, level, event_type, actor_type, actor_id)
    values (new.project_id, new.id, 'story',
            case when new.activated_at is null then 'deactivated' else 'activated' end,
            current_actor_type(), current_actor_id());
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists trg_tasks_event_activation on tasks;
create trigger trg_tasks_event_activation after update of activated_at on tasks
  for each row execute function record_story_activation();

-- task_comments after insert → commented（操作者は元の行の値）
create or replace function record_task_commented() returns trigger as $$
begin
  insert into task_events (project_id, task_id, level, event_type, comment_id, actor_type, actor_id, occurred_at)
  select t.project_id, t.id, t.level, 'commented', new.id, new.author_type, new.author_id, new.created_at
    from tasks t
   where t.id = new.task_id;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists trg_task_comments_event on task_comments;
create trigger trg_task_comments_event after insert on task_comments
  for each row execute function record_task_commented();

-- story_context_revisions after insert → context_updated（操作者は元の行の値）
create or replace function record_story_context_updated() returns trigger as $$
begin
  insert into task_events (project_id, task_id, level, event_type, actor_type, actor_id, occurred_at)
  select t.project_id, t.id, 'story', 'context_updated', new.edited_by_type, new.edited_by_id, new.created_at
    from tasks t
   where t.id = new.story_id;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists trg_story_context_revisions_event on story_context_revisions;
create trigger trg_story_context_revisions_event after insert on story_context_revisions
  for each row execute function record_story_context_updated();
