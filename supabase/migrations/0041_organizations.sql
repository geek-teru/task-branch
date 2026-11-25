-- task-branch: 組織とメンバー（DESIGN.md §3.2 organizations / organization_members）
--   複数ユーザーで使うための「組織」を足す（GitHub 型。個人所有のプロジェクトはそのまま）。
--   - organizations: slug（英小文字・数字・ハイフン、一意）と表示名。作った人が owner として入る
--   - organization_members: (org_id, user_id) とロール owner / member
--   - is_org_member() / is_org_owner(): current_owner_id()（操作している人。AI なら持ち主の人）で判定する。
--     security definer にして、organization_members の RLS（次のマイグレーション）が自分を参照して再帰しないようにする
--   - 最後の owner の脱退・降格はトリガーで止める。組織ごとの削除（cascade）は通す
--   RLS は有効にするが、ポリシーは 0042_organizations_rls.sql で足す。それまでは画面・MCP からは読み書きできない
--   （テーブルを先に公開しないため）。テーブル・関数を足すだけなので、適用前の画面・MCP とも互換。

-- ---------------------------------------------------------------------------
-- organizations
-- ---------------------------------------------------------------------------
create table if not exists organizations (
  id         uuid primary key default gen_random_uuid(),
  slug       text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,38}$'),
  name       text not null check (char_length(name) between 1 and 100),
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table organizations is '組織。プロジェクトを組織所有にできる（projects.org_id）。メンバーは organization_members';
comment on column organizations.slug is 'URL に使う識別子（/orgs/<slug>/settings）。英小文字・数字・ハイフンで 2〜39 文字、先頭は英数字';
comment on column organizations.created_by is '作った人。作成時に owner として organization_members に入る。ユーザーが消えたら null';

-- touch_updated_at() は tasks の status を見るので使えない。projects・profiles と同じ関数を使う。
drop trigger if exists trg_organizations_touch on organizations;
create trigger trg_organizations_touch before update on organizations
  for each row execute function touch_projects_updated_at();

-- ---------------------------------------------------------------------------
-- organization_members
-- ---------------------------------------------------------------------------
create table if not exists organization_members (
  org_id     uuid not null references organizations(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  role       text not null check (role in ('owner', 'member')),
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);

comment on table organization_members is '組織のメンバー（人）。owner は招待・メンバー削除・組織設定・プロジェクト削除もできる';

create index if not exists idx_organization_members_user on organization_members(user_id);

-- ---------------------------------------------------------------------------
-- 判定関数: 操作している人（AI なら持ち主の人）がその組織のメンバー / owner か
--   RLS のポリシーから呼ぶので authenticated に execute を残す。
-- ---------------------------------------------------------------------------
create or replace function is_org_member(org uuid) returns boolean as $$
  select exists (
    select 1 from organization_members m
     where m.org_id = org
       and m.user_id = current_owner_id()
  );
$$ language sql stable security definer set search_path = public;

create or replace function is_org_owner(org uuid) returns boolean as $$
  select exists (
    select 1 from organization_members m
     where m.org_id = org
       and m.user_id = current_owner_id()
       and m.role = 'owner'
  );
$$ language sql stable security definer set search_path = public;

revoke execute on function is_org_member(uuid) from public, anon;
revoke execute on function is_org_owner(uuid) from public, anon;
grant execute on function is_org_member(uuid) to authenticated;
grant execute on function is_org_owner(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- organizations after insert → 作った人を owner として入れる
--   作った人は created_by（既定値 auth.uid()。AI でも sub は人の uid）。
--   JWT の無い psql・シードで created_by が null のときは入れない（owner の無い組織になる）。
--   organization_members の insert は RLS で owner だけに絞るため、security definer で入れる。
-- ---------------------------------------------------------------------------
create or replace function add_org_creator_as_owner() returns trigger as $$
begin
  if new.created_by is not null then
    insert into organization_members (org_id, user_id, role)
    values (new.id, new.created_by, 'owner')
    on conflict (org_id, user_id) do update set role = 'owner';
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

revoke execute on function add_org_creator_as_owner() from public, anon, authenticated;

drop trigger if exists trg_organizations_add_owner on organizations;
create trigger trg_organizations_add_owner after insert on organizations
  for each row execute function add_org_creator_as_owner();

-- ---------------------------------------------------------------------------
-- organization_members after delete / update of role → owner が 0 人になるなら拒否
--   最後の owner は脱退・降格できない（ほかの人を owner にしてから行う）。
--   組織ごとの削除（organizations の delete から cascade）では、組織の行がもう無いので通す。
--   同じ組織の owner を同時に降格・削除して 0 人になるのを防ぐため、組織の行をロックしてから数える。
--   ユーザーの削除（auth.users から cascade）でも、最後の owner なら止まる（先に owner を移すか組織を消す）。
-- ---------------------------------------------------------------------------
create or replace function check_org_has_owner() returns trigger as $$
begin
  if tg_op = 'UPDATE' and not (old.role = 'owner' and new.role is distinct from 'owner') then
    return new;
  end if;
  if tg_op = 'DELETE' and old.role <> 'owner' then
    return old;
  end if;

  perform 1 from organizations o where o.id = old.org_id for update;
  if not found then
    return old;  -- 組織ごとの削除
  end if;

  if not exists (
    select 1 from organization_members m
     where m.org_id = old.org_id and m.role = 'owner'
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'org_last_owner',
      detail  = 'organization must have at least one owner';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$ language plpgsql security definer set search_path = public;

revoke execute on function check_org_has_owner() from public, anon, authenticated;

drop trigger if exists trg_organization_members_last_owner on organization_members;
create trigger trg_organization_members_last_owner
  after delete or update of role on organization_members
  for each row execute function check_org_has_owner();

-- ---------------------------------------------------------------------------
-- RLS: 有効にだけしておく（ポリシーは 0042_organizations_rls.sql）。ポリシーが無いあいだは authenticated も読み書きできない。
-- ---------------------------------------------------------------------------
alter table organizations enable row level security;
alter table organization_members enable row level security;
