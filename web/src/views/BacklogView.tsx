import type { CSSProperties } from "react";
import { Link } from "react-router-dom";
import type { BacklogEpic, Project } from "../lib/types";

// Epics of one project: active ones (エピック) and inactive ones (バックログ).
// Only name / description / state are shown; the document (context) is not loaded here.
export function BacklogView({
  projects,
  projectId,
  epics,
  onSelectProject,
}: {
  projects: Project[];
  projectId: string;
  epics: BacklogEpic[] | null;
  onSelectProject: (projectId: string) => void;
}) {
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
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
          value={projectId}
          onChange={(e) => onSelectProject(e.target.value)}
          style={{ fontSize: 13, padding: "4px 8px", borderRadius: 6, border: "1px solid #cbd2d9" }}
        >
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      <div style={{ flex: 1, minHeight: 0, padding: 24, overflow: "auto", boxSizing: "border-box" }}>
        {!epics ? (
          <div style={{ color: "#5f6b7a" }}>読み込み中…</div>
        ) : epics.length === 0 ? (
          <div style={{ color: "#5f6b7a" }}>エピック・バックログがありません。</div>
        ) : (
          <table style={table}>
            <thead>
              <tr>
                <th style={{ ...th, width: "30%" }}>名前</th>
                <th style={th}>説明</th>
                <th style={{ ...th, width: 160 }}>状態</th>
                <th style={{ ...th, width: 72 }} />
              </tr>
            </thead>
            <tbody>
              {epics.map((e) => {
                const active = e.activated_at != null;
                return (
                  <tr key={e.id}>
                    <td style={{ ...td, fontWeight: 600 }}>{e.title}</td>
                    <td style={{ ...td, color: e.description ? "#3b4149" : "#94a0ad" }}>
                      {e.description ?? "（説明なし）"}
                    </td>
                    <td style={td}>
                      <span style={active ? activeBadge : inactiveBadge}>
                        {active ? "エピック（Active）" : "バックログ（Inactive）"}
                      </span>
                    </td>
                    <td style={td}>
                      <Link to={`/epics/${e.id}`} style={detailBtn}>
                        詳細
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

const table: CSSProperties = {
  width: "100%",
  borderCollapse: "separate",
  borderSpacing: 0,
  background: "#fff",
  border: "1px solid #e5e8eb",
  borderRadius: 10,
  overflow: "hidden",
  fontSize: 13,
};

const th: CSSProperties = {
  textAlign: "left",
  padding: "8px 12px",
  fontSize: 12,
  fontWeight: 600,
  color: "#5f6b7a",
  background: "#f7f8f9",
  borderBottom: "1px solid #e5e8eb",
};

const td: CSSProperties = {
  padding: "10px 12px",
  borderBottom: "1px solid #eef0f2",
  verticalAlign: "top",
  color: "#1f2933",
};

const detailBtn: CSSProperties = {
  display: "inline-block",
  background: "#fff",
  color: "#3b4149",
  border: "1px solid #cbd2d9",
  borderRadius: 6,
  padding: "3px 10px",
  fontSize: 12,
  textDecoration: "none",
  whiteSpace: "nowrap",
};

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
