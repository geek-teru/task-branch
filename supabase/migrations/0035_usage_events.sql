-- task-branch: AI エージェントの使用量（トークン・費用）を API 応答ごとに記録する（DESIGN.md §3.2 usage_events / §3.5 / §4.2）
--   集め方は docs/usage-collection.md（Claude Code のフック＋transcript を推奨）。
--   1 行 = API 応答 1 件。タスクへのひも付け（task_id）は送り手が MCP ツールの呼び出しの区間で決める。
--   書き込みは record_usage_events() だけ（security definer）。テーブルには select のポリシーだけを置く。
--   新しいテーブルと関数を足すだけなので、適用前の画面・MCP とも互換。

-- ---------------------------------------------------------------------------
-- usage_events
--   owner_id: 持ち主（人）。AI が送っても持ち主の人になる。ユーザーを消したら一緒に消える
--   project_id / task_id: ひも付けたタスクとそのプロジェクト。タスクが消えたら task_id は null（使用量は残す）
--   request_key: 応答の一意キー（transcript の message.id、OTel の request_id）。同じ応答は 1 行
--   cost_usd: 応答ごとの費用。transcript では送り手がセッションの費用を按分した値。分からなければ null
-- ---------------------------------------------------------------------------
create table if not exists usage_events (
  id                          uuid primary key default gen_random_uuid(),
  owner_id                    uuid not null default current_owner_id() references auth.users(id) on delete cascade,
  project_id                  uuid references projects(id) on delete cascade,
  task_id                     uuid references tasks(id) on delete set null,
  client_id                   text default current_actor_client_id(),
  source                      text not null check (source in ('claude_code_transcript', 'otel')),
  session_id                  text not null,
  request_key                 text not null,
  model                       text not null,
  is_subagent                 boolean not null default false,
  input_tokens                bigint not null default 0 check (input_tokens >= 0),
  output_tokens               bigint not null default 0 check (output_tokens >= 0),
  cache_read_input_tokens     bigint not null default 0 check (cache_read_input_tokens >= 0),
  cache_creation_input_tokens bigint not null default 0 check (cache_creation_input_tokens >= 0),
  cost_usd                    numeric(14, 8) check (cost_usd is null or cost_usd >= 0),
  occurred_at                 timestamptz not null,
  created_at                  timestamptz not null default now(),
  constraint usage_events_owner_request_key unique (owner_id, request_key),
  constraint usage_events_task_has_project check (task_id is null or project_id is not null)
);

comment on table usage_events is 'AI エージェントの使用量（API 応答 1 件 = 1 行）。書き込みは record_usage_events() だけ';

create index if not exists idx_usage_events_owner   on usage_events(owner_id, occurred_at desc);
create index if not exists idx_usage_events_project on usage_events(project_id, occurred_at desc);
create index if not exists idx_usage_events_task    on usage_events(task_id);

-- ---------------------------------------------------------------------------
-- RLS: 持ち主の select だけ。insert / update / delete のポリシーは作らない（RPC だけが書く）
-- ---------------------------------------------------------------------------
alter table usage_events enable row level security;

drop policy if exists usage_events_select on usage_events;
create policy usage_events_select on usage_events
  for select to authenticated
  using (owner_id = current_owner_id());

-- ---------------------------------------------------------------------------
-- record_usage_events(events jsonb) → {"inserted": n, "updated": u, "skipped": m}
--   events は配列。各要素:
--     source（既定 'claude_code_transcript'）, session_id, request_key, model, occurred_at（必須）
--     task_id, is_subagent, input_tokens, output_tokens, cache_read_input_tokens,
--     cache_creation_input_tokens, cost_usd（任意）
--   - 持ち主は current_owner_id()。JWT が無い・ゲストなら例外
--   - task_id は持ち主のプロジェクトのタスクだけを受け付け、project_id をタスクから埋める。
--     見えない・存在しないタスクは task_id / project_id を null にして記録する（使用量は落とさない）
--   - 同じ (owner_id, request_key) がすでにあれば、cost_usd が null で新しい値があるときだけ埋める（updated）。
--     それ以外は何もしない（skipped）。Stop（費用なし）→ SessionEnd（費用あり）の順に送っても費用が入る
--   - 同じ呼び出しの中で request_key が重なったら、先頭の 1 件だけを使う
--   - 1 回 500 件まで
-- ---------------------------------------------------------------------------
create or replace function usage_events_max_batch() returns int as $$
  select 500;
$$ language sql immutable;

revoke execute on function usage_events_max_batch() from public, anon, authenticated;

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
           case when p.owner_id = owner then t.project_id end,
           case when p.owner_id = owner then t.id end,
           s.source, s.session_id, s.request_key, s.model, s.is_subagent,
           s.input_tokens, s.output_tokens, s.cache_read_input_tokens, s.cache_creation_input_tokens,
           s.cost_usd, s.occurred_at
      from uniq s
      left join tasks t on t.id = s.task_id
      left join projects p on p.id = t.project_id
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
