-- task-branch: 操作履歴の過去分の補完（0024_task_events.sql の続き）
--   トリガ導入前の行から task_events を作る。既存テーブルは読むだけ。
--   何度流しても二重にならないよう、同じ行の記録が task_events に既にあれば入れない。
--     created / status_changed(done) / activated: task_id + event_type（+ to_status）単位で見る。
--       トリガ導入後に記録された行と日時が数マイクロ秒ずれても二重にならない。
--     commented: comment_id 単位。context_updated: 同じ task_id + occurred_at（改訂の ID を持たないため）。
--   途中のステータス変更は出せないので、完了（done）だけを completed_at から補完する。
--   操作者が分かるもの（コメント・コンテキスト）だけ actor を入れ、ほかは null。
--   ローカルの seed はマイグレーションの後に入るので、トリガの方で記録される。

-- created: tasks.created_at（ストーリーもタスクも）
insert into task_events (project_id, task_id, level, event_type, occurred_at)
select t.project_id, t.id, t.level, 'created', t.created_at
  from tasks t
 where not exists (
   select 1 from task_events e
    where e.task_id = t.id and e.event_type = 'created'
 );

-- status_changed: completed_at がある行を done（from_status は不明なので null）
insert into task_events (project_id, task_id, level, event_type, from_status, to_status, occurred_at)
select t.project_id, t.id, t.level, 'status_changed', null, 'done', t.completed_at
  from tasks t
 where t.completed_at is not null
   and not exists (
     select 1 from task_events e
      where e.task_id = t.id and e.event_type = 'status_changed' and e.to_status = 'done'
   );

-- commented: task_comments.created_at、操作者はコメントの author
insert into task_events (project_id, task_id, level, event_type, comment_id, actor_type, actor_id, occurred_at)
select t.project_id, t.id, t.level, 'commented', c.id, c.author_type, c.author_id, c.created_at
  from task_comments c
  join tasks t on t.id = c.task_id
 where not exists (
   select 1 from task_events e
    where e.comment_id = c.id
 );

-- context_updated: story_context_revisions.created_at、操作者は edited_by
insert into task_events (project_id, task_id, level, event_type, actor_type, actor_id, occurred_at)
select t.project_id, t.id, 'story', 'context_updated', r.edited_by_type, r.edited_by_id, r.created_at
  from story_context_revisions r
  join tasks t on t.id = r.story_id
 where not exists (
   select 1 from task_events e
    where e.task_id = r.story_id and e.event_type = 'context_updated' and e.occurred_at = r.created_at
 );

-- activated: activated_at があるストーリー
insert into task_events (project_id, task_id, level, event_type, occurred_at)
select t.project_id, t.id, 'story', 'activated', t.activated_at
  from tasks t
 where t.level = 'story'
   and t.activated_at is not null
   and not exists (
     select 1 from task_events e
      where e.task_id = t.id and e.event_type = 'activated'
   );
