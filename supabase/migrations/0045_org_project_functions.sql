-- task-branch: DB 関数の組織プロジェクト対応（DESIGN.md §3.2 tasks / organization_members、§3.5）
--   0044 でポリシーは組織のメンバーに開いたが、projects.owner_id を直接見ている関数が残っていた。
--   - check_task_assignee: 個人プロジェクトは今までどおり持ち主だけ。組織プロジェクトはその組織のメンバーだけ
--   - organization_members の after delete: 脱退（削除）した人が担当の、その組織のプロジェクトのタスクを未割り当てに戻す
--   - record_usage_events: タスクへのひも付けの条件を can_access_project() にする（組織プロジェクトでの自分の使用量も紐付く）。
--     usage_events の持ち主（owner_id = 人）は変えない
--   見直したが変えないもの:
--   - enforce_guest_limit（0031）: 組織プロジェクトは owner_id が null なので、owner is null の分岐で数えずに通る。
--     ゲストは組織を作れない（0042）ので、組織プロジェクトは上限の対象外のままでよい
--   - create_plan（0038）: security invoker で 0044 の RLS の範囲で読むので、組織のメンバーには組織プロジェクトが見つかる。
--     組織プロジェクトでの assignee = 'user' の意味（今は持ち主 = null）は「組織プロジェクトの担当者と MCP 対応の実装」で決める
--   - export_project / get_task_graph / get_progress / list_project_events / project_activity_counts / shift_story_dates /
--     create_guest_sample_project / usage_totals: security invoker で RLS に任せている（owner_id を直接見ない）
--   - delete_expired_guests（0032）: 消すのはゲストの個人プロジェクトだけ（owner_id = any(ids)）。組織プロジェクトは触らない
--   関数とトリガを差し替え・足すだけで、個人プロジェクトの結果は変わらない。適用前の画面・MCP とも互換。

-- ---------------------------------------------------------------------------
-- check_task_assignee: assignee_id はプロジェクトの持ち主（個人）か、組織のメンバー（組織）であること
--   organization_members の RLS に左右されずに見るため security definer にする。
-- ---------------------------------------------------------------------------
create or replace function check_task_assignee() returns trigger as $$
declare
  project_owner uuid;
  project_org   uuid;
begin
  if new.assignee_id is null then
    return new;
  end if;

  select owner_id, org_id into project_owner, project_org from projects where id = new.project_id;

  if project_org is not null then
    if not exists (
      select 1 from organization_members m
       where m.org_id = project_org and m.user_id = new.assignee_id
    ) then
      raise exception 'the assignee must be a member of the organization';
    end if;
  elsif project_owner is distinct from new.assignee_id then
    raise exception 'the assignee must be the owner of the project';
  end if;

  return new;
end;
$$ language plpgsql security definer set search_path = public;

revoke execute on function check_task_assignee() from public, anon, authenticated;

comment on column tasks.assignee_id is 'task のみ。人が担当する場合の担当者（auth.users.id）。個人プロジェクトは持ち主、組織プロジェクトは組織のメンバーだけ';

-- ---------------------------------------------------------------------------
-- organization_members after delete → その組織のプロジェクトで、抜けた人が担当のタスクを未割り当てに戻す
--   assignee_type も null にする（tasks_assignee_id_is_human を満たしたまま「未割り当て」にする）。
--   ユーザーの削除（auth.users から cascade）でも動く（assignee_id は FK の set null でも外れる）。
--   組織ごとの削除はプロジェクトが残っていると FK（restrict）で止まるので、ここでは対象のタスクが無い。
--   抜けた人の行は RLS で触れないことがあるため security definer で更新する。
-- ---------------------------------------------------------------------------
create or replace function unassign_removed_org_member() returns trigger as $$
begin
  update tasks t
     set assignee_id = null,
         assignee_type = null
    from projects p
   where p.id = t.project_id
     and p.org_id = old.org_id
     and t.assignee_id = old.user_id;
  return old;
end;
$$ language plpgsql security definer set search_path = public;

revoke execute on function unassign_removed_org_member() from public, anon, authenticated;

drop trigger if exists trg_organization_members_unassign on organization_members;
create trigger trg_organization_members_unassign
  after delete on organization_members
  for each row execute function unassign_removed_org_member();

