// Gantt view: a project's stories and their tasks on a shared timeline.
// Built from start_date/due_date on the story and task nodes.
import { useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent } from "react";
import type { GraphNode, Project, ProjectGraph, Status, StoryInput } from "../lib/types";
import { LEVEL_LABEL, STATUS_LABEL } from "../lib/types";
import { STATUS_COLOR } from "../lib/style";
import { TaskForm } from "../components/TaskForm";
import { GroupForm } from "../components/GroupForm";
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

// Prefill a new story form: starts the day after the project's current last due
// date (or today if the project has no dated stories) and spans one week.
function storyInitial(prevEnd: Date | null): StoryInput {
  const start = prevEnd ? addDays(prevEnd, 1) : new Date();
  const due = addDays(start, 6);
  return { title: "", status: "todo", start_date: isoDate(start), due_date: isoDate(due), description: null };
}

// タスクは期間を持たないことが多いので、空のまま出して必要なら入れてもらう。
function taskInitial(): StoryInput {
  return { title: "", status: "todo", start_date: null, due_date: null, description: null };
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
  kind: "project" | "group" | "story" | "task";
  label: string;
  start: Date | null;
  end: Date | null;
  status: GraphNode["status"] | null;
  node: GraphNode | null;
  // The story group this row sits in (the group row itself, or a story / task inside it). null = no group.
  groupId: string | null;
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
    const sortedByStart = (filter: (n: GraphNode) => boolean) =>
      graph.nodes
        .filter(filter)
        .map((t) => ({
          node: t,
          start: t.start_date ? parseDate(t.start_date) : null,
          end: t.due_date ? parseDate(t.due_date) : null,
        }))
        .sort((a, b) => byStart(a.start, a.node.sort_order, b.start, b.node.sort_order));

    rows.push({ key: `p:${project.id}`, kind: "project", label: project.name, start: null, end: null, status: null, node: null, groupId: null });

    const pushStory = (t: { node: GraphNode; start: Date | null; end: Date | null }, groupId: string | null) => {
      rows.push({
        key: `t:${t.node.id}`,
        kind: "story",
        label: t.node.title,
        start: t.start,
        end: t.end,
        status: t.node.status,
        node: t.node,
        groupId,
      });

      for (const k of sortedByStart((n) => n.level === "task" && n.parent_id === t.node.id)) {
        rows.push({
          key: `k:${k.node.id}`,
          kind: "task",
          label: k.node.title,
          start: k.start,
          end: k.end,
          status: k.node.status,
          node: k.node,
          groupId,
        });
      }
    };

    // A group sits at the same level as the ungrouped stories. Its period is its stories'
    // earliest start to latest due, so it sorts by that start (an empty group goes last).
    const stories = sortedByStart((n) => n.level === "story");
    const groupIds = new Set(graph.groups.map((g) => g.id));
    const items = [
      ...graph.groups.map((g) => {
        const inner = stories.filter((s) => s.node.group_id === g.id);
        const starts = inner.flatMap((s) => (s.start ? [s.start.getTime()] : []));
        const ends = inner.flatMap((s) => (s.end ? [s.end.getTime()] : []));
        const start = starts.length ? new Date(Math.min(...starts)) : null;
        return {
          start,
          order: g.sort_order,
          push: () => {
            rows.push({
              key: `g:${g.id}`,
              kind: "group",
              label: g.name,
              start,
              end: ends.length ? new Date(Math.max(...ends)) : null,
              status: null,
              node: null,
              groupId: g.id,
            });
            for (const s of inner) pushStory(s, g.id);
          },
        };
      }),
      // A group_id pointing at a group we did not get back is shown as no group.
      ...stories
        .filter((s) => !(s.node.group_id && groupIds.has(s.node.group_id)))
        .map((s) => ({ start: s.start, order: s.node.sort_order, push: () => pushStory(s, null) })),
    ];
    for (const it of items.sort((a, b) => byStart(a.start, a.order, b.start, b.order))) it.push();
  }
  return rows;
}

