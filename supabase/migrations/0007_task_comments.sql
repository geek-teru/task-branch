-- task-branch: task comments (DESIGN.md §3)

-- ---------------------------------------------------------------------------
-- task_comments: notes / discussion on a task (level = 'task' only).
--   Unlike epic_comments, the body can be edited; who wrote it and when cannot.
-- ---------------------------------------------------------------------------
create table if not exists task_comments (
  id          uuid primary key default gen_random_uuid(),
  task_id     uuid not null references tasks(id) on delete cascade,
  author_type text not null default current_actor_type() check (author_type in ('human', 'ai')),
  author_id   uuid default current_actor_id(),
  body        text not null check (length(btrim(body)) > 0),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_task_comments_task on task_comments(task_id, created_at);

create or replace function check_task_comment() returns trigger as $$
begin
  if tg_op = 'UPDATE' then
    if new.task_id is distinct from old.task_id
       or new.author_type is distinct from old.author_type
       or new.author_id is distinct from old.author_id
       or new.created_at is distinct from old.created_at then
      raise exception 'only the body of a task comment can be changed';
    end if;
    new.updated_at := now();
  end if;
  if not exists (select 1 from tasks where id = new.task_id and level = 'task') then
    raise exception 'comments can only be attached to a task';
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_task_comments_check on task_comments;
create trigger trg_task_comments_check before insert or update on task_comments
  for each row execute function check_task_comment();
