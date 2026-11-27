import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Navigate, Route, Routes, useLocation, useMatch, useNavigate, useSearchParams } from "react-router-dom";
import { isConfigured } from "./lib/supabase";
import {
  initialAuthRedirectError,
  linkGoogle,
  signOut,
  switchToGoogleAccount,
  useSession,
  withoutAuthRedirectError,
} from "./lib/useSession";
import { useProfile } from "./lib/useProfile";
import {
  addRootStory,
  addTaskComment,
  addTask,
  createOrganization,
  createProject,
  deleteProject,
  deleteTask,
  exportProject,
  getKanbanLanes,
  listBacklogStories,
  createBacklogStory,
  getProjectGraph,
  listProjects,
  moveTask,
  moveTaskToStory,
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
import type { Assignees, BacklogStory, GraphNode, KanbanLane, Organization, OrganizationInput, Project, ProjectGraph, ProjectInput, Status, StoryInput, Task } from "./lib/types";
import { agentAssigneeId } from "./lib/types";
import { agentClientLabel, findAgentProvider } from "./lib/agentProviders";
import { useAgentGrants } from "./lib/useAgentGrants";
import { useOrgContext } from "./lib/useOrgContext";
import { Sidebar, type MenuKey } from "./components/Sidebar";
import { BottomTabBar } from "./components/BottomTabBar";
import { useIsMobile } from "./lib/useIsMobile";
import { GlobalHeader } from "./components/GlobalHeader";
import { GuestBanner } from "./components/GuestBanner";
import { ConfirmDialog } from "./components/ConfirmDialog";
import { ProjectSelect } from "./components/ProjectSelect";
import { OrgForm } from "./components/OrgForm";
import { CloseIcon } from "./components/Icons";
import { Button, IconButton } from "./components/ui/Button";
import { ProjectsListPage } from "./views/ProjectsListPage";
import { ProjectDetailPage } from "./views/ProjectDetailPage";
import { GanttView } from "./views/GanttView";
import { KanbanView } from "./views/KanbanView";
import { BacklogView } from "./views/BacklogView";
import { TimelineView } from "./views/TimelineView";
import { StoryDetailPage } from "./views/StoryDetailPage";
import { LoginPage } from "./views/LoginPage";
import { OAuthConsentPage } from "./views/OAuthConsentPage";
import { InvitePage } from "./views/InvitePage";
import { PerformanceView } from "./views/PerformanceView";
import { SettingsPage } from "./views/SettingsPage";
import { OrgSettingsPage, type OrgSettingsTab } from "./views/org/OrgSettingsPage";

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
  const isPerformance = pathname === "/performance";
  const storyMatch = useMatch("/stories/:storyId");
  const isBacklog = pathname === "/backlog" || storyMatch !== null;
  // Settings belong to no project: no side nav item is current, and the breadcrumb says 設定.
  const isSettings = pathname === "/settings" || pathname.startsWith("/settings/");
  // Organization settings (/orgs/:slug/settings/...): no project either; the side nav marks 組織の設定.
  const orgSettingsMatch = useMatch("/orgs/:slug/settings/*");
  const isOrgSettings = orgSettingsMatch !== null;
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
  // Performance: ?project=, defaulting as the Gantt does; ?project=all (null) adds up every project.
  const performanceProjectParam = isPerformance ? searchParams.get("project") : null;
  const performanceProjectId = isPerformance
    ? performanceProjectParam === "all"
      ? null
      : performanceProjectParam ?? defaultProjectId
    : undefined;

  // A project named in the URL becomes the selection, so the next page opens on it too.
  const urlProjectId =
    ganttMatch?.params.projectId ??
    projectMatch?.params.projectId ??
    (pathname === "/backlog" || isKanban || isTimeline || isPerformance ? searchParams.get("project") : null);
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

  // Add a backlog item (planning story without a parent) to the selected project, then reload the list.
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
  // comment: 確認ダイアログで書いたコメント。ステータスを変えられたときだけ、空でなければ投稿する（失敗してもステータスは戻さない）。
  const handleKanbanStatus = useCallback(async (taskId: string, status: Status, comment?: string) => {
    setLanes((prev) =>
      prev?.map((l) => ({ ...l, tasks: l.tasks.map((t) => (t.id === taskId ? { ...t, status } : t)) })) ?? prev
    );
    try {
      await updateTaskStatus(taskId, status);
      await postStatusComment(taskId, comment);
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
  const handleKanbanMove = useCallback(async (taskId: string, storyId: string, status: Status, comment?: string) => {
    try {
      await moveTask(taskId, storyId, status);
      await postStatusComment(taskId, comment);
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

  const handleMoveTaskToStory = useCallback(
    async (taskId: string, storyId: string) => {
      try {
        await moveTaskToStory(taskId, storyId);
        await refreshGraph();
      } catch (e: any) {
        setError(String(e.message ?? e));
      }
    },
    [refreshGraph]
  );

  // Returns the created project (null on failure, which is shown as the page error).
  const handleCreateProject = useCallback(async (input: ProjectInput): Promise<Project | null> => {
    try {
      const p = await createProject(input);
      setProjects((prev) => [...prev, p]);
      return p;
    } catch (e: any) {
      setError(String(e.message ?? e));
      return null;
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

  // Guest → regular user. On success the browser leaves for Google; only an error comes back here.
  const handleLinkGoogle = useCallback(async () => {
    const { error } = await linkGoogle();
    if (error) setError(`Google での本登録に失敗しました: ${error.message}`);
  }, []);

  // Back from Google with identity_already_exists: the account is already registered, so the link
  // failed and the user is still the guest. Offer to switch to that account (no data merge).
  const [identityConflict, setIdentityConflict] = useState(
    () => initialAuthRedirectError === "identity_already_exists"
  );
  // Drop the error params from the URL once read, so a reload does not show the guidance again.
  useEffect(() => {
    if (initialAuthRedirectError) navigate(withoutAuthRedirectError(window.location.href), { replace: true });
  }, [navigate]);
  const handleSwitchToGoogleAccount = useCallback(async () => {
    setIdentityConflict(false);
    const { error } = await switchToGoogleAccount();
    if (error) setError(`Google でのログインに失敗しました: ${error.message}`);
  }, []);

  // Phone layout (< 768px): the bottom tab bar replaces the sidebar.
  const isMobile = useIsMobile();

  // Owner (個人 / 組織) the project list is scoped to: ?org=<slug>, else the last choice.
  const org = useOrgContext(isConfigured ? userId : undefined);
  const [creatingOrg, setCreatingOrg] = useState(false);
  const handleSelectOwner = useCallback(
    (slug: string | null) => {
      org.select(slug);
      navigate(slug ? `/projects?org=${encodeURIComponent(slug)}` : "/projects");
    },
    [org.select, navigate]
  );
  // Throws on failure so the dialog can show the reason (duplicate slug etc.).
  const handleCreateOrg = useCallback(
    async (input: OrganizationInput) => {
      const created = await createOrganization(input);
      org.add(created);
      setCreatingOrg(false);
      handleSelectOwner(created.slug);
    },
    [org.add, handleSelectOwner]
  );
  // Organization settings: open the selected organization's, and follow renames / removals.
  const openOrgSettings = useCallback(() => {
    if (org.current) navigate(`/orgs/${encodeURIComponent(org.current.slug)}/settings/general`);
  }, [org.current, navigate]);
  const handleOrgUpdated = useCallback(
    (updated: Organization, previousSlug: string) => {
      org.replace(updated);
      if (updated.slug !== previousSlug) {
        // Keep the remembered choice on this organization under its new slug.
        if (org.requestedSlug === previousSlug) org.select(updated.slug);
        const tab = pathname.endsWith("/members") ? "members" : "general";
        navigate(`/orgs/${encodeURIComponent(updated.slug)}/settings/${tab}`, { replace: true });
      }
    },
    [org.replace, org.select, org.requestedSlug, pathname, navigate]
  );
  // Deleted or left: drop it (and its projects, no longer readable) and go back to the personal list.
  const handleOrgRemoved = useCallback(
    (orgId: string) => {
      org.remove(orgId);
      setProjects((prev) => prev.filter((p) => p.org_id !== orgId));
      if (org.current?.id === orgId) org.select(null);
      navigate("/projects");
    },
    [org.remove, org.select, org.current, navigate]
  );
  // Opening an organization's settings (e.g. from a link) picks that organization in the header too.
  const orgSettingsSlug = orgSettingsMatch?.params.slug ?? null;
  useEffect(() => {
    if (orgSettingsSlug && org.requestedSlug !== orgSettingsSlug && org.orgs.some((o) => o.slug === orgSettingsSlug)) {
      org.select(orgSettingsSlug);
    }
  }, [orgSettingsSlug, org.requestedSlug, org.orgs, org.select]);
  const orgProjectCount = useCallback(
    (orgId: string) => projects.filter((p) => p.org_id === orgId).length,
    [projects]
  );

  // The project list without ?org= but with a remembered organization: put it in the URL.
  const isProjectsList = pathname === "/projects";
  const urlOrg = searchParams.get("org");
  useEffect(() => {
    if (isProjectsList && !urlOrg && org.current) {
      navigate(`/projects?org=${encodeURIComponent(org.current.slug)}`, { replace: true });
    }
  }, [isProjectsList, urlOrg, org.current, navigate]);
  // Projects of the selected owner (個人: no org_id; 組織: that org_id).
  const ownerProjects = useMemo(
    () => projects.filter((p) => (org.current ? p.org_id === org.current.id : !p.org_id)),
    [projects, org.current]
  );

  // The side nav opens each page on the selected project.
  const onNavigate = useCallback((key: MenuKey) => {
    if (key === "projects") navigate("/projects");
    else if (key === "gantt") navigate(selectedId ? `/projects/${selectedId}/gantt` : "/gantt");
    else if (key === "kanban") navigate(selectedId ? `/kanban?project=${selectedId}` : "/kanban");
    else if (key === "backlog") navigate(selectedId ? `/backlog?project=${selectedId}` : "/backlog");
    else if (key === "timeline") navigate(selectedId ? `/timeline?project=${selectedId}` : "/timeline");
    else if (key === "performance") navigate(selectedId ? `/performance?project=${selectedId}` : "/performance");
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

  // The invitation page (/invite/<token>) stands alone too, and signs in by itself so the token
  // stays in the URL (the /login detour would drop it).
  const inviteMatch = pathname.match(/^\/invite\/([^/]+)\/?$/);
  if (inviteMatch) {
    return (
      <Shell>
        {session !== undefined && <InvitePage session={session} token={decodeURIComponent(inviteMatch[1])} />}
      </Shell>
    );
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
        : isPerformance
          ? performanceProjectId
          : projectMatch?.params.projectId ?? selectedId;
  const handleHeaderSelectProject = (id: string) => {
    selectProject(id);
    if (isGantt) navigate(`/projects/${id}/gantt`);
    else if (isKanban) navigate(`/kanban?project=${id}`);
    else if (isTimeline) navigate(`/timeline?project=${id}`);
    else if (isPerformance) navigate(`/performance?project=${id}`);
    else if (projectMatch) navigate(`/projects/${id}`);
    else navigate(`/backlog?project=${id}`);
  };
  // Clears the selection: the Kanban and the performance page then show every project; other pages
  // go to the project list.
  const handleSelectAllProjects = () => {
    selectProject(null);
    navigate(isKanban ? "/kanban" : isPerformance ? "/performance?project=all" : "/projects");
  };
  // The toolbar's picker works on the same selection as the header's switcher.
  const projectSelect = (value: string | null | undefined) => (
    <ProjectSelect
      projects={projects}
      orgs={org.orgs}
      value={value ?? null}
      allowAll={isKanban || isPerformance}
      onChange={(id) => (id ? handleHeaderSelectProject(id) : handleSelectAllProjects())}
    />
  );

  const detailProject = projects.find((p) => p.id === projectMatch?.params.projectId);
  const ganttProject = projects.find((p) => p.id === ganttProjectId);
  const ganttPage = (
    <main style={{ flex: 1, minHeight: 0 }}>
      {!projectsLoaded ? (
        <div className="p-6 text-fg-muted">読み込み中…</div>
      ) : projects.length === 0 ? (
        <div className="p-6 text-fg-muted">プロジェクトがありません。</div>
      ) : !ganttProject ? (
        <div className="p-6 text-fg-muted">プロジェクトが見つかりません。</div>
      ) : graph?.projectId !== ganttProject.id ? (
        <div className="p-6 text-fg-muted">読み込み中…</div>
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
          onMoveTaskToStory={handleMoveTaskToStory}
          assignees={assignees}
        />
      )}
    </main>
  );

  const activeMenu: MenuKey | null = isSettings || isOrgSettings
    ? null
    : isGantt
      ? "gantt"
      : isKanban
        ? "kanban"
        : isTimeline
          ? "timeline"
          : isPerformance
            ? "performance"
            : isBacklog
              ? "backlog"
              : "projects";

  return (
    // dvh on phones: 100vh includes the area under Safari's toolbar, which would hide the tab bar.
    <div className="flex h-screen flex-col max-md:h-dvh">
      <GlobalHeader
        orgs={org.orgs}
        currentOrg={org.current}
        onSelectOwner={handleSelectOwner}
        onCreateOrg={session.user.is_anonymous ? undefined : () => setCreatingOrg(true)}
        projects={projects}
        currentProjectId={headerProjectId ?? null}
        allProjectsLabel={isKanban || isPerformance ? "すべてのプロジェクト" : undefined}
        onSelectProject={handleHeaderSelectProject}
        onSelectAllProjects={handleSelectAllProjects}
        pageTitle={isSettings ? "設定" : isOrgSettings ? "組織の設定" : undefined}
        userName={profile.displayName}
        userAvatarUrl={profile.avatarUrl}
        userEmail={session.user.email ?? null}
        isGuest={!!session.user.is_anonymous}
        onOpenSettings={() => navigate("/settings/profile")}
        onLinkGoogle={handleLinkGoogle}
        onLogout={handleLogout}
      />
      {session.user.is_anonymous && (
        <GuestBanner
          createdAt={session.user.created_at}
          action={
            <Button variant="primary" size="sm" onClick={handleLinkGoogle}>
              Google で本登録
            </Button>
          }
        />
      )}
      {creatingOrg && !session.user.is_anonymous && (
        <OrgForm onSubmit={handleCreateOrg} onCancel={() => setCreatingOrg(false)} />
      )}
      {identityConflict && session.user.is_anonymous && (
        <ConfirmDialog
          message={
            "この Google アカウントは登録済みです。ゲストのデータは引き継げません。\nそのアカウントでログインし直しますか？"
          }
          confirmLabel="ログインし直す"
          onConfirm={handleSwitchToGoogleAccount}
          onCancel={() => setIdentityConflict(false)}
        />
      )}
      <div className="flex min-h-0 flex-1">
        {!isMobile && (
          <Sidebar
            active={activeMenu}
            onNavigate={onNavigate}
            onOpenOrgSettings={org.current ? openOrgSettings : undefined}
            orgSettingsActive={isOrgSettings}
          />
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          {error && (
            <div className="flex items-center gap-2 border-b border-danger/30 bg-danger/10 px-3 py-1.5 text-[13px] text-danger-fg">
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
                    projects={ownerProjects}
                    ownerName={org.current?.name ?? null}
                    orgs={org.orgs}
                    currentOrgId={org.current?.id ?? null}
                    onCreate={async (input) => {
                      // Created under another owner than the one shown: switch to it so the project shows.
                      const p = await handleCreateProject(input);
                      if (p && (p.org_id ?? null) !== (org.current?.id ?? null)) {
                        handleSelectOwner(org.orgs.find((o) => o.id === p.org_id)?.slug ?? null);
                      }
                    }}
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
                    <div className="p-6 text-fg-muted">読み込み中…</div>
                  ) : !detailProject ? (
                    <div className="p-6 text-fg-muted">プロジェクトが見つかりません。</div>
                  ) : (
                    <ProjectDetailPage
                      project={detailProject}
                      orgs={org.orgs}
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
            <Route
              path="/performance"
              element={
                <main style={{ flex: 1, minHeight: 0 }}>
                  {!projectsLoaded ? (
                    <div className="p-6 text-fg-muted">読み込み中…</div>
                  ) : projects.length === 0 ? (
                    <div className="p-6 text-fg-muted">プロジェクトがありません。</div>
                  ) : performanceProjectId !== null && !projects.some((p) => p.id === performanceProjectId) ? (
                    <div className="p-6 text-fg-muted">プロジェクトが見つかりません。</div>
                  ) : (
                    <PerformanceView
                      projectId={performanceProjectId ?? null}
                      projectSelect={projectSelect(performanceProjectId)}
                      onError={setError}
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
                    <div className="p-6 text-fg-muted">読み込み中…</div>
                  ) : projects.length === 0 ? (
                    <div className="p-6 text-fg-muted">プロジェクトがありません。</div>
                  ) : !projects.some((p) => p.id === backlogProjectId) ? (
                    <div className="p-6 text-fg-muted">プロジェクトが見つかりません。</div>
                  ) : (
                    <BacklogView
                      stories={backlog && backlog.projectId === backlogProjectId ? backlog.stories : null}
                      projectSelect={projectSelect(backlogProjectId)}
                      onAddBacklog={handleAddBacklog}
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
                    <div className="p-6 text-fg-muted">読み込み中…</div>
                  ) : projects.length === 0 ? (
                    <div className="p-6 text-fg-muted">プロジェクトがありません。</div>
                  ) : !timelineProjectId || !projects.some((p) => p.id === timelineProjectId) ? (
                    <div className="p-6 text-fg-muted">プロジェクトが見つかりません。</div>
                  ) : (
                    <TimelineView
                      projectId={timelineProjectId}
                      projectName={projects.find((p) => p.id === timelineProjectId)?.name ?? ""}
                      projectSelect={projectSelect(timelineProjectId)}
                      assignees={assignees}
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
                    <StoryDetailPage
                      storyId={storyMatch.params.storyId}
                      projects={projects}
                      assignees={assignees}
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
                    <div className="p-6 text-fg-muted">読み込み中…</div>
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
            <Route
              path="/settings/appearance"
              element={
                <main style={{ flex: 1, minHeight: 0 }}>
                  <SettingsPage tab="appearance" session={session} />
                </main>
              }
            />
            <Route path="/orgs/:slug/settings" element={<OrgSettingsRedirect />} />
            <Route
              path="/orgs/:slug/settings/general"
              element={
                <main style={{ flex: 1, minHeight: 0 }}>
                  {orgSettingsMatch?.params.slug && (
                    <OrgSettingsPage
                      tab="general"
                      slug={orgSettingsMatch.params.slug}
                      orgs={org.orgs}
                      orgsLoaded={org.loaded}
                      userId={session.user.id}
                      selfName={profile.displayName}
                      selfAvatarUrl={profile.avatarUrl}
                      projectCount={orgProjectCount}
                      onUpdated={handleOrgUpdated}
                      onDeleted={handleOrgRemoved}
                      onLeft={handleOrgRemoved}
                    />
                  )}
                </main>
              }
            />
            <Route
              path="/orgs/:slug/settings/members"
              element={
                <main style={{ flex: 1, minHeight: 0 }}>
                  {orgSettingsMatch?.params.slug && (
                    <OrgSettingsPage
                      tab="members"
                      slug={orgSettingsMatch.params.slug}
                      orgs={org.orgs}
                      orgsLoaded={org.loaded}
                      userId={session.user.id}
                      selfName={profile.displayName}
                      selfAvatarUrl={profile.avatarUrl}
                      projectCount={orgProjectCount}
                      onUpdated={handleOrgUpdated}
                      onDeleted={handleOrgRemoved}
                      onLeft={handleOrgRemoved}
                    />
                  )}
                </main>
              }
            />
            <Route path="*" element={<Navigate to="/projects" replace />} />
          </Routes>
        </div>
      </div>
      {isMobile && (
        <BottomTabBar
          active={activeMenu}
          settingsActive={isSettings}
          onNavigate={onNavigate}
          onOpenSettings={() => navigate("/settings/profile")}
          onOpenOrgSettings={org.current ? openOrgSettings : undefined}
          orgSettingsActive={isOrgSettings}
        />
      )}
    </div>
  );
}

// /orgs/:slug/settings → its first tab.
function OrgSettingsRedirect() {
  const match = useMatch("/orgs/:slug/settings");
  const tab: OrgSettingsTab = "general";
  return <Navigate to={`/orgs/${encodeURIComponent(match?.params.slug ?? "")}/settings/${tab}`} replace />;
}

function Shell({ children }: { children: ReactNode }) {
  return <div className="flex h-screen">{children}</div>;
}

// カンバンのステータス変更の確認ダイアログで書いたコメントを投稿する。空（trim 後）なら何もしない。
// 失敗はステータス変更の失敗と区別できるよう、文言を添えて投げ直す。
async function postStatusComment(taskId: string, comment: string | undefined): Promise<void> {
  const body = comment?.trim();
  if (!body) return;
  try {
    await addTaskComment(taskId, body);
  } catch (e: any) {
    throw new Error(`ステータスは変更しましたが、コメントを投稿できませんでした: ${e.message ?? e}`);
  }
}
