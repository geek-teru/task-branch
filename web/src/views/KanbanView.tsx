import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { listProjectStories } from "../lib/api";
import type { KanbanLane, Project, Status, StoryInput, Task } from "../lib/types";
import { BOARD_STATUSES, STATUS_LABEL, isFinished } from "../lib/types";
import { STATUS_CLASS } from "../lib/style";
import { cn } from "../lib/cn";
import { TaskForm } from "../components/TaskForm";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { DetailPanel, type StoryOption } from "../components/DetailPanel";
import { IdBadge } from "../components/IdBadge";
import { useResizableWidth } from "../lib/useResizableWidth";
import { AddIcon } from "../components/Icons";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Badge } from "../components/ui/Badge";


const toDate = (s: string | null) => (s ? new Date(`${s}T00:00:00`) : null);

// ドラッグ中、ボードの上下この幅に入ったら自動スクロールする（px / 1フレームの最大量）。
const AUTO_SCROLL_EDGE = 72;
const AUTO_SCROLL_MAX_STEP = 18;

// 「クローズしたタスクも表示」の状態。ブラウザごとに覚える（列幅と同じ扱い）。
const SHOW_CLOSED_KEY = "kanban.showClosed";

// One board per project: a swimlane per in-progress story, columns = task status.
// The project filter (null = all projects) is owned by the caller (kept in the URL, switched from the header).
// A card can only move between columns of its own story (its parent is fixed),
// and a drop is applied only after the user confirms it.
export function KanbanView({
  projects,
  lanes,
  projectFilter,
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
  onChangeStatus: (taskId: string, status: Status) => void;
  onMoveTask: (taskId: string, storyId: string, status: Status) => void;
  onAddStory: (projectId: string, values: StoryInput) => void;
  onAddTask: (story: Task, values: StoryInput) => void;
  onUpdateTask: (id: string, values: StoryInput) => void;
  onDeleteTask: (id: string) => void;
}) {
  const { width: LABEL_W, startResize } = useResizableWidth("kanban.labelWidth", 280, 160, 640);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showClosed, setShowClosed] = useState(() => {
    try {
      return localStorage.getItem(SHOW_CLOSED_KEY) === "1";
    } catch {
      // Storage can be unavailable (private mode); fall back to hidden.
      return false;
    }
  });
  const toggleShowClosed = (on: boolean) => {
    setShowClosed(on);
    try {
      localStorage.setItem(SHOW_CLOSED_KEY, on ? "1" : "0");
    } catch {
      // Ignore: the toggle still applies for this session.
    }
  };
  const [editing, setEditing] = useState<Task | null>(null);
  const [adding, setAdding] = useState<Task | null>(null);
  // ストーリー追加: いつもの TaskForm で名前と期間を入れる。親なしのストーリーになる。
  const [storyForm, setStoryForm] = useState<Project | null>(null);
  // targetStory がある＝別ストーリーへの移動。無ければ同じストーリー内のステータス変更。
  const [pendingMove, setPendingMove] = useState<{ task: Task; status: Status; targetStory?: Task } | null>(null);
  const [drag, setDrag] = useState<{ task: Task; storyId: string } | null>(null);
  const [over, setOver] = useState<{ storyId: string; status: Status } | null>(null);
  // ストーリーの変更: 詳細パネルのストーリー名を押したときのプルダウンの中身。
  // 選んだタスクのプロジェクト単位で読み、同じプロジェクトの間は読み直さない。
  const [storySource, setStorySource] = useState<{ projectId: string; stories: Task[] } | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const autoScroll = useRef<{ raf: number; step: number } | null>(null);

  const visibleProjects = useMemo(
    () => (projectFilter ? projects.filter((p) => p.id === projectFilter) : projects),
    [projects, projectFilter]
  );

  // Lanes grouped by project, keeping the order getKanbanLanes returns.
  const lanesByProject = useMemo(() => {
    const byProject = new Map<string, KanbanLane[]>();
    for (const l of lanes) byProject.set(l.story.project_id, [...(byProject.get(l.story.project_id) ?? []), l]);
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
    listProjectStories(selectedProjectId)
      .then((stories) => {
        if (!cancelled) setStorySource({ projectId: selectedProjectId, stories });
      })
      .catch(() => {
        // 読めなければプルダウンを出さないだけで、詳細の表示は妨げない。
      });
    return () => {
      cancelled = true;
    };
  }, [selectedProjectId, storySource?.projectId]);

  // 移動先のストーリー（バックログと同じ並び）。進行中でないストーリーには状態を添える。
  const storyOptions = useMemo<StoryOption[] | undefined>(() => {
    if (!selectedProjectId || storySource?.projectId !== selectedProjectId) return undefined;
    return storySource.stories.map((story) => ({
      id: story.id,
      label: story.status === "in_progress" ? story.title : `${story.title}（${STATUS_LABEL[story.status]}）`,
    }));
  }, [selectedProjectId, storySource]);

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

  // クローズは列を持たない。トグルが入っているときだけ完了列の下に薄く出す。
  const cardsIn = (tasks: Task[], s: Status) =>
    tasks
      .filter((t) => t.status === s || (s === "done" && showClosed && t.status === "closed"))
      .sort((a, b) => Number(a.status === "closed") - Number(b.status === "closed"));

  const renderLane = ({ story, tasks }: KanbanLane) => {
    // クローズも完了として数える。トグルで隠していても数は変えない。
    const done = tasks.filter((t) => isFinished(t.status)).length;
    return (
      <div key={story.id} className="flex border-b border-border last:border-b-0">
        <div className="relative box-border flex-none px-3 py-2.5" style={{ width: LABEL_W }}>
          <div className="flex items-start gap-1.5">
            <div className="flex-1 text-sm font-medium text-fg">{story.title}</div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setAdding(story)}
              title="タスクを追加"
              aria-label="タスクを追加"
              className="h-6 w-6 px-0 text-fg-muted"
            >
              <AddIcon size={12} />
            </Button>
          </div>
          <div className="mt-1 flex items-center gap-2 text-[11px] text-fg-muted">
            <IdBadge id={story.id} />
            <span>{tasks.length === 0 ? "タスクなし" : `完了 ${done} / ${tasks.length}`}</span>
          </div>
          {/* same handle as the header, so the column can be dragged from any lane */}
          <ResizeHandle onMouseDown={startResize} />
        </div>

        {BOARD_STATUSES.map((s) => {
          // 同じプロジェクト内なら、同じストーリーの同じ列以外どこへでも落とせる
          // （別ストーリーなら移動になる）。プロジェクトをまたぐ移動は許さない。
          const canDrop =
            !!drag &&
            drag.task.project_id === story.project_id &&
            !(drag.storyId === story.id && drag.task.status === s);
          const isOver = canDrop && over?.storyId === story.id && over.status === s;
          return (
            <div key={s} className="min-w-0 flex-1 p-1.5">
              <div
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
                className={cn(
                  "box-border flex h-full min-h-16 flex-col gap-1.5 rounded-md p-1.5 transition-colors",
                  isOver ? "bg-brand/10 ring-2 ring-inset ring-brand" : canDrop ? "bg-brand/5" : "bg-surface-muted",
                )}
              >
                {cardsIn(tasks, s).map((t) => (
                  <TaskCard
                    key={t.id}
                    task={t}
                    storyTitle={story.title}
                    dragging={drag?.task.id === t.id}
                    selected={selectedId === t.id}
                    onSelect={() => setSelectedId(t.id)}
                    onDragStart={() => setDrag({ task: t, storyId: story.id })}
                    onDragEnd={endDrag}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="flex h-full text-sm text-fg">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex shrink-0 items-center gap-2 border-b border-border bg-surface px-3 py-2">
          <label className="flex cursor-pointer items-center gap-1.5 text-[13px] text-fg-muted">
            <input
              type="checkbox"
              checked={showClosed}
              onChange={(e) => toggleShowClosed(e.target.checked)}
              className="m-0 h-3.5 w-3.5 cursor-pointer accent-brand"
            />
            クローズしたタスクも表示
          </label>
        </div>

        <div
          ref={boardRef}
          onDragOver={(e) => updateAutoScroll(e.clientY)}
          onDrop={stopAutoScroll}
          className="box-border min-h-0 flex-1 overflow-auto p-6"
        >
          {visibleProjects.length === 0 ? (
            <div className="text-fg-muted">
              {projectFilter ? "プロジェクトが見つかりません。" : "プロジェクトがありません。"}
            </div>
          ) : (
            visibleProjects.map((p) => {
              const projectLanes = lanesByProject.get(p.id) ?? [];
              return (
                <section key={p.id} className="mb-7">
                  <div className="mb-2 flex items-center gap-2.5">
                    <h3 className="m-0 text-[15px] font-semibold">{p.name}</h3>
                    <Button size="sm" icon={<AddIcon size={13} />} onClick={() => setStoryForm(p)}>
                      ストーリーを追加
                    </Button>
                  </div>
                  {projectLanes.length === 0 ? (
                    <div className="text-[13px] text-fg-muted">進行中のストーリーがありません。</div>
                  ) : (
                    <div className="rounded-md border border-border bg-surface" style={{ minWidth: LABEL_W + 3 * 220 }}>
                      <div className="flex border-b border-border">
                        <div
                          className="relative flex flex-none items-center px-3 py-2 text-xs font-medium text-fg-muted"
                          style={{ width: LABEL_W }}
                        >
                          ストーリー
                          <ResizeHandle onMouseDown={startResize} />
                        </div>
                        {BOARD_STATUSES.map((s) => (
                          <div key={s} className="relative flex min-w-0 flex-1 items-center gap-2 px-3 py-2">
                            <span
                              className={cn(
                                "inline-flex h-6 items-center gap-1.5 rounded-full border px-2.5 text-xs font-semibold tracking-wide",
                                STATUS_CLASS[s].bg,
                                STATUS_CLASS[s].border,
                                STATUS_CLASS[s].text,
                              )}
                            >
                              <span className={cn("h-1.5 w-1.5 rounded-full ring-[3px]", STATUS_HEAD[s].dot)} />
                              {STATUS_LABEL[s]}
                            </span>
                            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full border border-border bg-surface-muted px-1.5 text-[11px] font-medium tabular-nums text-fg-muted">
                              {projectLanes.reduce((n, lane) => n + cardsIn(lane.tasks, s).length, 0)}
                            </span>
                            {/* 列の色帯。見出しの下端に status 色の線を引く */}
                            <span className={cn("absolute inset-x-1.5 -bottom-px h-0.5 rounded-full", STATUS_HEAD[s].bar)} />
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
          place={{ story: selected.lane.story.title }}
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

      {storyForm && (
        <TaskForm
          heading={`ストーリーを追加（${storyForm.name}）`}
          submitLabel="追加"
          initial={{ title: "", status: "in_progress", start_date: null, due_date: null, description: null }}
          todoHint="未着手のままだとカンバンには出ません（ガントチャートとバックログから見えます）。"
          onSubmit={(values) => {
            onAddStory(storyForm.id, values);
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

// 上から ID / ストーリー / タイトル / 期限。上2行は弱い補助として出す。
function TaskCard({
  task,
  storyTitle,
  dragging,
  selected,
  onSelect,
  onDragStart,
  onDragEnd,
}: {
  task: Task;
  storyTitle: string;
  dragging: boolean;
  selected: boolean;
  onSelect: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  const closed = task.status === "closed";
  return (
    <Card
      interactive
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      onClick={onSelect}
      title={task.description ?? task.title}
      className={cn(
        "px-2 py-1.5 text-xs text-fg",
        selected && "border-brand ring-2 ring-brand/30 hover:border-brand",
        dragging ? "opacity-40" : closed && "opacity-60",
      )}
    >
      <div className="flex items-center gap-1.5 text-[11px] leading-relaxed text-fg-muted">
        <IdBadge id={task.id} />
        {closed && (
          <Badge tone="closed" className="ml-auto h-4 px-1.5 text-[10px]">
            {STATUS_LABEL.closed}
          </Badge>
        )}
      </div>
      {/* ストーリー名は「補助・ラベル」、期限はそれより弱く出す。長い名前は末尾を「…」で切る。 */}
      <div className="truncate text-[11px] text-fg-muted" title={storyTitle}>
        {storyTitle}
      </div>
      <div className="mt-0.5">{task.title}</div>
      {task.due_date && <div className="truncate text-[11px] text-fg-muted/80">期限 {task.due_date}</div>}
    </Card>
  );
}

// 列幅を変えるつまみ。見出しと各レーンのストーリー列の右端に置く（サイドナビと同じ形）。
function ResizeHandle({ onMouseDown }: { onMouseDown: (e: MouseEvent) => void }) {
  return (
    <div
      onMouseDown={onMouseDown}
      title="ドラッグで幅を変更"
      className="absolute inset-y-0 -right-[3px] z-5 w-[7px] cursor-col-resize select-none"
    />
  );
}

// 列の見出しの丸（淡い光輪付き）と下端の色帯。STATUS_CLASS の bg は淡い色なので、枠線の色で塗る。
// Tailwind が拾えるよう、クラス名は省略せずに書く。
const STATUS_HEAD: Record<Status, { dot: string; bar: string }> = {
  todo: { dot: "bg-status-todo-border ring-status-todo-border/25", bar: "bg-status-todo-border" },
  in_progress: {
    dot: "bg-status-in_progress-border ring-status-in_progress-border/25",
    bar: "bg-status-in_progress-border",
  },
  done: { dot: "bg-status-done-border ring-status-done-border/25", bar: "bg-status-done-border" },
  closed: { dot: "bg-status-closed-border ring-status-closed-border/25", bar: "bg-status-closed-border" },
};
