import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { listEpics, listProjectStories } from "../lib/api";
import type { BacklogEpic, KanbanLane, Project, Status, StoryInput, Task } from "../lib/types";
import { STATUS_LABEL, STATUS_ORDER } from "../lib/types";
import { STATUS_COLOR } from "../lib/style";
import { TaskForm } from "../components/TaskForm";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { DetailPanel, type StoryGroup } from "../components/DetailPanel";
import { IdBadge } from "../components/IdBadge";
import { useResizableWidth, resizeHandleStyle } from "../lib/useResizableWidth";


const toDate = (s: string | null) => (s ? new Date(`${s}T00:00:00`) : null);

// ドラッグ中、ボードの上下この幅に入ったら自動スクロールする（px / 1フレームの最大量）。
const AUTO_SCROLL_EDGE = 72;
const AUTO_SCROLL_MAX_STEP = 18;

// One board per project: a swimlane per in-progress story, columns = task status.
// The project filter (null = all projects) is owned by the caller (kept in the URL).
// A card can only move between columns of its own story (its parent is fixed),
// and a drop is applied only after the user confirms it.
export function KanbanView({
  projects,
  lanes,
  projectFilter,
  onChangeProjectFilter,
  onChangeStatus,
  onMoveTask,
  onAddStory,
  onAddTask,
  onUpdateTask,
  onDeleteTask,
}: {
  projects: Project[];
  lanes: KanbanLane[];
  projectFilter: string | null;
  onChangeProjectFilter: (projectId: string | null) => void;
  onChangeStatus: (taskId: string, status: Status) => void;
  onMoveTask: (taskId: string, storyId: string, status: Status) => void;
  onAddStory: (epic: Pick<Task, "id" | "project_id">, values: StoryInput) => void;
  onAddTask: (story: Task, values: StoryInput) => void;
  onUpdateTask: (id: string, values: StoryInput) => void;
  onDeleteTask: (id: string) => void;
}) {
  const { width: LABEL_W, startResize } = useResizableWidth("kanban.labelWidth", 280, 160, 640);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Task | null>(null);
  const [adding, setAdding] = useState<Task | null>(null);
  // ストーリー追加: エピックを選んでから、いつもの TaskForm で名前と期間を入れる
  const [pickEpic, setPickEpic] = useState<{ project: Project; epics: BacklogEpic[] } | null>(null);
  const [epicId, setEpicId] = useState("");
  const [storyForm, setStoryForm] = useState<{ epic: Pick<Task, "id" | "project_id">; epicTitle: string } | null>(null);
  // targetStory がある＝別ストーリーへの移動。無ければ同じストーリー内のステータス変更。
  const [pendingMove, setPendingMove] = useState<{ task: Task; status: Status; targetStory?: Task } | null>(null);
  const [drag, setDrag] = useState<{ task: Task; storyId: string } | null>(null);
  const [over, setOver] = useState<{ storyId: string; status: Status } | null>(null);
  // ストーリーの変更: 詳細パネルのエピック / ストーリー名を押したときのプルダウンの中身。
  // 選んだタスクのプロジェクト単位で読み、同じプロジェクトの間は読み直さない。
  const [storySource, setStorySource] = useState<{ projectId: string; epics: BacklogEpic[]; stories: Task[] } | null>(
    null
  );
  const boardRef = useRef<HTMLDivElement>(null);
  const autoScroll = useRef<{ raf: number; step: number } | null>(null);

  const visibleProjects = useMemo(
    () => (projectFilter ? projects.filter((p) => p.id === projectFilter) : projects),
    [projects, projectFilter]
  );

  // Lanes grouped by project, each ordered by epic then story.
  const lanesByProject = useMemo(() => {
    const byProject = new Map<string, KanbanLane[]>();
    for (const l of lanes) byProject.set(l.story.project_id, [...(byProject.get(l.story.project_id) ?? []), l]);
    for (const list of byProject.values())
      list.sort(
        (a, b) => (a.epic?.sort_order ?? 0) - (b.epic?.sort_order ?? 0) || a.story.sort_order - b.story.sort_order
      );
    return byProject;
  }, [lanes]);

  // Looked up from the visible lanes so the panel reflects moves / edits; closes if the task is gone
  // or its project is filtered out.
  const selected = useMemo(() => {
    if (!selectedId) return null;
    for (const p of visibleProjects)
      for (const lane of lanesByProject.get(p.id) ?? []) {
        const task = lane.tasks.find((t) => t.id === selectedId);
        if (task) return { task, lane };
      }
    return null;
  }, [visibleProjects, lanesByProject, selectedId]);

  const selectedProjectId = selected?.task.project_id;
  useEffect(() => {
    if (!selectedProjectId || storySource?.projectId === selectedProjectId) return;
    let cancelled = false;
    Promise.all([listEpics(selectedProjectId), listProjectStories(selectedProjectId)])
      .then(([epics, stories]) => {
        if (!cancelled) setStorySource({ projectId: selectedProjectId, epics, stories });
      })
      .catch(() => {
        // 読めなければプルダウンを出さないだけで、詳細の表示は妨げない。
      });
    return () => {
      cancelled = true;
    };
  }, [selectedProjectId, storySource?.projectId]);

  // エピックごとにまとめた移動先。進行中でないストーリーには状態を添える。
  const storyOptions = useMemo<StoryGroup[] | undefined>(() => {
    if (!selectedProjectId || storySource?.projectId !== selectedProjectId) return undefined;
    return storySource.epics
      .map((epic) => ({
        epic: epic.title,
        stories: storySource.stories
          .filter((story) => story.parent_id === epic.id)
          .map((story) => ({
            id: story.id,
            label: story.status === "in_progress" ? story.title : `${story.title}（${STATUS_LABEL[story.status]}）`,
          })),
      }))
      .filter((group) => group.stories.length > 0);
  }, [selectedProjectId, storySource]);

  const startAddStory = async (project: Project) => {
    try {
      const epics = await listEpics(project.id);
      setEpicId(epics[0]?.id ?? "");
      setPickEpic({ project, epics });
    } catch (e: any) {
      window.alert(String(e.message ?? e));
    }
  };

  const stopAutoScroll = () => {
    if (!autoScroll.current) return;
    cancelAnimationFrame(autoScroll.current.raf);
    autoScroll.current = null;
  };

  // 画面外のストーリーへ運べるよう、ボードの上下端にカードを持っていったらスクロールする。
  // ドロップ先の判定は列の onDragOver / onDrop がそのまま見るので、ここは位置だけを動かす。
  const updateAutoScroll = (clientY: number) => {
    const board = boardRef.current;
    if (!board) return;
    const { top, bottom } = board.getBoundingClientRect();
    const ratio =
      clientY < top + AUTO_SCROLL_EDGE
        ? -(top + AUTO_SCROLL_EDGE - clientY) / AUTO_SCROLL_EDGE
        : clientY > bottom - AUTO_SCROLL_EDGE
        ? (clientY - (bottom - AUTO_SCROLL_EDGE)) / AUTO_SCROLL_EDGE
        : 0;
    if (!ratio) {
      stopAutoScroll();
      return;
    }
    const step = Math.max(-1, Math.min(1, ratio)) * AUTO_SCROLL_MAX_STEP;
    if (autoScroll.current) {
      autoScroll.current.step = step;
      return;
    }
    const tick = () => {
      const running = autoScroll.current;
      const node = boardRef.current;
      if (!running || !node) return;
      node.scrollTop += running.step;
      running.raf = requestAnimationFrame(tick);
    };
    autoScroll.current = { raf: requestAnimationFrame(tick), step };
  };

  const endDrag = () => {
    stopAutoScroll();
    setDrag(null);
    setOver(null);
  };

  const renderLane = ({ story, epic, tasks }: KanbanLane) => {
    const done = tasks.filter((t) => t.status === "done").length;
    return (
      <div key={story.id} style={{ display: "flex", borderBottom: "1px solid #e5e8eb" }}>
        <div style={{ width: LABEL_W, flex: "none", padding: "10px 12px", boxSizing: "border-box", position: "relative" }}>
          {epic && <div style={{ fontSize: 11, color: "#5f6b7a" }}>{epic.title}</div>}
          <div style={{ display: "flex", alignItems: "flex-start", gap: 6, marginTop: 2 }}>
            <div style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>{story.title}</div>
            <button onClick={() => setAdding(story)} title="タスクを追加" style={addBtn}>
              +
            </button>
          </div>
          <div style={{ fontSize: 11, color: "#94a0ad", marginTop: 4 }}>
            {tasks.length === 0 ? "タスクなし" : `完了 ${done} / ${tasks.length}`}
          </div>
          {/* same handle as the header, so the column can be dragged from any lane */}
          <div onMouseDown={startResize} title="ドラッグで幅を変更" style={{ ...resizeHandleStyle, right: -3 }} />
        </div>

        {STATUS_ORDER.map((s) => {
          // 同じプロジェクト内なら、同じストーリーの同じ列以外どこへでも落とせる
          // （別ストーリーなら移動になる）。プロジェクトをまたぐ移動は許さない。
          const canDrop =
            !!drag &&
            drag.task.project_id === story.project_id &&
            !(drag.storyId === story.id && drag.task.status === s);
          const isOver = canDrop && over?.storyId === story.id && over.status === s;
          return (
            <div
              key={s}
              onDragOver={
                canDrop
                  ? (e) => {
                      e.preventDefault();
                      if (!isOver) setOver({ storyId: story.id, status: s });
                    }
                  : undefined
              }
              onDragLeave={() => setOver((cur) => (cur?.storyId === story.id && cur.status === s ? null : cur))}
              onDrop={(e) => {
                e.preventDefault();
                if (canDrop && drag) {
                  setPendingMove({
                    task: drag.task,
                    status: s,
                    targetStory: drag.storyId === story.id ? undefined : story,
                  });
                }
                endDrag();
              }}
              style={{
                flex: 1,
                minWidth: 0,
                minHeight: 64,
                padding: 8,
                borderLeft: "1px solid #e5e8eb",
                background: isOver ? "#eaf2fc" : canDrop ? "#f7fafe" : undefined,
                outline: isOver ? "2px solid #0972d3" : "none",
                outlineOffset: -4,
              }}
            >
              {tasks
                .filter((t) => t.status === s)
                .map((t) => (
                  <Card
                    key={t.id}
                    task={t}
                    epicTitle={epic?.title ?? null}
                    storyTitle={story.title}
                    dragging={drag?.task.id === t.id}
                    selected={selectedId === t.id}
                    onSelect={() => setSelectedId(t.id)}
                    onDragStart={() => setDrag({ task: t, storyId: story.id })}
                    onDragEnd={endDrag}
                  />
                ))}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div style={{ display: "flex", height: "100%" }}>
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "8px 12px",
            borderBottom: "1px solid #e5e8eb",
            background: "#fff",
            flexShrink: 0,
          }}
        >
          <label style={{ fontSize: 12, color: "#5f6b7a" }}>プロジェクト</label>
          <select
            value={projectFilter ?? ""}
            onChange={(e) => onChangeProjectFilter(e.target.value || null)}
            style={{ fontSize: 13, padding: "4px 8px", borderRadius: 6, border: "1px solid #cbd2d9" }}
          >
            <option value="">すべてのプロジェクト</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        <div
          ref={boardRef}
          onDragOver={(e) => updateAutoScroll(e.clientY)}
          onDrop={stopAutoScroll}
          style={{ flex: 1, minHeight: 0, padding: 24, overflow: "auto", boxSizing: "border-box" }}
        >
          {visibleProjects.length === 0 ? (
            <div style={{ color: "#5f6b7a" }}>
              {projectFilter ? "プロジェクトが見つかりません。" : "プロジェクトがありません。"}
            </div>
          ) : (
            visibleProjects.map((p) => {
              const projectLanes = lanesByProject.get(p.id) ?? [];
              return (
                <section key={p.id} style={{ marginBottom: 28 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "0 0 8px" }}>
                    <h3 style={{ margin: 0, fontSize: 15 }}>{p.name}</h3>
                    <button onClick={() => startAddStory(p)} style={quietBtn}>
                      ストーリーを追加
                    </button>
                  </div>
                  {projectLanes.length === 0 ? (
                    <div style={{ fontSize: 13, color: "#5f6b7a" }}>進行中のストーリーがありません。</div>
                  ) : (
                    <div
                      style={{
                        minWidth: LABEL_W + 3 * 220,
                        border: "1px solid #e5e8eb",
                        borderRadius: 10,
                        background: "#fff",
                      }}
                    >
                      <div style={{ display: "flex", borderBottom: "1px solid #e5e8eb", background: "#f7f8f9" }}>
                        <div style={{ ...headerCell, width: LABEL_W, flex: "none", position: "relative" }}>
                        エピック / ストーリー
                        <div onMouseDown={startResize} title="ドラッグで幅を変更" style={{ ...resizeHandleStyle, right: -3 }} />
                      </div>
                        {STATUS_ORDER.map((s) => (
                          <div key={s} style={{ ...headerCell, flex: 1, minWidth: 0, borderLeft: "1px solid #e5e8eb" }}>
                            <span style={{ ...dot, background: STATUS_COLOR[s].border }} />
                            {STATUS_LABEL[s]}
                          </div>
                        ))}
                      </div>
                      {projectLanes.map(renderLane)}
                    </div>
                  )}
                </section>
              );
            })
          )}
        </div>
      </div>

      {selected && (
        <DetailPanel
          title={selected.task.title}
          node={selected.task}
          start={toDate(selected.task.start_date)}
          end={toDate(selected.task.due_date)}
          place={{ epic: selected.lane.epic?.title ?? null, story: selected.lane.story.title }}
          storyOptions={storyOptions}
          currentStoryId={selected.task.parent_id}
          onPickStory={(storyId) => {
            const target = storySource?.stories.find((story) => story.id === storyId);
            if (target) setPendingMove({ task: selected.task, status: selected.task.status, targetStory: target });
          }}
          onClose={() => setSelectedId(null)}
          onEdit={(t) => setEditing(t)}
          onDelete={(t) => {
            if (window.confirm(`タスク「${t.title}」を削除します。よろしいですか？`)) {
              onDeleteTask(t.id);
              setSelectedId(null);
            }
          }}
          onStart={(t) => onChangeStatus(t.id, "in_progress")}
          onComplete={(t) => onChangeStatus(t.id, "done")}
          onChangeStatus={(t, status) => setPendingMove({ task: t, status })}
        />
      )}

      {editing && (
        <TaskForm
          heading="タスクを変更"
          noun="タスク"
          submitLabel="保存"
          initial={{
            title: editing.title,
            status: editing.status,
            start_date: editing.start_date,
            due_date: editing.due_date,
            description: editing.description,
          }}
          onSubmit={(values) => {
            onUpdateTask(editing.id, values);
            setEditing(null);
          }}
          onCancel={() => setEditing(null)}
        />
      )}

      {pickEpic && (
        <div style={overlay} onMouseDown={() => setPickEpic(null)}>
          <div style={dialog} onMouseDown={(e) => e.stopPropagation()}>
            <h3 style={{ margin: "0 0 16px", fontSize: 16 }}>ストーリーを追加（{pickEpic.project.name}）</h3>
            {pickEpic.epics.length === 0 ? (
              <div style={{ fontSize: 13, color: "#94a0ad" }}>
                このプロジェクトにはエピックがありません。先にバックログから追加してください。
              </div>
            ) : (
              <>
                <label style={fieldLabel}>エピック</label>
                <select value={epicId} onChange={(e) => setEpicId(e.target.value)} style={selectInput}>
                  {pickEpic.epics.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.title}
                      {e.activated_at ? "" : "（バックログ）"}
                    </option>
                  ))}
                </select>
                <div style={{ fontSize: 11, color: "#94a0ad", marginTop: 6 }}>
                  ステータスは次の画面で選べます。既定は、カンバンに出るよう進行中です。
                </div>
              </>
            )}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 20 }}>
              <button onClick={() => setPickEpic(null)} style={quietBtn}>
                キャンセル
              </button>
              <button
                onClick={() => {
                  const epic = pickEpic.epics.find((e) => e.id === epicId);
                  if (!epic) return;
                  setStoryForm({
                    epic: { id: epic.id, project_id: pickEpic.project.id },
                    epicTitle: epic.title,
                  });
                  setPickEpic(null);
                }}
                disabled={!epicId}
                style={primaryBtn}
              >
                次へ
              </button>
            </div>
          </div>
        </div>
      )}

      {storyForm && (
        <TaskForm
          heading={`ストーリーを追加（${storyForm.epicTitle}）`}
          submitLabel="追加"
          initial={{ title: "", status: "in_progress", start_date: null, due_date: null, description: null }}
          todoHint="未着手のままだとカンバンには出ません（ガントチャートとバックログから見えます）。"
          onSubmit={(values) => {
            onAddStory(storyForm.epic, values);
            setStoryForm(null);
          }}
          onCancel={() => setStoryForm(null)}
        />
      )}

      {adding && (
        <TaskForm
          heading={`タスクを追加（${adding.title}）`}
          noun="タスク"
          submitLabel="追加"
          initial={{ title: "", status: "todo", start_date: null, due_date: null, description: null }}
          onSubmit={(values) => {
            onAddTask(adding, values);
            setAdding(null);
          }}
          onCancel={() => setAdding(null)}
        />
      )}

      {pendingMove && (
        <ConfirmDialog
          message={moveMessage(pendingMove)}
          confirmLabel={pendingMove.targetStory ? "移動する" : undefined}
          onConfirm={() => {
            if (pendingMove.targetStory) {
              onMoveTask(pendingMove.task.id, pendingMove.targetStory.id, pendingMove.status);
            } else {
              onChangeStatus(pendingMove.task.id, pendingMove.status);
            }
            setPendingMove(null);
          }}
          onCancel={() => setPendingMove(null)}
        />
      )}
    </div>
  );
}

