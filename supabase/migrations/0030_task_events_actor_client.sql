-- task-branch: 操作履歴に操作したエージェントを記録する（DESIGN.md §3.2 task_events / §4.2）
--   AI も人の uid で書くため、actor_type / actor_id だけではどのエージェントの操作か分からない。
--   actor_client_id に OAuth の client_id（JWT の client_id）を既定値で入れる。人の操作は null。
--   記録トリガは列を明示しないので既定値で入る。コメントのイベントだけは、元のコメントの author_client_id を入れる。
--   過去分はコメントのイベントだけ task_comments.author_client_id から補完し、他は null のまま。
--   list_project_events に actor（'human' | 'ai'）の絞り込みと、actor_id / actor_client_id / comment_body を足す。
--   列と返り値の項目を足すだけなので、適用前の画面とも互換。

-- 列の追加と既定値を分ける。add column に既定値を付けると、既存行にも適用時の1回の評価値が入るため
alter table task_events
  add column if not exists actor_client_id text;

alter table task_events
  alter column actor_client_id set default current_actor_client_id();

comment on column task_events.actor_client_id is 'AI の操作のとき、操作したエージェント（OAuth の client_id）。人の操作と記録前の AI の操作は null';

-- 補完（制約より先。author_client_id は AI のコメントにしか入らないので制約も満たす）
update task_events e
   set actor_client_id = c.author_client_id
  from task_comments c
 where e.event_type = 'commented'
   and e.comment_id = c.id
   and e.actor_client_id is null
   and c.author_client_id is not null;

alter table task_events
  drop constraint if exists task_events_actor_client_is_ai,
  add constraint task_events_actor_client_is_ai
    check (actor_client_id is null or actor_type = 'ai');

-- task_comments after insert → commented（操作者は元の行の値。エージェントも元のコメントから取る）
create or replace function record_task_commented() returns trigger as $$
begin
  insert into task_events (project_id, task_id, level, event_type, comment_id, actor_type, actor_id, actor_client_id, occurred_at)
  select t.project_id, t.id, t.level, 'commented', new.id, new.author_type, new.author_id, new.author_client_id, new.created_at
    from tasks t
   where t.id = new.task_id;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

-- ---------------------------------------------------------------------------
-- list_project_events
--   引数を足すので、旧シグネチャを消してから作る（残すとオーバーロードになり、PostgREST が呼び分けられない）。
--   actor を渡したら actor_type で絞る（'human' | 'ai'）。操作者が不明な過去分は、絞り込むと出ない。
--   comment_body はコメントの全文、comment_excerpt は本文の先頭 80 文字。コメントが消えていたらどちらも null。
-- ---------------------------------------------------------------------------
drop function if exists list_project_events(uuid, timestamptz, uuid, text[], int);

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
               e.actor_type,
               e.actor_id,
               e.actor_client_id,
               left(c.body, 80)                 as comment_excerpt,
               c.body                           as comment_body
          from task_events e
          join tasks t on t.id = e.task_id
          left join tasks s on s.id = case when t.level = 'story' then t.id else t.parent_id end
          left join task_comments c on c.id = e.comment_id
         where e.project_id = project
           and (before is null or e.occurred_at < before)
           and (story is null or t.id = story or t.parent_id = story)
           and (types is null or e.event_type = any(types))
           and (actor is null or e.actor_type = actor)
         order by e.occurred_at desc, e.id desc
         limit greatest(coalesce(max_rows, 50), 0)
      ) r
  );
end;
$$ language plpgsql stable;
