-- task-branch: ストーリーのステータスに「計画中」（planning）を足す（DESIGN.md §3.2）
--   planning → todo → in_progress → done → closed。バックログに置いていて、まだ着手の予定に入れていない状態。
--   ストーリー専用。タスクは計画中にできない（レビュー中がタスク専用なのと対になる）。
--   Active / InActive（activated_at）の代わりに着手前をステータスで表すための第一歩。
--   計画中は未完了として扱うので、touch_updated_at() と get_progress() は変えない
--   （どちらも done / closed だけを完了として見ている）。
--
--   制約を広げるだけなので、適用前の画面とも互換。
--   既存のストーリー（未着手かつ InActive）を計画中に移す update はここでは行わない。
--   release.yml はマイグレーションと Vercel の画面デプロイを同時に走らせるため、
--   planning を知らない今の画面に planning の行を返すと、ステータスのバッジ（STATUS_CLASS[status]）で落ちる。
--   移行は、この画面が本番に出たあとの別のマイグレーションで行う。

alter table tasks
  drop constraint if exists tasks_status_check,
  add constraint tasks_status_check
    check (status in ('planning', 'todo', 'in_progress', 'in_review', 'done', 'closed'));

alter table tasks
  drop constraint if exists tasks_planning_story_only,
  add constraint tasks_planning_story_only
    check (status <> 'planning' or level = 'story');
