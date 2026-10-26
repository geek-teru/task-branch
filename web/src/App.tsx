import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Navigate, Route, Routes, useLocation, useMatch, useNavigate, useSearchParams } from "react-router-dom";
import { isConfigured } from "./lib/supabase";
import { signOut, useSession } from "./lib/useSession";
import {
  addRootStory,
  addTask,
  createProject,
  deleteProject,
  deleteTask,
  exportProject,
  getKanbanLanes,
  listBacklogStories,
  createBacklogStory,
  setActive,
  getProjectGraph,
  listProjects,
  moveTask,
  setProjectActive,
  updateProject,
  updateTask,
  updateTaskDates,
  shiftStoryDates,
  updateTaskStatus,
  createStoryGroup,
  renameStoryGroup,
  deleteStoryGroup,
  setStoryGroup,
} from "./lib/api";
import type { BacklogStory, GraphNode, KanbanLane, Project, ProjectGraph, ProjectInput, Status, StoryInput, Task } from "./lib/types";
import { Sidebar, type MenuKey } from "./components/Sidebar";
import { GlobalHeader } from "./components/GlobalHeader";
import { Button } from "./components/ui/Button";
import { ProjectsListPage } from "./views/ProjectsListPage";
import { ProjectDetailPage } from "./views/ProjectDetailPage";
import { GanttView } from "./views/GanttView";
import { KanbanView } from "./views/KanbanView";
import { BacklogView } from "./views/BacklogView";
import { StoryDetailPage } from "./views/StoryDetailPage";
import { LoginPage } from "./views/LoginPage";
import { OAuthConsentPage } from "./views/OAuthConsentPage";

