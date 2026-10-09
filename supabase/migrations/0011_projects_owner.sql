-- task-branch: projects の所有者（DESIGN.md §3.2 projects / §3.5）
--   既存のプロジェクトの owner_id はここでは埋めない。本番では適用後に手動の update で埋める
--   （利用者の uid をリポジトリに残さないため）。埋めるまで owner_id が null のプロジェクトは RLS で見えない。
--   そのため owner_id は当面 nullable。not null は埋めたあとの後続のマイグレーションで付ける。

-- ---------------------------------------------------------------------------
-- current_owner_id(): 実効の所有者。
--   AI は JWT の app_metadata.owner_id（持ち主の人）、人は auth.uid()。
--   JWT が無い（psql・シード）と null。
-- ---------------------------------------------------------------------------
create or replace function current_owner_id() returns uuid as $$
  select coalesce(
    (auth.jwt() -> 'app_metadata' ->> 'owner_id')::uuid,  -- AI なら持ち主の id
    auth.uid()                                              -- 人なら自分の id
  );
$$ language sql stable;

-- ---------------------------------------------------------------------------
-- projects.owner_id: 所有者（人のユーザー）。AI が作っても持ち主の人になる。
-- ---------------------------------------------------------------------------
alter table projects
  add column if not exists owner_id uuid references auth.users(id) default current_owner_id();

create index if not exists idx_projects_owner on projects(owner_id);
