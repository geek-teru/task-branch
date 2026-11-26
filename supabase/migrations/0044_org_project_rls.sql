-- task-branch: 組織プロジェクトの RLS（DESIGN.md §3.5）
--   既存のポリシーは「プロジェクトの持ち主（と持ち主の AI）」だけを見ていたため、組織プロジェクト（0043 の org_id）には
--   誰も触れなかった。プロジェクトに触れるかの判定を can_access_project() に集約し、組織のメンバー（とメンバー本人の AI）にも開く。
--   - 個人プロジェクト: 今までどおり持ち主だけ（owner_id = current_owner_id()）
--   - 組織プロジェクト: その組織のメンバー（is_org_member(org_id)）。AI は current_owner_id() で持ち主の人になるので本人と同じ権限
--   - projects は for all の projects_owner を操作ごとに分け、組織プロジェクトの削除は組織の owner だけにする
--   - created_by / author_id / actor_type などの条件はそのまま残す（判定の exists だけを置き換える）
--   - task_comments の update / delete は書いた本人だけのまま（0014。プロジェクトの条件を持たないので変えない）
--   - storage.objects（attachments）は task_attachments の行の存在で判定しているので、task_attachments の変更で追従する
--   ポリシーを差し替えるだけで、個人プロジェクトの結果は変わらない。適用前の画面・MCP とも互換。

-- ---------------------------------------------------------------------------
-- can_access_project(project): 操作している人（AI なら持ち主の人）がそのプロジェクトに触れるか
--   projects の RLS に左右されずに見るため security definer（ポリシーの中から projects を読むときの再帰も避ける）。
-- ---------------------------------------------------------------------------
create or replace function can_access_project(project uuid) returns boolean as $$
  select exists (
    select 1 from projects p
     where p.id = project
       and (
         p.owner_id = current_owner_id()
         or (p.org_id is not null and is_org_member(p.org_id))
       )
  );
$$ language sql stable security definer set search_path = public;

revoke execute on function can_access_project(uuid) from public, anon;
grant execute on function can_access_project(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- projects
--   select / update: 持ち主、または組織のメンバー
--   insert: 個人なら自分名義、組織ならその組織のメンバー
--     （org_id を渡すと before insert の trg_00_projects_org_owner が owner_id を null にしてから検査される）
--   delete: 個人なら持ち主、組織なら組織の owner
--   owner_id / org_id の付け替えは 0043 のトリガ（project_owner_immutable）で止まる
-- ---------------------------------------------------------------------------
drop policy if exists projects_owner on projects;

drop policy if exists projects_select on projects;
create policy projects_select on projects
  for select to authenticated
  using (owner_id = current_owner_id() or is_org_member(org_id));

drop policy if exists projects_insert on projects;
create policy projects_insert on projects
  for insert to authenticated
  with check (
    (org_id is null and owner_id = current_owner_id())
    or (org_id is not null and is_org_member(org_id))
  );

drop policy if exists projects_update on projects;
create policy projects_update on projects
  for update to authenticated
  using      (owner_id = current_owner_id() or is_org_member(org_id))
  with check (owner_id = current_owner_id() or is_org_member(org_id));

drop policy if exists projects_delete on projects;
create policy projects_delete on projects
  for delete to authenticated
  using (owner_id = current_owner_id() or is_org_owner(org_id));

-- ---------------------------------------------------------------------------
-- tasks: 触れるプロジェクトのものだけ読み書きできる。触れないプロジェクトへの作成・移動を弾く
-- ---------------------------------------------------------------------------
drop policy if exists tasks_owner on tasks;
create policy tasks_owner on tasks
  for all to authenticated
  using      (can_access_project(project_id))
  with check (can_access_project(project_id));

-- ---------------------------------------------------------------------------
-- story_context_revisions: 読む・足す（足すのはトリガ）。足すときは更新者が自分であることも確かめる
-- ---------------------------------------------------------------------------
drop policy if exists story_context_revisions_select on story_context_revisions;
create policy story_context_revisions_select on story_context_revisions
  for select to authenticated
  using (exists (
    select 1 from tasks t
     where t.id = story_context_revisions.story_id
       and can_access_project(t.project_id)
  ));

drop policy if exists story_context_revisions_insert on story_context_revisions;
create policy story_context_revisions_insert on story_context_revisions
  for insert to authenticated
  with check (
    edited_by_id = auth.uid()
    and edited_by_type = current_actor_type()
    and exists (
      select 1 from tasks t
       where t.id = story_context_revisions.story_id
         and can_access_project(t.project_id)
    )
  );

-- ---------------------------------------------------------------------------
-- task_comments: 読む・投稿する。投稿は投稿者が自分であることも確かめる
--   update / delete（書いた本人だけ。0014）は変えない
-- ---------------------------------------------------------------------------
drop policy if exists task_comments_select on task_comments;
create policy task_comments_select on task_comments
  for select to authenticated
  using (exists (
    select 1 from tasks t
     where t.id = task_comments.task_id
       and can_access_project(t.project_id)
  ));

drop policy if exists task_comments_insert on task_comments;
create policy task_comments_insert on task_comments
  for insert to authenticated
  with check (
    author_id = auth.uid()
    and author_type = current_actor_type()
    and exists (
      select 1 from tasks t
       where t.id = task_comments.task_id
         and can_access_project(t.project_id)
    )
  );

-- ---------------------------------------------------------------------------
-- task_events: select だけ（書くのはトリガ）
-- ---------------------------------------------------------------------------
drop policy if exists task_events_select on task_events;
create policy task_events_select on task_events
  for select to authenticated
  using (can_access_project(project_id));

-- ---------------------------------------------------------------------------
-- task_attachments: select は人・AI、insert は人・AI（ゲスト不可。0039）、delete は人
-- ---------------------------------------------------------------------------
drop policy if exists task_attachments_select on task_attachments;
create policy task_attachments_select on task_attachments
  for select to authenticated
  using (can_access_project(project_id));

drop policy if exists task_attachments_insert on task_attachments;
create policy task_attachments_insert on task_attachments
  for insert to authenticated
  with check (
    created_by = auth.uid()
    and current_actor_type() in ('human', 'ai')
    and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) is not true
    and can_access_project(project_id)
  );

drop policy if exists task_attachments_delete on task_attachments;
create policy task_attachments_delete on task_attachments
  for delete to authenticated
  using (
    current_actor_type() = 'human'
    and can_access_project(project_id)
  );

-- ---------------------------------------------------------------------------
-- story_groups: 触れるプロジェクトのものだけ読み書きできる
-- ---------------------------------------------------------------------------
drop policy if exists story_groups_owner on story_groups;
create policy story_groups_owner on story_groups
  for all to authenticated
  using      (can_access_project(project_id))
  with check (can_access_project(project_id));
