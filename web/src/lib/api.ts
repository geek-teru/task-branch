// Data-access layer. The only place that talks to Supabase (REST + RPC).
// Views consume ProjectGraph and never call Supabase directly.

import { supabase } from "./supabase";
import type { BacklogEpic, ContextRevision, KanbanLane, Project, ProjectGraph, ProjectInput, Status, StoryInput, Task } from "./types";

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
  "activated_at, assignee_type, assignee_id, metadata, created_at, updated_at, completed_at";

// Single normalized snapshot the views render (get_task_graph RPC).
export async function getProjectGraph(projectId: string): Promise<ProjectGraph> {
  const { data, error } = await supabase.rpc("get_task_graph", { project: projectId });
  if (error) throw error;
  const raw = (data ?? {}) as Partial<ProjectGraph>;
  return { nodes: raw.nodes ?? [], edges: raw.edges ?? [] };
}

// One project as a nested JSON document (export_project RPC).
export async function exportProject(projectId: string): Promise<unknown> {
  const { data, error } = await supabase.rpc("export_project", { project: projectId });
  if (error) throw error;
  if (data == null) throw new Error("プロジェクトが見つかりません");
  return data;
}

// Backlog page: epics of a project (active and inactive), without the context document.
export async function listEpics(projectId: string): Promise<BacklogEpic[]> {
  const { data, error } = await supabase
    .from("tasks")
    .select("id, title, description, activated_at, sort_order")
    .eq("project_id", projectId)
    .eq("level", "epic")
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

// Backlog page: add a backlog item, i.e. an inactive epic (activated_at stays null),
// appended after the project's existing epics.
export async function createEpic(projectId: string, title: string, description: string | null): Promise<BacklogEpic> {
  const { data: last, error: lastError } = await supabase
    .from("tasks")
    .select("sort_order")
    .eq("project_id", projectId)
    .eq("level", "epic")
    .order("sort_order", { ascending: false })
    .limit(1);
  if (lastError) throw lastError;
  const { data, error } = await supabase
    .from("tasks")
    .insert({
      project_id: projectId,
      level: "epic",
      title,
      description,
      sort_order: (last?.[0]?.sort_order ?? 0) + 1,
    })
    .select("id, title, description, activated_at, sort_order")
    .single();
  if (error) throw error;
  return data;
}

// Epic detail page: the epic including its context document.
export async function getEpic(epicId: string): Promise<Task | null> {
  const { data, error } = await supabase
    .from("tasks")
    .select(`${TASK_LIST_COLUMNS}, context`)
    .eq("id", epicId)
    .eq("level", "epic")
    .maybeSingle()
    .overrideTypes<Task | null, { merge: false }>();
  if (error) throw error;
  return data;
}

// Saving the context adds a version to epic_context_revisions (DB trigger).
// Rename an epic / edit its one-line description. The context document has its own function.
export async function updateEpicInfo(epicId: string, title: string, description: string | null): Promise<void> {
  const { error } = await supabase.from("tasks").update({ title, description }).eq("id", epicId);
  if (error) throw error;
}

export async function updateEpicContext(epicId: string, context: string | null): Promise<void> {
  const { error } = await supabase.from("tasks").update({ context }).eq("id", epicId);
  if (error) throw error;
}

export async function getLatestContextRevision(epicId: string): Promise<ContextRevision | null> {
  const { data, error } = await supabase
    .from("epic_context_revisions")
    .select("version, edited_by_type, created_at")
    .eq("epic_id", epicId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data as ContextRevision | null;
}

export async function listStories(epicId: string): Promise<Task[]> {
  const { data, error } = await supabase
    .from("tasks")
    .select(TASK_LIST_COLUMNS)
    .eq("parent_id", epicId)
    .eq("level", "story")
    .order("sort_order", { ascending: true })
    .overrideTypes<Task[], { merge: false }>();
  if (error) throw error;
  return data ?? [];
}

// Move a story under another epic of the same project, appended after that epic's stories.
export async function moveStory(storyId: string, targetEpicId: string): Promise<void> {
  const { data: last, error: lastError } = await supabase
    .from("tasks")
    .select("sort_order")
    .eq("parent_id", targetEpicId)
    .eq("level", "story")
    .order("sort_order", { ascending: false })
    .limit(1);
  if (lastError) throw lastError;
  const { error } = await supabase
    .from("tasks")
    .update({ parent_id: targetEpicId, sort_order: (last?.[0]?.sort_order ?? 0) + 1 })
    .eq("id", storyId);
  if (error) throw error;
}

// Kanban: every in-progress story across projects, with its epic and child tasks.
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
    supabase.from("tasks").select(TASK_LIST_COLUMNS).in("id", epicIds).overrideTypes<Task[], { merge: false }>(),
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

  const epics = new Map((epicsRes.data ?? []).map((e: Task) => [e.id, e]));
  return stories.map((story: Task) => ({
    story,
    epic: (story.parent_id && epics.get(story.parent_id)) || null,
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

// Persist a new epic ordering: assign sort_order = position (1-based) in the
// given id list. Called after a drag-and-drop reorder in the gantt.
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

export async function reorderEpics(orderedIds: string[]): Promise<void> {
  const results = await Promise.all(
    orderedIds.map((id, i) => supabase.from("tasks").update({ sort_order: i + 1 }).eq("id", id))
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) throw failed.error;
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

// Create a new story under the given epic, appended after its existing stories.
export function addStory(epic: Pick<Task, "id" | "project_id">, input: StoryInput): Promise<Task> {
  return addChild(epic, "story", input);
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
