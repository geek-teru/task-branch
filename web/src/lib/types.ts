// Shared domain types. Every view is a projection over these — see DESIGN.md §5.4.

export type Level = "epic" | "story" | "task";
export type Status = "todo" | "in_progress" | "done";

export interface Project {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface Task {
  id: string;
  project_id: string;
  parent_id: string | null;
  level: Level;
  title: string;
  description: string | null;
  status: Status;
  sort_order: number;
  start_date: string | null; // extensibility: gantt / calendar
  due_date: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

// Editable fields for a story, shared by the create/edit form and the API.
export interface StoryInput {
  title: string;
  status: Status;
  start_date: string | null;
  due_date: string | null;
  description: string | null;
}

// A task enriched with derived fields from get_task_graph().
export interface GraphNode extends Task {
  progress: number | null;
}

// Normalized, view-agnostic snapshot of a project (the single source views read).
export interface ProjectGraph {
  nodes: GraphNode[];
}

// One kanban swimlane: an in-progress story with its parent epic and child tasks.
export interface KanbanLane {
  story: Task;
  epic: Task | null;
  tasks: Task[];
}

export const STATUS_LABEL: Record<Status, string> = {
  todo: "未着手",
  in_progress: "進行中",
  done: "完了",
};

export const STATUS_ORDER: Status[] = ["todo", "in_progress", "done"];

export const LEVEL_LABEL: Record<Level, string> = {
  epic: "エピック",
  story: "ストーリー",
  task: "タスク",
};
