-- task-branch: プロフィールとアイコン画像（DESIGN.md §3.2 / §3.5）
--   profiles は本人の表示名とアイコン画像のパスを持つ。行は画面からの初回保存で upsert する
--   （auth.users のトリガでは作らない）。値が null なら Google の full_name / avatar_url を使う。
--   アイコン画像は公開バケット avatars に <uid>/<ランダム>.<拡張子> で置く。
--   公開にするのは <img> で署名付き URL を作らずに出すため（アイコンは秘密ではない）。
--   profiles と avatars の書き込みは人だけ（current_actor_type() = 'human'）。AI はできない。

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create table if not exists profiles (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  display_name text check (char_length(display_name) between 1 and 50),
  avatar_path  text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

comment on column profiles.display_name is '表示名。null なら Google の full_name、それも無ければ email';
comment on column profiles.avatar_path is 'avatars バケット内のパス。null なら Google の avatar_url';

-- touch_updated_at() は tasks の status を見るので使えない。列を持たない projects と同じ関数を使う。
drop trigger if exists trg_profiles_touch on profiles;
create trigger trg_profiles_touch before update on profiles
  for each row execute function touch_projects_updated_at();

-- ---------------------------------------------------------------------------
-- RLS: 本人だけが読める。書けるのは本人の人だけ（AI は書けない）。delete はポリシーを作らない。
-- ---------------------------------------------------------------------------
alter table profiles enable row level security;

drop policy if exists profiles_select on profiles;
create policy profiles_select on profiles
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists profiles_insert on profiles;
create policy profiles_insert on profiles
  for insert to authenticated
  with check (user_id = auth.uid() and current_actor_type() = 'human');

drop policy if exists profiles_update on profiles;
create policy profiles_update on profiles
  for update to authenticated
  using      (user_id = auth.uid() and current_actor_type() = 'human')
  with check (user_id = auth.uid() and current_actor_type() = 'human');

-- ---------------------------------------------------------------------------
-- avatars バケット: 公開、2MB まで、png / jpeg / webp。
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------------
-- storage.objects: 自分の uid のフォルダにだけ、人だけが置ける・差し替えられる・消せる。
--   公開バケットなので画像の取得にポリシーは要らない。select は Storage の削除・差し替えが
--   対象の行を読むために要るので、自分のフォルダだけ読めるようにする。
-- ---------------------------------------------------------------------------
drop policy if exists avatars_select on storage.objects;
create policy avatars_select on storage.objects
  for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists avatars_insert on storage.objects;
create policy avatars_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
    and current_actor_type() = 'human'
  );

drop policy if exists avatars_update on storage.objects;
create policy avatars_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
    and current_actor_type() = 'human'
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
    and current_actor_type() = 'human'
  );

drop policy if exists avatars_delete on storage.objects;
create policy avatars_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
    and current_actor_type() = 'human'
  );
