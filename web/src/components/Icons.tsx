import type { CSSProperties, ReactNode } from "react";

// Spread into a button's style to line an icon up with its label.
export const withIcon: CSSProperties = { display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 4 };

// Line icons on a 16px grid. Stroke uses currentColor, so an icon takes the color of the button it sits in.
function Icon({ size = 16, children }: { size?: number; children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      {children}
    </svg>
  );
}

type IconProps = { size?: number };

// Service icon: a trunk with branches forking left and right, and smaller branches off those, on a rounded tile.
// Same drawing as public/favicon.svg.
export function ServiceIcon({ size = 24 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" style={{ flexShrink: 0 }}>
      <rect width="24" height="24" rx="6" fill="#0972d3" />
      <g fill="none" stroke="#fff" strokeWidth="1.6" strokeLinecap="round">
        <path d="M12 20.5V4.5" />
        <path d="M12 16.5c0-2.5-6.5-2.5-6.5-5V9" />
        <path d="M12 12.5c0-2.5 6.5-2.5 6.5-5V5.5" />
        <path d="M5.5 13c0-1.5-2-1-2-3" />
        <path d="M18.5 10c0 2 2 2 2 4" />
      </g>
      <g fill="#fff">
        <circle cx="12" cy="4.5" r="1.6" />
        <circle cx="12" cy="20" r="1.6" />
        <circle cx="5.5" cy="8.5" r="1.6" />
        <circle cx="18.5" cy="5" r="1.6" />
        <circle cx="3.5" cy="9.5" r="1.3" />
        <circle cx="20.5" cy="14.5" r="1.3" />
      </g>
    </svg>
  );
}

// Projects: a folder.
export function ProjectIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M2 4.5c0-.6.4-1 1-1h3.2l1.5 1.5H13c.6 0 1 .4 1 1v6.5c0 .6-.4 1-1 1H3c-.6 0-1-.4-1-1z" />
    </Icon>
  );
}

// Backlog: a stacked list with bullets.
export function BacklogIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M6 4h8M6 8h8M6 12h8" />
      <path d="M2.5 4h.01M2.5 8h.01M2.5 12h.01" strokeWidth="2" />
    </Icon>
  );
}

// Kanban: three columns of different heights.
export function KanbanIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <rect x="2" y="2.5" width="3.2" height="11" rx="0.8" />
      <rect x="6.4" y="2.5" width="3.2" height="7.5" rx="0.8" />
      <rect x="10.8" y="2.5" width="3.2" height="9.5" rx="0.8" />
    </Icon>
  );
}

// Gantt chart: staggered bars.
export function GanttIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M2 2v12h12" />
      <path d="M4.5 5h4M6.5 8h5M9 11h4" strokeWidth="2" />
    </Icon>
  );
}

// Edit (変更 / 編集): a pencil.
export function EditIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M10.5 2.5l3 3L6 13H3v-3z" />
      <path d="M9 4l3 3" />
    </Icon>
  );
}

// Delete: a trash can.
export function DeleteIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M2.5 4h11M6 4V2.5h4V4" />
      <path d="M3.8 4l.7 9.5h7l.7-9.5" />
      <path d="M6.5 6.5v4.5M9.5 6.5v4.5" />
    </Icon>
  );
}

// Add: a plus.
export function AddIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M8 3v10M3 8h10" />
    </Icon>
  );
}
