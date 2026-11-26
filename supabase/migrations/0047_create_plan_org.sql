-- task-branch: create_plan の組織プロジェクト対応（DESIGN.md §4.2 create_plan / §7.2 MCP ツール）
--   0038 の create_plan を差し替える。変えるのは担当者の扱いだけで、ほかの入力・返り値・挙動は 0038 と同じ。
--   - tasks[].assignee の user を「呼び出した人（current_owner_id()。AI なら持ち主の人）」にする。
--     0038 はプロジェクトの持ち主（projects.owner_id）で、組織プロジェクト（owner_id null）では担当が入らなかった。
--     個人プロジェクトは持ち主しか触れないので、結果は 0038 と同じ
--   - tasks[].assignee_user_id（uuid）を足す。指定したらその人（人）を担当にする。assignee と同時には指定できない。
--     担当にできるのは、個人プロジェクトは持ち主、組織プロジェクトは組織のメンバーだけ。
--     最終の判定は 0045 の check_task_assignee（トリガ）だが、何も作らずに日本語で返すため、ここでも先に確かめる
--   関数を差し替えるだけなので、適用前の画面・MCP とも互換（assignee_user_id を渡さなければ今までどおり）。

create or replace function create_plan(project uuid, stories jsonb) returns jsonb as $$
declare
  me           uuid := current_owner_id();
  project_owner uuid;
  project_org  uuid;
  assignee_uid uuid;
  client       text := current_actor_client_id();
  s            jsonb;
  t            jsonb;
  ext          text;
  ext_ids      text[] := '{}';
  dup          text[];
  row_id       uuid;
  row_title    text;
  story_id     uuid;
  story_title  text;
  story_ext    text;
  story_new    boolean;
  next_story   integer;
  next_task    integer;
  assignee     text;
  task_out     jsonb;
  stories_out  jsonb := '[]'::jsonb;
