-- task-branch: 添付画像の保存基盤（DESIGN.md §3.2 task_attachments / §3.5）
--   コメント・ストーリーのコンテキスト・タスクの説明に差し込む画像を、非公開バケット attachments に置く。
--   - 添付はタスク（ストーリーを含む tasks の行）にひも付ける。本文には ![名前](attachment:<id>) で差し込む（画面は別ストーリー）
--   - パスは <project_id>/<添付の id>.<拡張子>。先に task_attachments の行を作り、その storage_path にだけアップロードできる
--   - 書けるのはプロジェクトの所有者の人だけ（AI・ゲストは不可）。読めるのは所有者（人・AI）だけ。上書きは不可
--   - ゲストは不可: 7 日後の自動削除（0032）で Storage のファイルを SQL から消せないため（avatars と同じ）
--   - 行が消えると storage.objects の select が通らなくなり、署名付き URL を作れない（ファイルが残っても読めない）
--   - タスク・プロジェクトの削除で Storage に残るファイルの掃除は今回やらない
--   新しいテーブル・バケット・ポリシーを足すだけなので、適用前の画面・MCP とも互換。

-- ---------------------------------------------------------------------------
-- task_attachments
--   id: 画面で crypto.randomUUID() を作って渡す（アップロード先のパスに使うため）
--   storage_path: '<project_id>/<id>.<png|jpg|webp|gif>'。拡張子は mime_type と対応させる
--   original_name: 表示用。パスには使わない
-- ---------------------------------------------------------------------------
create table if not exists task_attachments (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references projects(id) on delete cascade,
  task_id       uuid not null references tasks(id) on delete cascade,
  storage_path  text not null unique,
  mime_type     text not null check (mime_type in ('image/png', 'image/jpeg', 'image/webp', 'image/gif')),
  size_bytes    integer not null check (size_bytes between 1 and 5242880),
  original_name text check (char_length(original_name) <= 255),
  created_by    uuid not null default auth.uid(),
  created_at    timestamptz not null default now(),
  constraint task_attachments_storage_path check (
    storage_path = project_id::text || '/' || id::text || '.' ||
      case mime_type
        when 'image/png'  then 'png'
        when 'image/jpeg' then 'jpg'
        when 'image/webp' then 'webp'
        when 'image/gif'  then 'gif'
      end
  )
);

comment on table task_attachments is '添付画像（attachments バケット）。タスク・ストーリーにひも付ける。書けるのは所有者の人だけ';
comment on column task_attachments.storage_path is 'attachments バケット内のパス。<project_id>/<id>.<拡張子>';
comment on column task_attachments.original_name is '元のファイル名（表示用。パスには使わない）';

create index if not exists idx_task_attachments_task on task_attachments(task_id);

-- task_id の行の project_id と一致することを確かめる（0004 の依存関係と同じくトリガで守る）。
--   update のポリシーは無いので insert だけを見る。tasks は RLS の下で読むので、見えないタスクも拒否になる。
create or replace function check_task_attachment() returns trigger as $$
begin
  if not exists (select 1 from tasks t where t.id = new.task_id and t.project_id = new.project_id) then
    raise exception 'attachment project_id must match its task';
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_task_attachments_check on task_attachments;
create trigger trg_task_attachments_check before insert on task_attachments
  for each row execute function check_task_attachment();

-- ---------------------------------------------------------------------------
-- RLS: select は所有者（人・AI）。insert は所有者の人（ゲスト不可）。delete は所有者の人。update は作らない
-- ---------------------------------------------------------------------------
alter table task_attachments enable row level security;

drop policy if exists task_attachments_select on task_attachments;
create policy task_attachments_select on task_attachments
  for select to authenticated
  using (exists (
    select 1 from projects p
     where p.id = task_attachments.project_id
       and p.owner_id = current_owner_id()
  ));

drop policy if exists task_attachments_insert on task_attachments;
create policy task_attachments_insert on task_attachments
  for insert to authenticated
  with check (
    created_by = auth.uid()
    and current_actor_type() = 'human'
    and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) is not true
    and exists (
      select 1 from projects p
       where p.id = task_attachments.project_id
         and p.owner_id = current_owner_id()
    )
  );

drop policy if exists task_attachments_delete on task_attachments;
create policy task_attachments_delete on task_attachments
  for delete to authenticated
  using (
    current_actor_type() = 'human'
    and exists (
      select 1 from projects p
       where p.id = task_attachments.project_id
         and p.owner_id = current_owner_id()
    )
  );

-- ---------------------------------------------------------------------------
-- attachments バケット: 非公開、5MB まで、png / jpeg / webp / gif（SVG は許さない）。
--   再適用しても設定がそろうよう on conflict で上書きする。
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('attachments', 'attachments', false, 5242880, array['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------------
-- storage.objects（attachments）: task_attachments の行があるパスだけを扱える。
--   exists は task_attachments の RLS の下で評価されるので、所有者の行だけが見える。
--   select: 所有者（署名付き URL の作成・一覧）。行が消えたら読めない
--   insert: 所有者の人（ゲスト不可）。行の無いパスには置けない
--   update: 作らない（upsert での上書き不可。差し替えは削除して作り直す）
--   delete: 所有者の人
-- ---------------------------------------------------------------------------
drop policy if exists attachments_select on storage.objects;
create policy attachments_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'attachments'
    and exists (select 1 from public.task_attachments a where a.storage_path = objects.name)
  );

drop policy if exists attachments_insert on storage.objects;
create policy attachments_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'attachments'
    and current_actor_type() = 'human'
    and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) is not true
    and exists (select 1 from public.task_attachments a where a.storage_path = objects.name)
  );

drop policy if exists attachments_delete on storage.objects;
create policy attachments_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'attachments'
    and current_actor_type() = 'human'
    and exists (select 1 from public.task_attachments a where a.storage_path = objects.name)
  );