// 確認モーダルの文面。ステータスが変わらない移動ではその一文を省き、
// 進行中でないストーリーへ移すときはカンバンから消えることを添える。
function moveMessage({ task, status, targetStory }: { task: Task; status: Status; targetStory?: Task }): string {
  if (!targetStory) {
    return `「${task.title}」のステータスを『${STATUS_LABEL[status]}』に変更します。よろしいですか？`;
  }
  const head =
    status === task.status
      ? `「${task.title}」を\nストーリー「${targetStory.title}」へ移動します。`
      : `「${task.title}」を\nストーリー「${targetStory.title}」へ移動し、` +
        `ステータスを『${STATUS_LABEL[status]}』にします。`;
  const warn =
    targetStory.status === "in_progress"
      ? ""
      : `\n移動先は${STATUS_LABEL[targetStory.status]}のストーリーのため、移動するとカンバンには出なくなります。`;
  return `${head}${warn}\nよろしいですか？`;
}

// 上から ID / エピック - ストーリー / タイトル / 期限。上2行は弱い補助として出す。
function Card({
  task,
  epicTitle,
  storyTitle,
  dragging,
  selected,
  onSelect,
  onDragStart,
  onDragEnd,
}: {
  task: Task;
  epicTitle: string | null;
  storyTitle: string;
  dragging: boolean;
  selected: boolean;
  onSelect: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  const place = [epicTitle, storyTitle].filter(Boolean).map((t) => clip(t as string)).join(" - ");
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      onClick={onSelect}
      title={task.description ?? task.title}
      style={{
        background: "#fff",
        border: "1px solid #e5e8eb",
        borderRadius: 6,
        padding: "6px 8px",
        marginBottom: 6,
        fontSize: 12,
        color: "#1f2933",
        cursor: "pointer",
        outline: selected ? "2px solid #1f2933" : "none",
        outlineOffset: 1,
        opacity: dragging ? 0.4 : 1,
        boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
      }}
    >
      <div style={{ fontSize: 11, color: "#94a0ad", lineHeight: 1.6 }}>
        <IdBadge id={task.id} />
      </div>
      <div style={placeStyle} title={[epicTitle, storyTitle].filter(Boolean).join(" - ")}>
        {place}
      </div>
      <div style={{ marginTop: 2 }}>{task.title}</div>
      {task.due_date && <div style={weak}>期限 {task.due_date}</div>}
    </div>
  );
}

