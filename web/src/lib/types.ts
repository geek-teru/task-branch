// Shared domain types. Every view is a projection over these — see DESIGN.md §5.4.

export type Level = "story" | "task";
export type Status = "todo" | "in_progress" | "done" | "closed";
export type AssigneeType = "human" | "ai";

export interface Project {
  id: string;
  name: string;
  description: string | null;
  url: string | null; // related site (deployment etc.)
  repository_url: string | null; // GitHub etc.
  is_active: boolean; // false = archived: hidden from the gantt / kanban / backlog pickers
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
  activated_at: string | null; // story only: null = backlog, set = active
  assignee_type: AssigneeType | null; // task only
  assignee_id: string | null; // task only: the human assignee
  context?: string | null; // story only: Markdown document. Not fetched by list queries
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  completed_at: string | null; // set while done / closed
  closed_at: string | null; // set while closed (approved and taken off the board)
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
  group_id: string | null; // story only: the story_groups row it belongs to. null = no group
}

// A group of stories (story_groups). Shown on the gantt only; its period comes from its stories.
export interface StoryGroup {
  id: string;
  name: string;
  sort_order: number;
}

// A row of the backlog page (stories of a project, without the context document).
export type BacklogStory = Pick<
  Task,
  "id" | "title" | "description" | "status" | "activated_at" | "sort_order"
>;

// Latest saved version of a story's context document (story_context_revisions).
export interface ContextRevision {
  version: number;
  edited_by_type: AssigneeType;
  created_at: string;
}

// A comment on a task (level = task only). author_* default to the caller on insert.
export interface TaskComment {
  id: string;
  task_id: string;
  author_type: AssigneeType;
  author_id: string | null;
  body: string;
  created_at: string;
  updated_at: string;
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
  groups: StoryGroup[];
}

// One kanban swimlane: an in-progress story with its child tasks.
export interface KanbanLane {
  story: Task;
  tasks: Task[];
}

export const STATUS_LABEL: Record<Status, string> = {
  todo: "未着手",
  in_progress: "進行中",
  done: "完了",
  closed: "クローズ",
};

// Every status, in workflow order (status pickers and forms).
export const STATUS_ORDER: Status[] = ["todo", "in_progress", "done", "closed"];

// Kanban columns. The closed column is always shown (as a drop target); its cards are hidden
// unless the toolbar toggle is on.
export const BOARD_STATUSES: Status[] = ["todo", "in_progress", "done", "closed"];

// done and closed both count as finished (same rule as get_progress).
export const isFinished = (status: Status) => status === "done" || status === "closed";

export const LEVEL_LABEL: Record<Level, string> = {
  story: "ストーリー",
  task: "タスク",
};
