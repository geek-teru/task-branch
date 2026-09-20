-- task-branch: links on a project (site / repository), shown on the projects page.
alter table projects
  add column if not exists url            text,
  add column if not exists repository_url text;

comment on column projects.url is 'プロジェクトに関連する URL（デプロイ先など）';
comment on column projects.repository_url is 'GitHub などのリポジトリ URL';