export function GanttView({
  projects,
  project,
  graph,
  onSelectProject,
  onAddStory,
  onAddTask,
  onUpdateTask,
  onDeleteTask,
  onStartStory,
  onCompleteStory,
  onChangeStatus,
  onResizeStory,
  onShiftStory,
  onMoveTask,
  onAddGroup,
  onRenameGroup,
  onDeleteGroup,
  onMoveStoryToGroup,
}: {
  projects: Project[];
  project: Project;
  graph: ProjectGraph;
  onSelectProject: (projectId: string) => void;
  onAddStory?: (values: StoryInput) => void;
  onAddTask?: (story: GraphNode, values: StoryInput) => void;
  onUpdateTask?: (id: string, values: StoryInput) => void;
  onDeleteTask?: (id: string) => void;
  onStartStory?: (id: string) => void;
  onCompleteStory?: (id: string) => void;
  onChangeStatus?: (id: string, status: Status) => void;
  onResizeStory?: (id: string, startDate: string, dueDate: string) => void;
  // Move a story and its tasks by the same number of days.
  onShiftStory?: (id: string, days: number) => void;
  // Move one task's start and due dates (its bar is dragged by the middle).
  onMoveTask?: (id: string, startDate: string, dueDate: string) => void;
  onAddGroup?: (name: string) => void;
  onRenameGroup?: (id: string, name: string) => void;
  // The stories in the group go back to no group; they are not deleted.
  onDeleteGroup?: (id: string) => void;
  // Put a story into a group, or take it out of its group (null).
  onMoveStoryToGroup?: (storyId: string, groupId: string | null) => void;
}) {
  const { width: LABEL_W, startResize } = useResizableWidth("gantt.labelWidth", 320, 160, 720);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [form, setForm] = useState<
    | { mode: "create"; prevEnd: Date | null }
    | { mode: "create-task"; story: GraphNode }
    | { mode: "edit"; node: GraphNode }
    | null
  >(null);
  // グループの追加（id なし）／名前の変更（id あり）のフォーム。
  const [groupForm, setGroupForm] = useState<{ id: string | null; name: string } | null>(null);
  // Pending change awaiting confirmation via the custom modal.
  const [confirm, setConfirm] = useState<{ message: string; label?: string; onConfirm: () => void } | null>(null);
  // 畳んでいるストーリーの id。全部畳んだ状態で始めるので、タスクは既定で隠れている。
  // 張り直すのはプロジェクトを変えたときだけ。ステータス変更のたびに走る refreshGraph で
  // 作り直すと、ユーザーが開いた行が勝手に閉じてしまう。
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  // 畳んでいるグループの id。グループは開いた状態で始める。
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  // ドラッグ中のストーリーと今いるグループ、ドラッグが重なっているドロップ先の行の key。
  const [dragStory, setDragStory] = useState<{ id: string; groupId: string | null } | null>(null);
  const [dropKey, setDropKey] = useState<string | null>(null);
  useEffect(() => {
    setCollapsed(new Set(graph.nodes.filter((n) => n.level === "story").map((n) => n.id)));
    setCollapsedGroups(new Set());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id]);
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

  // 配下のタスクの数。0 件のストーリーには開閉のトグルを出さない。
  const childCount = new Map<string, number>();
  // グループの中のストーリーの数。0 件のグループも行は出すが、開閉のトグルは出さない。
  const groupStoryCount = new Map<string, number>();
  for (const r of rows) {
    if (r.kind === "task" && r.node?.parent_id) {
      childCount.set(r.node.parent_id, (childCount.get(r.node.parent_id) ?? 0) + 1);
    }
    if (r.kind === "story" && r.groupId) {
      groupStoryCount.set(r.groupId, (groupStoryCount.get(r.groupId) ?? 0) + 1);
    }
  }
  // 畳んだグループのストーリーとタスク、畳んだストーリーのタスクを落とす。
  // 期間の計算は rows（全行）のままなので、畳んでもタイムラインの横幅と月の並びは動かない。
  const visibleRows = rows.filter(
    (r) =>
      !((r.kind === "story" || r.kind === "task") && r.groupId && collapsedGroups.has(r.groupId)) &&
      !(r.kind === "task" && collapsed.has(r.node?.parent_id ?? ""))
  );
  const bodyH = visibleRows.length * ROW_H;
  const totalW = LABEL_W + timelineW;
  const selectedRow = selectedKey ? rows.find((r) => r.key === selectedKey) ?? null : null;
  // 新しいストーリーの期間の初期値に使う、プロジェクト内のストーリーの最終期限。
  const storyEnds = rows.filter((r) => r.kind === "story" && r.end).map((r) => r.end!.getTime());
  const lastStoryEnd = storyEnds.length ? new Date(Math.max(...storyEnds)) : null;

  const toggleIn = (setter: typeof setCollapsed) => (id: string) =>
    setter((cur) => {
      const next = new Set(cur);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  const toggleCollapsed = toggleIn(setCollapsed);
  const toggleGroup = toggleIn(setCollapsedGroups);

  const submitForm = (values: StoryInput) => {
    if (!form) return;
    if (form.mode === "create") onAddStory?.(values);
    else if (form.mode === "create-task") onAddTask?.(form.story, values);
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
            プロジェクト / ストーリー
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

          {visibleRows.map((r) => {
            // タスクを持つストーリーと、ストーリーを持つグループだけ開閉できる。
            const toggle =
              r.kind === "group" && r.groupId && groupStoryCount.get(r.groupId)
                ? {
                    collapsed: collapsedGroups.has(r.groupId),
                    count: groupStoryCount.get(r.groupId)!,
                    noun: "ストーリーとタスク",
                    onToggle: () => toggleGroup(r.groupId!),
                  }
                : r.kind === "story" && r.node && childCount.get(r.node.id)
                  ? {
                      collapsed: collapsed.has(r.node.id),
                      count: childCount.get(r.node.id)!,
                      noun: "タスク",
                      onToggle: () => toggleCollapsed(r.node!.id),
                    }
                  : null;
            // グループの中はストーリーとタスクを1段ずつ深くする。
            const indent = r.kind === "project" ? 8 : r.kind === "group" ? 22 : (r.groupId ? 14 : 0) + (r.kind === "task" ? 40 : 22);
            // ストーリーはグループ行（そのグループへ）とプロジェクト行（グループから出す）にドロップできる。
            // 今いるグループへのドロップは何もしないので、ドロップ先にもしない。
            const dropGroupId = r.kind === "group" ? r.groupId : r.kind === "project" ? null : undefined;
            const canDrop = !!dragStory && dropGroupId !== undefined && dropGroupId !== dragStory.groupId;
            const isOver = canDrop && dropKey === r.key;
            const draggableStory = r.kind === "story" && !!r.node && !!onMoveStoryToGroup;
            return (
            <div
              key={r.key}
              onDragOver={
                canDrop
                  ? (e) => {
                      e.preventDefault();
                      if (!isOver) setDropKey(r.key);
                    }
                  : undefined
              }
              onDragLeave={() => setDropKey((cur) => (cur === r.key ? null : cur))}
              onDrop={(e) => {
                e.preventDefault();
                if (canDrop && dragStory) onMoveStoryToGroup?.(dragStory.id, dropGroupId ?? null);
                setDragStory(null);
                setDropKey(null);
              }}
              style={{ display: "flex", height: ROW_H, position: "relative" }}
            >
              <div
                draggable={draggableStory}
                onDragStart={
                  draggableStory
                    ? (e) => {
                        e.dataTransfer.effectAllowed = "move";
                        setDragStory({ id: r.node!.id, groupId: r.groupId });
                      }
                    : undefined
                }
                onDragEnd={() => {
                  setDragStory(null);
                  setDropKey(null);
                }}
                style={{
                  cursor: draggableStory ? "grab" : undefined,
                  opacity: dragStory && r.node?.id === dragStory.id ? 0.5 : 1,
                  outline: isOver ? "2px solid #0972d3" : "none",
                  outlineOffset: -2,
                  width: LABEL_W,
                  flexShrink: 0,
                  position: "sticky",
                  left: 0,
                  zIndex: 2,
                  background: isOver
                    ? "#eaf2fc"
                    : canDrop
                      ? "#f7fafe"
                      : r.kind === "project"
                        ? "#eef1f3"
                        : r.kind === "group"
                          ? "#f7f9fa"
                          : "#fff",
                  borderRight: "1px solid #cbd2d9",
                  borderBottom: "1px solid #f0f2f4",
                  display: "flex",
                  alignItems: "center",
                  padding: `0 8px 0 ${indent}px`,
                  fontSize: r.kind === "project" ? 12 : 11,
                  fontWeight: r.kind === "project" ? 700 : r.kind === "group" ? 600 : 400,
                  color: r.kind === "project" ? "#1f2933" : "#3b4149",
                  gap: 4,
                }}
                title={r.label}
              >
                <span
                  onClick={(e) => {
                    if (!toggle) return;
                    e.stopPropagation();
                    toggle.onToggle();
                  }}
                  title={toggle ? `クリックで${toggle.noun}を${toggle.collapsed ? "表示" : "隠す"}` : undefined}
                  style={{ flexShrink: 0, width: 12, color: "#5f6b7a", cursor: toggle ? "pointer" : "default" }}
                >
                  {toggle ? (toggle.collapsed ? "▸" : "▾") : ""}
                </span>
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
                  {toggle?.collapsed && (
                    <span style={{ color: "#94a0ad", marginLeft: 4, fontWeight: 400 }}>({toggle.count})</span>
                  )}
                </span>
                {r.kind === "project" && onAddStory && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setForm({ mode: "create", prevEnd: lastStoryEnd });
                    }}
                    title="ストーリーを追加"
                    style={addBtn}
                  >
                    +
                  </button>
                )}
                {r.kind === "project" && onAddGroup && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setGroupForm({ id: null, name: "" });
                    }}
                    title="グループを追加"
                    style={textBtn}
                  >
                    グループを追加
                  </button>
                )}
                {r.kind === "group" && r.groupId && onRenameGroup && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setGroupForm({ id: r.groupId, name: r.label });
                    }}
                    title="グループ名を変更"
                    style={textBtn}
                  >
                    変更
                  </button>
                )}
                {r.kind === "group" && r.groupId && onDeleteGroup && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      const id = r.groupId!;
                      setConfirm({
                        message: `グループ「${r.label}」を削除します。中のストーリーはグループなしに戻ります。`,
                        label: "削除する",
                        onConfirm: () => onDeleteGroup(id),
                      });
                    }}
                    title="グループを削除"
                    style={{ ...textBtn, color: "#d13212" }}
                  >
                    削除
                  </button>
                )}
                {r.kind === "story" && r.node && onAddTask && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setForm({ mode: "create-task", story: r.node! });
                    }}
                    title="タスクを追加"
                    style={addBtn}
                  >
                    +
                  </button>
                )}
                <div onMouseDown={startResize} title="ドラッグで幅を変更" style={{ ...resizeHandleStyle, right: -3 }} />
              </div>
              <div style={{ position: "relative", width: timelineW, borderBottom: "1px solid #f0f2f4" }}>
                {r.kind === "task" && !(r.start && r.end) && (
                  <span
                    style={{
                      position: "absolute",
                      left: 8,
                      top: 0,
                      height: ROW_H,
                      display: "flex",
                      alignItems: "center",
                      fontSize: 10,
                      color: "#94a0ad",
                    }}
                  >
                    期間未設定
                  </span>
                )}
                {r.kind === "group" && r.start && r.end && <GroupBar row={r} timelineStart={timelineStart} />}
                {r.kind !== "group" && r.start && r.end && (
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
                    onMove={
                      r.kind === "story" && r.node && onShiftStory
                        ? (days) => {
                            const node = r.node!;
                            const f = (d: Date) => `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
                            setConfirm({
                              message: `「${r.label}」の期間を
${f(addDays(r.start!, days))} 〜 ${f(addDays(r.end!, days))}
に変更します。配下のタスクも ${Math.abs(days)} 日${days > 0 ? "後ろ" : "前"}へずらします。よろしいですか？`,
                              onConfirm: () => onShiftStory(node.id, days),
                            });
                          }
                        : r.kind === "task" && r.node && onMoveTask
                          ? (days) => {
                              const node = r.node!;
                              const startDate = isoDate(addDays(r.start!, days));
                              const dueDate = isoDate(addDays(r.end!, days));
                              const f = (d: Date) => `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
                              setConfirm({
                                message: `「${r.label}」の期間を
${f(addDays(r.start!, days))} 〜 ${f(addDays(r.end!, days))}
に変更します。よろしいですか？`,
                                onConfirm: () => onMoveTask(node.id, startDate, dueDate),
                              });
                            }
                          : undefined
                    }
                  />
                )}
              </div>
            </div>
            );
          })}
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
                  const kind = LEVEL_LABEL[node.level];
                  const extra = node.level === "story" ? "\n配下のタスクも削除されます。" : "";
                  if (window.confirm(`${kind}「${node.title}」を削除します。${extra}よろしいですか？`)) {
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
          heading={
            form.mode === "create"
              ? "ストーリーを追加"
              : form.mode === "create-task"
              ? `タスクを追加（${form.story.title}）`
              : `${LEVEL_LABEL[form.node.level]}を変更`
          }
          noun={
            form.mode === "create-task" || (form.mode === "edit" && form.node.level === "task")
              ? "タスク"
              : "ストーリー"
          }
          submitLabel={form.mode === "edit" ? "保存" : "追加"}
          initial={
            form.mode === "create"
              ? storyInitial(form.prevEnd)
              : form.mode === "create-task"
              ? taskInitial()
              : editInitial(form.node)
          }
          onSubmit={submitForm}
          onCancel={() => setForm(null)}
        />
      )}

      {groupForm && (
        <GroupForm
          heading={groupForm.id ? "グループ名を変更" : "グループを追加"}
          submitLabel={groupForm.id ? "保存" : "追加"}
          initialName={groupForm.name}
          onSubmit={(name) => {
            if (groupForm.id) onRenameGroup?.(groupForm.id, name);
            else onAddGroup?.(name);
            setGroupForm(null);
          }}
          onCancel={() => setGroupForm(null)}
        />
      )}

      {confirm && (
        <ConfirmDialog
          message={confirm.message}
          confirmLabel={confirm.label}
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

// プロジェクトの「ストーリーを追加」／ストーリーの「タスクを追加」で共通。
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

// プロジェクトの「グループを追加」／グループの「変更」「削除」。
const textBtn: CSSProperties = {
  flexShrink: 0,
  height: 18,
  lineHeight: "16px",
  padding: "0 6px",
  border: "1px solid #cbd2d9",
  borderRadius: 4,
  background: "#fff",
  color: "#0972d3",
  cursor: "pointer",
  fontSize: 10,
  fontWeight: 400,
  whiteSpace: "nowrap",
};

// グループの期間（中のストーリーの最小開始日〜最大期限）。ストーリーより細いグレーのバーで、動かせない。
function GroupBar({ row, timelineStart }: { row: Row; timelineStart: Date }) {
  const start = row.start as Date;
  const end = row.end as Date;
  const left = diffDays(timelineStart, start) * PX_PER_DAY;
  const width = Math.max((diffDays(start, end) + 1) * PX_PER_DAY, 4);
  const fmt = (d: Date) => `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
  const short = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}`;
  return (
    <>
      <div
        title={`${row.label}\n${fmt(start)} 〜 ${fmt(end)}`}
        style={{
          position: "absolute",
          left,
          width,
          top: (ROW_H - 8) / 2,
          height: 8,
          borderRadius: 4,
          background: "#b8c1cc",
        }}
      />
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
        {short(start)} - {short(end)}
      </span>
    </>
  );
}

function Bar({
  row,
  timelineStart,
  selected,
  onSelect,
  onResize,
  onMove,
}: {
  row: Row;
  timelineStart: Date;
  selected: boolean;
  onSelect: () => void;
  onResize?: (startDate: string, dueDate: string) => void;
  // Called with the number of days the whole bar was dragged (never 0).
  onMove?: (days: number) => void;
}) {
  const start = row.start as Date;
  const end = row.end as Date;
  const c = row.status ? STATUS_COLOR[row.status] : null;

  // Live drag offset (in whole days) while an edge or the whole bar is being dragged; null otherwise.
  const [drag, setDrag] = useState<{ edge: "start" | "end" | "move"; days: number } | null>(null);
  // The click that follows a bar drag must not open the detail panel.
  const draggedRef = useRef(false);

  // Preview dates reflect the in-progress drag so the bar tracks the cursor.
  const span = diffDays(start, end); // inclusive span minus 1; keeps at least 1 day when clamped
  let pStart = start;
  let pEnd = end;
  if (drag) {
    if (drag.edge === "start") pStart = addDays(start, Math.min(drag.days, span));
    else if (drag.edge === "end") pEnd = addDays(end, Math.max(drag.days, -span));
    else {
      pStart = addDays(start, drag.days);
      pEnd = addDays(end, drag.days);
    }
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

  const beginMove = (e: ReactMouseEvent) => {
    if (!onMove || e.button !== 0) return;
    e.preventDefault();
    const startX = e.clientX;
    const toDays = (clientX: number) => Math.round((clientX - startX) / PX_PER_DAY);
    const onMouseMove = (ev: MouseEvent) => {
      setDrag({ edge: "move", days: toDays(ev.clientX) });
    };
    const onUp = (ev: MouseEvent) => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onUp);
      setDrag(null);
      const days = toDays(ev.clientX);
      if (days === 0) return;
      draggedRef.current = true;
      onMove(days);
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onUp);
  };

  const showHandles = !!onResize;
  const HANDLE_W = 7;

  return (
    <>
      <div
        onMouseDown={beginMove}
        onClick={() => {
          if (draggedRef.current) {
            draggedRef.current = false;
            return;
          }
          if (drag) return;
          onSelect();
        }}
        title={`${row.label}\n${fmt(pStart)} 〜 ${fmt(pEnd)}`}
        style={{
          position: "absolute",
          left,
          width,
          top: 4,
          height: ROW_H - 10,
          borderRadius: 4,
          background: c?.border ?? "#94a0ad",
          cursor: drag?.edge === "move" ? "grabbing" : onMove ? "grab" : "pointer",
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
    </>
  );
}