-- ---------------------------------------------------------------------------
-- record_usage_events: タスクへのひも付けを「自分が触れるプロジェクトのタスク」にする（0035 は p.owner_id = owner）
--   owner は current_owner_id() なので、can_access_project() と同じ人で判定される。それ以外は 0035 と同じ
-- ---------------------------------------------------------------------------
create or replace function record_usage_events(events jsonb) returns jsonb as $$
declare
  owner    uuid := current_owner_id();
  total    int;
  inserted int;
  updated  int;
begin
  if owner is null then
    raise exception 'usage_events: 呼び出し元のユーザーが分かりません';
  end if;
  if is_guest_owner(owner) then
    raise exception using errcode = 'P0001', message = 'guest_not_allowed',
      detail = 'ゲストは使用量を記録できません';
  end if;
  if events is null or jsonb_typeof(events) <> 'array' then
    raise exception 'usage_events: events は配列で渡してください';
  end if;

  total := jsonb_array_length(events);
  if total > usage_events_max_batch() then
    raise exception 'usage_events: 1 回に送れるのは % 件までです（% 件）', usage_events_max_batch(), total;
  end if;
  if total = 0 then
    return jsonb_build_object('inserted', 0, 'updated', 0, 'skipped', 0);
  end if;

  if exists (
    select 1 from jsonb_array_elements(events) e
     where jsonb_typeof(e) <> 'object'
        or coalesce(e ->> 'session_id', '') = ''
        or coalesce(e ->> 'request_key', '') = ''
        or coalesce(e ->> 'model', '') = ''
        or coalesce(e ->> 'occurred_at', '') = ''
  ) then
    raise exception 'usage_events: session_id / request_key / model / occurred_at は必須です';
  end if;

  with src as (
    select coalesce(e ->> 'source', 'claude_code_transcript')         as source,
           e ->> 'session_id'                                          as session_id,
           e ->> 'request_key'                                         as request_key,
           e ->> 'model'                                               as model,
           (e ->> 'occurred_at')::timestamptz                          as occurred_at,
           case when (e ->> 'task_id') ~* '^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$'
                then (e ->> 'task_id')::uuid end                       as task_id,
           coalesce((e ->> 'is_subagent')::boolean, false)             as is_subagent,
           coalesce((e ->> 'input_tokens')::bigint, 0)                 as input_tokens,
           coalesce((e ->> 'output_tokens')::bigint, 0)                as output_tokens,
           coalesce((e ->> 'cache_read_input_tokens')::bigint, 0)      as cache_read_input_tokens,
           coalesce((e ->> 'cache_creation_input_tokens')::bigint, 0)  as cache_creation_input_tokens,
           (e ->> 'cost_usd')::numeric                                 as cost_usd
      from jsonb_array_elements(events) e
  ),
  uniq as (
    select distinct on (request_key) *
      from (select src.*, row_number() over () as ord from src) s
     order by request_key, ord
  ),
  ins as (
    insert into usage_events (
      owner_id, project_id, task_id, source, session_id, request_key, model, is_subagent,
      input_tokens, output_tokens, cache_read_input_tokens, cache_creation_input_tokens,
      cost_usd, occurred_at
    )
    select owner,
           case when can_access_project(t.project_id) then t.project_id end,
           case when can_access_project(t.project_id) then t.id end,
           s.source, s.session_id, s.request_key, s.model, s.is_subagent,
           s.input_tokens, s.output_tokens, s.cache_read_input_tokens, s.cache_creation_input_tokens,
           s.cost_usd, s.occurred_at
      from uniq s
      left join tasks t on t.id = s.task_id
    on conflict (owner_id, request_key) do update
      set cost_usd = excluded.cost_usd
      where usage_events.cost_usd is null and excluded.cost_usd is not null
    returning (xmax = 0) as is_insert
  )
  select count(*) filter (where is_insert), count(*) filter (where not is_insert)
    into inserted, updated
    from ins;

  return jsonb_build_object('inserted', inserted, 'updated', updated, 'skipped', total - inserted - updated);
end;
$$ language plpgsql volatile security definer set search_path = public, auth;

revoke execute on function record_usage_events(jsonb) from public, anon;
grant execute on function record_usage_events(jsonb) to authenticated;
