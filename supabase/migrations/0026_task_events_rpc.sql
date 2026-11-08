-- task-branch: タイムライン・集計用 RPC（DESIGN.md §4.2）
--   - list_project_events: プロジェクトの操作を新しい順に、カーソル（before）で max_rows 件ずつ返す
--   - project_activity_counts: 日 / 週ごとのストーリー作成・タスク作成・タスク完了の件数
--   どちらも security invoker（既定）。task_events_select の RLS がそのまま効き、所有者の行だけが見える。

-- ---------------------------------------------------------------------------
-- list_project_events
--   story を渡したら、そのストーリー自身と配下タスクのイベントだけ。types を渡したら event_type で絞る。
--   comment_excerpt は本文の先頭 80 文字。コメントが消えていたら null。
-- ---------------------------------------------------------------------------
create or replace function list_project_events(
  project  uuid,
  before   timestamptz default null,
  story    uuid default null,
  types    text[] default null,
  max_rows int default 50
) returns jsonb as $$
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
             left(c.body, 80)                 as comment_excerpt
        from task_events e
        join tasks t on t.id = e.task_id
        left join tasks s on s.id = case when t.level = 'story' then t.id else t.parent_id end
        left join task_comments c on c.id = e.comment_id
       where e.project_id = project
         and (before is null or e.occurred_at < before)
         and (story is null or t.id = story or t.parent_id = story)
         and (types is null or e.event_type = any(types))
       order by e.occurred_at desc, e.id desc
       limit greatest(coalesce(max_rows, 50), 0)
    ) r;
$$ language sql stable;

-- ---------------------------------------------------------------------------
-- project_activity_counts
--   bucket は 'day' | 'week'（週は月曜始まり）。区切りは Asia/Tokyo。
--   from_date〜to_date（両端含む）を generate_series で埋め、イベントが無い区間も 0 で返す。
-- ---------------------------------------------------------------------------
create or replace function project_activity_counts(
  project   uuid,
  bucket    text,
  from_date date,
  to_date   date
) returns table (
  bucket_start    date,
  stories_created bigint,
  tasks_created   bigint,
  tasks_done      bigint
) as $$
begin
  if bucket not in ('day', 'week') then
    raise exception 'bucket は day か week を指定してください: %', bucket;
  end if;

  return query
  with series as (
    select d::date as b
      from generate_series(date_trunc(bucket, from_date::timestamp),
                           date_trunc(bucket, to_date::timestamp),
                           ('1 ' || bucket)::interval) d
  ),
  ev as (
    select date_trunc(bucket, e.occurred_at at time zone 'Asia/Tokyo')::date as b,
           e.event_type, e.level, e.to_status
      from task_events e
     where e.project_id = project
       and (e.occurred_at at time zone 'Asia/Tokyo')::date between from_date and to_date
  )
  select s.b,
         count(*) filter (where ev.event_type = 'created' and ev.level = 'story'),
         count(*) filter (where ev.event_type = 'created' and ev.level = 'task'),
         count(*) filter (where ev.event_type = 'status_changed' and ev.to_status = 'done' and ev.level = 'task')
    from series s
    left join ev on ev.b = s.b
   group by s.b
   order by s.b;
end;
$$ language plpgsql stable;
