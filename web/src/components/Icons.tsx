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

// Google's "G" mark, in its own colors, for the sign-in buttons.
export function GoogleIcon({ size = 16 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" style={{ flexShrink: 0 }}>
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
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

// Kanban: three columns of the same height (todo / in progress / done).
export function KanbanIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <rect x="2" y="2.5" width="3.2" height="11" rx="0.8" />
      <rect x="6.4" y="2.5" width="3.2" height="11" rx="0.8" />
      <rect x="10.8" y="2.5" width="3.2" height="11" rx="0.8" />
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
