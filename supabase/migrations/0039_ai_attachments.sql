-- task-branch: AI（MCP）からの添付アップロードを許す（DESIGN.md §3.5 task_attachments / storage.objects）
--   0036 では添付の作成を所有者の人だけにしていた。MCP のツール（create_attachment_upload）が
--   呼び出した人の JWT（client_id 付き = current_actor_type() が 'ai'）で行を作り、
--   署名付きアップロード URL でファイルを上げられるよう、insert の条件を human と ai に広げる。
--   - select は今のまま（所有者は人・AI とも読める）
--   - delete は人のまま（AI には削除させない）
--   - ゲスト不可・行の無いパスには置けない・上書き不可（update のポリシーを作らない）はそのまま
--   ポリシーを差し替えるだけなので、適用前の画面・MCP とも互換。

drop policy if exists task_attachments_insert on task_attachments;
create policy task_attachments_insert on task_attachments
  for insert to authenticated
  with check (
    created_by = auth.uid()
    and current_actor_type() in ('human', 'ai')
    and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) is not true
    and exists (
      select 1 from projects p
       where p.id = task_attachments.project_id
         and p.owner_id = current_owner_id()
    )
  );

drop policy if exists attachments_insert on storage.objects;
create policy attachments_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'attachments'
    and current_actor_type() in ('human', 'ai')
    and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) is not true
    and exists (select 1 from public.task_attachments a where a.storage_path = objects.name)
  );

comment on table task_attachments is '添付画像（attachments バケット）。タスク・ストーリーにひも付ける。書けるのは所有者（人・AI。ゲスト不可）、消せるのは所有者の人だけ';