export default function App() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectsLoaded, setProjectsLoaded] = useState(false);
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const ganttMatch = useMatch("/projects/:projectId/gantt");
  const projectMatch = useMatch("/projects/:projectId");
  const isGantt = pathname === "/gantt" || ganttMatch !== null;
  const isKanban = pathname === "/kanban";
  const storyMatch = useMatch("/stories/:storyId");
  const isBacklog = pathname === "/backlog" || storyMatch !== null;
  const [searchParams] = useSearchParams();
  // Gantt shows one project: the one in the URL, or the first active project for /gantt.
  const defaultProjectId = (projects.find((p) => p.is_active) ?? projects[0])?.id;
  const ganttProjectId = isGantt ? ganttMatch?.params.projectId ?? defaultProjectId : undefined;
  const [graph, setGraph] = useState<{ projectId: string; graph: ProjectGraph } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const session = useSession();
  // Data is loaded only after sign-in; signed-out visitors are sent to /login below.
  const userId = session?.user.id;

  useEffect(() => {
    if (!isConfigured || !userId) return;
    listProjects()
      .then(setProjects)
      .catch((e) => setError(String(e.message ?? e)))
      .finally(() => setProjectsLoaded(true));
  }, [userId]);

  // Load only the selected project's graph.
  useEffect(() => {
    if (!userId || !ganttProjectId) return;
    let cancelled = false;
    getProjectGraph(ganttProjectId)
      .then((g) => {
        if (!cancelled) setGraph({ projectId: ganttProjectId, graph: g });
      })
      .catch((e) => setError(String(e.message ?? e)));
    return () => {
      cancelled = true;
    };
  }, [userId, ganttProjectId]);

  // Backlog page: the project comes from ?project=, defaulting to the first project.
  const backlogProjectId = pathname === "/backlog" ? searchParams.get("project") ?? defaultProjectId : undefined;
  const [backlog, setBacklog] = useState<{ projectId: string; stories: BacklogStory[] } | null>(null);
  useEffect(() => {
    if (!userId || !backlogProjectId) return;
    let cancelled = false;
    listBacklogStories(backlogProjectId)
      .then((stories) => {
        if (!cancelled) setBacklog({ projectId: backlogProjectId, stories });
      })
      .catch((e) => setError(String(e.message ?? e)));
    return () => {
      cancelled = true;
    };
  }, [userId, backlogProjectId]);

  // Add a backlog item (inactive story without a parent) to the selected project, then reload the list.
  const handleAddBacklog = useCallback(
    async (title: string, description: string | null) => {
      if (!backlogProjectId) return;
      try {
        await createBacklogStory(backlogProjectId, title, description);
        setBacklog({ projectId: backlogProjectId, stories: await listBacklogStories(backlogProjectId) });
      } catch (e: any) {
        setError(String(e.message ?? e));
        throw e;
      }
    },
    [backlogProjectId]
  );

  // Activate / shelve a story from the backlog list, then reload it.
  const handleSetStoryActive = useCallback(
    async (storyId: string, active: boolean) => {
      if (!backlogProjectId) return;
      try {
        await setActive(storyId, active);
        setBacklog({ projectId: backlogProjectId, stories: await listBacklogStories(backlogProjectId) });
      } catch (e: any) {
        setError(String(e.message ?? e));
      }
    },
    [backlogProjectId]
  );

  const [lanes, setLanes] = useState<KanbanLane[] | null>(null);
  useEffect(() => {
    if (!userId || !isKanban) return;
    setLanes(null);
    getKanbanLanes()
      .then(setLanes)
      .catch((e) => setError(String(e.message ?? e)));
  }, [userId, isKanban]);

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

  // Kanban: add a story without a parent, already started (Active).
  const handleKanbanAddStory = useCallback(
    async (projectId: string, values: StoryInput) => {
      try {
        await addRootStory(projectId, values, true);
        setLanes(await getKanbanLanes());
      } catch (e: any) {
        setError(String(e.message ?? e));
      }
    },
    []
  );

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

  const handleGanttAddTask = useCallback(
    async (story: GraphNode, values: StoryInput) => {
      try {
        await addTask(story, values);
        await refreshGraph();
      } catch (e: any) {
        setError(String(e.message ?? e));
      }
    },
    [refreshGraph]
  );

  // Gantt: add a story without a parent to the shown project.
  const handleAddStory = useCallback(
    async (values: StoryInput) => {
      if (!ganttProjectId) return;
      try {
        await addRootStory(ganttProjectId, values);
        await refreshGraph();
      } catch (e: any) {
        setError(String(e.message ?? e));
      }
    },
    [ganttProjectId, refreshGraph]
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

  const handleMoveTaskDates = useCallback(
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

  const handleShiftStory = useCallback(
    async (id: string, days: number) => {
      try {
        await shiftStoryDates(id, days);
        await refreshGraph();
      } catch (e: any) {
        setError(String(e.message ?? e));
      }
    },
    [refreshGraph]
  );

  // Gantt: add / rename / delete a story group of the shown project.
  const handleAddGroup = useCallback(
    async (name: string) => {
      if (!ganttProjectId) return;
      try {
        await createStoryGroup(ganttProjectId, name);
        await refreshGraph();
      } catch (e: any) {
        setError(String(e.message ?? e));
      }
    },
    [ganttProjectId, refreshGraph]
  );

  const handleRenameGroup = useCallback(
    async (id: string, name: string) => {
      try {
        await renameStoryGroup(id, name);
        await refreshGraph();
      } catch (e: any) {
        setError(String(e.message ?? e));
      }
    },
    [refreshGraph]
  );

  const handleDeleteGroup = useCallback(
    async (id: string) => {
      try {
        await deleteStoryGroup(id);
        await refreshGraph();
      } catch (e: any) {
        setError(String(e.message ?? e));
      }
    },
    [refreshGraph]
  );

  const handleMoveStoryToGroup = useCallback(
    async (storyId: string, groupId: string | null) => {
      try {
        await setStoryGroup(storyId, groupId);
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

  const handleLogout = useCallback(async () => {
    const { error } = await signOut();
    if (error) setError(error.message);
    else navigate("/login");
  }, [navigate]);

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

  // The login page stands alone, without the sidebar. Signed-in users go straight to the app.
  if (pathname === "/login") {
    return (
      <Shell>
        {session === undefined ? null : session ? <Navigate to="/projects" replace /> : <LoginPage />}
      </Shell>
    );
  }

  // The OAuth consent page also stands alone, and handles sign-in itself: a detour via /login
  // would drop the authorization_id from the URL.
  if (pathname === "/oauth/consent") {
    return <Shell>{session !== undefined && <OAuthConsentPage session={session} />}</Shell>;
  }

  // Every other page needs a signed-in user. Render nothing while the session is still being read.
  if (!session) {
    return <Shell>{session === null && <Navigate to="/login" replace />}</Shell>;
  }

  // Archived projects stay reachable by URL but drop out of the pickers.
  const pickerProjects = (currentId: string | null | undefined) =>
    projects.filter((p) => p.is_active || p.id === currentId);

  // Google sign-in fills full_name / name; fall back to the email.
  const meta = session.user.user_metadata ?? {};
  const userName: string = meta.full_name ?? meta.name ?? session.user.email ?? "";

  // The header's project switcher keeps the page and swaps the project; pages without one
  // (project list, story detail) go to that project's backlog.
  const kanbanProjectId = isKanban ? searchParams.get("project") : null;
  const headerProjectId = isGantt
    ? ganttProjectId
    : pathname === "/backlog"
      ? backlogProjectId
      : isKanban
        ? kanbanProjectId
        : projectMatch?.params.projectId;
  const handleHeaderSelectProject = (id: string) => {
    if (isGantt) navigate(`/projects/${id}/gantt`);
    else if (isKanban) navigate(`/kanban?project=${id}`);
    else if (projectMatch) navigate(`/projects/${id}`);
    else navigate(`/backlog?project=${id}`);
  };

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
          onAddTask={handleGanttAddTask}
          onUpdateTask={handleUpdateTask}
          onDeleteTask={handleDeleteTask}
          onStartStory={handleStartStory}
          onCompleteStory={handleCompleteStory}
          onChangeStatus={handleChangeStatus}
          onResizeStory={handleResizeStory}
          onShiftStory={handleShiftStory}
          onMoveTask={handleMoveTaskDates}
          onAddGroup={handleAddGroup}
          onRenameGroup={handleRenameGroup}
          onDeleteGroup={handleDeleteGroup}
          onMoveStoryToGroup={handleMoveStoryToGroup}
        />
      )}
    </main>
  );

  return (
    <div className="flex h-screen flex-col">
      <GlobalHeader
        projects={projects}
        currentProjectId={headerProjectId ?? null}
        allProjectsLabel={isKanban ? "すべてのプロジェクト" : undefined}
        onSelectProject={handleHeaderSelectProject}
        onSelectAllProjects={() => navigate(isKanban ? "/kanban" : "/projects")}
        userName={userName}
        userEmail={session.user.email ?? null}
        onLogout={handleLogout}
      />
      <div className="flex min-h-0 flex-1">
        <Sidebar
          active={isGantt ? "gantt" : isKanban ? "kanban" : isBacklog ? "backlog" : "projects"}
          onNavigate={onNavigate}
        />

        <div className="flex min-w-0 flex-1 flex-col">
          {error && (
            <div className="flex items-center gap-2 border-b border-danger/30 bg-danger/10 px-3 py-1.5 text-[13px] text-danger">
              <span className="min-w-0 flex-1">{error}</span>
              <Button variant="ghost" size="sm" aria-label="閉じる" onClick={() => setError(null)}>
                ×
              </Button>
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
                      stories={backlog && backlog.projectId === backlogProjectId ? backlog.stories : null}
                      onAddBacklog={handleAddBacklog}
                      onSetActive={handleSetStoryActive}
                    />
                  )}
                </main>
              }
            />
            <Route
              path="/stories/:storyId"
              element={
                <main style={{ flex: 1, minHeight: 0 }}>
                  {storyMatch?.params.storyId && (
                    <StoryDetailPage storyId={storyMatch.params.storyId} projects={projects} onError={setError} />
                  )}
                </main>
              }
            />
            {/* Epics go away in the two-level model; nothing links here any more. */}
            <Route path="/epics/:epicId" element={<Navigate to="/backlog" replace />} />
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
                      onChangeStatus={handleKanbanStatus}
                      onMoveTask={handleKanbanMove}
                      onAddStory={handleKanbanAddStory}
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
      </div>
    </div>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return <div className="flex h-screen">{children}</div>;
}
