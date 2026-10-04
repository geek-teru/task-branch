-- task-branch: closed status (DESIGN.md §3)
--   todo → in_progress → done → closed。done は「終わったが未承認」でカンバンに残し、
--   承認を得たら closed にしてボードから外す（カンバンのトグルでのみ表示）。
--   制約を広げ列を足すだけなので、適用前の画面とも互換。

-- ---------------------------------------------------------------------------
-- status: closed を許可し、承認（クローズ）した日時を残す列を足す。
-- ---------------------------------------------------------------------------
alter table tasks drop constraint if exists tasks_status_check;
alter table tasks
  add constraint tasks_status_check check (status in ('todo','in_progress','done','closed'));

alter table tasks
  add column if not exists closed_at timestamptz;

comment on column tasks.closed_at is 'closed になった日時（closed 以外では null）';

-- ---------------------------------------------------------------------------
-- updated_at maintenance + completed_at / closed_at auto-set
--   completed_at は done / closed の間は保持する（done → closed で消さない）。
-- ---------------------------------------------------------------------------
create or replace function touch_updated_at() returns trigger as $$
begin
  new.updated_at := now();
  if new.status in ('done', 'closed') then
    if tg_op = 'INSERT' or old.status not in ('done', 'closed') then
      new.completed_at := coalesce(new.completed_at, now());
    end if;
  else
    new.completed_at := null;
  end if;
  if new.status = 'closed' then
    if tg_op = 'INSERT' or old.status is distinct from 'closed' then
      new.closed_at := coalesce(new.closed_at, now());
    end if;
  else
    new.closed_at := null;
  end if;
  return new;
end;
$$ language plpgsql;

-- ---------------------------------------------------------------------------
-- get_progress(project): closed も完了として数える（クローズで進捗が下がらないように）。
-- ---------------------------------------------------------------------------
create or replace function get_progress(project uuid)
returns table(id uuid, level text, progress numeric) as $$
  with task_progress as (
    select
      t.id,
      case
        when count(s.id) > 0
          then count(s.id) filter (where s.status in ('done', 'closed'))::numeric / count(s.id)
        when t.status in ('done', 'closed') then 1
        else 0
      end as progress
    from tasks t
    left join tasks s on s.parent_id = t.id and s.level = 'task'
    where t.project_id = project and t.level = 'story'
    group by t.id, t.status
  ),
  epic_progress as (
    select ph.id, coalesce(avg(tp.progress), 0) as progress
    from tasks ph
    left join tasks tk on tk.parent_id = ph.id and tk.level = 'story'
    left join task_progress tp on tp.id = tk.id
    where ph.project_id = project and ph.level = 'epic'
    group by ph.id
  )
  select id, 'story'::text as level, progress from task_progress
  union all
  select id, 'epic'::text as level, progress from epic_progress;
$$ language sql stable;
