import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Navigate, Route, Routes, useLocation, useMatch, useNavigate, useSearchParams } from "react-router-dom";
import { isConfigured } from "./lib/supabase";
import { signOut, useSession } from "./lib/useSession";
import { useProfile } from "./lib/useProfile";
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
import type { Assignees, BacklogStory, GraphNode, KanbanLane, Project, ProjectGraph, ProjectInput, Status, StoryInput, Task } from "./lib/types";
import { agentAssigneeId } from "./lib/types";
import { agentClientLabel, findAgentProvider } from "./lib/agentProviders";
import { useAgentGrants } from "./lib/useAgentGrants";
import { Sidebar, type MenuKey } from "./components/Sidebar";
import { GlobalHeader } from "./components/GlobalHeader";
import { ProjectSelect } from "./components/ProjectSelect";
import { CloseIcon } from "./components/Icons";
import { IconButton } from "./components/ui/Button";
import { ProjectsListPage } from "./views/ProjectsListPage";
import { ProjectDetailPage } from "./views/ProjectDetailPage";
import { GanttView } from "./views/GanttView";
import { KanbanView } from "./views/KanbanView";
import { BacklogView } from "./views/BacklogView";
import { TimelineView } from "./views/TimelineView";
import { StoryDetailPage } from "./views/StoryDetailPage";
import { LoginPage } from "./views/LoginPage";
import { OAuthConsentPage } from "./views/OAuthConsentPage";
import { SettingsPage } from "./views/SettingsPage";

// The project picked in the header / toolbar, remembered per browser.
const SELECTED_PROJECT_KEY = "project.selected";

