-- task-branch: RLS ポリシー（DESIGN.md §3.5）
--   本人と本人の AI だけがデータに触れるようにする。
--   ポリシーはすべて to authenticated。anon 向けは作らない（未ログインでは何もできない）。
--   ポリシーを作らない操作は拒否される（epic_context_revisions の update / delete など）。
--   owner_id が null のプロジェクト（本番で手動で埋める前）は誰からも見えない。

-- ---------------------------------------------------------------------------
-- projects: 所有者だけが読み書きできる。with check で他人名義の作成と所有者の付け替えを弾く。
-- ---------------------------------------------------------------------------
alter table projects enable row level security;

drop policy if exists projects_owner on projects;
create policy projects_owner on projects
  for all to authenticated
  using      (owner_id = current_owner_id())
  with check (owner_id = current_owner_id());

-- ---------------------------------------------------------------------------
-- tasks: 属するプロジェクトの所有者だけが読み書きできる。他人のプロジェクトへの作成・移動を弾く。
-- ---------------------------------------------------------------------------
alter table tasks enable row level security;

drop policy if exists tasks_owner on tasks;
create policy tasks_owner on tasks
  for all to authenticated
  using (exists (
    select 1 from projects p
     where p.id = tasks.project_id
       and p.owner_id = current_owner_id()
  ))
  with check (exists (
    select 1 from projects p
     where p.id = tasks.project_id
       and p.owner_id = current_owner_id()
  ));

-- ---------------------------------------------------------------------------
-- epic_context_revisions: 所有者だけが読み、足せる（足すのはトリガ save_epic_context_revision()）。
--   足すときは更新者が自分であることも確かめる。update / delete はポリシーを作らない。
-- ---------------------------------------------------------------------------
alter table epic_context_revisions enable row level security;

drop policy if exists epic_context_revisions_select on epic_context_revisions;
create policy epic_context_revisions_select on epic_context_revisions
  for select to authenticated
  using (exists (
    select 1 from tasks t
      join projects p on p.id = t.project_id
     where t.id = epic_context_revisions.epic_id
       and p.owner_id = current_owner_id()
  ));

drop policy if exists epic_context_revisions_insert on epic_context_revisions;
create policy epic_context_revisions_insert on epic_context_revisions
  for insert to authenticated
  with check (
    edited_by_id = auth.uid()
    and edited_by_type = current_actor_type()
    and exists (
      select 1 from tasks t
        join projects p on p.id = t.project_id
       where t.id = epic_context_revisions.epic_id
         and p.owner_id = current_owner_id()
    )
  );

-- ---------------------------------------------------------------------------
-- task_comments: 所有者だけが読み、投稿できる。投稿は投稿者が自分であることも確かめる。
--   編集・削除は書いた本人だけ（人と AI は別の投稿者）。
-- ---------------------------------------------------------------------------
alter table task_comments enable row level security;

drop policy if exists task_comments_select on task_comments;
create policy task_comments_select on task_comments
  for select to authenticated
  using (exists (
    select 1 from tasks t
      join projects p on p.id = t.project_id
     where t.id = task_comments.task_id
       and p.owner_id = current_owner_id()
  ));

drop policy if exists task_comments_insert on task_comments;
create policy task_comments_insert on task_comments
  for insert to authenticated
  with check (
    author_id = auth.uid()
    and author_type = current_actor_type()
    and exists (
      select 1 from tasks t
        join projects p on p.id = t.project_id
       where t.id = task_comments.task_id
         and p.owner_id = current_owner_id()
    )
  );

drop policy if exists task_comments_update on task_comments;
create policy task_comments_update on task_comments
  for update to authenticated
  using      (author_id = auth.uid())
  with check (author_id = auth.uid());

drop policy if exists task_comments_delete on task_comments;
create policy task_comments_delete on task_comments
  for delete to authenticated
  using (author_id = auth.uid());