begin
  -- ---------------------------------------------------------------------------
  -- 1. 入力の形（何も書く前に全部見る）
  -- ---------------------------------------------------------------------------
  if jsonb_typeof(stories) is distinct from 'array' or jsonb_array_length(stories) = 0 then
    raise exception 'stories は 1 件以上の配列で渡してください' using errcode = '22023';
  end if;

  for s in select value from jsonb_array_elements(create_plan.stories) loop
    if jsonb_typeof(s) is distinct from 'object' then
      raise exception 'stories[] の要素はオブジェクトで渡してください' using errcode = '22023';
    end if;
    if s ? 'id' and jsonb_typeof(s -> 'id') <> 'null' then
      -- 既存のストーリーにタスクを足す。title などは使わない
      if (s ->> 'id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
        raise exception 'stories[].id が uuid ではありません: %', s ->> 'id' using errcode = '22023';
      end if;
    else
      if coalesce(btrim(s ->> 'title'), '') = '' then
        raise exception 'stories[] には id（既存のストーリー）か title（新規）のどちらかが要ります' using errcode = '22023';
      end if;
      if coalesce(s ->> 'status', 'todo') not in ('planning', 'todo') then
        raise exception 'stories[].status は planning か todo です: %', s ->> 'status' using errcode = '22023';
      end if;
      if s ? 'external_id' and jsonb_typeof(s -> 'external_id') <> 'null' then
        ext := btrim(s ->> 'external_id');
        if ext = '' then
          raise exception 'external_id が空です' using errcode = '22023';
        end if;
        ext_ids := ext_ids || ext;
      end if;
    end if;

    if s ? 'tasks' and jsonb_typeof(s -> 'tasks') not in ('array', 'null') then
      raise exception 'stories[].tasks は配列で渡してください' using errcode = '22023';
    end if;
    for t in select value from jsonb_array_elements(coalesce(nullif(s -> 'tasks', 'null'::jsonb), '[]'::jsonb)) loop
      if jsonb_typeof(t) is distinct from 'object' or coalesce(btrim(t ->> 'title'), '') = '' then
        raise exception 'tasks[] には title が要ります' using errcode = '22023';
      end if;
      if coalesce(t ->> 'assignee', 'none') not in ('user', 'ai', 'none') then
        raise exception 'tasks[].assignee は user / ai / none のどれかです: %', t ->> 'assignee' using errcode = '22023';
      end if;
      if t ? 'assignee_user_id' and jsonb_typeof(t -> 'assignee_user_id') <> 'null' then
        if (t ->> 'assignee_user_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
          raise exception 'tasks[].assignee_user_id が uuid ではありません: %', t ->> 'assignee_user_id' using errcode = '22023';
        end if;
        if t ? 'assignee' and jsonb_typeof(t -> 'assignee') <> 'null' then
          raise exception 'tasks[].assignee と assignee_user_id は同時に指定できません: %', btrim(t ->> 'title') using errcode = '22023';
        end if;
      end if;
      if t ? 'external_id' and jsonb_typeof(t -> 'external_id') <> 'null' then
        ext := btrim(t ->> 'external_id');
        if ext = '' then
          raise exception 'external_id が空です' using errcode = '22023';
        end if;
        ext_ids := ext_ids || ext;
      end if;
    end loop;
  end loop;

  -- 入力の中の external_id の重複は、どちらを正とするか決められないので弾く
  select array_agg(v order by v) into dup
    from (select v from unnest(ext_ids) v group by v having count(*) > 1) d;
  if dup is not null then
    raise exception 'external_id が入力の中で重複しています: %', array_to_string(dup, ', ') using errcode = '22023';
  end if;

  -- ---------------------------------------------------------------------------
  -- 2. 既存の行との突き合わせ（RLS の範囲）
  -- ---------------------------------------------------------------------------
  select p.owner_id, p.org_id into project_owner, project_org from projects p where p.id = create_plan.project;
  if not found then
    raise exception 'プロジェクトが見つかりません: %', create_plan.project using errcode = '22023';
  end if;

  -- 担当者の指定を、何も作る前に確かめる（新しく作るタスクだけが対象だが、入力の誤りとしてまとめて弾く）
  for s in select value from jsonb_array_elements(create_plan.stories) loop
    for t in select value from jsonb_array_elements(coalesce(nullif(s -> 'tasks', 'null'::jsonb), '[]'::jsonb)) loop
      if t ->> 'assignee' = 'user' and me is null then
        raise exception 'tasks[].assignee の user は、呼び出した人が分からないので使えません' using errcode = '22023';
      end if;
      if t ? 'assignee_user_id' and jsonb_typeof(t -> 'assignee_user_id') <> 'null' then
        assignee_uid := (t ->> 'assignee_user_id')::uuid;
        if project_org is not null then
          -- organization_members は同じ組織のメンバーなら RLS で読める
          perform 1 from organization_members m where m.org_id = project_org and m.user_id = assignee_uid;
          if not found then
            raise exception '担当にできるのは組織のメンバーだけです（list_members で確かめてください）: %', assignee_uid
              using errcode = '22023';
          end if;
        elsif assignee_uid is distinct from project_owner then
          raise exception '個人プロジェクトの担当にできるのは持ち主だけです: %', assignee_uid using errcode = '22023';
        end if;
      end if;
    end loop;
  end loop;

  -- 既存の行と level が食い違うものは、作り直しも流用もできないので何も作らずに弾く
  for s in select value from jsonb_array_elements(create_plan.stories) loop
    if s ? 'id' and jsonb_typeof(s -> 'id') <> 'null' then
      perform 1 from tasks x
       where x.id = (s ->> 'id')::uuid and x.project_id = create_plan.project and x.level = 'story';
      if not found then
        raise exception 'このプロジェクトのストーリーが見つかりません: %', s ->> 'id' using errcode = '22023';
      end if;
    elsif s ? 'external_id' and jsonb_typeof(s -> 'external_id') <> 'null' then
      perform 1 from tasks x
       where x.project_id = create_plan.project and x.metadata ->> 'external_id' = btrim(s ->> 'external_id') and x.level = 'task';
      if found then
        raise exception 'external_id % は既存のタスクに使われています（ストーリーには使えません）', btrim(s ->> 'external_id')
          using errcode = '22023';
      end if;
    end if;
    for t in select value from jsonb_array_elements(coalesce(nullif(s -> 'tasks', 'null'::jsonb), '[]'::jsonb)) loop
      if t ? 'external_id' and jsonb_typeof(t -> 'external_id') <> 'null' then
        perform 1 from tasks x
         where x.project_id = create_plan.project and x.metadata ->> 'external_id' = btrim(t ->> 'external_id') and x.level = 'story';
        if found then
          raise exception 'external_id % は既存のストーリーに使われています（タスクには使えません）', btrim(t ->> 'external_id')
            using errcode = '22023';
        end if;
      end if;
    end loop;
  end loop;

  -- ---------------------------------------------------------------------------
  -- 3. 登録。ストーリーはプロジェクトの末尾（無ければ 1 から）、タスクはストーリーの末尾（無ければ 0 から）
  -- ---------------------------------------------------------------------------
  select max(x.sort_order) into next_story
    from tasks x where x.project_id = create_plan.project and x.level = 'story';
  next_story := coalesce(next_story, 0) + 1;

  for s in select value from jsonb_array_elements(create_plan.stories) loop
    story_new := false;
    if s ? 'id' and jsonb_typeof(s -> 'id') <> 'null' then
      select x.id, x.title, x.metadata ->> 'external_id' into story_id, story_title, story_ext
        from tasks x where x.id = (s ->> 'id')::uuid;
    else
      story_ext := nullif(btrim(s ->> 'external_id'), '');
      story_id := null;
      if story_ext is not null then
        select x.id, x.title into story_id, story_title
          from tasks x
         where x.project_id = create_plan.project and x.metadata ->> 'external_id' = story_ext and x.level = 'story'
         order by x.created_at, x.id
         limit 1;
      end if;
      if story_id is null then
        insert into tasks (project_id, level, title, description, context, start_date, due_date, status, sort_order, metadata)
        values (
          create_plan.project, 'story', btrim(s ->> 'title'), s ->> 'description', s ->> 'context',
          (s ->> 'start_date')::date, (s ->> 'due_date')::date, coalesce(s ->> 'status', 'todo'), next_story,
          case when story_ext is null then '{}'::jsonb else jsonb_build_object('external_id', story_ext) end
        )
        returning id, title into story_id, story_title;
        next_story := next_story + 1;
        story_new := true;
      end if;
    end if;

    task_out := '[]'::jsonb;
    next_task := null;
    for t in select value from jsonb_array_elements(coalesce(nullif(s -> 'tasks', 'null'::jsonb), '[]'::jsonb)) loop
      ext := nullif(btrim(t ->> 'external_id'), '');
      row_id := null;
      if ext is not null then
        select x.id, x.title into row_id, row_title
          from tasks x
         where x.project_id = create_plan.project and x.metadata ->> 'external_id' = ext and x.level = 'task'
         order by x.created_at, x.id
         limit 1;
      end if;
      if row_id is not null then
        task_out := task_out || jsonb_build_object('id', row_id, 'external_id', ext, 'title', row_title, 'created', false);
        continue;
      end if;

      if next_task is null then
        select max(x.sort_order) into next_task from tasks x where x.parent_id = story_id and x.level = 'task';
        next_task := coalesce(next_task, -1) + 1;
      end if;
      assignee := coalesce(t ->> 'assignee', 'none');
      assignee_uid := case when jsonb_typeof(t -> 'assignee_user_id') = 'string' then (t ->> 'assignee_user_id')::uuid end;
      if assignee_uid is not null then
        assignee := 'member';
      end if;
      insert into tasks (project_id, parent_id, level, title, description, start_date, due_date,
                         assignee_type, assignee_id, assignee_client_id, sort_order, metadata)
      values (
        create_plan.project, story_id, 'task', btrim(t ->> 'title'), t ->> 'description',
        (t ->> 'start_date')::date, (t ->> 'due_date')::date,
        case assignee when 'user' then 'human' when 'member' then 'human' when 'ai' then 'ai' end,
        case assignee when 'user' then me when 'member' then assignee_uid end,
        case when assignee = 'ai' then client end,
        next_task,
        case when ext is null then '{}'::jsonb else jsonb_build_object('external_id', ext) end
      )
      returning id, title into row_id, row_title;
      next_task := next_task + 1;
      task_out := task_out || jsonb_build_object('id', row_id, 'external_id', ext, 'title', row_title, 'created', true);
    end loop;

    stories_out := stories_out || jsonb_build_object(
      'id', story_id, 'external_id', story_ext, 'title', story_title, 'created', story_new, 'tasks', task_out
    );
  end loop;

  return jsonb_build_object('project_id', create_plan.project, 'stories', stories_out);
end;
$$ language plpgsql;

revoke execute on function create_plan(uuid, jsonb) from public, anon;
grant execute on function create_plan(uuid, jsonb) to authenticated;
