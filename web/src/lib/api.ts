// Data-access layer. The only place that talks to Supabase (REST + RPC).
// Views consume ProjectGraph and never call Supabase directly.

import { supabase } from "./supabase";
import type { Project, ProjectGraph, Status, StoryInput, Task } from "./types";

export async function listProjects(): Promise<Project[]> {
  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function createProject(name: string, description?: string): Promise<Project> {
  const { data, error } = await supabase
    .from("projects")
    .insert({ name, description: description ?? null })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateProject(
  id: string,
  patch: { name: string; description: string | null }
): Promise<Project> {
  const { data, error } = await supabase
    .from("projects")
    .update(patch)
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

// Single normalized snapshot the views render (get_task_graph RPC).
export async function getProjectGraph(projectId: string): Promise<ProjectGraph> {
  const { data, error } = await supabase.rpc("get_task_graph", { project: projectId });
  if (error) throw error;
  const raw = (data ?? {}) as { nodes?: ProjectGraph["nodes"] };
  return { nodes: raw.nodes ?? [] };
}

// One project as a nested JSON document (export_project RPC).
export async function exportProject(projectId: string): Promise<unknown> {
  const { data, error } = await supabase.rpc("export_project", { project: projectId });
  if (error) throw error;
  if (data == null) throw new Error("プロジェクトが見つかりません");
  return data;
}

// Every project's graph, for the views.
export async function getAllProjectGraphs(): Promise<{ project: Project; graph: ProjectGraph }[]> {
  const projects = await listProjects();
  const graphs = await Promise.all(projects.map((p) => getProjectGraph(p.id)));
  return projects.map((project, i) => ({ project, graph: graphs[i] }));
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
export async function addStory(
  epic: Pick<Task, "id" | "project_id">,
  input: StoryInput
): Promise<Task> {
  const { data, error } = await supabase
    .from("tasks")
    .select("sort_order")
    .eq("parent_id", epic.id)
    .order("sort_order", { ascending: false })
    .limit(1);
  if (error) throw error;
  const nextOrder = (data?.[0]?.sort_order ?? -1) + 1;
  return createTask({
    project_id: epic.project_id,
    parent_id: epic.id,
    level: "story",
    ...input,
    sort_order: nextOrder,
  });
}
