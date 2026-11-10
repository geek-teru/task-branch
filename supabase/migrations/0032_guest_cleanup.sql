-- task-branch: 期限切れゲストの自動削除（DESIGN.md §3.5 ゲストの自動削除）
--   作成から 7 日を過ぎた匿名ユーザー（ゲスト）を、データごと毎日自動で削除する。
--   本登録（Google 連携）すると auth.users.is_anonymous が false になり、対象から自動で外れる。
--   - delete_expired_guests(): 対象の auth.users を for update でロックして id を確定し、
--     projects（配下の tasks / task_comments / story_groups / task_events などは on delete cascade）
--     → auth.users（profiles は cascade、tasks.assignee_id は set null）の順に消す。
--     projects.owner_id は auth.users へのカスケードが無いので、先にプロジェクトを消す。
--   - 期限は guest_retention() の 1 か所で定義する。
--   - pg_cron で毎日 18:00 UTC（JST 3:00）に実行する。ジョブ名 delete-expired-guests。
--   - ゲストのアイコン画像（avatars バケット）は SQL から消せないため、ゲストのアップロードを
--     RLS で禁止する（消す必要のある画像を作らせない）。

create extension if not exists pg_cron;

-- ゲストのデータを残す期間（唯一の定義）。画面の「データは <作成日 + 7 日> に削除されます」と揃える
create or replace function guest_retention() returns interval as $$
  select interval '7 days';
$$ language sql immutable;

revoke execute on function guest_retention() from public, anon, authenticated;

-- 期限切れゲストを消し、消したユーザー数を返す。auth スキーマを触るため security definer
create or replace function delete_expired_guests() returns integer as $$
declare
  ids uuid[];
  n   int;
begin
  -- 対象を確定する。行をロックして、削除の途中で本登録（is_anonymous が false）された
  -- ユーザーのデータだけが消える、を防ぐ
  select coalesce(array_agg(id), '{}') into ids
    from (
      select u.id from auth.users u
       where u.is_anonymous
         and u.created_at < now() - guest_retention()
       for update
    ) s;

  if cardinality(ids) = 0 then
    return 0;
  end if;

  delete from projects where owner_id = any(ids);
  delete from auth.users where id = any(ids);
  get diagnostics n = row_count;
  return n;
end;
$$ language plpgsql security definer set search_path = public, auth;

revoke execute on function delete_expired_guests() from public, anon, authenticated;

-- 毎日 1 回。同じ名前のジョブがあれば置き換わる（再適用しても増えない）
select cron.schedule('delete-expired-guests', '0 18 * * *', 'select public.delete_expired_guests()');

-- ---------------------------------------------------------------------------
-- avatars: ゲスト（JWT の is_anonymous が true）はアップロード・差し替えできない。
--   削除は今までどおり本人の人なら可（0020_profiles.sql）。
-- ---------------------------------------------------------------------------
drop policy if exists avatars_insert on storage.objects;
create policy avatars_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
    and current_actor_type() = 'human'
    and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) is not true
  );

drop policy if exists avatars_update on storage.objects;
create policy avatars_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
    and current_actor_type() = 'human'
    and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) is not true
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
    and current_actor_type() = 'human'
    and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) is not true
  );
