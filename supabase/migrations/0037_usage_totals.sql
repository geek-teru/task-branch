-- task-branch: AI の使用量のプロジェクト・ストーリーごとの累計（DESIGN.md §4.2 usage_totals）
--   プロジェクト詳細・ストーリー詳細の「AI の使用量」カードが 1 行だけ受け取れるよう、DB で集計する。
--   security invoker（既定）なので usage_events の RLS（持ち主だけ）の範囲で数える。
--   関数を足すだけなので、適用前の画面・MCP とも互換。

-- ---------------------------------------------------------------------------
-- usage_totals(project, story) → 1 行
--   story が null: プロジェクトにひも付いた使用量の合計（usage_events.project_id = project）
--   story を渡す: ストーリー自身と、その配下のタスク（tasks.parent_id = story）にひも付いた分の合計
--   cost_usd は費用の分かる応答だけの合計（1 件も無ければ null）。uncosted_responses は費用が null の応答数
-- ---------------------------------------------------------------------------
create or replace function usage_totals(
  project uuid,
  story   uuid default null
) returns table (
  responses                   bigint,
  input_tokens                bigint,
  output_tokens               bigint,
  cache_read_input_tokens     bigint,
  cache_creation_input_tokens bigint,
  cost_usd                    numeric,
  uncosted_responses          bigint,
  first_at                    timestamptz,
  last_at                     timestamptz
) as $$
  select count(*),
         coalesce(sum(u.input_tokens), 0)::bigint,
         coalesce(sum(u.output_tokens), 0)::bigint,
         coalesce(sum(u.cache_read_input_tokens), 0)::bigint,
         coalesce(sum(u.cache_creation_input_tokens), 0)::bigint,
         sum(u.cost_usd),
         count(*) filter (where u.cost_usd is null),
         min(u.occurred_at),
         max(u.occurred_at)
    from usage_events u
   where u.project_id = usage_totals.project
     and (usage_totals.story is null
          or u.task_id = usage_totals.story
          or u.task_id in (select t.id from tasks t
                            where t.parent_id = usage_totals.story
                              and t.project_id = usage_totals.project));
$$ language sql stable;

revoke execute on function usage_totals(uuid, uuid) from public, anon;
grant execute on function usage_totals(uuid, uuid) to authenticated;
