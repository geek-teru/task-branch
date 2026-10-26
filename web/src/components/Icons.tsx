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

// Service icon: a trunk with one branch forking off, on a rounded tile. Same drawing as public/favicon.svg.
export function ServiceIcon({ size = 24 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" style={{ flexShrink: 0 }}>
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

// Search: a magnifier.
export function SearchIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <circle cx="7" cy="7" r="4.5" />
      <path d="M10.5 10.5L14 14" />
    </Icon>
  );
}

// More actions: three vertical dots (⋮).
export function MoreIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M8 3h.01M8 8h.01M8 13h.01" strokeWidth="2.2" />
    </Icon>
  );
}

// Grid view: four tiles.
export function GridIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <rect x="2.5" y="2.5" width="4.5" height="4.5" rx="0.8" />
      <rect x="9" y="2.5" width="4.5" height="4.5" rx="0.8" />
      <rect x="2.5" y="9" width="4.5" height="4.5" rx="0.8" />
      <rect x="9" y="9" width="4.5" height="4.5" rx="0.8" />
    </Icon>
  );
}

// List view: horizontal rows.
export function ListIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M2.5 4h11M2.5 8h11M2.5 12h11" />
    </Icon>
  );
}
