import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  getLatestContextRevision,
  getStory,
  listStoryTasks,
  updateStoryContext,
  updateStoryInfo,
} from "../lib/api";
import type { ContextRevision, Project, Task } from "../lib/types";
import { STATUS_LABEL, STATUS_ORDER } from "../lib/types";
import { cn } from "../lib/cn";
import { useTableSort, type SortValue } from "../lib/useTableSort";
import { AttachmentTextarea } from "../components/AttachmentTextarea";
import { IdBadge } from "../components/IdBadge";
import { Markdown } from "../components/Markdown";
import { EditIcon } from "../components/Icons";
import { Badge } from "../components/ui/Badge";
import { Button, IconButton } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Dialog } from "../components/ui/Dialog";
import { Input } from "../components/ui/Input";
import { PageHeader } from "../components/ui/PageHeader";
import { SortableTh } from "../components/ui/SortableTh";
import { Textarea } from "../components/ui/Textarea";

// Task table columns sortable by a header click (all but ID). 期間 compares the start date, then the due date.
const SORT_COLUMNS = {
  title: (t) => t.title,
  description: (t) => t.description,
  status: (t) => STATUS_ORDER.indexOf(t.status),
  period: (t) => (t.start_date || t.due_date ? [t.start_date, t.due_date] : null),
} satisfies Record<string, (t: Task) => SortValue>;

