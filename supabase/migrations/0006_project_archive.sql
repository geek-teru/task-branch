-- プロジェクトのアーカイブ。
-- is_active = false のプロジェクトは残したまま、ガント / カンバン / バックログの
-- プロジェクト選択肢から外し、一覧でもトグルを入れたときだけ表示する。
alter table projects
  add column if not exists is_active boolean not null default true;

comment on column projects.is_active is 'false = アーカイブ（一覧のトグルでのみ表示）';
