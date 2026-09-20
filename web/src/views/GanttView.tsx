// Gantt view: every project's phases/tasks on a shared timeline.
// Built from start_date/due_date on story-level nodes (epics summarize their children).
import { useMemo, useState, type MouseEvent as ReactMouseEvent } from "react";
import type { GraphNode, Project, ProjectGraph, Status, StoryInput } from "../lib/types";
import { STATUS_LABEL } from "../lib/types";
import { STATUS_COLOR } from "../lib/style";
import { TaskForm } from "../components/TaskForm";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { DetailPanel } from "../components/DetailPanel";
import { useResizableWidth, resizeHandleStyle } from "../lib/useResizableWidth";

const PX_PER_DAY = 8;
const ROW_H = 26;
const HEADER_H = 34;
const MS_DAY = 86_400_000;

function parseDate(s: string): Date {
  return new Date(`${s}T00:00:00`);
}
function diffDays(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / MS_DAY);
}
function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}
function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}
function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Prefill a new story form: starts the day after the epic's current last due
// date (or today if the epic has no dated stories) and spans one week.
function storyInitial(prevEnd: Date | null): StoryInput {
  const start = prevEnd ? addDays(prevEnd, 1) : new Date();
  const due = addDays(start, 6);
  return { title: "", status: "todo", start_date: isoDate(start), due_date: isoDate(due), description: null };
}

function editInitial(node: GraphNode): StoryInput {
  return {
    title: node.title,
    status: node.status,
    start_date: node.start_date,
    due_date: node.due_date,
    description: node.description,
  };
}

interface Row {
  key: string;
  kind: "project" | "epic" | "story";
  label: string;
  start: Date | null;
  end: Date | null;
  status: GraphNode["status"] | null;
  node: GraphNode | null;
}

// Sort ascending by start date; rows without a start date go last. Ties fall
// back to sort_order to keep a stable order.
function byStart(aStart: Date | null, aOrder: number, bStart: Date | null, bOrder: number): number {
  if (aStart && bStart) {
    const d = aStart.getTime() - bStart.getTime();
    return d !== 0 ? d : aOrder - bOrder;
  }
  if (aStart) return -1;
  if (bStart) return 1;
  return aOrder - bOrder;
}

function buildRows(data: { project: Project; graph: ProjectGraph }[]): Row[] {
  const rows: Row[] = [];
  for (const { project, graph } of data) {
    const tasksOf = (phaseId: string) =>
      graph.nodes
        .filter((n) => n.level === "story" && n.parent_id === phaseId)
        .map((t) => ({
          node: t,
          start: t.start_date ? parseDate(t.start_date) : null,
          end: t.due_date ? parseDate(t.due_date) : null,
        }))
        .sort((a, b) => byStart(a.start, a.node.sort_order, b.start, b.node.sort_order));

    const phases = graph.nodes
      .filter((n) => n.level === "epic")
      .map((ph) => {
        const kids = tasksOf(ph.id);
        const starts = kids.map((t) => t.start).filter(Boolean) as Date[];
        const ends = kids.map((t) => t.end).filter(Boolean) as Date[];
        const phStart = starts.length ? new Date(Math.min(...starts.map((d) => d.getTime()))) : null;
        const phEnd = ends.length ? new Date(Math.max(...ends.map((d) => d.getTime()))) : null;
        return { node: ph, kids, start: phStart, end: phEnd };
      })
      // Epics keep the manual order (sort_order); ties fall back to start date.
      .sort((a, b) =>
        a.node.sort_order !== b.node.sort_order
          ? a.node.sort_order - b.node.sort_order
          : byStart(a.start, a.node.sort_order, b.start, b.node.sort_order)
      );

    rows.push({ key: `p:${project.id}`, kind: "project", label: project.name, start: null, end: null, status: null, node: null });

    for (const ph of phases) {
      rows.push({ key: `ph:${ph.node.id}`, kind: "epic", label: ph.node.title, start: ph.start, end: ph.end, status: null, node: ph.node });

      for (const t of ph.kids) {
        rows.push({
          key: `t:${t.node.id}`,
          kind: "story",
          label: t.node.title,
          start: t.start,
          end: t.end,
          status: t.node.status,
          node: t.node,
        });
      }
    }
  }
  return rows;
}