// Story detail: name / description, status, the context document and the story's tasks.
// Loads its own data through the api layer (the story's context is only needed here).
export function StoryDetailPage({
  storyId,
  projects,
  onError,
  onLoadProject,
}: {
  storyId: string;
  projects: Project[];
  onError: (message: string) => void;
  // Called with the story's project once loaded, so it becomes the app-wide selection.
  onLoadProject?: (projectId: string) => void;
}) {
  const [story, setStory] = useState<Task | null | undefined>(undefined); // undefined = loading
  const [tasks, setTasks] = useState<Task[]>([]);
  const [revision, setRevision] = useState<ContextRevision | null>(null);
  const [draft, setDraft] = useState<string | null>(null); // non-null while editing
  const [saving, setSaving] = useState(false);
  const [editingInfo, setEditingInfo] = useState(false);
  const [uploading, setUploading] = useState(false); // images being attached to the context
  const { sorted: sortedTasks, sort, toggle } = useTableSort(tasks, SORT_COLUMNS);

  const load = useCallback(async () => {
    try {
      const [s, t, r] = await Promise.all([getStory(storyId), listStoryTasks(storyId), getLatestContextRevision(storyId)]);
      setStory(s);
      setTasks(t);
      setRevision(r);
      if (s) onLoadProject?.(s.project_id);
    } catch (err: any) {
      onError(String(err.message ?? err));
    }
  }, [storyId, onError, onLoadProject]);

  useEffect(() => {
    setStory(undefined);
    setDraft(null);
    load();
  }, [load]);

  if (story === undefined) return <div className="p-6 text-[13px] text-fg-muted">読み込み中…</div>;
  if (story === null) return <div className="p-6 text-[13px] text-fg-muted">ストーリーが見つかりません。</div>;

  const project = projects.find((p) => p.id === story.project_id);
  const editing = draft !== null;
  const dirty = editing && draft !== (story.context ?? "");

  const save = async () => {
    if (draft === null || uploading) return;
    setSaving(true);
    try {
      await updateStoryContext(story.id, draft.trim() === "" ? null : draft);
      setDraft(null);
      await load();
    } catch (err: any) {
      onError(String(err.message ?? err));
    } finally {
      setSaving(false);
    }
  };

  const cancel = () => {
    if (dirty && !window.confirm("編集中の内容を破棄します。よろしいですか？")) return;
    setDraft(null);
  };

  // 名前・説明・期間の変更。コンテキストの編集とは別。
  const submitInfo = async (info: StoryInfo) => {
    try {
      await updateStoryInfo(story.id, info);
      setEditingInfo(false);
      await load();
    } catch (err: any) {
      onError(String(err.message ?? err));
    }
  };

  return (
    <div className="h-full overflow-auto">
      <PageHeader
        back={
          <Link to={`/backlog?project=${story.project_id}`} className="text-fg-muted no-underline hover:text-fg">
            ← バックログ{project ? `（${project.name}）` : ""}
          </Link>
        }
        title={story.title}
        meta={
          <>
            <Badge tone={story.status}>{STATUS_LABEL[story.status]}</Badge>
            <span className="text-[11px]">{period(story)}</span>
            <IdBadge id={story.id} />
          </>
        }
        actions={
          <IconButton label="変更" size="md" onClick={() => setEditingInfo(true)}>
            <EditIcon size={14} />
          </IconButton>
        }
      />
      <div className="max-w-[960px] px-6 pb-6">
        <p className={cn("m-0 text-sm", story.description ? "text-fg" : "text-fg-muted")}>
          {story.description ?? "（説明なし）"}
        </p>

        <Card className="mt-6">
          <CardHeader
            title="コンテキスト"
            meta={
              revision
                ? `版 ${revision.version}・${new Date(revision.created_at).toLocaleString("ja-JP")}・${revision.edited_by_type === "ai" ? "AI" : "人"}が更新`
                : "未作成"
            }
          >
            {editing ? (
              <>
                <Button size="sm" onClick={cancel} disabled={saving}>
                  キャンセル
                </Button>
                <Button size="sm" variant="primary" onClick={save} disabled={saving || uploading || !dirty}>
                  {saving ? "保存中…" : "保存"}
                </Button>
              </>
            ) : (
              <IconButton label="コンテキストを変更" onClick={() => setDraft(story.context ?? "")}>
                <EditIcon size={14} />
              </IconButton>
            )}
          </CardHeader>
          <div className="px-5 py-4 text-sm">
            {editing ? (
              <AttachmentTextarea
                autoFocus
                value={draft}
                onChange={setDraft}
                projectId={story.project_id}
                taskId={story.id}
                onUploadingChange={setUploading}
                rows={20}
                placeholder={"## 背景・課題\n\n## ゴール\n\n## スコープと非スコープ\n\n## 方針\n\n## 決定事項\n\n## 未決事項"}
                // ! beats fieldClass's font-sans (cn does not resolve conflicting utilities).
                className="px-3 py-2.5 font-mono!"
              />
            ) : story.context ? (
              <Markdown>{story.context}</Markdown>
            ) : (
              <div className="text-fg-muted">
                コンテキストがまだありません。「編集」から、背景・課題、ゴール、方針などを書いてください。
              </div>
            )}
          </div>
        </Card>

        {/* @container: the description column is dropped when the card is narrow. */}
        <Card className="@container mt-6 overflow-hidden">
          <CardHeader title="タスク" meta={`${tasks.length} 件`} />
          {tasks.length === 0 ? (
            <div className="px-5 py-4 text-[13px] text-fg-muted">タスクはまだありません。</div>
          ) : (
            <table className="w-full table-fixed border-collapse text-[13px]">
              <thead>
                <tr className="border-b border-border bg-surface-muted text-left text-xs text-fg-muted">
                  <th className="w-24 px-3 py-2 font-medium">ID</th>
                  <SortableTh label="名前" sortKey="title" sort={sort} onSort={toggle} className="px-3 py-2 @2xl:w-[38%]" />
                  <SortableTh label="説明" sortKey="description" sort={sort} onSort={toggle} className="hidden px-3 py-2 @2xl:table-cell" />
                  <SortableTh label="ステータス" sortKey="status" sort={sort} onSort={toggle} className="w-28 px-3 py-2" />
                  <SortableTh label="期間" sortKey="period" sort={sort} onSort={toggle} className="w-44 px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {sortedTasks.map((s) => (
                  <tr key={s.id} className="h-10 border-b border-border transition-colors last:border-b-0 hover:bg-surface-muted">
                    <td className="px-3 py-2">
                      <IdBadge id={s.id} />
                    </td>
                    <td className="truncate px-3 py-2 font-medium text-fg" data-tooltip={s.title}>
                      {s.title}
                    </td>
                    <td className={cn("hidden truncate px-3 py-2 @2xl:table-cell", s.description ? "text-fg-muted" : "text-fg-muted/60")}>
                      {s.description ?? "（説明なし）"}
                    </td>
                    <td className="px-3 py-2">
                      <Badge tone={s.status}>{STATUS_LABEL[s.status]}</Badge>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-fg-muted">{period(s)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>

      {editingInfo && (
        <StoryInfoForm
          initial={story}
          onSubmit={submitInfo}
          onCancel={() => setEditingInfo(false)}
        />
      )}
    </div>
  );
}

function period(t: Task): string {
  return t.start_date || t.due_date ? `${t.start_date ?? "—"} 〜 ${t.due_date ?? "—"}` : "—";
}

// Card title row: title, a muted note next to it and buttons on the right.
function CardHeader({ title, meta, children }: { title: string; meta: string; children?: ReactNode }) {
  return (
    <div className="flex min-h-12 items-center gap-3 border-b border-border px-5 py-2">
      <h2 className="m-0 text-sm font-medium text-fg">{title}</h2>
      <span className="text-[11px] text-fg-muted">{meta}</span>
      {children && <div className="ml-auto flex gap-1.5">{children}</div>}
    </div>
  );
}

type StoryInfo = { title: string; description: string | null; start_date: string | null; due_date: string | null };

// 名前（必須）・説明・期間。コンテキストは詳細画面のエディタで編集する。
// 期間を変えても配下のタスクはずらさない。
function StoryInfoForm({
  initial,
  onSubmit,
  onCancel,
}: {
  initial: Task;
  onSubmit: (info: StoryInfo) => Promise<void>;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(initial.title);
  const [description, setDescription] = useState(initial.description ?? "");
  const [start, setStart] = useState(initial.start_date ?? "");
  const [due, setDue] = useState(initial.due_date ?? "");
  const [saving, setSaving] = useState(false);
  const trimmed = title.trim();
  // YYYY-MM-DD compares correctly as a string.
  const periodInvalid = start !== "" && due !== "" && start > due;
  const canSubmit = trimmed !== "" && !periodInvalid && !saving;

  const submit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    try {
      const d = description.trim();
      await onSubmit({ title: trimmed, description: d ? d : null, start_date: start || null, due_date: due || null });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      title="ストーリーを変更"
      onClose={onCancel}
      className="w-[420px]"
      footer={
        <>
          <Button onClick={onCancel} disabled={saving}>
            キャンセル
          </Button>
          <Button variant="primary" onClick={submit} disabled={!canSubmit}>
            {saving ? "保存中…" : "保存"}
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
      />

      <label className="mb-1.5 mt-3.5 block text-xs text-fg-muted">説明（任意）</label>
      <Textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={3}
        placeholder="一覧に出す 1〜2 行の説明"
      />

      <div className="mt-3.5 flex gap-3">
        <div className="flex-1">
          <label className="mb-1.5 block text-xs text-fg-muted">開始日</label>
          <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
        </div>
        <div className="flex-1">
          <label className="mb-1.5 block text-xs text-fg-muted">期限</label>
          <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
        </div>
      </div>
      {periodInvalid ? (
        <div className="mt-1.5 text-[11px] text-danger">開始日が期限より後になっています。</div>
      ) : (
        <div className="mt-1.5 text-[11px] text-fg-muted">配下のタスクの期間は変わりません。</div>
      )}
    </Dialog>
  );
}
