// Shared domain types. Every view is a projection over these — see DESIGN.md §5.4.

import type { AgentProvider } from "./agentProviders";

export type Level = "story" | "task";
export type Status = "planning" | "todo" | "in_progress" | "in_review" | "done" | "closed";
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
  assignee_type: AssigneeType | null; // task only
  assignee_id: string | null; // task only: the human assignee
  assignee_client_id: string | null; // task only: the AI assignee (OAuth client_id). null = AI（未指定）
  context?: string | null; // story only: Markdown document. Not fetched by list queries
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  completed_at: string | null; // set while done / closed
  closed_at: string | null; // set while closed (approved and taken off the board)
}

// The signed-in user's own profile (profiles). null fields fall back to the Google account's.
export interface Profile {
  user_id: string;
  display_name: string | null; // null = Google full_name, then email
  avatar_path: string | null; // path in the avatars bucket. null = Google avatar_url
  created_at: string;
  updated_at: string;
}

// Editable fields of a profile (saveProfile).
export type ProfileInput = Pick<Profile, "display_name" | "avatar_path">;

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
  // task only, and only when the assignee was changed (absent = left as is).
  assignee_id?: string | null;
  assignee_type?: AssigneeType | null;
  assignee_client_id?: string | null;
}

// A task's assignee as shown on screen: the project owner (the signed-in user) or an AI agent.
export interface AssigneeOption {
  id: string; // a user id, or an AI key (agentAssigneeId / AI_ASSIGNEE_ID)
  name: string;
  avatarUrl: string | null;
  agent?: { provider: AgentProvider | null }; // AI only: shown with the provider's icon, as on /settings/agents
}

// Who can be picked as an assignee. agentsLoaded is false while the connected agents are unknown
// (not read yet, or the read failed), when an agent missing from options may still be connected.
export interface Assignees {
  options: AssigneeOption[];
  agentsLoaded: boolean;
}

type AssigneeFields = Pick<StoryInput, "assignee_id" | "assignee_type" | "assignee_client_id">;

// An agent has no user row (assignee_id only points at users), so it is told apart by this key.
const AGENT_KEY_PREFIX = "agent:";
export const agentAssigneeId = (clientId: string) => `${AGENT_KEY_PREFIX}${clientId}`;

// An AI assignee with no client_id: tasks assigned before agents could be picked.
export const AI_ASSIGNEE_ID = "ai";

const AI_UNSPECIFIED: AssigneeOption = { id: AI_ASSIGNEE_ID, name: "AI（未指定）", avatarUrl: null, agent: { provider: null } };

// The AssigneeOption id of a task's assignee, or null for 未割り当て.
export function assigneeKey(t: AssigneeFields): string | null {
  if (t.assignee_id) return t.assignee_id;
  if (t.assignee_type !== "ai") return null;
  return t.assignee_client_id ? agentAssigneeId(t.assignee_client_id) : AI_ASSIGNEE_ID;
}

// The assignee to show for a task. An agent that is no longer among the candidates stays the
// assignee and is shown as 解除済みのエージェント, or just エージェント while that cannot be told.
export function assigneeOf(t: AssigneeFields, assignees: Assignees): AssigneeOption | null {
  const key = assigneeKey(t);
  if (!key) return null;
  const found = assignees.options.find((a) => a.id === key);
  if (found) return found;
  if (key === AI_ASSIGNEE_ID) return AI_UNSPECIFIED;
  if (!key.startsWith(AGENT_KEY_PREFIX)) return null;
  const name = assignees.agentsLoaded ? "解除済みのエージェント" : "エージェント";
  return { id: key, name, avatarUrl: null, agent: { provider: null } };
}

// The author of a comment, picked from the assignees the same way as a task's assignee: a human
// is the user with author_id, an AI is the agent with author_client_id (AI（未指定） when it was posted
// before agents were recorded). AI comments carry the human's uid too, so author_type decides.
// null = a human who is not among the assignees (not the signed-in user).
export function commentAuthorOf(
  c: Pick<TaskComment, "author_type" | "author_id" | "author_client_id">,
  assignees: Assignees,
): AssigneeOption | null {
  if (c.author_type === "ai") {
    return assigneeOf({ assignee_id: null, assignee_type: "ai", assignee_client_id: c.author_client_id }, assignees);
  }
  if (!c.author_id) return null;
  return assignees.options.find((a) => a.id === c.author_id) ?? null;
}

