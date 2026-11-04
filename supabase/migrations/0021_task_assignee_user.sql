-- task-branch: タスクの担当ユーザー（DESIGN.md §3.2 / §3.5）
--   0004 で足した tasks.assignee_id に auth.users への参照を付ける。ユーザーが消えたら未割り当てに戻す。
--   割り当てられるのはそのタスクのプロジェクトの持ち主だけ（プロジェクトは持ち主1人で、共有が無いため）。
--   編集できる人は RLS tasks_owner（持ち主のみ）のまま。
--   適用前に、持ち主以外を指す assignee_id が無いこと（あると FK かトリガーの検査で失敗する）。

alter table tasks
  drop constraint if exists tasks_assignee_id_fkey,
  add constraint tasks_assignee_id_fkey
    foreign key (assignee_id) references auth.users(id) on delete set null;

create index if not exists idx_tasks_assignee on tasks(assignee_id);

comment on column tasks.assignee_id is 'task のみ。人が担当する場合の担当者（auth.users.id）。プロジェクトの持ち主だけ';

-- assignee_id はプロジェクトの持ち主であること。
create or replace function check_task_assignee() returns trigger as $$
declare
  project_owner uuid;
begin
  if new.assignee_id is null then
    return new;
  end if;

  select owner_id into project_owner from projects where id = new.project_id;

  if project_owner is distinct from new.assignee_id then
    raise exception 'the assignee must be the owner of the project';
  end if;

  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_tasks_assignee on tasks;
create trigger trg_tasks_assignee before insert or update of assignee_id, project_id on tasks
  for each row execute function check_task_assignee();
