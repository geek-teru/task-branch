import { useState, type CSSProperties } from "react";

// Active / InActive のバッジ。onPick があるとクリックでプルダウンを出し、
// 選んだ状態を返す（確認モーダルは呼び出し側が出す）。
export function EpicStateBadge({ active, onPick }: { active: boolean; onPick?: (next: boolean) => void }) {
  // 表の中でも隠れないよう、メニューはボタンの位置に合わせた固定配置で出す
  // （表は角丸のため overflow: hidden になっている）。
  const [at, setAt] = useState<{ left: number; top: number } | null>(null);
  const label = active ? "Active" : "InActive";

  if (!onPick) return <span style={active ? activeBadge : inactiveBadge}>{label}</span>;

  return (
    <span style={{ position: "relative", display: "inline-block" }}>
      <button
        onClick={(e) => {
          if (at) return setAt(null);
          const r = e.currentTarget.getBoundingClientRect();
          setAt({ left: r.left, top: r.bottom + 4 });
        }}
        title="クリックで状態を変更"
        style={pickerBtn}
      >
        <span style={active ? activeBadge : inactiveBadge}>{label}</span>
        <span style={{ fontSize: 10, color: "#5f6b7a" }}>▾</span>
      </button>
      {at && (
        <>
          {/* click-away closes the menu */}
          <span onClick={() => setAt(null)} style={{ position: "fixed", inset: 0, zIndex: 19 }} />
          <span style={{ ...menu, left: at.left, top: at.top }}>
            {[true, false].map((value) => (
              <button
                key={String(value)}
                onClick={() => {
                  setAt(null);
                  if (value !== active) onPick(value);
                }}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  padding: "5px 10px",
                  border: "none",
                  borderRadius: 4,
                  background: value === active ? "#eef1f3" : "transparent",
                  color: "#1f2933",
                  fontSize: 12,
                  fontWeight: value === active ? 600 : 400,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                {value ? "Active" : "InActive"}
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

const menu: CSSProperties = {
  position: "fixed",
  zIndex: 20,
  minWidth: 96,
  background: "#fff",
  border: "1px solid #cbd2d9",
  borderRadius: 6,
  boxShadow: "0 4px 12px rgba(31,41,51,0.18)",
  padding: 4,
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
