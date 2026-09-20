import { useState, type CSSProperties, type ReactNode } from "react";
import type { Status, Task } from "../lib/types";
import { LEVEL_LABEL, STATUS_LABEL, STATUS_ORDER } from "../lib/types";
import { STATUS_COLOR } from "../lib/style";
import { IdBadge } from "./IdBadge";

// A story or task shown in the panel; progress is present for graph nodes only.
export type DetailNode = Task & { progress?: number | null };

const MS_DAY = 24 * 60 * 60 * 1000;
function parseDate(s: string): Date {
  return new Date(`${s}T00:00:00`);
}
function diffDays(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / MS_DAY);
}

// Right-hand detail panel for a selected story / task (shared by the gantt and the kanban).
export function DetailPanel<T extends DetailNode>({
  title,
  node,
  start,
  end,
  onClose,
  onEdit,
  onDelete,
  onStart,
  onComplete,
  onChangeStatus,
}: {
  title: string;
  node: T | null;
  start: Date | null; // shown as 期間; the gantt passes the bar's (possibly derived) span
  end: Date | null;
  onClose: () => void;
  onEdit?: (node: T) => void;
  onDelete?: (node: T) => void;
  onStart?: (node: T) => void;
  onComplete?: (node: T) => void;
  onChangeStatus?: (node: T, status: Status) => void; // status badge → menu
}) {
  const fmt = (d: Date | null) => (d ? `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}` : "—");
  const fmtDateTime = (s: string) => new Date(s).toLocaleString("ja-JP");
  const durationDays = start && end ? diffDays(start, end) + 1 : null;
  const canEdit = node != null && node.level !== "epic";
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
          {title}
        </div>

        {node && (
          <div style={{ marginBottom: 12 }}>
            <IdBadge id={node.id} />
          </div>
        )}

        <Field label="レベル">{node ? LEVEL_LABEL[node.level] : DASH}</Field>
        <Field label="ステータス">
          {node?.status ? (
            onChangeStatus && node.level !== "epic" ? (
              <StatusPicker status={node.status} onPick={(s) => onChangeStatus(node, s)} />
            ) : (
              <StatusBadge status={node.status} />
            )
          ) : (
            DASH
          )}
        </Field>
        <Field label="開始日">{node?.start_date ? fmt(parseDate(node.start_date)) : DASH}</Field>
        <Field label="期限">{node?.due_date ? fmt(parseDate(node.due_date)) : DASH}</Field>
        <Field label="期間">{durationDays != null ? `${durationDays}日` : DASH}</Field>
        <Field label="進捗">
          {node?.progress != null ? `${Math.round(node.progress * 100)}%` : DASH}
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
                  title={`この${LEVEL_LABEL[node.level]}を進行中にします`}
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

// Badge that opens a small menu to pick any status.
function StatusPicker({ status, onPick }: { status: Status; onPick: (status: Status) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <span style={{ position: "relative", display: "inline-block" }}>
      <button onClick={() => setOpen((v) => !v)} title="クリックでステータスを変更" style={pickerBtn}>
        <StatusBadge status={status} />
        <span style={{ fontSize: 10, color: "#5f6b7a" }}>▾</span>
      </button>
      {open && (
        <>
          <span onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 19 }} />
          <span style={pickerMenu}>
            {STATUS_ORDER.map((s) => (
              <button
                key={s}
                onClick={() => {
                  setOpen(false);
                  if (s !== status) onPick(s);
                }}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  padding: "5px 10px",
                  border: "none",
                  borderRadius: 4,
                  background: s === status ? "#eef1f3" : "transparent",
                  color: "#1f2933",
                  fontSize: 12,
                  fontWeight: s === status ? 600 : 400,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                {STATUS_LABEL[s]}
              </button>
            ))}
          </span>
        </>
      )}
    </span>
  );
}

const pickerBtn: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  background: "none",
  border: "none",
  padding: 0,
  cursor: "pointer",
};

const pickerMenu: CSSProperties = {
  position: "absolute",
  left: 0,
  top: "calc(100% + 4px)",
  zIndex: 20,
  minWidth: 96,
  background: "#fff",
  border: "1px solid #cbd2d9",
  borderRadius: 6,
  boxShadow: "0 4px 12px rgba(31,41,51,0.18)",
  padding: 4,
};

function StatusBadge({ status }: { status: Status }) {
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
