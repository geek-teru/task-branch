// Data-access layer. The only place that talks to Supabase (REST + RPC).
// Views consume ProjectGraph and never call Supabase directly.

import { supabase } from "./supabase";
import type { BacklogStory, ContextRevision, KanbanLane, Project, ProjectGraph, ProjectInput, Status, StoryInput, Task, TaskComment } from "./types";

export async function listProjects(): Promise<Project[]> {
  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function createProject(input: ProjectInput): Promise<Project> {
  const { data, error } = await supabase.from("projects").insert(input).select().single();
  if (error) throw error;
  return data;
}

export async function updateProject(id: string, patch: ProjectInput): Promise<Project> {
  const { data, error } = await supabase
    .from("projects")
    .update(patch)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Archive (false) or restore (true) a project.
export async function setProjectActive(id: string, isActive: boolean): Promise<Project> {
  const { data, error } = await supabase
    .from("projects")
    .update({ is_active: isActive })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteProject(id: string): Promise<void> {
  const { error } = await supabase.from("projects").delete().eq("id", id);
  if (error) throw error;
}

// Every tasks column except the epic document (context), which can be long.
// List queries use this; fetch context explicitly where it is needed.
const TASK_LIST_COLUMNS =
  "id, project_id, parent_id, level, title, description, status, sort_order, start_date, due_date, " +
  "activated_at, assignee_type, assignee_id, metadata, created_at, updated_at, completed_at, closed_at";

// Single normalized snapshot the views render (get_task_graph RPC).
export async function getProjectGraph(projectId: string): Promise<ProjectGraph> {
  const { data, error } = await supabase.rpc("get_task_graph", { project: projectId });
  if (error) throw error;
  const raw = (data ?? {}) as Partial<ProjectGraph>;
  // story_groups のマイグレーション適用前の DB は group_id / groups を返さないので、グループなしとして扱う。
  const nodes = (raw.nodes ?? []).map((n) => ({ ...n, group_id: n.group_id ?? null }));
  return { nodes, edges: raw.edges ?? [], groups: raw.groups ?? [] };
}

// One project as a nested JSON document (export_project RPC).
export async function exportProject(projectId: string): Promise<unknown> {
  const { data, error } = await supabase.rpc("export_project", { project: projectId });
  if (error) throw error;
  if (data == null) throw new Error("プロジェクトが見つかりません");
  return data;
}

// Stories in the order the epics had them: epic order, then story order within the epic;
// stories without a parent come last. epicOrder maps an epic id to its sort_order.
function sortStoriesLikeEpics<S extends Pick<Task, "parent_id" | "sort_order">>(
  stories: S[],
  epicOrder: Map<string, number>
): S[] {
  const groupOrder = (s: S) => (s.parent_id ? epicOrder.get(s.parent_id) ?? 0 : Infinity);
  return [...stories].sort(
    (a, b) =>
      groupOrder(a) - groupOrder(b) ||
      (a.parent_id ?? "").localeCompare(b.parent_id ?? "") ||
      a.sort_order - b.sort_order
  );
}

// Backlog page: stories of a project (active and inactive), without the context document.
// Ordered as the epics were (epic order, then story order within the epic); stories without a parent come last.
export async function listBacklogStories(projectId: string): Promise<BacklogStory[]> {
  const [storiesRes, epicsRes] = await Promise.all([
    supabase
      .from("tasks")
      .select("id, parent_id, title, description, status, activated_at, sort_order")
      .eq("project_id", projectId)
      .eq("level", "story"),
    supabase.from("tasks").select("id, sort_order").eq("project_id", projectId).eq("level", "epic"),
  ]);
  if (storiesRes.error) throw storiesRes.error;
  if (epicsRes.error) throw epicsRes.error;
  const epicOrder = new Map((epicsRes.data ?? []).map((e) => [e.id, e.sort_order]));
  return sortStoriesLikeEpics((storiesRes.data ?? []) as BacklogStory[], epicOrder);
}

// Backlog page: add a backlog item, i.e. an inactive story without a parent (activated_at stays null).
export async function createBacklogStory(projectId: string, title: string, description: string | null): Promise<void> {
  await addRootStory(projectId, { title, description, status: "todo", start_date: null, due_date: null });
}

// Create a story without a parent, appended after the project's other stories without a parent.
// activated_at is set to now only when active is true (the kanban adds stories as started).
export async function addRootStory(projectId: string, input: StoryInput, active = false): Promise<Task> {
  const { data: last, error: lastError } = await supabase
    .from("tasks")
    .select("sort_order")
    .eq("project_id", projectId)
    .eq("level", "story")
    .is("parent_id", null)
    .order("sort_order", { ascending: false })
    .limit(1);
  if (lastError) throw lastError;
  const { data, error } = await supabase
    .from("tasks")
    .insert({
      ...input,
      project_id: projectId,
      level: "story",
      sort_order: (last?.[0]?.sort_order ?? 0) + 1,
      activated_at: active ? new Date().toISOString() : null,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Gantt: add a story group to a project, appended after its other groups.
export async function createStoryGroup(projectId: string, name: string): Promise<void> {
  const { data: last, error: lastError } = await supabase
    .from("story_groups")
    .select("sort_order")
    .eq("project_id", projectId)
    .order("sort_order", { ascending: false })
    .limit(1);
  if (lastError) throw lastError;
  const { error } = await supabase
    .from("story_groups")
    .insert({ project_id: projectId, name, sort_order: (last?.[0]?.sort_order ?? 0) + 1 });
  if (error) throw error;
}

export async function renameStoryGroup(id: string, name: string): Promise<void> {
  const { error } = await supabase.from("story_groups").update({ name }).eq("id", id);
  if (error) throw error;
}

// The stories in it go back to no group (tasks.group_id is on delete set null); they are not deleted.
export async function deleteStoryGroup(id: string): Promise<void> {
  const { error } = await supabase.from("story_groups").delete().eq("id", id);
  if (error) throw error;
}

// Gantt: put a story into a group, or take it out of its group (null).
export async function setStoryGroup(storyId: string, groupId: string | null): Promise<void> {
  const { error } = await supabase.from("tasks").update({ group_id: groupId }).eq("id", storyId);
  if (error) throw error;
}

// Story detail page: the story including its context document.
export async function getStory(storyId: string): Promise<Task | null> {
  const { data, error } = await supabase
    .from("tasks")
    .select(`${TASK_LIST_COLUMNS}, context`)
    .eq("id", storyId)
    .eq("level", "story")
    .maybeSingle()
    .overrideTypes<Task | null, { merge: false }>();
  if (error) throw error;
  return data;
}

// Rename a story / edit its one-line description. The context document has its own function.
export async function updateStoryInfo(storyId: string, title: string, description: string | null): Promise<void> {
  const { error } = await supabase.from("tasks").update({ title, description }).eq("id", storyId);
  if (error) throw error;
}

// Activate an epic or a story (activated_at = now) or shelve it back to the backlog (null).
export async function setActive(id: string, active: boolean): Promise<void> {
  const { error } = await supabase
    .from("tasks")
    .update({ activated_at: active ? new Date().toISOString() : null })
    .eq("id", id);
  if (error) throw error;
}

// Saving the context adds a version to epic_context_revisions (DB trigger).
export async function updateStoryContext(storyId: string, context: string | null): Promise<void> {
  const { error } = await supabase.from("tasks").update({ context }).eq("id", storyId);
  if (error) throw error;
}

// Until the table is renamed (migration stage ③), a story's revisions sit in epic_context_revisions
// with the story id in epic_id.
export async function getLatestContextRevision(storyId: string): Promise<ContextRevision | null> {
  const { data, error } = await supabase
    .from("epic_context_revisions")
    .select("version, edited_by_type, created_at")
    .eq("epic_id", storyId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data as ContextRevision | null;
}

// Comments on a task, oldest first.
export async function listTaskComments(taskId: string): Promise<TaskComment[]> {
  const { data, error } = await supabase
    .from("task_comments")
    .select("*")
    .eq("task_id", taskId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as TaskComment[];
}

// author_type / author_id are left to the DB defaults (current_actor_type / current_actor_id).
export async function addTaskComment(taskId: string, body: string): Promise<TaskComment> {
  const { data, error } = await supabase.from("task_comments").insert({ task_id: taskId, body }).select().single();
  if (error) throw error;
  return data as TaskComment;
}

export async function listStoryTasks(storyId: string): Promise<Task[]> {
  const { data, error } = await supabase
    .from("tasks")
    .select(TASK_LIST_COLUMNS)
    .eq("parent_id", storyId)
    .eq("level", "task")
    .order("sort_order", { ascending: true })
    .overrideTypes<Task[], { merge: false }>();
  if (error) throw error;
  return data ?? [];
}

// Every story of a project, for pickers that move a task to another story.
// Ordered like the backlog (see sortStoriesLikeEpics).
export async function listProjectStories(projectId: string): Promise<Task[]> {
  const [storiesRes, epicsRes] = await Promise.all([
    supabase
      .from("tasks")
      .select(TASK_LIST_COLUMNS)
      .eq("project_id", projectId)
      .eq("level", "story")
      .overrideTypes<Task[], { merge: false }>(),
    supabase.from("tasks").select("id, sort_order").eq("project_id", projectId).eq("level", "epic"),
  ]);
  if (storiesRes.error) throw storiesRes.error;
  if (epicsRes.error) throw epicsRes.error;
  const epicOrder = new Map((epicsRes.data ?? []).map((e) => [e.id, e.sort_order]));
  return sortStoriesLikeEpics(storiesRes.data ?? [], epicOrder);
}

// Kanban: every in-progress story across projects, with its child tasks.
// Ordered like the backlog (epic order, then story order within the epic); stories without a parent come last.
export async function getKanbanLanes(): Promise<KanbanLane[]> {
  const { data: stories, error } = await supabase
    .from("tasks")
    .select(TASK_LIST_COLUMNS)
    .eq("level", "story")
    .eq("status", "in_progress")
    .order("sort_order", { ascending: true })
    .overrideTypes<Task[], { merge: false }>();
  if (error) throw error;
  if (!stories?.length) return [];

  const epicIds = [...new Set(stories.map((s) => s.parent_id).filter((id): id is string => !!id))];
  const [epicsRes, tasksRes] = await Promise.all([
    supabase.from("tasks").select("id, sort_order").in("id", epicIds),
    supabase
      .from("tasks")
      .select(TASK_LIST_COLUMNS)
      .eq("level", "task")
      .in("parent_id", stories.map((s) => s.id))
      .order("sort_order", { ascending: true })
      .overrideTypes<Task[], { merge: false }>(),
  ]);
  if (epicsRes.error) throw epicsRes.error;
  if (tasksRes.error) throw tasksRes.error;

  const epicOrder = new Map((epicsRes.data ?? []).map((e) => [e.id, e.sort_order]));
  return sortStoriesLikeEpics(stories, epicOrder).map((story: Task) => ({
    story,
    tasks: (tasksRes.data ?? []).filter((t: Task) => t.parent_id === story.id),
  }));
}

export async function updateTaskStatus(id: string, status: Status): Promise<void> {
  const { error } = await supabase.from("tasks").update({ status }).eq("id", id);
  if (error) throw error;
}

// Update only the schedule of a task (used when a gantt bar edge is dragged).
export async function updateTaskDates(id: string, start_date: string, due_date: string): Promise<void> {
  const { error } = await supabase.from("tasks").update({ start_date, due_date }).eq("id", id);
  if (error) throw error;
}

// Shift a story and its tasks by the same number of days in one call (shift_story_dates RPC).
export async function shiftStoryDates(storyId: string, days: number): Promise<void> {
  const { error } = await supabase.rpc("shift_story_dates", { story: storyId, days });
  if (error) throw error;
}

// Move a task to another story. The column it was dropped on decides the status.
// Tasks with dependencies are rejected by the DB trigger (dependencies are per story).
export async function moveTask(taskId: string, targetStoryId: string, status: Status): Promise<void> {
  const { data: last, error: lastError } = await supabase
    .from("tasks")
    .select("sort_order")
    .eq("parent_id", targetStoryId)
    .eq("level", "task")
    .order("sort_order", { ascending: false })
    .limit(1);
  if (lastError) throw lastError;

  const { error } = await supabase
    .from("tasks")
    .update({ parent_id: targetStoryId, sort_order: (last?.[0]?.sort_order ?? 0) + 1, status })
    .eq("id", taskId);
  if (error) throw error;
}

export async function createTask(input: Partial<Task> & { project_id: string; level: Task["level"]; title: string }): Promise<Task> {
  const { data, error } = await supabase.from("tasks").insert(input).select().single();
  if (error) throw error;
  return data;
}

export async function updateTask(id: string, input: StoryInput): Promise<Task> {
  const { data, error } = await supabase.from("tasks").update(input).eq("id", id).select().single();
  if (error) throw error;
  return data;
}

// Deletes a task; child tasks cascade (on delete cascade).
export async function deleteTask(id: string): Promise<void> {
  const { error } = await supabase.from("tasks").delete().eq("id", id);
  if (error) throw error;
}

// Create a new task under the given story, appended after its existing tasks.
export function addTask(story: Pick<Task, "id" | "project_id">, input: StoryInput): Promise<Task> {
  return addChild(story, "task", input);
}

async function addChild(
  parent: Pick<Task, "id" | "project_id">,
  level: "story" | "task",
  input: StoryInput
): Promise<Task> {
  const { data, error } = await supabase
    .from("tasks")
    .select("sort_order")
    .eq("parent_id", parent.id)
    .order("sort_order", { ascending: false })
    .limit(1);
  if (error) throw error;
  const nextOrder = (data?.[0]?.sort_order ?? -1) + 1;
  return createTask({
    project_id: parent.project_id,
    parent_id: parent.id,
    level,
    ...input,
    sort_order: nextOrder,
  });
}
