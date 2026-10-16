-- task-branch: ストーリーと配下のタスクの日付をまとめてずらす RPC（ガントのバー移動用）
--   - 対象は id = story の行と parent_id = story の行。start_date / due_date をそれぞれ + days する
--   - null の日付は null のまま
--   - 1 回の呼び出し（1 トランザクション）で更新するので、途中で失敗しても半端にずれない
--   - security invoker（既定）。tasks_owner の RLS がそのまま効き、見えないストーリーは「見つからない」になる

create or replace function shift_story_dates(story uuid, days int)
returns void as $$
begin
  if not exists (select 1 from tasks where id = story and level = 'story') then
    raise exception 'ストーリーが見つかりません: %', story;
  end if;

  if days = 0 then
    return;
  end if;

  update tasks
     set start_date = start_date + days,
         due_date   = due_date + days
   where id = story
      or (parent_id = story and level = 'task');
end;
$$ language plpgsql;