export default function App() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectsLoaded, setProjectsLoaded] = useState(false);
  // One project selection for the whole app (null = none picked), carried across pages.
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(() => {
    try {
      return localStorage.getItem(SELECTED_PROJECT_KEY);
    } catch {
      return null; // storage can be unavailable (private mode)
    }
  });
  const selectProject = useCallback((id: string | null) => {
    setSelectedProjectId(id);
    try {
      if (id) localStorage.setItem(SELECTED_PROJECT_KEY, id);
      else localStorage.removeItem(SELECTED_PROJECT_KEY);
    } catch {
      // Ignore: the selection still applies for this session.
    }
  }, []);
  // A remembered project that no longer exists counts as none.
  const selectedId = projects.some((p) => p.id === selectedProjectId) ? selectedProjectId : null;
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const ganttMatch = useMatch("/projects/:projectId/gantt");
  const projectMatch = useMatch("/projects/:projectId");
  const isGantt = pathname === "/gantt" || ganttMatch !== null;
  const isKanban = pathname === "/kanban";
  const isTimeline = pathname === "/timeline";
  const storyMatch = useMatch("/stories/:storyId");
  const isBacklog = pathname === "/backlog" || storyMatch !== null;
  // Settings belong to no project: no side nav item is current, and the breadcrumb says 設定.
  const isSettings = pathname === "/settings" || pathname.startsWith("/settings/");
  const [searchParams] = useSearchParams();
  // Gantt shows one project: the one in the URL, else the selected one, else the first active project.
  const defaultProjectId = selectedId ?? (projects.find((p) => p.is_active) ?? projects[0])?.id;
  const ganttProjectId = isGantt ? ganttMatch?.params.projectId ?? defaultProjectId : undefined;
  const [graph, setGraph] = useState<{ projectId: string; graph: ProjectGraph } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const session = useSession();
  const profile = useProfile(session);
  // Data is loaded only after sign-in; signed-out visitors are sent to /login below.
  const userId = session?.user.id;
  // Read again on leaving the settings, where agents can be disconnected.
  const grants = useAgentGrants(isConfigured ? userId : undefined, isSettings);
  // Candidates for a task's 担当者: the project owner (every project shown is the user's own) and the
  // connected agents.
  const assignees = useMemo<Assignees>(
    () => ({
      options: userId
        ? [
            { id: userId, name: profile.displayName, avatarUrl: profile.avatarUrl },
            ...(grants ?? []).map((g) => ({
              id: agentAssigneeId(g.client.id),
              name: agentClientLabel(g.client),
              avatarUrl: null,
              agent: { provider: findAgentProvider({ name: g.client.name }) },
            })),
          ]
        : [],
      agentsLoaded: grants !== undefined,
    }),
    [userId, profile.displayName, profile.avatarUrl, grants]
  );

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

  // Backlog page: the project comes from ?project=, defaulting as the Gantt does.
  const backlogProjectId = pathname === "/backlog" ? searchParams.get("project") ?? defaultProjectId : undefined;
  // Kanban: ?project=, else the selected project; null shows all projects.
  const kanbanProjectId = isKanban ? searchParams.get("project") ?? selectedId : null;
  // Timeline: ?project=, defaulting as the Gantt does.
  const timelineProjectId = isTimeline ? searchParams.get("project") ?? defaultProjectId : undefined;

  // A project named in the URL becomes the selection, so the next page opens on it too.
  const urlProjectId =
    ganttMatch?.params.projectId ??
    projectMatch?.params.projectId ??
    (pathname === "/backlog" || isKanban || isTimeline ? searchParams.get("project") : null);
  useEffect(() => {
    if (urlProjectId && projects.some((p) => p.id === urlProjectId)) selectProject(urlProjectId);
  }, [urlProjectId, projects, selectProject]);
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

  // Change a story's status from the backlog list, then reload it.
  const handleSetStoryStatus = useCallback(
    async (storyId: string, status: Status) => {
      if (!backlogProjectId) return;
      try {
        await updateTaskStatus(storyId, status);
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
      if (id === selectedProjectId) selectProject(null);
      setGraph((prev) => (prev?.projectId === id ? null : prev));
    } catch (e: any) {
      setError(String(e.message ?? e));
    }
  }, [selectedProjectId, selectProject]);

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

  // The side nav opens each page on the selected project.
  const onNavigate = useCallback((key: MenuKey) => {
    if (key === "projects") navigate("/projects");
    else if (key === "gantt") navigate(selectedId ? `/projects/${selectedId}/gantt` : "/gantt");
    else if (key === "kanban") navigate(selectedId ? `/kanban?project=${selectedId}` : "/kanban");
    else if (key === "backlog") navigate(selectedId ? `/backlog?project=${selectedId}` : "/backlog");
    else if (key === "timeline") navigate(selectedId ? `/timeline?project=${selectedId}` : "/timeline");
  }, [navigate, selectedId]);

  if (!isConfigured) {
    return (
      <Shell>
        <div className="p-6">
          <h2 className="mb-3 text-2xl font-medium text-fg">設定が必要です</h2>
          <p className="text-sm text-fg">
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

  // The header's project switcher keeps the page and swaps the project; pages without one
  // (project list, story detail) go to that project's backlog.
  const headerProjectId = isGantt
    ? ganttProjectId
    : pathname === "/backlog"
      ? backlogProjectId
      : isKanban
        ? kanbanProjectId
        : isTimeline
          ? timelineProjectId
          : projectMatch?.params.projectId ?? selectedId;
  const handleHeaderSelectProject = (id: string) => {
    selectProject(id);
    if (isGantt) navigate(`/projects/${id}/gantt`);
    else if (isKanban) navigate(`/kanban?project=${id}`);
    else if (isTimeline) navigate(`/timeline?project=${id}`);
    else if (projectMatch) navigate(`/projects/${id}`);
    else navigate(`/backlog?project=${id}`);
  };
  // Clears the selection: the Kanban then shows every project; other pages go to the project list.
  const handleSelectAllProjects = () => {
    selectProject(null);
    navigate(isKanban ? "/kanban" : "/projects");
  };
  // The toolbar's picker works on the same selection as the header's switcher.
  const projectSelect = (value: string | null | undefined) => (
    <ProjectSelect
      projects={projects}
      value={value ?? null}
      allowAll={isKanban}
      onChange={(id) => (id ? handleHeaderSelectProject(id) : handleSelectAllProjects())}
    />
  );

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
          project={ganttProject}
          graph={graph.graph}
          projectSelect={projectSelect(ganttProjectId)}
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
          assignees={assignees}
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
        onSelectAllProjects={handleSelectAllProjects}
        pageTitle={isSettings ? "設定" : undefined}
        userName={profile.displayName}
        userAvatarUrl={profile.avatarUrl}
        userEmail={session.user.email ?? null}
        onOpenSettings={() => navigate("/settings/profile")}
        onLogout={handleLogout}
      />
      <div className="flex min-h-0 flex-1">
        <Sidebar
          active={isSettings ? null : isGantt ? "gantt" : isKanban ? "kanban" : isTimeline ? "timeline" : isBacklog ? "backlog" : "projects"}
          onNavigate={onNavigate}
        />

        <div className="flex min-w-0 flex-1 flex-col">
          {error && (
            <div className="flex items-center gap-2 border-b border-danger/30 bg-danger/10 px-3 py-1.5 text-[13px] text-danger">
              <span className="min-w-0 flex-1">{error}</span>
              <IconButton label="閉じる" danger onClick={() => setError(null)}>
                <CloseIcon size={14} />
              </IconButton>
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
                      projectSelect={projectSelect(backlogProjectId)}
                      onAddBacklog={handleAddBacklog}
                      onSetActive={handleSetStoryActive}
                      onChangeStatus={handleSetStoryStatus}
                    />
                  )}
                </main>
              }
            />
            <Route
              path="/timeline"
              element={
                <main style={{ flex: 1, minHeight: 0 }}>
                  {!projectsLoaded ? (
                    <div style={{ padding: 24, color: "#5f6b7a" }}>読み込み中…</div>
                  ) : projects.length === 0 ? (
                    <div style={{ padding: 24, color: "#5f6b7a" }}>プロジェクトがありません。</div>
                  ) : !timelineProjectId || !projects.some((p) => p.id === timelineProjectId) ? (
                    <div style={{ padding: 24, color: "#5f6b7a" }}>プロジェクトが見つかりません。</div>
                  ) : (
                    <TimelineView projectId={timelineProjectId} projectSelect={projectSelect(timelineProjectId)} />
                  )}
                </main>
              }
            />
            <Route
              path="/stories/:storyId"
              element={
                <main style={{ flex: 1, minHeight: 0 }}>
                  {storyMatch?.params.storyId && (
                    <StoryDetailPage
                      storyId={storyMatch.params.storyId}
                      projects={projects}
                      onError={setError}
                      onLoadProject={selectProject}
                    />
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
                      projects={pickerProjects(kanbanProjectId)}
                      lanes={lanes}
                      projectFilter={kanbanProjectId}
                      projectSelect={projectSelect(kanbanProjectId)}
                      onChangeStatus={handleKanbanStatus}
                      onMoveTask={handleKanbanMove}
                      onAddTask={handleAddTask}
                      onUpdateTask={handleKanbanUpdate}
                      onDeleteTask={handleKanbanDelete}
                      assignees={assignees}
                    />
                  )}
                </main>
              }
            />
            <Route path="/settings" element={<Navigate to="/settings/profile" replace />} />
            <Route
              path="/settings/profile"
              element={
                <main style={{ flex: 1, minHeight: 0 }}>
                  <SettingsPage tab="profile" session={session} onProfileSaved={profile.reload} />
                </main>
              }
            />
            <Route
              path="/settings/agents"
              element={
                <main style={{ flex: 1, minHeight: 0 }}>
                  <SettingsPage tab="agents" session={session} />
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