export function GanttView({
  projects,
  project,
  graph,
  onSelectProject,
  onAddStory,
  onUpdateTask,
  onDeleteTask,
  onStartStory,
  onCompleteStory,
  onChangeStatus,
  onResizeStory,
  onReorderEpics,
}: {
  projects: Project[];
  project: Project;
  graph: ProjectGraph;
  onSelectProject: (projectId: string) => void;
  onAddStory?: (epic: GraphNode, values: StoryInput) => void;
  onUpdateTask?: (id: string, values: StoryInput) => void;
  onDeleteTask?: (id: string) => void;
  onStartStory?: (id: string) => void;
  onCompleteStory?: (id: string) => void;
  onChangeStatus?: (id: string, status: Status) => void;
  onResizeStory?: (id: string, startDate: string, dueDate: string) => void;
  onReorderEpics?: (orderedEpicIds: string[]) => void;
}) {
  const { width: LABEL_W, startResize } = useResizableWidth("gantt.labelWidth", 320, 160, 720);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [dragEpicId, setDragEpicId] = useState<string | null>(null);
  const [overEpicId, setOverEpicId] = useState<string | null>(null);
  const filtered = useMemo(() => [{ project, graph }], [project, graph]);

  const model = useMemo(() => {
    const rows = buildRows(filtered);
    const dates = rows.flatMap((r) => [r.start, r.end]).filter(Boolean) as Date[];
    if (dates.length === 0) return null;

    const min = new Date(Math.min(...dates.map((d) => d.getTime())));
    const max = new Date(Math.max(...dates.map((d) => d.getTime())));
    const timelineStart = startOfMonth(min);
    const timelineEnd = addMonths(startOfMonth(max), 1); // exclusive end
    const totalDays = diffDays(timelineStart, timelineEnd);
    const timelineW = totalDays * PX_PER_DAY;

    const months: { x: number; w: number; label: string }[] = [];
    for (let m = startOfMonth(timelineStart); m < timelineEnd; m = addMonths(m, 1)) {
      const next = addMonths(m, 1);
      months.push({
        x: diffDays(timelineStart, m) * PX_PER_DAY,
        w: diffDays(m, next) * PX_PER_DAY,
        label: `${m.getFullYear()}/${String(m.getMonth() + 1).padStart(2, "0")}`,
      });
    }

    const today = new Date();
    const todayX =
      today >= timelineStart && today < timelineEnd ? diffDays(timelineStart, today) * PX_PER_DAY : null;

    return { rows, timelineStart, timelineW, months, todayX };
  }, [filtered]);

  const toolbar = (
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
        value={project.id}
        onChange={(e) => {
          onSelectProject(e.target.value);
          setSelectedKey(null);
        }}
        style={{ fontSize: 13, padding: "4px 8px", borderRadius: 6, border: "1px solid #cbd2d9" }}
      >
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
    </div>
  );

  if (!model) {
    return (
      <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
        {toolbar}
        <div style={{ padding: 24, color: "#5f6b7a" }}>期間（開始日・期限）が設定されたタスクがありません。</div>
      </div>
    );
  }

  const { rows, timelineStart, timelineW, months, todayX } = model;
  const bodyH = rows.length * ROW_H;
  const totalW = LABEL_W + timelineW;
  const selectedRow = selectedKey ? rows.find((r) => r.key === selectedKey) ?? null : null;

  const epicIds = rows.filter((r) => r.kind === "epic").map((r) => r.node!.id);
  const handleEpicDrop = (targetId: string) => {
    if (!onReorderEpics || !dragEpicId || dragEpicId === targetId) return;
    const from = epicIds.indexOf(dragEpicId);
    const target = epicIds.indexOf(targetId);
    if (from < 0 || target < 0) return;
    const next = epicIds.filter((id) => id !== dragEpicId);
    let insertAt = next.indexOf(targetId);
    if (from < target) insertAt += 1; // dragging down: drop after the target
    next.splice(insertAt, 0, dragEpicId);
    onReorderEpics(next);
  };

  const [form, setForm] = useState<
    { mode: "create"; epic: GraphNode; prevEnd: Date | null } | { mode: "edit"; node: GraphNode } | null
  >(null);

  // Pending change awaiting confirmation via the custom modal.
  const [confirm, setConfirm] = useState<{ message: string; onConfirm: () => void } | null>(null);

  const submitForm = (values: StoryInput) => {
    if (!form) return;
    if (form.mode === "create") onAddStory?.(form.epic, values);
    else onUpdateTask?.(form.node.id, values);
    setForm(null);
  };

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      {toolbar}
      <div style={{ flex: 1, minHeight: 0, display: "flex" }}>
      <div style={{ flex: 1, minWidth: 0, overflow: "auto", background: "#fff" }}>
        <div style={{ width: totalW, position: "relative" }}>
        {/* header */}
        <div style={{ display: "flex", position: "sticky", top: 0, zIndex: 3, height: HEADER_H }}>
          <div
            style={{
              width: LABEL_W,
              flexShrink: 0,
              position: "sticky",
              left: 0,
              zIndex: 4,
              background: "#f7f9fa",
              borderBottom: "1px solid #cbd2d9",
              borderRight: "1px solid #cbd2d9",
              display: "flex",
              alignItems: "center",
              padding: "0 12px",
              fontSize: 12,
              fontWeight: 600,
              color: "#3b4149",
            }}
          >
            プロジェクト / エピック / ストーリー
            <div onMouseDown={startResize} title="ドラッグで幅を変更" style={{ ...resizeHandleStyle, right: -3 }} />
          </div>
          <div style={{ position: "relative", width: timelineW, background: "#f7f9fa", borderBottom: "1px solid #cbd2d9" }}>
            {months.map((mo) => (
              <div
                key={mo.x}
                style={{
                  position: "absolute",
                  left: mo.x,
                  width: mo.w,
                  height: HEADER_H,
                  borderLeft: "1px solid #e5e8eb",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 11,
                  color: "#5f6b7a",
                  boxSizing: "border-box",
                }}
              >
                {mo.label}
              </div>
            ))}
          </div>
        </div>

        {/* body */}
        <div style={{ position: "relative", height: bodyH }}>
          {/* gridlines + today marker */}
          <div style={{ position: "absolute", left: LABEL_W, top: 0, width: timelineW, height: bodyH, zIndex: 0 }}>
            {months.map((mo) => (
              <div
                key={mo.x}
                style={{ position: "absolute", left: mo.x, top: 0, width: 1, height: bodyH, background: "#eef1f3" }}
              />
            ))}
            {todayX != null && (
              <div style={{ position: "absolute", left: todayX, top: 0, width: 2, height: bodyH, background: "#d13212", opacity: 0.7 }} />
            )}
          </div>

          {rows.map((r) => (
            <div key={r.key} style={{ display: "flex", height: ROW_H, position: "relative" }}>
              <div
                draggable={r.kind === "epic" && !!onReorderEpics}
                onDragStart={
                  r.kind === "epic" && r.node && onReorderEpics ? () => setDragEpicId(r.node!.id) : undefined
                }
                onDragOver={
                  r.kind === "epic" && r.node && dragEpicId
                    ? (e) => {
                        e.preventDefault();
                        if (overEpicId !== r.node!.id) setOverEpicId(r.node!.id);
                      }
                    : undefined
                }
                onDragLeave={
                  r.kind === "epic" && r.node
                    ? () => setOverEpicId((cur) => (cur === r.node!.id ? null : cur))
                    : undefined
                }
                onDrop={
                  r.kind === "epic" && r.node
                    ? (e) => {
                        e.preventDefault();
                        handleEpicDrop(r.node!.id);
                        setDragEpicId(null);
                        setOverEpicId(null);
                      }
                    : undefined
                }
                onDragEnd={() => {
                  setDragEpicId(null);
                  setOverEpicId(null);
                }}
                style={{
                  width: LABEL_W,
                  flexShrink: 0,
                  position: "sticky",
                  left: 0,
                  zIndex: 2,
                  background:
                    r.node && overEpicId === r.node.id
                      ? "#eaf2fc"
                      : r.kind === "project"
                      ? "#eef1f3"
                      : "#fff",
                  boxShadow: r.node && overEpicId === r.node.id ? "inset 0 2px 0 #0972d3" : undefined,
                  opacity: r.node && dragEpicId === r.node.id ? 0.4 : undefined,
                  borderRight: "1px solid #cbd2d9",
                  borderBottom: "1px solid #f0f2f4",
                  display: "flex",
                  alignItems: "center",
                  padding: r.kind === "story" ? "0 8px 0 40px" : r.kind === "epic" ? "0 8px 0 22px" : "0 8px",
                  fontSize: r.kind === "project" ? 12 : 11,
                  fontWeight: r.kind === "story" ? 400 : 700,
                  color: r.kind === "story" ? "#3b4149" : "#1f2933",
                  cursor: r.kind === "epic" && onReorderEpics ? "grab" : undefined,
                  gap: 4,
                }}
                title={r.kind === "epic" && onReorderEpics ? `${r.label}（ドラッグで並び替え）` : r.label}
              >
                <span
                  onClick={() => {
                    if (r.node) setSelectedKey(r.key);
                  }}
                  style={{
                    flex: 1,
                    minWidth: 0,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    cursor: r.node ? "pointer" : "default",
                  }}
                >
                  {r.label}
                </span>
                {r.kind === "epic" && r.node && onAddStory && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setForm({ mode: "create", epic: r.node!, prevEnd: r.end });
                    }}
                    title="ストーリーを追加"
                    style={{
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
                    }}
                  >
                    +
                  </button>
                )}
              </div>
              <div style={{ position: "relative", width: timelineW, borderBottom: "1px solid #f0f2f4" }}>
                {r.start && r.end && (
                  <Bar
                    row={r}
                    timelineStart={timelineStart}
                    selected={r.key === selectedKey}
                    onSelect={() => setSelectedKey(r.key)}
                    onResize={
                      r.kind === "story" && r.node && onResizeStory
                        ? (startDate, dueDate) => {
                            const f = (iso: string) => {
                              const d = parseDate(iso);
                              return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
                            };
                            const node = r.node!;
                            setConfirm({
                              message: `「${r.label}」の期間を\n${f(startDate)} 〜 ${f(dueDate)}\nに変更します。よろしいですか？`,
                              onConfirm: () => onResizeStory(node.id, startDate, dueDate),
                            });
                          }
                        : undefined
                    }
                  />
                )}
              </div>
            </div>
          ))}
        </div>
        {/* extra room so the last row's status menu (opens below the bar) stays on-screen */}
        <div style={{ height: 160 }} />
        </div>
      </div>
      {selectedRow && (
        <DetailPanel
          title={selectedRow.label}
          node={selectedRow.node}
          start={selectedRow.start}
          end={selectedRow.end}
          onClose={() => setSelectedKey(null)}
          onEdit={onUpdateTask ? (node) => setForm({ mode: "edit", node }) : undefined}
          onDelete={
            onDeleteTask
              ? (node) => {
                  if (window.confirm(`ストーリー「${node.title}」を削除します。\n配下のタスクも削除されます。よろしいですか？`)) {
                    onDeleteTask(node.id);
                    setSelectedKey(null);
                  }
                }
              : undefined
          }
          onStart={onStartStory ? (node) => onStartStory(node.id) : undefined}
          onComplete={onCompleteStory ? (node) => onCompleteStory(node.id) : undefined}
          onChangeStatus={
            onChangeStatus
              ? (node, status) =>
                  setConfirm({
                    message: `「${node.title}」のステータスを『${STATUS_LABEL[status]}』に変更します。よろしいですか？`,
                    onConfirm: () => onChangeStatus(node.id, status),
                  })
              : undefined
          }
        />
      )}
      </div>

      {form && (
        <TaskForm
          heading={form.mode === "create" ? "ストーリーを追加" : "ストーリーを変更"}
          submitLabel={form.mode === "create" ? "追加" : "保存"}
          initial={form.mode === "create" ? storyInitial(form.prevEnd) : editInitial(form.node)}
          onSubmit={submitForm}
          onCancel={() => setForm(null)}
        />
      )}

      {confirm && (
        <ConfirmDialog
          message={confirm.message}
          onConfirm={() => {
            confirm.onConfirm();
            setConfirm(null);
          }}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
}

function Bar({
  row,
  timelineStart,
  selected,
  onSelect,
  onResize,
}: {
  row: Row;
  timelineStart: Date;
  selected: boolean;
  onSelect: () => void;
  onResize?: (startDate: string, dueDate: string) => void;
}) {
  const start = row.start as Date;
  const end = row.end as Date;
  const isPhase = row.kind === "epic";
  const c = row.status ? STATUS_COLOR[row.status] : null;

  // Live drag offset (in whole days) while an edge is being dragged; null otherwise.
  const [drag, setDrag] = useState<{ edge: "start" | "end"; days: number } | null>(null);

  // Preview dates reflect the in-progress drag so the bar tracks the cursor.
  const span = diffDays(start, end); // inclusive span minus 1; keeps at least 1 day when clamped
  let pStart = start;
  let pEnd = end;
  if (drag) {
    if (drag.edge === "start") pStart = addDays(start, Math.min(drag.days, span));
    else pEnd = addDays(end, Math.max(drag.days, -span));
  }
  const left = diffDays(timelineStart, pStart) * PX_PER_DAY;
  const width = Math.max((diffDays(pStart, pEnd) + 1) * PX_PER_DAY, 4);

  const fmt = (d: Date) => `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
  const short = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}`;

  const beginResize = (edge: "start" | "end", e: ReactMouseEvent) => {
    if (!onResize) return;
    e.stopPropagation();
    e.preventDefault();
    const startX = e.clientX;
    const clampDays = (raw: number) => (edge === "start" ? Math.min(raw, span) : Math.max(raw, -span));
    const onMove = (ev: MouseEvent) => {
      setDrag({ edge, days: clampDays(Math.round((ev.clientX - startX) / PX_PER_DAY)) });
    };
    const onUp = (ev: MouseEvent) => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      setDrag(null);
      const days = clampDays(Math.round((ev.clientX - startX) / PX_PER_DAY));
      if (days === 0) return;
      if (edge === "start") onResize(isoDate(addDays(start, days)), isoDate(end));
      else onResize(isoDate(start), isoDate(addDays(end, days)));
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const showHandles = !isPhase && !!onResize;
  const HANDLE_W = 7;

  return (
    <>
      <div
        onClick={() => {
          if (drag) return;
          onSelect();
        }}
        title={`${row.label}\n${fmt(pStart)} 〜 ${fmt(pEnd)}`}
        style={{
          position: "absolute",
          left,
          width,
          top: isPhase ? ROW_H / 2 - 3 : 4,
          height: isPhase ? 6 : ROW_H - 10,
          borderRadius: isPhase ? 3 : 4,
          background: isPhase ? "#94a0ad" : c?.border ?? "#94a0ad",
          opacity: isPhase ? 0.55 : 1,
          cursor: "pointer",
          outline: selected || drag ? "2px solid #1f2933" : "none",
          outlineOffset: 1,
        }}
      />
      {showHandles && (
        <>
          <div
            onMouseDown={(e) => beginResize("start", e)}
            onClick={(e) => e.stopPropagation()}
            title="ドラッグで開始日を変更"
            style={{
              position: "absolute",
              left: left - HANDLE_W / 2,
              width: HANDLE_W,
              top: 4,
              height: ROW_H - 10,
              cursor: "ew-resize",
              zIndex: 10,
            }}
          />
          <div
            onMouseDown={(e) => beginResize("end", e)}
            onClick={(e) => e.stopPropagation()}
            title="ドラッグで期限を変更"
            style={{
              position: "absolute",
              left: left + width - HANDLE_W / 2,
              width: HANDLE_W,
              top: 4,
              height: ROW_H - 10,
              cursor: "ew-resize",
              zIndex: 10,
            }}
          />
        </>
      )}
      {!isPhase && (
        <span
          style={{
            position: "absolute",
            left: left + width + 6,
            top: 0,
            height: ROW_H,
            display: "flex",
            alignItems: "center",
            fontSize: 10,
            color: "#5f6b7a",
            whiteSpace: "nowrap",
            pointerEvents: "none",
          }}
        >
          {short(pStart)} - {short(pEnd)}
        </span>
      )}
    </>
  );
}