// Assigning a user makes the task a human's, picking an agent makes it the AI's, and clearing it
// leaves no assignee at all.
export function assigneeFields(assigneeId: string | null): AssigneeFields {
  if (assigneeId === AI_ASSIGNEE_ID) return { assignee_id: null, assignee_type: "ai", assignee_client_id: null };
  if (assigneeId?.startsWith(AGENT_KEY_PREFIX)) {
    return { assignee_id: null, assignee_type: "ai", assignee_client_id: assigneeId.slice(AGENT_KEY_PREFIX.length) };
  }
  return { assignee_id: assigneeId, assignee_type: assigneeId ? "human" : null, assignee_client_id: null };
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
  "id" | "title" | "description" | "status" | "sort_order" | "start_date" | "due_date"
> & {
  // Child tasks of the story, and how many of them are done or closed (progress on the phone cards).
  task_count: number;
  done_count: number;
};

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
  // AI の投稿のとき、投稿したエージェント（OAuth の client_id）。人の投稿と記録前の AI の投稿は null
  author_client_id: string | null;
  body: string;
  created_at: string;
  updated_at: string;
}

// Image types the attachments bucket accepts (allowed_mime_types in 0036_task_attachments.sql). No SVG.
export type AttachmentMimeType = "image/png" | "image/jpeg" | "image/webp" | "image/gif";

// An image attached to a task or story (task_attachments). The file is at storage_path in the
// private attachments bucket; bodies reference it as ![name](attachment:<id>).
export interface Attachment {
  id: string;
  project_id: string;
  task_id: string; // the task or story row
  storage_path: string; // <project_id>/<id>.<png|jpg|webp|gif>
  mime_type: AttachmentMimeType;
  size_bytes: number;
  original_name: string | null; // display only; never used in the path
  created_by: string;
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
  groups: StoryGroup[];
}

// One kanban swimlane: an in-progress story with its child tasks.
export interface KanbanLane {
  story: Task;
  tasks: Task[];
}

export const STATUS_LABEL: Record<Status, string> = {
  planning: "計画中",
  todo: "未着手",
  in_progress: "進行中",
  in_review: "レビュー中",
  done: "完了",
  closed: "クローズ",
};

// Every status, in workflow order (sorting).
export const STATUS_ORDER: Status[] = ["planning", "todo", "in_progress", "in_review", "done", "closed"];

// Choices in status pickers and forms. in_review is for tasks only (the DB check constraint
// rejects it on stories): an in-review story would drop its kanban lane. planning is for stories
// only (a backlog item not yet scheduled), the counterpart of in_review.
export const TASK_STATUSES: Status[] = STATUS_ORDER.filter((s) => s !== "planning");
export const STORY_STATUSES: Status[] = STATUS_ORDER.filter((s) => s !== "in_review");

// Kanban columns. The closed column is always shown (as a drop target); its cards are hidden
// unless the toolbar toggle is on.
export const BOARD_STATUSES: Status[] = ["todo", "in_progress", "in_review", "done", "closed"];

// done and closed both count as finished (same rule as get_progress).
export const isFinished = (status: Status) => status === "done" || status === "closed";

export const LEVEL_LABEL: Record<Level, string> = {
  story: "ストーリー",
  task: "タスク",
};

// task_events (操作履歴)。list_project_events RPC の1行。
export type EventType = "created" | "status_changed" | "activated" | "deactivated" | "commented" | "context_updated";

export interface TaskEvent {
  id: string;
  occurred_at: string;
  event_type: EventType;
  level: Level;
  task_id: string;
  task_title: string;
  story_id: string | null;
  story_title: string | null;
  from_status: Status | null;
  to_status: Status | null;
  actor_type: AssigneeType | null; // null = 不明（過去分の補完）
  actor_id: string | null;
  actor_client_id: string | null; // AI の操作のときのエージェント（OAuth の client_id）。null = 人 / 記録前
  comment_excerpt: string | null;
  comment_body: string | null; // コメントの全文。コメントが消えていたら null
}

// One bucket (day / week) of project_activity_counts.
export interface ActivityCount {
  bucket_start: string; // YYYY-MM-DD, the first day of the bucket (Asia/Tokyo)
  stories_created: number;
  tasks_created: number;
  tasks_done: number;
}

export type ActivityBucket = "day" | "week";

// AI usage totals of a project or a story (RPC usage_totals). Tokens are summed over API responses.
export interface UsageTotals {
  responses: number;
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens: number;
  cache_creation_input_tokens: number;
  cost_usd: number | null; // sum over responses whose cost is known; null when none is
  uncosted_responses: number; // responses recorded without a cost
  first_at: string | null;
  last_at: string | null;
}
