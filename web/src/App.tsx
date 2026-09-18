import { useCallback, useEffect, useState, type ReactNode } from "react";
import { isConfigured } from "./lib/supabase";
import {
  addStory,
  createProject,
  deleteProject,
  deleteTask,
  exportProject,
  getAllProjectGraphs,
  listProjects,
  reorderEpics,
  updateProject,
  updateTask,
  updateTaskDates,
  updateTaskStatus,
} from "./lib/api";
import type { GraphNode, Project, ProjectGraph, Status, StoryInput } from "./lib/types";
import { Sidebar, type MenuKey } from "./components/Sidebar";
import { ProjectsListPage } from "./views/ProjectsListPage";
import { GanttView } from "./views/GanttView";

type Route = { name: "projects" } | { name: "gantt"; projectId?: string };

export default function App() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [route, setRoute] = useState<Route>({ name: "projects" });
  const [allGraphs, setAllGraphs] = useState<{ project: Project; graph: ProjectGraph }[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isConfigured) return;
    listProjects()
      .then(setProjects)
      .catch((e) => setError(String(e.message ?? e)));
  }, []);

  const needsGraphs = route.name === "gantt";
  useEffect(() => {
    if (!needsGraphs) return;
    setAllGraphs(null);
    getAllProjectGraphs()
      .then(setAllGraphs)
      .catch((e) => setError(String(e.message ?? e)));
  }, [needsGraphs]);

  // Reload graphs in place (no loading flicker / remount) after a mutation.
  const refreshAllGraphs = useCallback(async () => {
    try {
      setAllGraphs(await getAllProjectGraphs());
    } catch (e: any) {
      setError(String(e.message ?? e));
    }
  }, []);

  const handleAddStory = useCallback(
    async (epic: GraphNode, values: StoryInput) => {
      try {
        await addStory(epic, values);
        await refreshAllGraphs();
      } catch (e: any) {
        setError(String(e.message ?? e));
      }
    },
    [refreshAllGraphs]
  );

  const handleUpdateTask = useCallback(
    async (id: string, values: StoryInput) => {
      try {
        await updateTask(id, values);
        await refreshAllGraphs();
      } catch (e: any) {
        setError(String(e.message ?? e));
      }
    },
    [refreshAllGraphs]
  );

  const handleDeleteTask = useCallback(
    async (id: string) => {
      try {
        await deleteTask(id);
        await refreshAllGraphs();
      } catch (e: any) {
        setError(String(e.message ?? e));
      }
    },
    [refreshAllGraphs]
  );

  const handleStartStory = useCallback(
    async (id: string) => {
      try {
        await updateTaskStatus(id, "in_progress");
        await refreshAllGraphs();
      } catch (e: any) {
        setError(String(e.message ?? e));
      }
    },
    [refreshAllGraphs]
  );

  const handleCompleteStory = useCallback(
    async (id: string) => {
      try {
        await updateTaskStatus(id, "done");
        await refreshAllGraphs();
      } catch (e: any) {
        setError(String(e.message ?? e));
      }
    },
    [refreshAllGraphs]
  );

  const handleChangeStatus = useCallback(
    async (id: string, status: Status) => {
      try {
        await updateTaskStatus(id, status);
        await refreshAllGraphs();
      } catch (e: any) {
        setError(String(e.message ?? e));
      }
    },
    [refreshAllGraphs]
  );

  const handleResizeStory = useCallback(
    async (id: string, startDate: string, dueDate: string) => {
      try {
        await updateTaskDates(id, startDate, dueDate);
        await refreshAllGraphs();
      } catch (e: any) {
        setError(String(e.message ?? e));
      }
    },
    [refreshAllGraphs]
  );

  const handleReorderEpics = useCallback(
    async (orderedIds: string[]) => {
      try {
        await reorderEpics(orderedIds);
        await refreshAllGraphs();
      } catch (e: any) {
        setError(String(e.message ?? e));
      }
    },
    [refreshAllGraphs]
  );

  const handleCreateProject = useCallback(async (name: string, description: string | null) => {
    try {
      const p = await createProject(name, description ?? undefined);
      setProjects((prev) => [...prev, p]);
    } catch (e: any) {
      setError(String(e.message ?? e));
    }
  }, []);

  const handleUpdateProject = useCallback(
    async (id: string, name: string, description: string | null) => {
      try {
        const p = await updateProject(id, { name, description });
        setProjects((prev) => prev.map((x) => (x.id === id ? p : x)));
      } catch (e: any) {
        setError(String(e.message ?? e));
      }
    },
    []
  );

  const handleDeleteProject = useCallback(async (id: string) => {
    try {
      await deleteProject(id);
      setProjects((prev) => prev.filter((x) => x.id !== id));
      setAllGraphs((prev) => (prev ? prev.filter((g) => g.project.id !== id) : prev));
    } catch (e: any) {
      setError(String(e.message ?? e));
    }
  }, []);

  // Download one project as <name>.json.
  const handleExportProject = useCallback(async (project: Project) => {
    try {
      const doc = await exportProject(project.id);
      const blob = new Blob([JSON.stringify(doc, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${project.name.replace(/[\\/:*?"<>|\s]+/g, "_")}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      setError(String(e.message ?? e));
    }
  }, []);

  const onNavigate = useCallback((key: MenuKey) => {
    if (key === "projects") setRoute({ name: "projects" });
    else if (key === "gantt") setRoute({ name: "gantt" });
  }, []);

  if (!isConfigured) {
    return (
      <Shell>
        <div style={{ padding: 24 }}>
          <h2>設定が必要です</h2>
          <p>
            <code>web/.env.example</code> を <code>web/.env</code> にコピーし、Supabase の URL と anon key を設定してください。
            ローカルは <code>supabase start</code> が値を表示します。
          </p>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <Sidebar active={route.name} onNavigate={onNavigate} />

      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        {error && (
          <div style={{ background: "#fdeceb", color: "#a3210b", padding: "6px 12px", fontSize: 13 }}>
            {error} <button onClick={() => setError(null)}>×</button>
          </div>
        )}

        {route.name === "projects" ? (
          <main style={{ flex: 1, minHeight: 0 }}>
            <ProjectsListPage
              projects={projects}
              onCreate={handleCreateProject}
              onUpdate={handleUpdateProject}
              onDelete={handleDeleteProject}
              onShowGantt={(projectId) => setRoute({ name: "gantt", projectId })}
              onExport={handleExportProject}
            />
          </main>
        ) : (
          <main style={{ flex: 1, minHeight: 0 }}>
            {!allGraphs ? (
              <div style={{ padding: 24, color: "#5f6b7a" }}>読み込み中…</div>
            ) : (
              <GanttView
                data={allGraphs}
                initialProjectId={route.projectId}
                onAddStory={handleAddStory}
                onUpdateTask={handleUpdateTask}
                onDeleteTask={handleDeleteTask}
                onStartStory={handleStartStory}
                onCompleteStory={handleCompleteStory}
                onChangeStatus={handleChangeStatus}
                onResizeStory={handleResizeStory}
                onReorderEpics={handleReorderEpics}
              />
            )}
          </main>
        )}
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return <div style={{ height: "100vh", display: "flex" }}>{children}</div>;
}
