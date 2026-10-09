import type { CSSProperties } from "react";

export const HEADER_H = 48;

// Full-width bar across the top of every signed-in page.
export function GlobalHeader({
  userName,
  userEmail,
  onLogout,
}: {
  userName: string;
  userEmail: string | null;
  onLogout: () => void;
}) {
  return (
    <header
      style={{
        height: HEADER_H,
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "0 16px",
        background: "#1f2933",
        color: "#e5e8eb",
        borderBottom: "1px solid #2f3b46",
      }}
    >
      <span style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 8, fontWeight: 700, fontSize: 16, whiteSpace: "nowrap" }}>
        <BranchIcon />
        task-branch
      </span>
      <span
        title={userEmail ?? undefined}
        style={{ maxWidth: 280, fontSize: 13, color: "#cbd2d9", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
      >
        {userName}
      </span>
      <button onClick={onLogout} style={logoutBtn}>
        ログアウト
      </button>
    </header>
  );
}

// A trunk with one branch forking off, on a rounded tile.
function BranchIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true" style={{ flexShrink: 0 }}>
      <rect width="24" height="24" rx="6" fill="#0972d3" />
      <g fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round">
        <path d="M8 6.5v11" />
        <path d="M16 9c0 4-8 3-8 6" />
      </g>
      <g fill="#fff">
        <circle cx="8" cy="6.5" r="1.9" />
        <circle cx="8" cy="17.5" r="1.9" />
        <circle cx="16" cy="7.5" r="1.9" />
      </g>
    </svg>
  );
}

const logoutBtn: CSSProperties = {
  flexShrink: 0,
  padding: "5px 12px",
  border: "1px solid #3d4b57",
  borderRadius: 6,
  background: "transparent",
  color: "#e5e8eb",
  cursor: "pointer",
  fontSize: 13,
};
