-- task-branch: パフォーマンス画面の「すべてのプロジェクト」（DESIGN.md §4.2 project_activity_counts）
--   project に null を渡したら、呼び出したユーザーが見えるすべてのプロジェクト（task_events の RLS の範囲）を合わせて数える。
--   範囲はカンバンの「すべてのプロジェクト」と同じで、アーカイブ済みのプロジェクトも含む。
--   シグネチャは変えないので create or replace でよい（grant もそのまま残る）。

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
     where (project is null or e.project_id = project)
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
