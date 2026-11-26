-- task-branch: 組織の招待リンク（S4「招待リンクによるメンバー招待の実装」）
--   owner が期限付きの招待リンクを発行し、受け取った人がリンクを開いて参加する。
--   - organization_invitations: 招待 1 件 = リンク 1 本。DB にはトークンの sha256 だけを持つ（トークンは発行時に一度だけ返す）
--   - create_org_invitation(): owner の人が発行する。32 バイトの乱数を base64url にしたトークンを返す
--   - get_org_invitation(): 未参加の人がリンクの中身（組織名・slug・ロール・状態）を見る。メンバー一覧などは返さない
--   - accept_org_invitation(): 人（ゲストを除く）が参加する。期限内・未失効なら organization_members に入れる
--   リンクは期限内なら何人でも使える。失効は owner が revoked_at を入れる（UPDATE はこの列だけ許す）。
--   未参加の人は organizations を読めないので、get / accept は security definer で行う。
--   メンバーの参加は task_events に記録しない（プロジェクト単位の履歴のため）。
--   テーブル・関数を足すだけなので、適用前の画面・MCP とも互換。
--
--   pgcrypto（gen_random_bytes / digest）は Supabase では extensions スキーマにあるので、
--   関数の search_path に extensions を足す（無い環境では無視される）。

-- ---------------------------------------------------------------------------
-- organization_invitations
-- ---------------------------------------------------------------------------
create table if not exists organization_invitations (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references organizations(id) on delete cascade,
  token_hash     text not null unique,
  role           text not null default 'member' check (role in ('owner', 'member')),
  created_by     uuid references auth.users(id) on delete set null,
  expires_at     timestamptz not null,
  revoked_at     timestamptz,
  accepted_count integer not null default 0 check (accepted_count >= 0),
  created_at     timestamptz not null default now()
);

comment on table organization_invitations is '組織の招待リンク。トークンは発行時にだけ返し、DB には sha256（hex）だけを持つ。期限内・未失効なら何人でも参加できる';
comment on column organization_invitations.token_hash is 'トークン（base64url）の sha256 を hex にしたもの';
comment on column organization_invitations.revoked_at is '失効した日時。owner が入れる。一度入れたら戻せない';
comment on column organization_invitations.accepted_count is 'このリンクで新しく参加した人数（参加済みの人が開いても増えない）';

create index if not exists idx_organization_invitations_org on organization_invitations(org_id);

-- ---------------------------------------------------------------------------
-- RLS
--   select / update: 組織の owner の人。AI は触れない
--   insert / delete: ポリシーを作らない（発行は create_org_invitation の RPC だけ。行は消さず失効で止める）
--   UPDATE は revoked_at の列だけに絞る（列の権限）。値は下のトリガーで now() に揃え、戻せないようにする
-- ---------------------------------------------------------------------------
alter table organization_invitations enable row level security;

revoke all on organization_invitations from anon;
revoke insert, update, delete, truncate on organization_invitations from authenticated;
grant select on organization_invitations to authenticated;
grant update (revoked_at) on organization_invitations to authenticated;

drop policy if exists organization_invitations_select on organization_invitations;
create policy organization_invitations_select on organization_invitations
  for select to authenticated
  using (is_org_owner(org_id) and current_actor_type() = 'human');

drop policy if exists organization_invitations_update on organization_invitations;
create policy organization_invitations_update on organization_invitations
  for update to authenticated
  using      (is_org_owner(org_id) and current_actor_type() = 'human')
  with check (is_org_owner(org_id) and current_actor_type() = 'human');

-- ---------------------------------------------------------------------------
-- before update → 失効は一方向にする
--   revoked_at を入れたら値は now() に揃える（未来・過去の日時で失効を遅らせない）。失効済みは戻せない。
--   accepted_count など他の列は、列の権限で authenticated からは変えられない（RPC は security definer で更新する）。
-- ---------------------------------------------------------------------------
create or replace function guard_org_invitation_revoke() returns trigger as $$
begin
  if new.revoked_at is distinct from old.revoked_at then
    if old.revoked_at is not null then
      raise exception using
        errcode = 'P0001',
        message = 'org_invitation_already_revoked',
        detail  = 'a revoked invitation cannot be restored';
    end if;
    new.revoked_at := now();
  end if;
  return new;
end;
$$ language plpgsql set search_path = public;

revoke execute on function guard_org_invitation_revoke() from public, anon, authenticated;

drop trigger if exists trg_organization_invitations_revoke on organization_invitations;
create trigger trg_organization_invitations_revoke before update on organization_invitations
  for each row execute function guard_org_invitation_revoke();

-- ---------------------------------------------------------------------------
-- org_invitation_token_hash(token): トークンの sha256（hex）。発行・参照・参加で同じ計算を使う
-- ---------------------------------------------------------------------------
create or replace function org_invitation_token_hash(token text) returns text as $$
  select encode(digest(token, 'sha256'), 'hex');
$$ language sql immutable set search_path = public, extensions;

