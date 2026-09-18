// Gantt view: every project's phases/tasks on a shared timeline.
// Built from start_date/due_date on story-level nodes (epics summarize their children).
import { useMemo, useState, type CSSProperties, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import type { GraphNode, Project, ProjectGraph, Status, StoryInput } from "../lib/types";
import { LEVEL_LABEL, STATUS_LABEL, STATUS_ORDER } from "../lib/types";
import { STATUS_COLOR } from "../lib/style";
import { TaskForm } from "../components/TaskForm";

const PX_PER_DAY = 8;
const ROW_H = 26;
const LABEL_W = 320;
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
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [statusMenuKey, setStatusMenuKey] = useState<string | null>(null);
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
                    statusMenuOpen={r.key === statusMenuKey}
                    onToggleStatusMenu={
                      r.kind === "story" && r.node && onChangeStatus
                        ? () => setStatusMenuKey((cur) => (cur === r.key ? null : r.key))
                        : undefined
                    }
                    onPickStatus={
                      r.kind === "story" && r.node && onChangeStatus
                        ? (status) => {
                            setStatusMenuKey(null);
                            const node = r.node!;
                            setConfirm({
                              message: `「${r.label}」のステータスを『${STATUS_LABEL[status]}』に変更します。よろしいですか？`,
                              onConfirm: () => onChangeStatus(node.id, status),
                            });
                          }
                        : undefined
                    }
                    onCloseStatusMenu={() => setStatusMenuKey(null)}
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
          row={selectedRow}
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

function ConfirmDialog({
  message,
  onConfirm,
  onCancel,
}: {
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const btnBase: CSSProperties = {
    padding: "7px 16px",
    borderRadius: 6,
    fontSize: 13,
    cursor: "pointer",
  };
  return (
    <div
      onClick={onCancel}
      onKeyDown={(e) => {
        if (e.key === "Escape") onCancel();
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 50,
        background: "rgba(31,41,51,0.35)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#fff",
          borderRadius: 8,
          boxShadow: "0 8px 28px rgba(31,41,51,0.25)",
          width: 380,
          maxWidth: "90vw",
          padding: 20,
        }}
      >
        <div style={{ fontSize: 14, color: "#1f2933", lineHeight: 1.6, whiteSpace: "pre-line" }}>
          {message}
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 20 }}>
          <button
            onClick={onCancel}
            style={{ ...btnBase, background: "#fff", color: "#3b4149", border: "1px solid #cbd2d9" }}
          >
            キャンセル
          </button>
          <button
            autoFocus
            onClick={onConfirm}
            style={{ ...btnBase, background: "#1f2933", color: "#fff", border: "1px solid #1f2933" }}
          >
            変更する
          </button>
        </div>
      </div>
    </div>
  );
}

