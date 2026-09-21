import { useMemo, useState, type CSSProperties } from "react";
import type { KanbanLane, Project, Status, StoryInput, Task } from "../lib/types";
import { STATUS_LABEL, STATUS_ORDER } from "../lib/types";
import { STATUS_COLOR } from "../lib/style";
import { TaskForm } from "../components/TaskForm";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { DetailPanel } from "../components/DetailPanel";
import { IdBadge } from "../components/IdBadge";
import { useResizableWidth, resizeHandleStyle } from "../lib/useResizableWidth";


const toDate = (s: string | null) => (s ? new Date(`${s}T00:00:00`) : null);

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
  onAddTask,
  onUpdateTask,
  onDeleteTask,
}: {
  projects: Project[];
  lanes: KanbanLane[];
  projectFilter: string | null;
  onChangeProjectFilter: (projectId: string | null) => void;
  onChangeStatus: (taskId: string, status: Status) => void;
  onAddTask: (story: Task, values: StoryInput) => void;
  onUpdateTask: (id: string, values: StoryInput) => void;
  onDeleteTask: (id: string) => void;
}) {
  const { width: LABEL_W, startResize } = useResizableWidth("kanban.labelWidth", 280, 160, 640);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Task | null>(null);
  const [adding, setAdding] = useState<Task | null>(null);
  const [pendingMove, setPendingMove] = useState<{ task: Task; status: Status } | null>(null);
  const [drag, setDrag] = useState<{ task: Task; storyId: string } | null>(null);
  const [over, setOver] = useState<{ storyId: string; status: Status } | null>(null);

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
    const tasks = visibleProjects.flatMap((p) => lanesByProject.get(p.id) ?? []).flatMap((l) => l.tasks);
    return tasks.find((t) => t.id === selectedId) ?? null;
  }, [visibleProjects, lanesByProject, selectedId]);

  const endDrag = () => {
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
          const canDrop = drag?.storyId === story.id && drag.task.status !== s;
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
                if (canDrop && drag) setPendingMove({ task: drag.task, status: s });
                endDrag();
              }}
              style={{
                flex: 1,
                minHeight: 64,
                padding: 8,
                borderLeft: "1px solid #e5e8eb",
                background: isOver ? "#eaf2fc" : canDrop ? "#f7fafe" : undefined,
                outline: isOver ? "2px dashed #0972d3" : "none",
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

        <div style={{ flex: 1, minHeight: 0, padding: 24, overflow: "auto", boxSizing: "border-box" }}>
          {visibleProjects.length === 0 ? (
            <div style={{ color: "#5f6b7a" }}>
              {projectFilter ? "プロジェクトが見つかりません。" : "プロジェクトがありません。"}
            </div>
          ) : (
            visibleProjects.map((p) => {
              const projectLanes = lanesByProject.get(p.id) ?? [];
              return (
                <section key={p.id} style={{ marginBottom: 28 }}>
                  <h3 style={{ margin: "0 0 8px", fontSize: 15 }}>{p.name}</h3>
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
                          <div key={s} style={{ ...headerCell, flex: 1, borderLeft: "1px solid #e5e8eb" }}>
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
          title={selected.title}
          node={selected}
          start={toDate(selected.start_date)}
          end={toDate(selected.due_date)}
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
          message={`「${pendingMove.task.title}」のステータスを『${STATUS_LABEL[pendingMove.status]}』に変更します。よろしいですか？`}
          onConfirm={() => {
            onChangeStatus(pendingMove.task.id, pendingMove.status);
            setPendingMove(null);
          }}
          onCancel={() => setPendingMove(null)}
        />
      )}
    </div>
  );
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
        borderLeft: `3px solid ${STATUS_COLOR[task.status].border}`,
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
      <div style={weak} title={[epicTitle, storyTitle].filter(Boolean).join(" - ")}>
        {place}
      </div>
      <div style={{ marginTop: 2 }}>{task.title}</div>
      {task.due_date && <div style={weak}>期限 {task.due_date}</div>}
    </div>
  );
}

// 長い名前はカードの幅を食うので、6文字で切って「…」を付ける。
const clip = (text: string) => (text.length > 6 ? `${text.slice(0, 6)}…` : text);

const weak: CSSProperties = {
  fontSize: 11,
  color: "#94a0ad",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
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
