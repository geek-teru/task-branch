import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import type { Project, ProjectInput } from "../lib/types";
import { cn } from "../lib/cn";
import { ProjectForm } from "../components/ProjectForm";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { IdBadge } from "../components/IdBadge";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { DropdownMenu, DropdownMenuItem, DropdownMenuSeparator } from "../components/ui/DropdownMenu";
import { BacklogIcon, DeleteIcon, EditIcon, GanttIcon, KanbanIcon, MoreIcon } from "../components/Icons";

type Confirming = "archive" | "delete" | null;

// Project detail: view / edit the project itself. Everything except 変更 lives in
// the ⋮ menu next to it (jump to a view, export, archive, delete).
export function ProjectDetailPage({
  project,
  onUpdate,
  onDelete,
  onSetActive,
  onExport,
  onShowBacklog,
  onShowGantt,
  onShowKanban,
}: {
  project: Project;
  onUpdate: (id: string, input: ProjectInput) => void;
  onDelete: (id: string) => void;
  onSetActive: (id: string, isActive: boolean) => void;
  onExport: (project: Project) => void;
  onShowBacklog: (projectId: string) => void;
  onShowGantt: (projectId: string) => void;
  onShowKanban: (projectId: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState<Confirming>(null);

  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto max-w-[1200px] px-6 py-8">
        <Link to="/projects" className="text-xs text-fg-muted no-underline hover:text-fg">
          ← プロジェクト
        </Link>

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <h1 className="m-0 text-2xl font-medium text-fg">{project.name}</h1>
          <Badge tone={project.is_active ? "brand" : "neutral"}>
            {project.is_active ? "Active" : "InActive"}
          </Badge>
          <IdBadge id={project.id} />

          <div className="ml-auto flex items-center gap-2">
            <Button icon={<EditIcon size={14} />} onClick={() => setEditing(true)}>
              変更
            </Button>
            <DropdownMenu trigger={<MoreIcon size={14} />} label="そのほかの操作" align="end">
              <DropdownMenuItem onSelect={() => onShowBacklog(project.id)} icon={<BacklogIcon size={14} />}>
                バックログ
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onShowGantt(project.id)} icon={<GanttIcon size={14} />}>
                ガントチャート
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onShowKanban(project.id)} icon={<KanbanIcon size={14} />}>
                カンバン
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => onExport(project)}>JSONエクスポート</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setConfirming("archive")}>
                {project.is_active ? "アーカイブする" : "アクティブに戻す"}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setConfirming("delete")} danger icon={<DeleteIcon size={14} />}>
                削除
              </DropdownMenuItem>
            </DropdownMenu>
          </div>
        </div>
        <p className={cn("m-0 mt-2 text-sm", project.description ? "text-fg" : "text-fg-muted")}>
          {project.description ?? "説明なし"}
        </p>

        <Card className="mt-6 max-w-[720px]">
          <div className="border-b border-border px-5 py-3 text-sm font-medium text-fg">基本情報</div>
          <dl className="m-0 px-5 py-2">
            <Field label="URL">
              {project.url ? <ExternalLink href={project.url} /> : DASH}
            </Field>
            <Field label="リポジトリ">
              {project.repository_url ? <ExternalLink href={project.repository_url} /> : DASH}
            </Field>
            <Field label="作成日時">{fmt(project.created_at)}</Field>
            <Field label="更新日時">{fmt(project.updated_at)}</Field>
          </dl>
        </Card>
      </div>

      {editing && (
        <ProjectForm
          initial={project}
          onSubmit={(input) => {
            onUpdate(project.id, input);
            setEditing(false);
          }}
          onCancel={() => setEditing(false)}
        />
      )}

      {confirming === "archive" && (
        <ConfirmDialog
          message={
            project.is_active
              ? `プロジェクト「${project.name}」をアーカイブします。\nガントチャート・カンバン・バックログの選択肢から外れます。よろしいですか？`
              : `プロジェクト「${project.name}」をアクティブに戻します。よろしいですか？`
          }
          confirmLabel={project.is_active ? "アーカイブする" : "アクティブに戻す"}
          onConfirm={() => {
            setConfirming(null);
            onSetActive(project.id, !project.is_active);
          }}
          onCancel={() => setConfirming(null)}
        />
      )}

      {confirming === "delete" && (
        <ConfirmDialog
          message={`プロジェクト「${project.name}」を削除します。\n配下のエピック・ストーリー・タスク・依存関係もすべて削除されます。よろしいですか？`}
          confirmLabel="削除する"
          danger
          onConfirm={() => {
            setConfirming(null);
            onDelete(project.id);
          }}
          onCancel={() => setConfirming(null)}
        />
      )}
    </div>
  );
}

const DASH = <span className="text-fg-muted">—</span>;

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex gap-4 border-b border-border py-2.5 text-[13px] last:border-b-0">
      <dt className="w-24 shrink-0 text-xs font-medium leading-5 text-fg-muted">{label}</dt>
      <dd className="m-0 min-w-0 break-all leading-5 text-fg">{children}</dd>
    </div>
  );
}

function ExternalLink({ href }: { href: string }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="text-brand no-underline hover:underline">
      {href}
    </a>
  );
}

function fmt(iso: string): string {
  return new Date(iso).toLocaleString("ja-JP", { dateStyle: "medium", timeStyle: "short" });
}