// 長い名前はカードの幅を食うので、6文字で切って「…」を付ける。
const clip = (text: string) => (text.length > 6 ? `${text.slice(0, 6)}…` : text);

// エピック - ストーリーは「補助・ラベル」、期限はそれより弱い色で出す。
const placeStyle: CSSProperties = {
  fontSize: 11,
  color: "#5f6b7a",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

const weak: CSSProperties = {
  fontSize: 11,
  color: "#94a0ad",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

const quietBtn: CSSProperties = {
  background: "#fff",
  color: "#3b4149",
  border: "1px solid #cbd2d9",
  borderRadius: 6,
  padding: "5px 10px",
  fontSize: 12,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const primaryBtn: CSSProperties = {
  background: "#0972d3",
  color: "#fff",
  border: "none",
  borderRadius: 6,
  padding: "7px 14px",
  fontSize: 13,
  cursor: "pointer",
};

const overlay: CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(31,41,51,0.4)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 100,
};

const dialog: CSSProperties = {
  background: "#fff",
  borderRadius: 12,
  padding: 24,
  width: 420,
  maxWidth: "90vw",
  boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
};

const fieldLabel: CSSProperties = {
  display: "block",
  fontSize: 12,
  fontWeight: 600,
  color: "#5f6b7a",
  marginBottom: 6,
};

const selectInput: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  fontSize: 13,
  padding: "8px 10px",
  borderRadius: 6,
  border: "1px solid #cbd2d9",
};

// Same look as the gantt's "add story" button.
const addBtn: CSSProperties = {
  flexShrink: 0,
  width: 18,
  height: 18,
  lineHeight: "16px",
  padding: 0,
  border: "1px solid #cbd2d9",
  borderRadius: 4,
  background: "#fff",
  color: "#0972d3",
  cursor: "pointer",
  fontSize: 13,
};

const headerCell: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  padding: "8px 12px",
  fontSize: 12,
  fontWeight: 600,
  color: "#5f6b7a",
};

const dot: CSSProperties = {
  display: "inline-block",
  width: 8,
  height: 8,
  borderRadius: 4,
};
