import type { CSSProperties } from "react";

export type MenuKey = "projects" | "gantt" | "kanban";

const MENU: { key: MenuKey; label: string }[] = [
  { key: "projects", label: "プロジェクト" },
  { key: "gantt", label: "ガントチャート" },
  { key: "kanban", label: "カンバン" },
];

export function Sidebar({
  active,
  onNavigate,
}: {
  active: MenuKey | null;
  onNavigate: (key: MenuKey) => void;
}) {
  return (
    <aside
      style={{
        width: 220,
        flexShrink: 0,
        background: "#1f2933",
        color: "#e5e8eb",
        display: "flex",
        flexDirection: "column",
        height: "100vh",
      }}
    >
      <div style={{ padding: "14px 16px", fontWeight: 700, fontSize: 16, borderBottom: "1px solid #2f3b46" }}>
        task-branch
      </div>

      <nav style={{ flex: 1, padding: "8px", overflowY: "auto" }}>
        {MENU.map((m) => {
          const isActive = m.key === active;
          return (
            <button key={m.key} onClick={() => onNavigate(m.key)} style={menuBtn(isActive)}>
              {m.label}
            </button>
          );
        })}
      </nav>
    </aside>
  );
}

function menuBtn(isActive: boolean): CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    width: "100%",
    textAlign: "left",
    background: isActive ? "#0972d3" : "transparent",
    color: isActive ? "#fff" : "#cbd2d9",
    border: "none",
    borderRadius: 6,
    padding: "9px 10px",
    marginBottom: 2,
    cursor: "pointer",
    fontSize: 13,
    fontWeight: isActive ? 600 : 400,
  };
}
