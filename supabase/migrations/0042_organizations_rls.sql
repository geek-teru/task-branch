-- task-branch: 組織とメンバーの RLS（DESIGN.md §3.5）
--   0041_organizations.sql で RLS を有効にだけしたテーブルにポリシーを足す。すべて to authenticated（anon 向けは作らない）。
--   - organizations: メンバーが読める。人（ゲストを除く）が作れる。owner が変更・削除できる
--   - organization_members: メンバーが読める。owner の人が追加・ロール変更・削除できる。本人の人は脱退できる。
--     AI（current_actor_type() = 'ai'）はメンバーを変えられない
--   - profiles / avatars: 本人に加えて、同じ組織のメンバーが読める（メンバー一覧・担当者アイコンの表示名・画像のため）
--   判定は current_owner_id()（操作している人。AI なら持ち主の人）で行う。AI は持ち主と同じものを読める。

-- ---------------------------------------------------------------------------
-- shares_org_with(target): 操作している人と target が同じ組織のメンバーか（本人どうしは含めない）
--   profiles・avatars のポリシーから呼ぶ。organization_members を RLS に左右されずに見るため security definer。
-- ---------------------------------------------------------------------------
create or replace function shares_org_with(target uuid) returns boolean as $$
  select exists (
    select 1
      from organization_members me
      join organization_members other on other.org_id = me.org_id
     where me.user_id = current_owner_id()
       and other.user_id = target
  );
$$ language sql stable security definer set search_path = public;

revoke execute on function shares_org_with(uuid) from public, anon;
grant execute on function shares_org_with(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- organizations
--   select: メンバー。加えて作った人（created_by）も読める。
--     insert ... returning（PostgREST の return=representation）では、select のポリシーが新しい行に対して
--     insert の時点で検査される。作った人を owner に入れるのは after insert のトリガーなので、
--     メンバーの判定だけだと作った直後の行を返せず、作成そのものが失敗するため。
--     作った人が脱退したあとも組織名・slug は読めるが、メンバー・プロジェクトは読めない。
--   insert: 人で、ゲストでない（JWT の is_anonymous が true でない）。created_by は自分
--   update: owner（name / slug）
--   delete: owner。配下のプロジェクトが残っていれば projects.org_id の FK（on delete restrict。0043）で止まる
-- ---------------------------------------------------------------------------
drop policy if exists organizations_select on organizations;
create policy organizations_select on organizations
  for select to authenticated
  using (is_org_member(id) or created_by = auth.uid());

drop policy if exists organizations_insert on organizations;
create policy organizations_insert on organizations
  for insert to authenticated
  with check (
    created_by = auth.uid()
    and current_actor_type() = 'human'
    and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) is not true
  );

drop policy if exists organizations_update on organizations;
create policy organizations_update on organizations
  for update to authenticated
  using      (is_org_owner(id))
  with check (is_org_owner(id));

drop policy if exists organizations_delete on organizations;
create policy organizations_delete on organizations
  for delete to authenticated
  using (is_org_owner(id));

-- ---------------------------------------------------------------------------
-- organization_members
--   select: 同じ組織のメンバー
--   insert / update: owner の人（招待経由の参加は S4 の security definer の RPC で行う）
--   delete: owner の人、または本人の人（脱退）。最後の owner は 0041 のトリガーで止まる
--   AI はどれもできない（メンバーの変更は人の操作に限る）
-- ---------------------------------------------------------------------------
drop policy if exists organization_members_select on organization_members;
create policy organization_members_select on organization_members
  for select to authenticated
  using (is_org_member(org_id));

drop policy if exists organization_members_insert on organization_members;
create policy organization_members_insert on organization_members
  for insert to authenticated
  with check (is_org_owner(org_id) and current_actor_type() = 'human');

drop policy if exists organization_members_update on organization_members;
create policy organization_members_update on organization_members
  for update to authenticated
  using      (is_org_owner(org_id) and current_actor_type() = 'human')
  with check (is_org_owner(org_id) and current_actor_type() = 'human');

drop policy if exists organization_members_delete on organization_members;
create policy organization_members_delete on organization_members
  for delete to authenticated
  using (
    current_actor_type() = 'human'
    and (is_org_owner(org_id) or user_id = auth.uid())
  );

-- ---------------------------------------------------------------------------
-- profiles: 本人（0020）に加えて、同じ組織のメンバーが読める。書き込みのポリシーは変えない
-- ---------------------------------------------------------------------------
drop policy if exists profiles_select on profiles;
create policy profiles_select on profiles
  for select to authenticated
  using (user_id = auth.uid() or shares_org_with(user_id));

-- ---------------------------------------------------------------------------
-- avatars（storage.objects）: 自分のフォルダ（0020）に加えて、同じ組織のメンバーのフォルダを読める。
--   公開バケットなので画像の取得自体にはポリシーは要らないが、一覧（list）や API での取得を揃える。
--   フォルダ名が uuid でない行は、キャストで失敗しないよう case で先に外す（and は評価順が保証されないため）。
-- ---------------------------------------------------------------------------
drop policy if exists avatars_select on storage.objects;
create policy avatars_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'avatars'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or case
           when (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
             then shares_org_with(((storage.foldername(name))[1])::uuid)
           else false
         end
    )
  );