revoke execute on function org_invitation_token_hash(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- create_org_invitation(org, role, valid_days) → { id, token, role, expires_at }
--   組織の owner の人だけ。valid_days は 1〜30（画面は 1 / 7 / 30 から選ぶ。既定 7）。
--   トークンは gen_random_bytes(32) の base64url（'=' なし 43 文字）。返すのはこの 1 回だけ。
-- ---------------------------------------------------------------------------
create or replace function create_org_invitation(org uuid, role text default 'member', valid_days integer default 7)
returns jsonb as $$
declare
  v_token text;
  v_id    uuid;
  v_exp   timestamptz;
begin
  if auth.uid() is null or current_actor_type() <> 'human' or not is_org_owner(org) then
    raise exception using
      errcode = 'P0001',
      message = 'org_invitation_forbidden',
      detail  = 'only an owner of the organization can create invitations';
  end if;
  if role is null or role not in ('owner', 'member') then
    raise exception using
      errcode = 'P0001',
      message = 'org_invitation_invalid_role',
      detail  = 'role must be owner or member';
  end if;
  if valid_days is null or valid_days < 1 or valid_days > 30 then
    raise exception using
      errcode = 'P0001',
      message = 'org_invitation_invalid_days',
      detail  = 'valid_days must be between 1 and 30';
  end if;

  v_token := rtrim(translate(encode(gen_random_bytes(32), 'base64'), '+/', '-_'), '=');
  v_exp   := now() + make_interval(days => valid_days);

  insert into organization_invitations (org_id, token_hash, role, created_by, expires_at)
  values (org, org_invitation_token_hash(v_token), create_org_invitation.role, auth.uid(), v_exp)
  returning id into v_id;

  return jsonb_build_object('id', v_id, 'token', v_token, 'role', create_org_invitation.role, 'expires_at', v_exp);
end;
$$ language plpgsql volatile security definer set search_path = public, extensions;

revoke execute on function create_org_invitation(uuid, text, integer) from public, anon;
grant execute on function create_org_invitation(uuid, text, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- get_org_invitation(token) → { status, org_name, org_slug, role, expires_at, is_member }
--   status: valid / expired / revoked / invalid。invalid（トークンが無い）のときは status だけを返す。
--   失効と期限切れが重なれば revoked を優先する。is_member は呼んだ人がもうメンバーか（画面がそのまま移るため）。
--   メンバー一覧・発行者・参加人数は返さない。ログインした人（ゲストを含む）が呼べる。
-- ---------------------------------------------------------------------------
create or replace function get_org_invitation(token text) returns jsonb as $$
declare
  v_inv organization_invitations%rowtype;
  v_org organizations%rowtype;
begin
  if token is null or token = '' then
    return jsonb_build_object('status', 'invalid');
  end if;

  select * into v_inv from organization_invitations i
   where i.token_hash = org_invitation_token_hash(token);
  if not found then
    return jsonb_build_object('status', 'invalid');
  end if;

  select * into v_org from organizations o where o.id = v_inv.org_id;

  return jsonb_build_object(
    'status', case
                when v_inv.revoked_at is not null then 'revoked'
                when v_inv.expires_at <= now()    then 'expired'
                else 'valid'
              end,
    'org_name',   v_org.name,
    'org_slug',   v_org.slug,
    'role',       v_inv.role,
    'expires_at', v_inv.expires_at,
    'is_member',  exists (
                    select 1 from organization_members m
                     where m.org_id = v_inv.org_id and m.user_id = current_owner_id()
                  )
  );
end;
$$ language plpgsql stable security definer set search_path = public, extensions;

revoke execute on function get_org_invitation(text) from public, anon;
grant execute on function get_org_invitation(text) to authenticated;

-- ---------------------------------------------------------------------------
-- accept_org_invitation(token) → 組織の slug
--   人で、ゲスト（auth.users.is_anonymous）でないこと。期限内・未失効であること。
--   organization_members に (org, auth.uid(), role) を入れる。すでにメンバーなら何もしない（ロールは上書きしない）。
--   新しく入ったときだけ accepted_count を 1 増やす。同時の参加で数がずれないよう招待の行をロックする。
--   エラーの message: org_invitation_forbidden（AI・未ログイン）/ org_invitation_guest / org_invitation_invalid /
--   org_invitation_revoked / org_invitation_expired
-- ---------------------------------------------------------------------------
create or replace function accept_org_invitation(token text) returns text as $$
declare
  v_uid  uuid := auth.uid();
  v_inv  organization_invitations%rowtype;
  v_slug text;
  v_rows integer;
begin
  if v_uid is null or current_actor_type() <> 'human' then
    raise exception using
      errcode = 'P0001',
      message = 'org_invitation_forbidden',
      detail  = 'only a signed-in person can accept invitations';
  end if;
  if coalesce((select u.is_anonymous from auth.users u where u.id = v_uid), false) then
    raise exception using
      errcode = 'P0001',
      message = 'org_invitation_guest',
      detail  = 'guests cannot join organizations; link a Google account first';
  end if;

  select * into v_inv from organization_invitations i
   where i.token_hash = org_invitation_token_hash(coalesce(token, ''))
   for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'org_invitation_invalid', detail = 'invitation not found';
  end if;
  if v_inv.revoked_at is not null then
    raise exception using errcode = 'P0001', message = 'org_invitation_revoked', detail = 'invitation was revoked';
  end if;
  if v_inv.expires_at <= now() then
    raise exception using errcode = 'P0001', message = 'org_invitation_expired', detail = 'invitation has expired';
  end if;

  insert into organization_members (org_id, user_id, role)
  values (v_inv.org_id, v_uid, v_inv.role)
  on conflict (org_id, user_id) do nothing;
  get diagnostics v_rows = row_count;

  if v_rows > 0 then
    update organization_invitations
       set accepted_count = accepted_count + 1
     where id = v_inv.id;
  end if;

  select o.slug into v_slug from organizations o where o.id = v_inv.org_id;
  return v_slug;
end;
$$ language plpgsql volatile security definer set search_path = public, extensions;

revoke execute on function accept_org_invitation(text) from public, anon;
grant execute on function accept_org_invitation(text) to authenticated;
