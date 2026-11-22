-- task-branch: タスクのストーリー移動を操作履歴に記録する（DESIGN.md §3.2 task_events / §4.2）
--   tasks.parent_id が変わったタスク（level = 'task'）を event_type = 'moved' で1行記録する。
--   移動元・移動先のストーリーは from_story_id / to_story_id に残す（ストーリーが消えたら null）。
--   list_project_events は移動元・移動先の id と名前を返し、ストーリーで絞ると移動元・移動先のどちらでも出る。
--   列・event_type・返り値の項目を足すだけなので、適用前の画面・MCP とも互換。既存のイベント・補完分は触らない。

alter table task_events
  add column if not exists from_story_id uuid references tasks(id) on delete set null,
  add column if not exists to_story_id   uuid references tasks(id) on delete set null;

comment on column task_events.from_story_id is 'moved のとき、移動元のストーリー。消えていたら null';
comment on column task_events.to_story_id   is 'moved のとき、移動先のストーリー。消えていたら null';

alter table task_events
  drop constraint if exists task_events_event_type_check,
  add constraint task_events_event_type_check
    check (event_type in
      ('created', 'status_changed', 'activated', 'deactivated', 'commented', 'context_updated', 'moved'));

-- tasks after update of parent_id（task のみ）→ moved
--   付け替え先が同じプロジェクトのストーリーであることは check_task_hierarchy が保証する。
--   actor_client_id は列の既定値（JWT の client_id）で入る。
create or replace function record_task_moved() returns trigger as $$
begin
  if new.level = 'task' and old.parent_id is distinct from new.parent_id then
    insert into task_events (project_id, task_id, level, event_type, from_story_id, to_story_id, actor_type, actor_id)
    values (new.project_id, new.id, 'task', 'moved', old.parent_id, new.parent_id,
            current_actor_type(), current_actor_id());
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists trg_tasks_event_moved on tasks;
create trigger trg_tasks_event_moved after update of parent_id on tasks
  for each row execute function record_task_moved();

-- ---------------------------------------------------------------------------
-- list_project_events
--   シグネチャは 0030 と同じなので create or replace でよい（grant もそのまま残る）。
--   from_story_id / from_story_title / to_story_id / to_story_title を足す（moved 以外は null）。
--   story で絞るとき、移動元・移動先がそのストーリーのイベントも含める。
-- ---------------------------------------------------------------------------
create or replace function list_project_events(
  project  uuid,
  before   timestamptz default null,
  story    uuid default null,
  types    text[] default null,
  max_rows int default 50,
  actor    text default null
) returns jsonb as $$
begin
  if actor is not null and actor not in ('human', 'ai') then
    raise exception 'actor は human か ai を指定してください: %', actor;
  end if;

  return (
    select coalesce(jsonb_agg(row_to_json(r)::jsonb order by r.occurred_at desc, r.id desc), '[]'::jsonb)
      from (
        select e.id,
               e.occurred_at,
               e.event_type,
               e.level,
               e.task_id,
               t.title                          as task_title,
               s.id                             as story_id,
               s.title                          as story_title,
               e.from_status,
               e.to_status,
               e.from_story_id,
               fs.title                         as from_story_title,
               e.to_story_id,
               ts.title                         as to_story_title,
               e.actor_type,
               e.actor_id,
               e.actor_client_id,
               left(c.body, 80)                 as comment_excerpt,
               c.body                           as comment_body
          from task_events e
          join tasks t on t.id = e.task_id
          left join tasks s on s.id = case when t.level = 'story' then t.id else t.parent_id end
          left join tasks fs on fs.id = e.from_story_id
          left join tasks ts on ts.id = e.to_story_id
          left join task_comments c on c.id = e.comment_id
         where e.project_id = project
           and (before is null or e.occurred_at < before)
           and (story is null or t.id = story or t.parent_id = story
                or e.from_story_id = story or e.to_story_id = story)
           and (types is null or e.event_type = any(types))
           and (actor is null or e.actor_type = actor)
         order by e.occurred_at desc, e.id desc
         limit greatest(coalesce(max_rows, 50), 0)
      ) r
  );
end;
$$ language plpgsql stable;
