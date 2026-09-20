// Shared domain types. Every view is a projection over these — see DESIGN.md §5.4.

export type Level = "epic" | "story" | "task";
export type Status = "todo" | "in_progress" | "done";
export type AssigneeType = "human" | "ai";

export interface Project {
  id: string;
  name: string;
  description: string | null;
  url: string | null; // related site (deployment etc.)
  repository_url: string | null; // GitHub etc.
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
  activated_at: string | null; // epic only: null = backlog, set = active
  assignee_type: AssigneeType | null; // task only
  assignee_id: string | null; // task only: the human assignee
  context?: string | null; // epic only: Markdown document. Not fetched by list queries
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

// Editable fields of a project, shared by the create/edit form and the API.
export interface ProjectInput {
  name: string;
  description: string | null;
  url: string | null;
  repository_url: string | null;
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

// An epic as listed on the backlog page (no context document).
export type BacklogEpic = Pick<Task, "id" | "title" | "description" | "activated_at" | "sort_order">;

// Latest saved version of an epic's context document (epic_context_revisions).
export interface ContextRevision {
  version: number;
  edited_by_type: AssigneeType;
  created_at: string;
}

// predecessor (前提) → successor (後続), between tasks of the same story.
export interface TaskDependency {
  id: string;
  predecessor_id: string;
  successor_id: string;
}

// Normalized, view-agnostic snapshot of a project (the single source views read).
export interface ProjectGraph {
  nodes: GraphNode[];
  edges: TaskDependency[];
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
