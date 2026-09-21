import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Navigate, Route, Routes, useLocation, useMatch, useNavigate, useSearchParams } from "react-router-dom";
import { isConfigured } from "./lib/supabase";
import {
  addStory,
  addTask,
  createProject,
  deleteProject,
  deleteTask,
  exportProject,
  getKanbanLanes,
  listEpics,
  createEpic,
  getProjectGraph,
  listProjects,
  moveStory,
  moveTask,
  reorderEpics,
  setProjectActive,
  updateProject,
  updateTask,
  updateTaskDates,
  updateTaskStatus,
} from "./lib/api";
import type { BacklogEpic, GraphNode, KanbanLane, Project, ProjectGraph, ProjectInput, Status, StoryInput, Task } from "./lib/types";
import { Sidebar, type MenuKey } from "./components/Sidebar";
import { ProjectsListPage } from "./views/ProjectsListPage";
import { ProjectDetailPage } from "./views/ProjectDetailPage";
import { GanttView } from "./views/GanttView";
import { KanbanView } from "./views/KanbanView";
import { BacklogView } from "./views/BacklogView";
import { EpicDetailPage } from "./views/EpicDetailPage";

export default function App() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectsLoaded, setProjectsLoaded] = useState(false);
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const ganttMatch = useMatch("/projects/:projectId/gantt");
  const projectMatch = useMatch("/projects/:projectId");
  const isGantt = pathname === "/gantt" || ganttMatch !== null;
  const isKanban = pathname === "/kanban";
  const epicMatch = useMatch("/epics/:epicId");
  const isBacklog = pathname === "/backlog" || epicMatch !== null;
  const [searchParams, setSearchParams] = useSearchParams();
  // Gantt shows one project: the one in the URL, or the first active project for /gantt.
  const defaultProjectId = (projects.find((p) => p.is_active) ?? projects[0])?.id;
  const ganttProjectId = isGantt ? ganttMatch?.params.projectId ?? defaultProjectId : undefined;
  const [graph, setGraph] = useState<{ projectId: string; graph: ProjectGraph } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isConfigured) return;
    listProjects()
      .then(setProjects)
      .catch((e) => setError(String(e.message ?? e)))
      .finally(() => setProjectsLoaded(true));
  }, []);

  // Load only the selected project's graph.
  useEffect(() => {
    if (!ganttProjectId) return;
    let cancelled = false;
    getProjectGraph(ganttProjectId)
      .then((g) => {
        if (!cancelled) setGraph({ projectId: ganttProjectId, graph: g });
      })
      .catch((e) => setError(String(e.message ?? e)));
    return () => {
      cancelled = true;
    };
  }, [ganttProjectId]);

  // Backlog page: the project comes from ?project=, defaulting to the first project.
  const backlogProjectId = pathname === "/backlog" ? searchParams.get("project") ?? defaultProjectId : undefined;
  const [backlog, setBacklog] = useState<{ projectId: string; epics: BacklogEpic[] } | null>(null);
  useEffect(() => {
    if (!backlogProjectId) return;
    let cancelled = false;
    listEpics(backlogProjectId)
      .then((epics) => {
        if (!cancelled) setBacklog({ projectId: backlogProjectId, epics });
      })
      .catch((e) => setError(String(e.message ?? e)));
    return () => {
      cancelled = true;
    };
  }, [backlogProjectId]);

  // Add a backlog item (inactive epic) to the selected project, then reload the list.
  const handleAddBacklog = useCallback(
    async (title: string, description: string | null) => {
      if (!backlogProjectId) return;
      try {
        await createEpic(backlogProjectId, title, description);
        setBacklog({ projectId: backlogProjectId, epics: await listEpics(backlogProjectId) });
      } catch (e: any) {
        setError(String(e.message ?? e));
        throw e;
      }
    },
    [backlogProjectId]
  );

  const [lanes, setLanes] = useState<KanbanLane[] | null>(null);
  useEffect(() => {
    if (!isKanban) return;
    setLanes(null);
    getKanbanLanes()
      .then(setLanes)
      .catch((e) => setError(String(e.message ?? e)));
  }, [isKanban]);

  // Move a card: update locally first so the drop feels instant, then persist and resync.
  const handleKanbanStatus = useCallback(async (taskId: string, status: Status) => {
    setLanes((prev) =>
      prev?.map((l) => ({ ...l, tasks: l.tasks.map((t) => (t.id === taskId ? { ...t, status } : t)) })) ?? prev
    );
    try {
      await updateTaskStatus(taskId, status);
    } catch (e: any) {
      setError(String(e.message ?? e));
    }
    try {
      setLanes(await getKanbanLanes());
    } catch (e: any) {
      setError(String(e.message ?? e));
    }
  }, []);

  const handleKanbanMove = useCallback(async (taskId: string, storyId: string, status: Status) => {
    try {
      await moveTask(taskId, storyId, status);
    } catch (e: any) {
      setError(String(e.message ?? e));
    }
    try {
      setLanes(await getKanbanLanes());
    } catch (e: any) {
      setError(String(e.message ?? e));
    }
  }, []);

  const handleAddTask = useCallback(async (story: Task, values: StoryInput) => {
    try {
      await addTask(story, values);
      setLanes(await getKanbanLanes());
    } catch (e: any) {
      setError(String(e.message ?? e));
    }
  }, []);

  const handleKanbanUpdate = useCallback(async (id: string, values: StoryInput) => {
    try {
      await updateTask(id, values);
      setLanes(await getKanbanLanes());
    } catch (e: any) {
      setError(String(e.message ?? e));
    }
  }, []);

  const handleKanbanDelete = useCallback(async (id: string) => {
    try {
      await deleteTask(id);
      setLanes(await getKanbanLanes());
    } catch (e: any) {
      setError(String(e.message ?? e));
    }
  }, []);

  // Reload the graph in place (no loading flicker / remount) after a mutation.
  const refreshGraph = useCallback(async () => {
    if (!ganttProjectId) return;
    try {
      setGraph({ projectId: ganttProjectId, graph: await getProjectGraph(ganttProjectId) });
    } catch (e: any) {
      setError(String(e.message ?? e));
    }
  }, [ganttProjectId]);

  const handleAddStory = useCallback(
    async (epic: GraphNode, values: StoryInput) => {
      try {
        await addStory(epic, values);
        await refreshGraph();
      } catch (e: any) {
        setError(String(e.message ?? e));
      }
    },
    [refreshGraph]
  );

  const handleUpdateTask = useCallback(
    async (id: string, values: StoryInput) => {
      try {
        await updateTask(id, values);
        await refreshGraph();
      } catch (e: any) {
        setError(String(e.message ?? e));
      }
    },
    [refreshGraph]
  );

  const handleDeleteTask = useCallback(
    async (id: string) => {
      try {
        await deleteTask(id);
        await refreshGraph();
      } catch (e: any) {
        setError(String(e.message ?? e));
      }
    },
    [refreshGraph]
  );

  const handleStartStory = useCallback(
    async (id: string) => {
      try {
        await updateTaskStatus(id, "in_progress");
        await refreshGraph();
      } catch (e: any) {
        setError(String(e.message ?? e));
      }
    },
    [refreshGraph]
  );

  const handleCompleteStory = useCallback(
    async (id: string) => {
      try {
        await updateTaskStatus(id, "done");
        await refreshGraph();
      } catch (e: any) {
        setError(String(e.message ?? e));
      }
    },
    [refreshGraph]
  );

  const handleChangeStatus = useCallback(
    async (id: string, status: Status) => {
      try {
        await updateTaskStatus(id, status);
        await refreshGraph();
      } catch (e: any) {
        setError(String(e.message ?? e));
      }
    },
    [refreshGraph]
  );

  const handleResizeStory = useCallback(
    async (id: string, startDate: string, dueDate: string) => {
      try {
        await updateTaskDates(id, startDate, dueDate);
        await refreshGraph();
      } catch (e: any) {
        setError(String(e.message ?? e));
      }
    },
    [refreshGraph]
  );

  const handleMoveStory = useCallback(
    async (storyId: string, targetEpicId: string) => {
      try {
        await moveStory(storyId, targetEpicId);
        await refreshGraph();
      } catch (e: any) {
        setError(String(e.message ?? e));
      }
    },
    [refreshGraph]
  );

  const handleReorderEpics = useCallback(
    async (orderedIds: string[]) => {
      try {
        await reorderEpics(orderedIds);
        await refreshGraph();
      } catch (e: any) {
        setError(String(e.message ?? e));
      }
    },
    [refreshGraph]
  );

  const handleCreateProject = useCallback(async (input: ProjectInput) => {
    try {
      const p = await createProject(input);
      setProjects((prev) => [...prev, p]);
    } catch (e: any) {
      setError(String(e.message ?? e));
    }
  }, []);

  const handleUpdateProject = useCallback(
    async (id: string, input: ProjectInput) => {
      try {
        const p = await updateProject(id, input);
        setProjects((prev) => prev.map((x) => (x.id === id ? p : x)));
      } catch (e: any) {
        setError(String(e.message ?? e));
      }
    },
    []
  );

  const handleSetProjectActive = useCallback(async (id: string, isActive: boolean) => {
    try {
      const p = await setProjectActive(id, isActive);
      setProjects((prev) => prev.map((x) => (x.id === id ? p : x)));
    } catch (e: any) {
      setError(String(e.message ?? e));
    }
  }, []);

  const handleDeleteProject = useCallback(async (id: string) => {
    try {
      await deleteProject(id);
      setProjects((prev) => prev.filter((x) => x.id !== id));
      setGraph((prev) => (prev?.projectId === id ? null : prev));
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
    if (key === "projects") navigate("/projects");
    else if (key === "gantt") navigate("/gantt");
    else if (key === "kanban") navigate("/kanban");
    else if (key === "backlog") navigate("/backlog");
  }, [navigate]);

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

  // Archived projects stay reachable by URL but drop out of the pickers.
  const pickerProjects = (currentId: string | null | undefined) =>
    projects.filter((p) => p.is_active || p.id === currentId);

  const detailProject = projects.find((p) => p.id === projectMatch?.params.projectId);
  const ganttProject = projects.find((p) => p.id === ganttProjectId);
  const ganttPage = (
    <main style={{ flex: 1, minHeight: 0 }}>
      {!projectsLoaded ? (
        <div style={{ padding: 24, color: "#5f6b7a" }}>読み込み中…</div>
      ) : projects.length === 0 ? (
        <div style={{ padding: 24, color: "#5f6b7a" }}>プロジェクトがありません。</div>
      ) : !ganttProject ? (
        <div style={{ padding: 24, color: "#5f6b7a" }}>プロジェクトが見つかりません。</div>
      ) : graph?.projectId !== ganttProject.id ? (
        <div style={{ padding: 24, color: "#5f6b7a" }}>読み込み中…</div>
      ) : (
        <GanttView
          projects={pickerProjects(ganttProjectId)}
          project={ganttProject}
          graph={graph.graph}
          onSelectProject={(projectId) => navigate(`/projects/${projectId}/gantt`)}
          onAddStory={handleAddStory}
          onUpdateTask={handleUpdateTask}
          onDeleteTask={handleDeleteTask}
          onStartStory={handleStartStory}
          onCompleteStory={handleCompleteStory}
          onChangeStatus={handleChangeStatus}
          onResizeStory={handleResizeStory}
          onReorderEpics={handleReorderEpics}
          onMoveStory={handleMoveStory}
        />
      )}
    </main>
  );

  return (
    <Shell>
      <Sidebar
        active={isGantt ? "gantt" : isKanban ? "kanban" : isBacklog ? "backlog" : "projects"}
        onNavigate={onNavigate}
      />

      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        {error && (
          <div style={{ background: "#fdeceb", color: "#a3210b", padding: "6px 12px", fontSize: 13 }}>
            {error} <button onClick={() => setError(null)}>×</button>
          </div>
        )}

        <Routes>
          <Route path="/" element={<Navigate to="/projects" replace />} />
          <Route
            path="/projects"
            element={
              <main style={{ flex: 1, minHeight: 0 }}>
                <ProjectsListPage
                  projects={projects}
                  onCreate={handleCreateProject}
                  onShowDetail={(projectId) => navigate(`/projects/${projectId}`)}
                  onShowBacklog={(projectId) => navigate(`/backlog?project=${projectId}`)}
                  onShowGantt={(projectId) => navigate(`/projects/${projectId}/gantt`)}
                  onShowKanban={(projectId) => navigate(`/kanban?project=${projectId}`)}
                />
              </main>
            }
          />
          <Route
            path="/projects/:projectId"
            element={
              <main style={{ flex: 1, minHeight: 0 }}>
                {!projectsLoaded ? (
                  <div style={{ padding: 24, color: "#5f6b7a" }}>読み込み中…</div>
                ) : !detailProject ? (
                  <div style={{ padding: 24, color: "#5f6b7a" }}>プロジェクトが見つかりません。</div>
                ) : (
                  <ProjectDetailPage
                    project={detailProject}
                    onUpdate={handleUpdateProject}
                    onDelete={(id) => {
                      handleDeleteProject(id);
                      navigate("/projects");
                    }}
                    onSetActive={handleSetProjectActive}
                    onExport={handleExportProject}
                    onShowBacklog={(projectId) => navigate(`/backlog?project=${projectId}`)}
                    onShowGantt={(projectId) => navigate(`/projects/${projectId}/gantt`)}
                    onShowKanban={(projectId) => navigate(`/kanban?project=${projectId}`)}
                  />
                )}
              </main>
            }
          />
          <Route path="/projects/:projectId/gantt" element={ganttPage} />
          <Route path="/gantt" element={ganttPage} />
          <Route
            path="/backlog"
            element={
              <main style={{ flex: 1, minHeight: 0 }}>
                {!projectsLoaded ? (
                  <div style={{ padding: 24, color: "#5f6b7a" }}>読み込み中…</div>
                ) : projects.length === 0 ? (
                  <div style={{ padding: 24, color: "#5f6b7a" }}>プロジェクトがありません。</div>
                ) : !projects.some((p) => p.id === backlogProjectId) ? (
                  <div style={{ padding: 24, color: "#5f6b7a" }}>プロジェクトが見つかりません。</div>
                ) : (
                  <BacklogView
                    projects={pickerProjects(backlogProjectId)}
                    projectId={backlogProjectId!}
                    epics={backlog && backlog.projectId === backlogProjectId ? backlog.epics : null}
                    onSelectProject={(id) => setSearchParams({ project: id })}
                    onAddBacklog={handleAddBacklog}
                  />
                )}
              </main>
            }
          />
          <Route
            path="/epics/:epicId"
            element={
              <main style={{ flex: 1, minHeight: 0 }}>
                {epicMatch?.params.epicId && (
                  <EpicDetailPage epicId={epicMatch.params.epicId} projects={projects} onError={setError} />
                )}
              </main>
            }
          />
          <Route
            path="/kanban"
            element={
              <main style={{ flex: 1, minHeight: 0 }}>
                {!lanes ? (
                  <div style={{ padding: 24, color: "#5f6b7a" }}>読み込み中…</div>
                ) : (
                  <KanbanView
                    projects={pickerProjects(searchParams.get("project"))}
                    lanes={lanes}
                    projectFilter={searchParams.get("project")}
                    onChangeProjectFilter={(id) => setSearchParams(id ? { project: id } : {})}
                    onChangeStatus={handleKanbanStatus}
                    onMoveTask={handleKanbanMove}
                    onAddTask={handleAddTask}
                    onUpdateTask={handleKanbanUpdate}
                    onDeleteTask={handleKanbanDelete}
                  />
                )}
              </main>
            }
          />
          <Route path="*" element={<Navigate to="/projects" replace />} />
        </Routes>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return <div style={{ height: "100vh", display: "flex" }}>{children}</div>;
}