function DetailPanel({
  row,
  onClose,
  onEdit,
  onDelete,
  onStart,
  onComplete,
}: {
  row: Row;
  onClose: () => void;
  onEdit?: (node: GraphNode) => void;
  onDelete?: (node: GraphNode) => void;
  onStart?: (node: GraphNode) => void;
  onComplete?: (node: GraphNode) => void;
}) {
  const node = row.node;
  const fmt = (d: Date | null) => (d ? `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}` : "—");
  const fmtDateTime = (s: string) => new Date(s).toLocaleString("ja-JP");
  const durationDays = row.start && row.end ? diffDays(row.start, row.end) + 1 : null;
  const canEdit = node != null && node.level === "story";
  const canStart = canEdit && node != null && node.status === "todo";
  const canComplete = canEdit && node != null && node.status === "in_progress";
  const DASH = <span style={{ color: "#94a0ad" }}>-</span>;

  return (
    <div
      style={{
        width: 320,
        flexShrink: 0,
        borderLeft: "1px solid #cbd2d9",
        background: "#fff",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 14px",
          borderBottom: "1px solid #e5e8eb",
          background: "#f7f9fa",
        }}
      >
        <span style={{ fontSize: 12, fontWeight: 600, color: "#5f6b7a" }}>
          {node ? LEVEL_LABEL[node.level] : "詳細"}
        </span>
        <button
          onClick={onClose}
          style={{
            border: "1px solid #cbd2d9",
            background: "#fff",
            borderRadius: 6,
            padding: "2px 10px",
            fontSize: 12,
            cursor: "pointer",
            color: "#3b4149",
          }}
        >
          閉じる
        </button>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflow: "auto", padding: 16 }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: "#1f2933", marginBottom: 14 }}>
          {row.label}
        </div>

        <Field label="レベル">{node ? LEVEL_LABEL[node.level] : DASH}</Field>
        <Field label="ステータス">{node?.status ? <StatusBadge status={node.status} /> : DASH}</Field>
        <Field label="開始日">{node?.start_date ? fmt(parseDate(node.start_date)) : DASH}</Field>
        <Field label="期限">{node?.due_date ? fmt(parseDate(node.due_date)) : DASH}</Field>
        <Field label="期間">{durationDays != null ? `${durationDays}日` : DASH}</Field>
        <Field label="進捗">
          {node && node.progress != null ? `${Math.round(node.progress * 100)}%` : DASH}
        </Field>
        <Field label="詳細">
          {node?.description ? (
            <span style={{ whiteSpace: "pre-wrap", color: "#3b4149" }}>{node.description}</span>
          ) : (
            DASH
          )}
        </Field>
        <Field label="作成日時">{node?.created_at ? fmtDateTime(node.created_at) : DASH}</Field>
        <Field label="更新日時">{node?.updated_at ? fmtDateTime(node.updated_at) : DASH}</Field>
        <Field label="完了日時">{node?.completed_at ? fmtDateTime(node.completed_at) : DASH}</Field>
      </div>

      {canEdit && node && (
        <div style={{ flexShrink: 0, borderTop: "1px solid #e5e8eb", background: "#fff", padding: 12 }}>
          {((canStart && onStart) || (canComplete && onComplete)) && (
            <div style={{ display: "flex", gap: 8 }}>
              {canStart && onStart && (
                <button
                  onClick={() => onStart(node)}
                  title="このストーリーを進行中にします"
                  style={{ ...panelBtn, flex: 1, background: "#0972d3", color: "#fff", borderColor: "#0972d3" }}
                >
                  進行中にする
                </button>
              )}
              {canComplete && onComplete && (
                <button
                  onClick={() => onComplete(node)}
                  style={{ ...panelBtn, flex: 1, background: "#1a7f37", color: "#fff", borderColor: "#1a7f37" }}
                >
                  完了にする
                </button>
              )}
            </div>
          )}

          {(onEdit || onDelete) && (
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              {onEdit && (
                <button onClick={() => onEdit(node)} style={panelBtn}>
                  変更
                </button>
              )}
              {onDelete && (
                <button onClick={() => onDelete(node)} style={{ ...panelBtn, marginLeft: "auto", color: "#a3210b", borderColor: "#f0c2ba" }}>
                  削除
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const panelBtn: CSSProperties = {
  background: "#fff",
  color: "#3b4149",
  border: "1px solid #cbd2d9",
  borderRadius: 6,
  padding: "6px 14px",
  fontSize: 13,
  cursor: "pointer",
};

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: "#94a0ad", marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 13, color: "#1f2933" }}>{children}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: NonNullable<GraphNode["status"]> }) {
  const c = STATUS_COLOR[status];
  return (
    <span
      style={{
        display: "inline-block",
        fontSize: 12,
        padding: "2px 8px",
        borderRadius: 10,
        background: c?.bg ?? "#f4f5f6",
        color: c?.fg ?? "#5f6b7a",
        border: `1px solid ${c?.border ?? "#cbd2d9"}`,
      }}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

function Bar({
  row,
  timelineStart,
  selected,
  onSelect,
  statusMenuOpen,
  onToggleStatusMenu,
  onPickStatus,
  onCloseStatusMenu,
  onResize,
}: {
  row: Row;
  timelineStart: Date;
  selected: boolean;
  onSelect: () => void;
  statusMenuOpen?: boolean;
  onToggleStatusMenu?: () => void;
  onPickStatus?: (status: Status) => void;
  onCloseStatusMenu?: () => void;
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
          if (onToggleStatusMenu) onToggleStatusMenu();
          else onSelect();
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
          outline: selected || statusMenuOpen || drag ? "2px solid #1f2933" : "none",
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
      {statusMenuOpen && onPickStatus && (
        <>
          {/* backdrop: click-away closes the menu */}
          <div
            onClick={(e) => {
              e.stopPropagation();
              onCloseStatusMenu?.();
            }}
            style={{ position: "fixed", inset: 0, zIndex: 19 }}
          />
          <div
            style={{
              position: "absolute",
              left,
              top: ROW_H - 2,
              zIndex: 20,
              minWidth: 96,
              background: "#fff",
              border: "1px solid #cbd2d9",
              borderRadius: 6,
              boxShadow: "0 4px 12px rgba(31,41,51,0.18)",
              padding: 4,
            }}
          >
            {STATUS_ORDER.map((s) => (
              <button
                key={s}
                onClick={(e) => {
                  e.stopPropagation();
                  onPickStatus(s);
                }}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  padding: "5px 10px",
                  border: "none",
                  borderRadius: 4,
                  background: s === row.status ? "#eef1f3" : "transparent",
                  color: "#1f2933",
                  fontSize: 12,
                  fontWeight: s === row.status ? 600 : 400,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                {STATUS_LABEL[s]}
              </button>
            ))}
          </div>
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
