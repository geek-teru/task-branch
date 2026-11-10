-- task-branch: タスクコメントに投稿したエージェントを記録する（DESIGN.md §3.2 task_comments）
--   AI も人の uid で書くため、author_type / author_id だけではどのエージェントが書いたか分からない。
--   author_client_id に OAuth の client_id（JWT の client_id）を既定値で入れる。人の投稿は null。
--   接続を解除してもコメントは残すので、auth.oauth_clients への FK は付けない。
--   既存の行は null のまま（どのエージェントか分からないため補完しない）。列を足すだけなので適用前の画面とも互換。

create or replace function current_actor_client_id() returns text as $$
  select nullif(
    coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb ->> 'client_id', ''
  );
$$ language sql stable;

alter table task_comments
  add column if not exists author_client_id text default current_actor_client_id();

comment on column task_comments.author_client_id is 'AI の投稿のとき、投稿したエージェント（OAuth の client_id）。人の投稿と記録前の AI の投稿は null';

alter table task_comments
  drop constraint if exists task_comments_author_client_is_ai,
  add constraint task_comments_author_client_is_ai
    check (author_client_id is null or author_type = 'ai');

create or replace function check_task_comment() returns trigger as $$
begin
  if tg_op = 'UPDATE' then
    if new.task_id is distinct from old.task_id
       or new.author_type is distinct from old.author_type
       or new.author_id is distinct from old.author_id
       or new.author_client_id is distinct from old.author_client_id
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
