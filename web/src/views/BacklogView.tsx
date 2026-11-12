import { useMemo, useState, type MouseEvent, type ReactNode } from "react";
import { Link } from "react-router-dom";
import type { BacklogStory, Status } from "../lib/types";
import { STATUS_ORDER, STORY_STATUSES, isFinished } from "../lib/types";
import { cn } from "../lib/cn";
import { useResizableWidth } from "../lib/useResizableWidth";
import { useTableSort, type SortValue } from "../lib/useTableSort";
import { StatusPicker } from "../components/StatusPicker";
import { IdBadge } from "../components/IdBadge";
import { AddIcon } from "../components/Icons";
import { Button } from "../components/ui/Button";
import { Switch } from "../components/ui/Switch";
import { Input } from "../components/ui/Input";
import { PageHeader } from "../components/ui/PageHeader";
import { Toolbar } from "../components/ui/Toolbar";
import { Textarea } from "../components/ui/Textarea";
import { Dialog } from "../components/ui/Dialog";
import { SortableTh } from "../components/ui/SortableTh";

// 「完了・クローズも表示」の状態。ブラウザごとに覚える（カンバンの「クローズしたタスクも表示」と同じ扱い）。
const SHOW_FINISHED_KEY = "backlog.showFinished";

// 列見出しのクリックで並べ替える列（ID 以外）。
const SORT_COLUMNS = {
  title: (s) => s.title,
  start_date: (s) => s.start_date,
  due_date: (s) => s.due_date,
  status: (s) => STATUS_ORDER.indexOf(s.status),
} satisfies Record<string, (s: BacklogStory) => SortValue>;

