-- task-branch: drop epic_comments (DESIGN.md §3)
--   エピックへのコメントは画面から使われていないので、テーブルごと消す。
--   エピックの情報は説明（description）とドキュメント（context）で持つ。
--   画面はこのテーブルを参照していないため、適用前の画面とも互換。

drop table if exists epic_comments;  -- インデックスとトリガも一緒に消える
drop function if exists check_epic_comment();
