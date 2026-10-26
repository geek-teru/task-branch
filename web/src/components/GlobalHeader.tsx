import type { CSSProperties } from "react";
import { ServiceIcon } from "./Icons";

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
        <ServiceIcon />
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