// Stories of one project, from planning (バックログ) to closed. Done / closed ones are hidden by default.
// Only name / period / status are shown; the description and the document (context) are read on the detail page.
// The project is picked in the global header or the toolbar's picker (/backlog?project=).
export function BacklogView({
  stories,
  projectSelect,
  onAddBacklog,
  onChangeStatus,
}: {
  stories: BacklogStory[] | null;
  // The project picker, first in the toolbar.
  projectSelect?: ReactNode;
  onAddBacklog: (title: string, description: string | null) => Promise<void>;
  // Picked from the status column's menu; applied at once (no confirmation).
  onChangeStatus: (storyId: string, status: Status) => void;
}) {
  const [adding, setAdding] = useState(false);
  // ステータスはドラッグで幅を変えられる。名前は残り幅を使う。
  const status = useResizableWidth("backlog.statusWidth", 112, 72, 240, { invert: true });
  const [showFinished, setShowFinished] = useState(() => {
    try {
      return localStorage.getItem(SHOW_FINISHED_KEY) === "1";
    } catch {
      // Storage can be unavailable (private mode); fall back to hidden.
      return false;
    }
  });
  const toggleShowFinished = (on: boolean) => {
    setShowFinished(on);
    try {
      localStorage.setItem(SHOW_FINISHED_KEY, on ? "1" : "0");
    } catch {
      // Ignore: the toggle still applies for this session.
    }
  };

  const visible = useMemo(() => {
    if (!stories) return null;
    if (showFinished) return stories;
    return stories.filter((s) => !isFinished(s.status));
  }, [stories, showFinished]);
  const { sorted, sort, toggle } = useTableSort(visible ?? [], SORT_COLUMNS);

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="バックログ"
        meta={visible && `ストーリー ${visible.length} 件`}
        actions={
          <Button variant="primary" icon={<AddIcon size={14} />} onClick={() => setAdding(true)}>
            New Story
          </Button>
        }
      />
      <Toolbar>
        {projectSelect}
        <Switch checked={showFinished} onChange={toggleShowFinished} label="完了・クローズも表示" />
      </Toolbar>

      <div className="min-h-0 flex-1 overflow-auto px-6 py-4">
        <div className="max-w-[960px]">
          {!visible ? (
            <div className="text-[13px] text-fg-muted">読み込み中…</div>
          ) : stories!.length === 0 ? (
            <div className="text-[13px] text-fg-muted">ストーリーがありません。「New Story」から登録してください。</div>
          ) : visible.length === 0 ? (
            <div className="text-[13px] text-fg-muted">
              完了・クローズ以外のストーリーはありません。完了・クローズは「完了・クローズも表示」で出せます。
            </div>
          ) : (
            <div className="overflow-hidden rounded-md border border-border bg-surface">
              <table className="w-full table-fixed border-collapse text-[13px]">
                <thead>
                  <tr className="border-b border-border bg-surface-muted text-left text-xs text-fg-muted">
                    <th className="w-24 px-3 py-2 font-medium">ID</th>
                    <SortableTh label="名前" sortKey="title" sort={sort} onSort={toggle} className="px-3 py-2" />
                    <SortableTh label="開始日" sortKey="start_date" sort={sort} onSort={toggle} className="w-28 px-3 py-2" />
                    <SortableTh label="期限" sortKey="due_date" sort={sort} onSort={toggle} className="w-28 px-3 py-2" />
                    <SortableTh label="ステータス" sortKey="status" sort={sort} onSort={toggle} className="relative px-3 py-2" style={{ width: status.width }}>
                      <ResizeHandle onMouseDown={status.startResize} side="left" />
                    </SortableTh>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((s) => {
                    // 完了・クローズはグレーアウト。opacity は tr ではなくステータス以外のセルに付ける
                    // （tr に付けるとメニューが行の重なりに閉じ込められ、下の行に隠れる）。
                    const dim = isFinished(s.status) && "opacity-60";
                    return (
                      <tr key={s.id} className="h-10 border-b border-border transition-colors last:border-b-0 hover:bg-surface-muted">
                        <td className={cn("px-3 py-2", dim)}>
                          <IdBadge id={s.id} />
                        </td>
                        <td className={cn("truncate px-3 py-2", dim)}>
                          <Link
                            to={`/stories/${s.id}`}
                            data-tooltip="詳細を開く"
                            className="font-medium text-fg no-underline hover:underline"
                          >
                            {s.title}
                          </Link>
                        </td>
                        <td className={cn("whitespace-nowrap px-3 py-2 text-fg-muted", dim)}>{s.start_date ?? "—"}</td>
                        <td className={cn("whitespace-nowrap px-3 py-2 text-fg-muted", dim)}>{s.due_date ?? "—"}</td>
                        <td className="relative px-3 py-2">
                          <StatusPicker status={s.status} statuses={STORY_STATUSES} onPick={(next) => onChangeStatus(s.id, next)} />
                          <ResizeHandle onMouseDown={status.startResize} side="left" />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {adding && (
        <BacklogForm
          onSubmit={async (title, description) => {
            await onAddBacklog(title, description);
            setAdding(false);
          }}
          onCancel={() => setAdding(false)}
        />
      )}
    </div>
  );
}

// Transparent 7px drag handle on a column edge.
function ResizeHandle({ onMouseDown, side }: { onMouseDown: (e: MouseEvent) => void; side: "left" | "right" }) {
  return (
    <div
      onMouseDown={onMouseDown}
      data-tooltip="ドラッグで幅を変更"
      className={cn(
        "absolute inset-y-0 z-[5] w-[7px] cursor-col-resize select-none",
        side === "left" ? "-left-[3px]" : "-right-[3px]",
      )}
    />
  );
}

// Name (required) and description. A new backlog item starts as planning (計画中); its context is written on the detail page.
function BacklogForm({
  onSubmit,
  onCancel,
}: {
  onSubmit: (title: string, description: string | null) => Promise<void>;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const trimmed = title.trim();

  const submit = async () => {
    if (!trimmed || saving) return;
    setSaving(true);
    try {
      const d = description.trim();
      await onSubmit(trimmed, d ? d : null);
    } catch {
      // Reported by the caller (error banner); keep the form open so the input is not lost.
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      title="バックログを追加"
      onClose={onCancel}
      className="w-[420px]"
      footer={
        <>
          <Button onClick={onCancel} disabled={saving}>
            キャンセル
          </Button>
          <Button variant="primary" onClick={submit} disabled={!trimmed || saving}>
            {saving ? "追加中…" : "追加"}
          </Button>
        </>
      }
    >
      <label className="mb-1.5 block text-xs text-fg-muted">名前</label>
      <Input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.nativeEvent.isComposing) submit();
        }}
        placeholder="例: ユーザー登録"
      />

      <label className="mb-1.5 mt-3.5 block text-xs text-fg-muted">説明（任意）</label>
      <Textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={3}
        placeholder="一覧に出す 1〜2 行の説明"
      />
    </Dialog>
  );
}
