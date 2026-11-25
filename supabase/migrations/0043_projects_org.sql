-- task-branch: プロジェクトの組織所有（DESIGN.md §3.2 projects / §3.5）
--   projects が owner_id（個人所有）か org_id（組織所有）のどちらか一方を持てるようにする（GitHub 型）。
--   - projects.org_id: organizations への FK（on delete restrict。プロジェクトが残っている組織は消せない）
--   - owner_id の not null を外し、check で owner_id / org_id のちょうど一方だけを許す
--   - owner_id の既定値 current_owner_id() は残す。org_id を指定した insert では、トリガで owner_id を null にする
--     （画面・MCP が owner_id を意識せずに org_id だけ渡せばよいように）
--   - owner_id / org_id の付け替え（update）はトリガで禁止する。個人→組織の移管は後続のストーリーで扱う
--   既存の行はすべて owner_id あり・org_id null のまま（移行なし）。
--   RLS（projects_owner など）はここでは変えない。組織プロジェクトは誰からも見えない状態で、
--   「組織プロジェクトの RLS 拡張」で組織のメンバーに開く。列・制約・トリガを足すだけなので、適用前の画面・MCP とも互換。

-- ---------------------------------------------------------------------------
-- projects.org_id
-- ---------------------------------------------------------------------------
alter table projects
  add column if not exists org_id uuid references organizations(id) on delete restrict;

comment on column projects.org_id is '組織所有のときの組織。owner_id（個人所有）とちょうど一方だけが入る';

create index if not exists idx_projects_org on projects(org_id);

alter table projects alter column owner_id drop not null;

alter table projects drop constraint if exists projects_owner_or_org;
alter table projects add constraint projects_owner_or_org
  check (num_nonnulls(owner_id, org_id) = 1);

-- ---------------------------------------------------------------------------
-- before insert: org_id があれば owner_id（既定値 current_owner_id() で入る）を null にする
--   同じ before insert のゲスト上限（trg_guest_limit_projects）より先に動かすため、名前を trg_00_ で始める
--   （同じタイミングのトリガは名前の順に動く）。先に owner_id を消しておけば、組織プロジェクトは
--   ゲストの件数に数えられない。
-- ---------------------------------------------------------------------------
create or replace function set_project_owner_for_org() returns trigger as $$
begin
  if new.org_id is not null then
    new.owner_id := null;
  end if;
  return new;
end;
$$ language plpgsql set search_path = public;

revoke execute on function set_project_owner_for_org() from public, anon, authenticated;

drop trigger if exists trg_00_projects_org_owner on projects;
create trigger trg_00_projects_org_owner before insert on projects
  for each row execute function set_project_owner_for_org();

-- ---------------------------------------------------------------------------
-- before update: owner_id / org_id の付け替えを禁止する
--   拒否は errcode P0001 / message 'project_owner_immutable'（guest_limit_exceeded と同じ流儀で画面が読み替えられる形）
-- ---------------------------------------------------------------------------
create or replace function forbid_project_owner_change() returns trigger as $$
begin
  if new.owner_id is distinct from old.owner_id
     or new.org_id is distinct from old.org_id then
    raise exception using
      errcode = 'P0001',
      message = 'project_owner_immutable',
      detail  = 'owner_id / org_id cannot be changed';
  end if;
  return new;
end;
$$ language plpgsql set search_path = public;

revoke execute on function forbid_project_owner_change() from public, anon, authenticated;

drop trigger if exists trg_projects_owner_immutable on projects;
create trigger trg_projects_owner_immutable before update of owner_id, org_id on projects
  for each row execute function forbid_project_owner_change();
