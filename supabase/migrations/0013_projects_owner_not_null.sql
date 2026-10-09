-- task-branch: projects.owner_id を not null にする（DESIGN.md §3.2 projects / §3.5）
--   0011 では既存のプロジェクトの owner_id を埋めないため nullable で追加した。
--   本番で手動の update で埋め終わったので、ここで not null を付ける。
--   適用前に `select count(*) from projects where owner_id is null` が 0 であること（null が残っていると失敗する）。

alter table projects alter column owner_id set not null;
