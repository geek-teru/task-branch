-- task-branch: 人と AI の判定を OAuth の client_id で行う（DESIGN.md §3.5 / §7.1）
--   AI は人のアカウントで OAuth 2.1 の同意を経てトークンを得る（AI 専用アカウントは作らない）。
--   そのため AI のトークンも sub は人の uid で、違いは client_id の有無だけになる。

-- ---------------------------------------------------------------------------
-- current_actor_type(): JWT に client_id があれば ai、それ以外は human。
--   画面のログイン（Google）のトークンには client_id が無いので human のまま。
--   PostgREST の外（psql、seed）では claims が無いので human。
-- ---------------------------------------------------------------------------
create or replace function current_actor_type() returns text as $$
  select case
    when nullif(
           coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb ->> 'client_id', ''
         ) is not null then 'ai'
    else 'human'
  end;
$$ language sql stable;

-- ---------------------------------------------------------------------------
-- task_comments: 投稿者は author_id と author_type の組で見分ける。
--   人と AI は同じ uid になるため、種別も見ないと AI が人のコメントを編集・削除できてしまう。
-- ---------------------------------------------------------------------------
drop policy if exists task_comments_update on task_comments;
create policy task_comments_update on task_comments
  for update to authenticated
  using      (author_id = auth.uid() and author_type = current_actor_type())
  with check (author_id = auth.uid() and author_type = current_actor_type());

drop policy if exists task_comments_delete on task_comments;
create policy task_comments_delete on task_comments
  for delete to authenticated
  using (author_id = auth.uid() and author_type = current_actor_type());
