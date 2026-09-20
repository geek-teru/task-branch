import { useState, type CSSProperties } from "react";
import { useResizableWidth, resizeHandleStyle } from "../lib/useResizableWidth";

export type MenuKey = "projects" | "backlog" | "gantt" | "kanban";

// icon: shown instead of the label while the sidebar is collapsed.
const MENU: { key: MenuKey; label: string; icon: string }[] = [
  { key: "projects", label: "プロジェクト", icon: "▦" },
  { key: "backlog", label: "バックログ", icon: "≡" },
  { key: "gantt", label: "ガントチャート", icon: "▬" },
  { key: "kanban", label: "カンバン", icon: "▥" },
];

const COLLAPSED_W = 52;
const COLLAPSE_KEY = "sidebar.collapsed";

export function Sidebar({
  active,
  onNavigate,
}: {
  active: MenuKey | null;
  onNavigate: (key: MenuKey) => void;
}) {
  const { width, startResize } = useResizableWidth("sidebar.width", 220, 160, 480);
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(COLLAPSE_KEY) === "1";
    } catch {
      return false; // storage can be unavailable (private mode)
    }
  });

  const toggle = () => {
    setCollapsed((v) => {
      try {
        localStorage.setItem(COLLAPSE_KEY, v ? "0" : "1");
      } catch {
        // Ignore: the state still applies for this session.
      }
      return !v;
    });
  };

  return (
    <aside
      style={{
        position: "relative",
        width: collapsed ? COLLAPSED_W : width,
        flexShrink: 0,
        background: "#1f2933",
        color: "#e5e8eb",
        display: "flex",
        flexDirection: "column",
        height: "100vh",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: collapsed ? "14px 0" : "14px 8px 14px 16px",
          justifyContent: collapsed ? "center" : undefined,
          borderBottom: "1px solid #2f3b46",
        }}
      >
        {!collapsed && (
          <span style={{ flex: 1, minWidth: 0, fontWeight: 700, fontSize: 16, whiteSpace: "nowrap", overflow: "hidden" }}>
            task-branch
          </span>
        )}
        <button
          onClick={toggle}
          title={collapsed ? "サイドナビを開く" : "サイドナビを閉じる"}
          aria-label={collapsed ? "サイドナビを開く" : "サイドナビを閉じる"}
          style={toggleBtn}
        >
          {collapsed ? "»" : "«"}
        </button>
      </div>

      <nav style={{ flex: 1, padding: 8, overflowY: "auto", overflowX: "hidden" }}>
        {MENU.map((m) => {
          const isActive = m.key === active;
          return (
            <button
              key={m.key}
              onClick={() => onNavigate(m.key)}
              title={m.label}
              style={menuBtn(isActive, collapsed)}
            >
              {collapsed ? m.icon : m.label}
            </button>
          );
        })}
      </nav>

      {!collapsed && (
        <div onMouseDown={startResize} title="ドラッグで幅を変更" style={{ ...resizeHandleStyle, right: -3 }} />
      )}
    </aside>
  );
}

function menuBtn(isActive: boolean, collapsed: boolean): CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    justifyContent: collapsed ? "center" : "flex-start",
    width: "100%",
    textAlign: collapsed ? "center" : "left",
    background: isActive ? "#0972d3" : "transparent",
    color: isActive ? "#fff" : "#cbd2d9",
    border: "none",
    borderRadius: 6,
    padding: collapsed ? "9px 0" : "9px 10px",
    marginBottom: 2,
    cursor: "pointer",
    fontSize: collapsed ? 15 : 13,
    fontWeight: isActive ? 600 : 400,
    whiteSpace: "nowrap",
    overflow: "hidden",
  };
}

const toggleBtn: CSSProperties = {
  flexShrink: 0,
  width: 24,
  height: 24,
  lineHeight: "22px",
  padding: 0,
  border: "1px solid #3d4b57",
  borderRadius: 6,
  background: "transparent",
  color: "#cbd2d9",
  cursor: "pointer",
  fontSize: 13,
};
