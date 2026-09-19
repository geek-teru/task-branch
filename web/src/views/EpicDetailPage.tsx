import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import { addStory, getEpic, getLatestContextRevision, listStories, updateEpicContext } from "../lib/api";
import type { ContextRevision, Project, StoryInput, Task } from "../lib/types";
import { STATUS_LABEL } from "../lib/types";
import { STATUS_COLOR } from "../lib/style";
import { TaskForm } from "../components/TaskForm";

// Epic detail: view / edit the context document and add stories.
// Loads its own data through the api layer (the epic's context is only needed here).
export function EpicDetailPage({
  epicId,
  projects,
  onError,
}: {
  epicId: string;
  projects: Project[];
  onError: (message: string) => void;
}) {
  const [epic, setEpic] = useState<Task | null | undefined>(undefined); // undefined = loading
  const [stories, setStories] = useState<Task[]>([]);
  const [revision, setRevision] = useState<ContextRevision | null>(null);
  const [draft, setDraft] = useState<string | null>(null); // non-null while editing
  const [saving, setSaving] = useState(false);
  const [addingStory, setAddingStory] = useState(false);

  const load = useCallback(async () => {
    try {
      const [e, s, r] = await Promise.all([getEpic(epicId), listStories(epicId), getLatestContextRevision(epicId)]);
      setEpic(e);
      setStories(s);
      setRevision(r);
    } catch (err: any) {
      onError(String(err.message ?? err));
    }
  }, [epicId, onError]);

  useEffect(() => {
    setEpic(undefined);
    setDraft(null);
    load();
  }, [load]);

  if (epic === undefined) return <div style={{ padding: 24, color: "#5f6b7a" }}>読み込み中…</div>;
  if (epic === null) return <div style={{ padding: 24, color: "#5f6b7a" }}>エピックが見つかりません。</div>;

  const project = projects.find((p) => p.id === epic.project_id);
  const active = epic.activated_at != null;
  const editing = draft !== null;
  const dirty = editing && draft !== (epic.context ?? "");

  const save = async () => {
    if (draft === null) return;
    setSaving(true);
    try {
      await updateEpicContext(epic.id, draft.trim() === "" ? null : draft);
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

  const submitStory = async (values: StoryInput) => {
    setAddingStory(false);
    try {
      await addStory(epic, values);
      await load();
    } catch (err: any) {
      onError(String(err.message ?? err));
    }
  };

  return (
    <div style={{ height: "100%", overflow: "auto", padding: 24, boxSizing: "border-box" }}>
      <Link to={`/backlog?project=${epic.project_id}`} style={{ fontSize: 12, color: "#0972d3", textDecoration: "none" }}>
        ← バックログ{project ? `（${project.name}）` : ""}
      </Link>

      <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "10px 0 6px" }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>{epic.title}</h2>
        <span style={active ? activeBadge : inactiveBadge}>{active ? "エピック（Active）" : "バックログ（Inactive）"}</span>
      </div>
      <div style={{ fontSize: 13, color: epic.description ? "#3b4149" : "#94a0ad" }}>
        {epic.description ?? "（説明なし）"}
      </div>

      <section style={card}>
        <div style={cardHeader}>
          <h3 style={h3}>コンテキスト</h3>
          <span style={{ fontSize: 11, color: "#94a0ad" }}>
            {revision
              ? `版 ${revision.version}・${new Date(revision.created_at).toLocaleString("ja-JP")}・${revision.edited_by_type === "ai" ? "AI" : "人"}が更新`
              : "未作成"}
          </span>
          <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
            {editing ? (
              <>
                <button onClick={cancel} disabled={saving} style={btn}>
                  キャンセル
                </button>
                <button onClick={save} disabled={saving || !dirty} style={primaryBtn}>
                  {saving ? "保存中…" : "保存"}
                </button>
              </>
            ) : (
              <button onClick={() => setDraft(epic.context ?? "")} style={btn}>
                編集
              </button>
            )}
          </div>
        </div>
        {editing ? (
          <textarea
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={20}
            placeholder={"## 背景・課題\n\n## ゴール\n\n## スコープと非スコープ\n\n## 方針\n\n## 決定事項\n\n## 未決事項"}
            style={textarea}
          />
        ) : epic.context ? (
          <pre style={contextView}>{epic.context}</pre>
        ) : (
          <div style={{ fontSize: 13, color: "#94a0ad", padding: "8px 0" }}>
            コンテキストがまだありません。「編集」から、背景・課題、ゴール、方針などを書いてください。
          </div>
        )}
      </section>

      <section style={card}>
        <div style={cardHeader}>
          <h3 style={h3}>ストーリー</h3>
          <span style={{ fontSize: 11, color: "#94a0ad" }}>{stories.length} 件</span>
          <button onClick={() => setAddingStory(true)} style={{ ...primaryBtn, marginLeft: "auto" }}>
            ストーリーを追加
          </button>
        </div>
        {stories.length === 0 ? (
          <div style={{ fontSize: 13, color: "#94a0ad", padding: "8px 0" }}>ストーリーはまだありません。</div>
        ) : (
          <table style={table}>
            <thead>
              <tr>
                <th style={th}>名前</th>
                <th style={{ ...th, width: 110 }}>状態</th>
                <th style={{ ...th, width: 200 }}>期間</th>
              </tr>
            </thead>
            <tbody>
              {stories.map((s) => {
                const c = STATUS_COLOR[s.status];
                return (
                  <tr key={s.id}>
                    <td style={td}>
                      <div style={{ fontWeight: 600 }}>{s.title}</div>
                      {s.description && <div style={{ fontSize: 12, color: "#5f6b7a", marginTop: 2 }}>{s.description}</div>}
                    </td>
                    <td style={td}>
                      <span style={{ ...badge, background: c.bg, color: c.fg, borderColor: c.border }}>{STATUS_LABEL[s.status]}</span>
                    </td>
                    <td style={{ ...td, color: "#5f6b7a" }}>
                      {s.start_date || s.due_date ? `${s.start_date ?? "—"} 〜 ${s.due_date ?? "—"}` : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      {addingStory && (
        <TaskForm
          heading={`ストーリーを追加（${epic.title}）`}
          submitLabel="追加"
          initial={{ title: "", status: "todo", start_date: null, due_date: null, description: null }}
          onSubmit={submitStory}
          onCancel={() => setAddingStory(false)}
        />
      )}
    </div>
  );
}

const card: CSSProperties = {
  marginTop: 20,
  background: "#fff",
  border: "1px solid #e5e8eb",
  borderRadius: 10,
  padding: 16,
};

const cardHeader: CSSProperties = { display: "flex", alignItems: "center", gap: 10, marginBottom: 10 };

const h3: CSSProperties = { margin: 0, fontSize: 15 };

const btn: CSSProperties = {
  background: "#fff",
  color: "#3b4149",
  border: "1px solid #cbd2d9",
  borderRadius: 6,
  padding: "5px 12px",
  fontSize: 12,
  cursor: "pointer",
};

const primaryBtn: CSSProperties = { ...btn, background: "#0972d3", color: "#fff", borderColor: "#0972d3" };

const textarea: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
  fontSize: 13,
  lineHeight: 1.6,
  padding: "10px 12px",
  borderRadius: 6,
  border: "1px solid #cbd2d9",
  resize: "vertical",
};

const contextView: CSSProperties = {
  margin: 0,
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
  fontSize: 13,
  lineHeight: 1.6,
  color: "#1f2933",
  background: "#f7f8f9",
  borderRadius: 6,
  padding: "10px 12px",
};

const table: CSSProperties = { width: "100%", borderCollapse: "collapse", fontSize: 13 };
const th: CSSProperties = {
  textAlign: "left",
  padding: "6px 8px",
  fontSize: 12,
  fontWeight: 600,
  color: "#5f6b7a",
  borderBottom: "1px solid #e5e8eb",
};
const td: CSSProperties = { padding: "8px", borderBottom: "1px solid #eef0f2", verticalAlign: "top" };

const badge: CSSProperties = {
  display: "inline-block",
  fontSize: 12,
  padding: "2px 8px",
  borderRadius: 10,
  border: "1px solid",
  whiteSpace: "nowrap",
};
const activeBadge: CSSProperties = { ...badge, background: "#eaf2fc", color: "#0b4a8a", borderColor: "#0972d3" };
const inactiveBadge: CSSProperties = { ...badge, background: "#f4f5f6", color: "#5f6b7a", borderColor: "#cbd2d9" };
