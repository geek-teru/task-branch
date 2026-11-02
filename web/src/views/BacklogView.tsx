import { useMemo, useState, type MouseEvent, type ReactNode } from "react";
import { Link } from "react-router-dom";
import type { BacklogStory } from "../lib/types";
import { STATUS_LABEL } from "../lib/types";
import { cn } from "../lib/cn";
import { useResizableWidth } from "../lib/useResizableWidth";
import { EpicStateBadge } from "../components/EpicStateBadge";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { IdBadge } from "../components/IdBadge";
import { AddIcon } from "../components/Icons";
import { Button } from "../components/ui/Button";
import { Switch } from "../components/ui/Switch";
import { Input } from "../components/ui/Input";
import { PageHeader } from "../components/ui/PageHeader";
import { Toolbar } from "../components/ui/Toolbar";
import { Textarea } from "../components/ui/Textarea";
import { Dialog } from "../components/ui/Dialog";
import { Badge } from "../components/ui/Badge";

// 「InActive も表示」の状態。ブラウザごとに覚える（カンバンの「クローズしたタスクも表示」と同じ扱い）。
const SHOW_INACTIVE_KEY = "backlog.showInactive";

// Stories of one project: active ones and inactive ones (バックログ). Inactive ones are hidden by default.
// Only name / description / period / status / state are shown; the document (context) is not loaded here.
// The project is picked in the global header or the toolbar's picker (/backlog?project=).
export function BacklogView({
  stories,
  projectSelect,
  onAddBacklog,
  onSetActive,
}: {
  stories: BacklogStory[] | null;
  // The project picker, first in the toolbar.
  projectSelect?: ReactNode;
  onAddBacklog: (title: string, description: string | null) => Promise<void>;
  onSetActive: (storyId: string, active: boolean) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [pendingState, setPendingState] = useState<{ story: BacklogStory; active: boolean } | null>(null);
  // 名前・ステータス・状態はドラッグで幅を変えられる。説明は残り幅を使う。
  const name = useResizableWidth("backlog.nameWidth", 320, 160, 720);
  const status = useResizableWidth("backlog.statusWidth", 96, 72, 240, { invert: true });
  const state = useResizableWidth("backlog.stateWidth", 96, 72, 240, { invert: true });
  const [showInactive, setShowInactive] = useState(() => {
    try {
      return localStorage.getItem(SHOW_INACTIVE_KEY) === "1";
    } catch {
      // Storage can be unavailable (private mode); fall back to hidden.
      return false;
    }
  });
  const toggleShowInactive = (on: boolean) => {
    setShowInactive(on);
    try {
      localStorage.setItem(SHOW_INACTIVE_KEY, on ? "1" : "0");
    } catch {
      // Ignore: the toggle still applies for this session.
    }
  };

  const visible = useMemo(() => {
    if (!stories) return null;
    if (showInactive) return stories;
    return stories.filter((s) => s.activated_at != null);
  }, [stories, showInactive]);

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
        <Switch checked={showInactive} onChange={toggleShowInactive} label="InActive も表示" />
      </Toolbar>

      <div className="min-h-0 flex-1 overflow-auto px-6 py-4">
        {!visible ? (
          <div className="text-[13px] text-fg-muted">読み込み中…</div>
        ) : stories!.length === 0 ? (
          <div className="text-[13px] text-fg-muted">ストーリーがありません。「New Story」から登録してください。</div>
        ) : visible.length === 0 ? (
          <div className="text-[13px] text-fg-muted">
            Active のストーリーはありません。InActive は「InActive も表示」で出せます。
          </div>
        ) : (
          // @container: the description column is dropped when the table is narrow.
          <div className="@container overflow-hidden rounded-md border border-border bg-surface">
            <table className="w-full table-fixed border-collapse text-[13px]">
              <thead>
                <tr className="border-b border-border bg-surface-muted text-left text-xs text-fg-muted">
                  <th className="w-24 px-3 py-2 font-medium">ID</th>
                  <th className="relative px-3 py-2 font-medium" style={{ width: name.width }}>
                    名前
                    <ResizeHandle onMouseDown={name.startResize} side="right" />
                  </th>
                  <th className="hidden px-3 py-2 font-medium @5xl:table-cell">説明</th>
                  <th className="w-28 px-3 py-2 font-medium">開始日</th>
                  <th className="w-28 px-3 py-2 font-medium">期限</th>
                  <th className="relative px-3 py-2 font-medium" style={{ width: status.width }}>
                    ステータス
                    <ResizeHandle onMouseDown={status.startResize} side="left" />
                  </th>
                  <th className="relative px-3 py-2 font-medium" style={{ width: state.width }}>
                    状態
                    <ResizeHandle onMouseDown={state.startResize} side="left" />
                  </th>
                </tr>
              </thead>
              <tbody>
                {visible.map((s) => {
                  const active = s.activated_at != null;
                  // InActive はグレーアウト。opacity は tr ではなく状態以外のセルに付ける
                  // （tr に付けると状態のメニューが行の重なりに閉じ込められ、下の行に隠れる）。
                  const dim = !active && "opacity-60";
                  return (
                    <tr key={s.id} className="h-10 border-b border-border transition-colors last:border-b-0 hover:bg-surface-muted">
                      <td className={cn("px-3 py-2", dim)}>
                        <IdBadge id={s.id} />
                      </td>
                      <td className={cn("relative truncate px-3 py-2", dim)}>
                        <Link
                          to={`/stories/${s.id}`}
                          data-tooltip="詳細を開く"
                          className="font-medium text-fg no-underline hover:underline"
                        >
                          {s.title}
                        </Link>
                        <ResizeHandle onMouseDown={name.startResize} side="right" />
                      </td>
                      <td className={cn("hidden truncate px-3 py-2 @5xl:table-cell", s.description ? "text-fg-muted" : "text-fg-muted/60", dim)}>
                        {s.description ?? "（説明なし）"}
                      </td>
                      <td className={cn("whitespace-nowrap px-3 py-2 text-fg-muted", dim)}>{s.start_date ?? "—"}</td>
                      <td className={cn("whitespace-nowrap px-3 py-2 text-fg-muted", dim)}>{s.due_date ?? "—"}</td>
                      <td className={cn("relative px-3 py-2", dim)}>
                        <Badge tone={s.status}>{STATUS_LABEL[s.status]}</Badge>
                        <ResizeHandle onMouseDown={status.startResize} side="left" />
                      </td>
                      <td className="relative px-3 py-2">
                        <EpicStateBadge active={active} onPick={(next) => setPendingState({ story: s, active: next })} />
                        <ResizeHandle onMouseDown={state.startResize} side="left" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {pendingState && (
        <ConfirmDialog
          message={
            pendingState.active
              ? `「${pendingState.story.title}」を Active にします。ストーリーとして着手した扱いになります。よろしいですか？`
              : `「${pendingState.story.title}」を InActive にします。バックログに戻ります。よろしいですか？`
          }
          onConfirm={() => {
            onSetActive(pendingState.story.id, pendingState.active);
            setPendingState(null);
          }}
          onCancel={() => setPendingState(null)}
        />
      )}

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

// Name (required) and description. A new backlog item starts inactive; its context is written on the detail page.
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
