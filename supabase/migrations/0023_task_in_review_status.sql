-- task-branch: タスクのステータスに「レビュー中」（in_review）を足す（DESIGN.md §3.2）
--   todo → in_progress → in_review → done → closed。PR を出して人のレビューを待っている状態。
--   タスク専用。ストーリーはレビュー中にできない（カンバンのレーンは進行中のストーリーだけが出るため）。
--   レビュー中は未完了として扱うので、touch_updated_at() と get_progress() は変えない
--   （どちらも done / closed だけを完了として見ている）。
--   制約を広げるだけなので、適用前の画面とも互換。

alter table tasks
  drop constraint if exists tasks_status_check,
  add constraint tasks_status_check
    check (status in ('todo', 'in_progress', 'in_review', 'done', 'closed'));

alter table tasks
  drop constraint if exists tasks_in_review_task_only,
  add constraint tasks_in_review_task_only
    check (status <> 'in_review' or level = 'task');
