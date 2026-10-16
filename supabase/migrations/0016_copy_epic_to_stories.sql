-- task-branch: エピックのコンテキストと着手日時を配下のストーリーへ複製する（DESIGN.md §1.3.1 の段階②）
--   画面の2階層への切り替えと同じリリースで入れる（旧画面でエピックのコンテキストを編集すると複製とずれるため）。
--   - context: エピックの context を配下の全ストーリーへ写す。トリガ（save_epic_context_revision）が各ストーリーに版を作る
--   - 更新履歴: その版の更新者・日時は、エピックの最新版から引き継ぐ（最新版だけを各ストーリーの v1 として持ち越す）
--   - activated_at: エピックの着手日時を配下の全ストーリーへ写す
--   ストーリー側にすでに値がある（段階①以降にストーリーで書いた）ものは上書きしない。
--   エピック自体と epic_context_revisions のエピックの行は消さない（段階③）。

-- ---------------------------------------------------------------------------
-- context: 写したストーリーを控えておき、トリガが作った版を引き継ぎで書き換える。
-- ---------------------------------------------------------------------------
create temp table copied_story_contexts (story_id uuid primary key, epic_id uuid not null);

with copied as (
  update tasks s
     set context = e.context
    from tasks e
   where s.level = 'story'
     and s.parent_id = e.id
     and e.level = 'epic'
     and e.context is not null
     and s.context is null
  returning s.id as story_id, e.id as epic_id
)
insert into copied_story_contexts (story_id, epic_id)
select story_id, epic_id from copied;

with epic_latest as (
  select distinct on (r.epic_id) r.epic_id, r.edited_by_type, r.edited_by_id, r.created_at
    from epic_context_revisions r
   where r.epic_id in (select epic_id from copied_story_contexts)
   order by r.epic_id, r.version desc
),
story_latest as (
  select r.epic_id as story_id, max(r.version) as version
    from epic_context_revisions r
   where r.epic_id in (select story_id from copied_story_contexts)
   group by r.epic_id
)
update epic_context_revisions r
   set edited_by_type = el.edited_by_type,
       edited_by_id   = el.edited_by_id,
       created_at     = el.created_at
  from copied_story_contexts c
  join story_latest sl on sl.story_id = c.story_id
  join epic_latest  el on el.epic_id  = c.epic_id
 where r.epic_id = c.story_id
   and r.version = sl.version;

drop table copied_story_contexts;

-- ---------------------------------------------------------------------------
-- activated_at: 着手済みのエピックの配下は、ストーリーも着手済みにする。
-- ---------------------------------------------------------------------------
update tasks s
   set activated_at = e.activated_at
  from tasks e
 where s.level = 'story'
   and s.parent_id = e.id
   and e.level = 'epic'
   and e.activated_at is not null
   and s.activated_at is null;
