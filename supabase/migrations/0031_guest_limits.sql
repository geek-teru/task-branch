-- task-branch: ゲストの件数上限（DESIGN.md §3.5 ゲストの制約）
--   匿名サインインのユーザー（ゲスト）が作れる件数に上限をかける。本登録（Google 連携）すると
--   auth.users.is_anonymous が false になり、上限の対象から自動で外れる。
--   - ゲストかどうかは JWT ではなくデータの持ち主（projects.owner_id）で判定する。
--     OAuth でつないだ AI（MCP）の作成は持ち主がゲストなので、同じ上限にかかる。
--   - 上限（持ち主1人あたりの合計）: プロジェクト 2・ストーリー 20・タスク 100・コメント 200。
--     変えるのは guest_limit() の 1 か所だけ。
--   - 拒否は errcode P0001 / message 'guest_limit_exceeded' / detail '<projects|stories|tasks|comments>:<上限>'。
--   - 並行の作成で上限を少し超えるのは許容する（ロックは取らない）。

-- 上限値（唯一の定義）。kind は projects / stories / tasks / comments
create or replace function guest_limit(kind text) returns int as $$
  select case kind
    when 'projects' then 2
    when 'stories'  then 20
    when 'tasks'    then 100
    when 'comments' then 200
  end;
$$ language sql immutable;

-- ゲスト（匿名ユーザー）の持ち主かどうか。auth スキーマを読むため security definer
create or replace function is_guest_owner(owner uuid) returns boolean as $$
  select coalesce(
    (select u.is_anonymous from auth.users u where u.id = owner),
    false
  );
$$ language sql stable security definer set search_path = public, auth;

revoke execute on function is_guest_owner(uuid) from public, anon, authenticated;
revoke execute on function guest_limit(text) from public, anon, authenticated;

-- 件数を数えるため RLS に左右されないよう security definer にする
create or replace function enforce_guest_limit() returns trigger as $$
declare
  owner uuid;
  kind  text;
  cnt   int;
begin
  if tg_table_name = 'projects' then
    owner := new.owner_id;
    kind  := 'projects';
  elsif tg_table_name = 'tasks' then
    select p.owner_id into owner from projects p where p.id = new.project_id;
    kind := case when new.level = 'story' then 'stories' else 'tasks' end;
  else -- task_comments
    select p.owner_id into owner
      from tasks t join projects p on p.id = t.project_id
     where t.id = new.task_id;
    kind := 'comments';
  end if;

  if owner is null or not is_guest_owner(owner) then
    return new;
  end if;

  if kind = 'projects' then
    select count(*) into cnt from projects where owner_id = owner;
  elsif kind = 'stories' then
    select count(*) into cnt from tasks t join projects p on p.id = t.project_id
     where p.owner_id = owner and t.level = 'story';
  elsif kind = 'tasks' then
    select count(*) into cnt from tasks t join projects p on p.id = t.project_id
     where p.owner_id = owner and t.level <> 'story';
  else
    select count(*) into cnt from task_comments c
      join tasks t on t.id = c.task_id join projects p on p.id = t.project_id
     where p.owner_id = owner;
  end if;

  if cnt >= guest_limit(kind) then
    raise exception using errcode = 'P0001',
      message = 'guest_limit_exceeded',
      detail  = kind || ':' || guest_limit(kind);
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public, auth;

revoke execute on function enforce_guest_limit() from public, anon, authenticated;

drop trigger if exists trg_guest_limit_projects on projects;
create trigger trg_guest_limit_projects before insert on projects
  for each row execute function enforce_guest_limit();

drop trigger if exists trg_guest_limit_tasks on tasks;
create trigger trg_guest_limit_tasks before insert on tasks
  for each row execute function enforce_guest_limit();

drop trigger if exists trg_guest_limit_task_comments on task_comments;
create trigger trg_guest_limit_task_comments before insert on task_comments
  for each row execute function enforce_guest_limit();
