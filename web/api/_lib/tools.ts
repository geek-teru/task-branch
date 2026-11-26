// MCP のツール。後のストーリー（起票・参照、作業進行、コメント）のツールもここに足す。
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { SupabaseClient } from "@supabase/supabase-js";
import * as z from "zod";
import {
  ATTACHMENT_BUCKET,
  ATTACHMENT_MAX_BYTES,
  ATTACHMENT_MIME_TYPES,
  SIGNED_URL_SECONDS,
  attachmentMarkdown,
  attachmentPath,
  originalName,
  shellQuote,
} from "./attachments.js";

function json(value: unknown): CallToolResult {
  return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }] };
}

function toolError(text: string): CallToolResult {
  return { isError: true, content: [{ type: "text", text }] };
}

// ゲストの件数上限（0031_guest_limits.sql）の拒否を日本語にする。message は 'guest_limit_exceeded'、
// details は '<projects|stories|tasks|comments>:<上限>'。文言は web/src/lib/api.ts の guestLimitMessage と揃える。
const GUEST_LIMIT_LABELS: Record<string, string> = {
  projects: "プロジェクト",
  stories: "ストーリー",
  tasks: "タスク",
  comments: "コメント",
};

function guestLimitMessage(error: { message?: string; details?: string | null }): string | null {
  if (error.message !== "guest_limit_exceeded") return null;
  const [kind, limit] = (error.details ?? "").split(":");
  const label = GUEST_LIMIT_LABELS[kind] ?? "データ";
  const head = limit ? `ゲストでは${label}は ${limit} 件までです` : `ゲストでは${label}の件数に上限があります`;
  return `${head}。Google で本登録すると制限がなくなります`;
}

// REST のエラーは例外にせず、ツールの結果（isError）として AI に返す。
function restError(error: { message: string; code?: string; details?: string | null }): CallToolResult {
  const guest = guestLimitMessage(error);
  if (guest) return toolError(`${guest} (guest_limit_exceeded: ${error.details})`);
  return toolError(`Supabase のエラー: ${error.message}${error.code ? ` (${error.code})` : ""}`);
}

// author_id は人と AI が同じ uid で見分けに使えないので返さない。
const COMMENT_COLUMNS = "id, author_type, author_client_id, body, created_at, updated_at";

type CommentRow = { id: string; author_type: "human" | "ai"; author_client_id: string | null; body: string; created_at: string; updated_at: string };

// MCP 経由の操作は常に ai なので、編集・削除できるのは AI のコメントだけ（RLS の task_comments_update / delete と同じ条件）。
function withEditable(comment: CommentRow) {
  return { ...comment, editable: comment.author_type === "ai" };
}

const COMMENT_NOT_EDITABLE = "コメントが見つからないか、編集・削除できません（AI が書いたコメントだけが対象）";

const externalId = z.string().trim().min(1).describe("呼び出し側で決める識別子。metadata.external_id に入れ、同じプロジェクトに同じ値があれば作らない");

const assigneeInput = z
  .enum(["user", "ai", "none"])
  .describe("担当者。user は呼び出した AI の持ち主（本人）、ai は呼び出したエージェント、none は未割り当て。ほかのメンバーは assignee_user_id で指定する");

const assigneeUserIdInput = z
  .uuid()
  .describe("担当にする人の user_id（list_members で取る）。組織プロジェクトでほかのメンバーを担当にするときに使う。assignee と同時には指定できない");

// assignee の入力を tasks の担当の3列にする。user は本人（ownerId = 呼び出した AI の持ち主）。
function assigneeColumns(assignee: z.infer<typeof assigneeInput>, ownerId: string, clientId: string) {
  return {
    assignee_type: assignee === "user" ? "human" : assignee === "ai" ? "ai" : null,
    assignee_id: assignee === "user" ? ownerId : null,
    assignee_client_id: assignee === "ai" ? clientId : null,
  };
}

// 担当者のトリガ check_task_assignee（0045）の拒否を日本語にする。
function assigneeError(error: { message: string }): CallToolResult | null {
  if (error.message === "the assignee must be a member of the organization") {
    return toolError("担当にできるのは組織のメンバーだけです（list_members で確かめてください）");
  }
  if (error.message === "the assignee must be the owner of the project") {
    return toolError("個人プロジェクトの担当にできるのは持ち主だけです");
  }
  return null;
}

const planTask = z.object({
  external_id: externalId.optional(),
  title: z.string().trim().min(1).describe("タスク名"),
  description: z.string().optional().describe("タスクの説明（仕様など）"),
  start_date: z.iso.date().optional().describe("開始日（YYYY-MM-DD）"),
  due_date: z.iso.date().optional().describe("期限（YYYY-MM-DD）"),
  assignee: assigneeInput.optional(),
  assignee_user_id: assigneeUserIdInput.optional(),
});

const planStory = z.object({
  id: z.uuid().optional().describe("既存のストーリーにタスクを足すときのストーリーの id。指定したら title などは使わない"),
  external_id: externalId.optional(),
  title: z.string().trim().min(1).optional().describe("ストーリー名（新規のとき必須）"),
  description: z.string().optional().describe("ストーリーの説明"),
  context: z.string().optional().describe("ストーリーのコンテキスト（Markdown）"),
  start_date: z.iso.date().optional().describe("開始日（YYYY-MM-DD）"),
  due_date: z.iso.date().optional().describe("期限（YYYY-MM-DD）"),
  status: z
    .enum(["planning", "todo"])
    .optional()
    .describe("新規のストーリーの状態。planning は計画中（バックログに置く着手前のもの）、todo は未着手。既定は todo"),
  tasks: z.array(planTask).optional().describe("ストーリー配下に作るタスク"),
});

// list_projects / create_project で返すプロジェクトの列。org は組織プロジェクトの組織（個人なら null）。
const PROJECT_COLUMNS = "id, name, description, url, repository_url, org:org_id(id, slug, name)";

type ProjectRow = {
  id: string;
  name: string;
  description: string | null;
  url: string | null;
  repository_url: string | null;
  org: { id: string; slug: string; name: string } | null;
};

// 所有者の種別（user 個人 / org 組織）を足し、org を最後に並べる。
function withOwnerType({ org, ...project }: ProjectRow) {
  return { ...project, owner_type: org ? "org" : "user", org };
}

// get_task_context で返すタスク・親ストーリー・プロジェクトの列。親とプロジェクトは外部キーの列名で埋め込む。
// supabase-js が select の文字列から型を推論するので、連結せず1つのリテラルにする。
const TASK_CONTEXT_COLUMNS = `id, level, title, description, status, assignee_type, assignee_client_id, start_date, due_date, metadata, created_at, updated_at, completed_at, closed_at,
  story:parent_id(id, title, description, status, context), project:project_id(id, name, description, url, repository_url)`;

// get_next_task の候補の列。並べ替えに使う sort_order / created_at も取る。
const NEXT_TASK_COLUMNS = `id, title, description, status, assignee_type, assignee_client_id, start_date, due_date, sort_order,
  story:parent_id!inner(id, title, status, sort_order), project:project_id(id, name, url, repository_url, created_at)`;

type NextTaskRow = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  assignee_type: "human" | "ai" | null;
  assignee_client_id: string | null;
  start_date: string | null;
  due_date: string | null;
  sort_order: number;
  story: { id: string; title: string; status: string; sort_order: number };
  project: { id: string; name: string; url: string | null; repository_url: string | null; created_at: string };
};

// start_task / request_task_review / complete_task で返すタスクの列。
const TASK_STATUS_COLUMNS = "id, title, status, updated_at, completed_at, closed_at";

type TaskStatusRow = {
  id: string;
  title: string;
  status: "todo" | "in_progress" | "in_review" | "done" | "closed";
  updated_at: string;
  completed_at: string | null;
  closed_at: string | null;
};

// 状態を変える前にタスクを引く。見つからない（他人のものを含む）タスクとストーリーの id は get_task_context と同じく isError。
async function findTask(
  db: SupabaseClient,
  task_id: string,
  storyHint = "タスクの id を指定してください",
): Promise<{ task: TaskStatusRow } | { error: CallToolResult }> {
  const { data, error } = await db.from("tasks").select(`${TASK_STATUS_COLUMNS}, level`).eq("id", task_id).maybeSingle();
  if (error) return { error: restError(error) };
  if (!data) return { error: toolError(`タスクが見つかりません: ${task_id}`) };
  if (data.level === "story") return { error: toolError(`ストーリーの id です。${storyHint}: ${task_id}`) };
  const { level: _level, ...task } = data;
  return { task: task as TaskStatusRow };
}

// from の状態のときだけ更新する。引いたあとに別の操作で状態が変わっていたら 0 行になる。
async function updateStatus(
  db: SupabaseClient,
  task_id: string,
  from: TaskStatusRow["status"][],
  to: TaskStatusRow["status"],
): Promise<{ task: TaskStatusRow } | { error: CallToolResult }> {
  const { data, error } = await db.from("tasks").update({ status: to }).eq("id", task_id).in("status", from).select(TASK_STATUS_COLUMNS);
  if (error) return { error: restError(error) };
  if (data.length === 0) return { error: toolError(`タスクの状態が変わったため更新できませんでした。get_task_context で状態を確かめてください: ${task_id}`) };
  return { task: data[0] as TaskStatusRow };
}

// update_story で返すストーリーの列。
const STORY_COLUMNS = "id, title, description, context, status, start_date, due_date";

// update_task で返すタスクの列。
const TASK_COLUMNS = "id, title, description, status, assignee_type, assignee_client_id, start_date, due_date";

// find_items で返す件数の上限。超えたら truncated: true を付ける。
const FIND_ITEMS_LIMIT = 20;

// REST は1回に返す行数に上限（Supabase の max_rows、既定 1000）があるので、range で分けて全部取る。
const PAGE_SIZE = 1000;

type FindProjectRow = { id: string; name: string; created_at: string };
type FindTaskRow = { id: string; project_id: string; parent_id: string | null; level: "story" | "task"; title: string; status: string; sort_order: number };

// list_stories で返すストーリーの列と、タスク数を数えるためのタスクの列。
type ListStoryRow = { id: string; title: string; description: string | null; status: string; start_date: string | null; due_date: string | null };
type ListTaskRow = { parent_id: string; status: string };

// get_story で返すストーリーの列と配下のタスクの列。
const GET_STORY_COLUMNS = "id, project_id, level, title, description, context, status, start_date, due_date";
const STORY_TASK_COLUMNS = "id, title, description, status, assignee_type, assignee_client_id, start_date, due_date";

type StoryTaskRow = { assignee_client_id: string | null };

// eq は等価条件（列 → 値）で、全部を満たす行だけ取る。
async function selectAll<T>(db: SupabaseClient, table: string, columns: string, order: string, eq: Record<string, string> = {}) {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    let query = db.from(table).select(columns);
    for (const [column, value] of Object.entries(eq)) query = query.eq(column, value);
    const { data, error } = await query.order(order, { ascending: true }).order("id").range(from, from + PAGE_SIZE - 1);
    if (error) return { rows, error };
    rows.push(...(data as T[]));
    if (data.length < PAGE_SIZE) return { rows, error: null };
  }
}

// clientId は呼び出したエージェント（OAuth の client_id）、ownerId はその持ち主の人（DB の current_owner_id() と同じ）。
export function registerTools(server: McpServer, db: SupabaseClient, clientId: string, ownerId: string): void {
  // 参照ツールのタスクに、呼び出したエージェント自身の担当かを足す。
  const withAssignedToMe = <T extends { assignee_client_id: string | null }>(task: T) => ({
    ...task,
    assigned_to_me: task.assignee_client_id === clientId,
  });

  server.registerTool(
    "list_projects",
    {
      title: "プロジェクトの一覧",
      description:
        "自分のプロジェクト（個人のプロジェクトと、メンバーになっている組織のプロジェクト）の id, name, description, url, repository_url, " +
        "owner_type（user 個人 / org 組織）, org（組織プロジェクトなら { id, slug, name }、個人なら null）を作成順に返す。url / repository_url は未登録なら null",
    },
    async () => {
      const { data, error } = await db
        .from("projects")
        .select(PROJECT_COLUMNS)
        .order("created_at", { ascending: true });
      if (error) return restError(error);
      return json((data as unknown as ProjectRow[]).map(withOwnerType));
    },
  );

  server.registerTool(
    "create_project",
    {
      title: "プロジェクトの作成",
      description:
        "プロジェクトを作り、作ったプロジェクトを list_projects と同じ形で返す。org を省略したら個人のプロジェクトで、持ち主は自分（AI なら持ち主の人）になる。" +
        "org に組織の slug を渡したら、その組織のプロジェクトになる（メンバーになっている組織だけ）。" +
        "同じ名前のプロジェクトがあっても作るので、作る前に list_projects で重複を確かめる",
      inputSchema: {
        name: z.string().trim().min(1).describe("プロジェクト名"),
        description: z.string().optional().describe("プロジェクトの説明"),
        url: z.url().optional().describe("デプロイ先などの URL"),
        repository_url: z.url().optional().describe("GitHub などのリポジトリ URL"),
        org: z.string().trim().min(1).optional().describe("組織の slug（list_projects の org.slug）。省略したら個人のプロジェクト"),
      },
    },
    async ({ org, ...fields }) => {
      const row: Record<string, unknown> = { ...fields };
      if (org !== undefined) {
        // organizations はメンバー（と作った人）にしか見えないので、見つからなければメンバーではない。
        const { data: found, error: orgError } = await db.from("organizations").select("id").eq("slug", org).maybeSingle();
        if (orgError) return restError(orgError);
        if (!found) return toolError(`組織が見つかりません（メンバーになっている組織の slug を指定してください）: ${org}`);
        row.org_id = found.id;
      }
      // owner_id は送らず、DB の既定値 current_owner_id() に任せる（AI の JWT なら持ち主の人の id になる）。
      // org_id を渡したときは、トリガ（0043）が owner_id を null にする。
      const { data, error } = await db.from("projects").insert(row).select(PROJECT_COLUMNS).single();
      if (error) return restError(error);
      return json(withOwnerType(data as unknown as ProjectRow));
    },
  );

  server.registerTool(
    "list_members",
    {
      title: "担当にできる人の一覧",
      description:
        "プロジェクトのタスクの担当にできる人を返す。返り値は [{ user_id, display_name, role, is_me }]。" +
        "個人のプロジェクトは持ち主1人（role は owner）、組織のプロジェクトは組織のメンバー全員（role は owner / member）で、自分（is_me: true）を先頭に並べる。" +
        "user_id を create_plan の tasks[].assignee_user_id や update_task の assignee_user_id に渡す。display_name はプロフィール未設定なら null",
      inputSchema: { project_id: z.uuid().describe("プロジェクトの id（list_projects で取る）") },
    },
    async ({ project_id }) => {
      const { data: project, error: projectError } = await db.from("projects").select("id, owner_id, org_id").eq("id", project_id).maybeSingle();
      if (projectError) return restError(projectError);
      if (!project) return toolError(`プロジェクトが見つかりません: ${project_id}`);

      let members: { user_id: string; role: string }[];
      if (project.org_id) {
        const { data, error } = await db
          .from("organization_members")
          .select("user_id, role")
          .eq("org_id", project.org_id)
          .order("created_at", { ascending: true });
        if (error) return restError(error);
        members = data;
      } else {
        members = [{ user_id: project.owner_id as string, role: "owner" }];
      }

      // profiles は本人と同じ組織のメンバーの行が読める（0042）。organization_members とは FK が無いので別に引く。
      const { data: profiles, error: profileError } = await db
        .from("profiles")
        .select("user_id, display_name")
        .in("user_id", members.map((m) => m.user_id));
      if (profileError) return restError(profileError);
      const nameById = new Map((profiles as { user_id: string; display_name: string | null }[]).map((p) => [p.user_id, p.display_name]));

      const rows = members.map((m) => ({ user_id: m.user_id, display_name: nameById.get(m.user_id) ?? null, role: m.role, is_me: m.user_id === ownerId }));
      // 自分を先頭に。ほかは参加順のまま（sort は安定）。
      rows.sort((a, b) => Number(b.is_me) - Number(a.is_me));
      return json(rows);
    },
  );

  server.registerTool(
    "export_project",
    {
      title: "プロジェクトの全体の取得",
      description:
        "プロジェクトと、配下のストーリー（context・status・期間・progress 込み）とタスクを入れ子の JSON で返す" +
        "（format task-branch/project、version 4。画面のエクスポートと同じ形）。プロジェクト全体の書き出し用。" +
        "大きいので、計画の現状把握は list_stories と get_story を使う。コメントは含まない（get_task_context で取る）",
      inputSchema: { project_id: z.uuid().describe("プロジェクトの id（list_projects で取る）") },
    },
    async ({ project_id }) => {
      const { data, error } = await db.rpc("export_project", { project: project_id });
      if (error) return restError(error);
      // 他人のプロジェクトや存在しない id は RLS で見えず、RPC が null を返す。
      if (data === null) return toolError(`プロジェクトが見つかりません: ${project_id}`);
      // 着手前はストーリーのステータス（planning）で表すので、RPC が返す activated_at は MCP からは返さない。
      const exported = data as { stories?: Record<string, unknown>[] };
      for (const s of exported.stories ?? []) delete s.activated_at;
      return json(exported);
    },
  );

  server.registerTool(
    "list_stories",
    {
      title: "ストーリーの一覧",
      description:
        "プロジェクトのストーリーを並び順で一覧にする。計画の現状把握はまずこれ。中身（context と配下タスク）は get_story で取る。" +
        "返り値は { project: { id, name }, stories }。stories の各要素は id / title / description / " +
        "status（planning 計画中 / todo 未着手 / in_progress 進行中 / done 完了 / closed クローズ）/ " +
        "start_date / due_date / progress（0〜1）/ task_count（配下タスク数）/ done_count（done と closed の数）",
      inputSchema: { project_id: z.uuid().describe("プロジェクトの id（list_projects で取る）") },
    },
    async ({ project_id }) => {
      const { data: project, error: projectError } = await db.from("projects").select("id, name").eq("id", project_id).maybeSingle();
      if (projectError) return restError(projectError);
      if (!project) return toolError(`プロジェクトが見つかりません: ${project_id}`);

      const stories = await selectAll<ListStoryRow>(db, "tasks", "id, title, description, status, start_date, due_date", "sort_order", {
        project_id,
        level: "story",
      });
      if (stories.error) return restError(stories.error);
      const tasks = await selectAll<ListTaskRow>(db, "tasks", "parent_id, status", "sort_order", { project_id, level: "task" });
      if (tasks.error) return restError(tasks.error);
      const { data: progress, error: progressError } = await db.rpc("get_progress", { project: project_id });
      if (progressError) return restError(progressError);

      const progressById = new Map((progress as { id: string; progress: number }[]).map((p) => [p.id, Number(p.progress)]));
      const counts = new Map<string, { task_count: number; done_count: number }>();
      for (const t of tasks.rows) {
        const c = counts.get(t.parent_id) ?? { task_count: 0, done_count: 0 };
        c.task_count++;
        if (t.status === "done" || t.status === "closed") c.done_count++;
        counts.set(t.parent_id, c);
      }

      return json({
        project,
        stories: stories.rows.map((s) => ({
          id: s.id,
          title: s.title,
          description: s.description,
          status: s.status,
          start_date: s.start_date,
          due_date: s.due_date,
          progress: progressById.get(s.id) ?? 0,
          ...(counts.get(s.id) ?? { task_count: 0, done_count: 0 }),
        })),
      });
    },
  );

  server.registerTool(
    "get_story",
    {
      title: "ストーリーの中身の取得",
      description:
        "ストーリー1件のコンテキストと配下のタスクを返す。list_stories で一覧を見て、中身が要るストーリーだけこれで読む。" +
        "返り値は { story, project: { id, name }, tasks }。story は id / title / description / context / " +
        "status（planning 計画中 / todo 未着手 / in_progress 進行中 / done 完了 / closed クローズ）/ start_date / due_date / progress（0〜1）。tasks は並び順で id / title / description / status / assignee_type / " +
        "assignee_client_id（担当のエージェント）/ assigned_to_me（呼び出したエージェント自身の担当か）/ start_date / due_date。" +
        "コメントは含まない（get_task_context で取る）",
      inputSchema: { story_id: z.uuid().describe("ストーリーの id（タスクは不可）") },
    },
    async ({ story_id }) => {
      const { data: story, error: storyError } = await db.from("tasks").select(GET_STORY_COLUMNS).eq("id", story_id).maybeSingle();
      if (storyError) return restError(storyError);
      if (!story) return toolError(`ストーリーが見つかりません: ${story_id}`);
      if (story.level === "task") return toolError(`タスクの id です。ストーリーの id を指定してください: ${story_id}`);

      const { data: project, error: projectError } = await db.from("projects").select("id, name").eq("id", story.project_id).single();
      if (projectError) return restError(projectError);
      const tasks = await selectAll<StoryTaskRow>(db, "tasks", STORY_TASK_COLUMNS, "sort_order", { parent_id: story_id, level: "task" });
      if (tasks.error) return restError(tasks.error);
      const { data: progress, error: progressError } = await db.rpc("get_progress", { project: story.project_id });
      if (progressError) return restError(progressError);

      const storyProgress = (progress as { id: string; progress: number }[]).find((p) => p.id === story_id)?.progress;
      return json({
        story: {
          id: story.id,
          title: story.title,
          description: story.description,
          context: story.context,
          status: story.status,
          start_date: story.start_date,
          due_date: story.due_date,
          progress: Number(storyProgress ?? 0),
        },
        project,
        tasks: tasks.rows.map(withAssignedToMe),
      });
    },
  );

  server.registerTool(
    "find_items",
    {
      title: "プロジェクト・ストーリー・タスクの検索",
      description:
        "自分のプロジェクト・ストーリー・タスクを横断で探す。query は短縮 ID（id の先頭数桁。前方一致）か名前の一部（部分一致、大文字小文字を区別しない）。" +
        "完全な uuid を渡したらその1件だけ返す。返り値は { items, truncated }。items の各要素は kind / id / title（プロジェクトは name）/ status（プロジェクトは無し）と、" +
        `親の story（id, title）・project（id, name）。並びはプロジェクト → ストーリー → タスクで、${FIND_ITEMS_LIMIT} 件を超えたら先頭だけ返して truncated: true。見つからなければ items は空`,
      inputSchema: {
        query: z.string().trim().min(1).describe("短縮 ID（id の先頭数桁）か、名前の一部"),
        kind: z.enum(["project", "story", "task"]).optional().describe("種類で絞り込む。省略したらすべて"),
      },
    },
    async ({ query, kind }) => {
      // uuid は PostgREST で前方一致できないので、自分の行を RLS の下で全部取って関数の中で絞り込む。
      const projects = await selectAll<FindProjectRow>(db, "projects", "id, name, created_at", "created_at");
      if (projects.error) return restError(projects.error);
      const tasks = kind === "project" ? { rows: [], error: null } : await selectAll<FindTaskRow>(db, "tasks", "id, project_id, parent_id, level, title, status, sort_order", "sort_order");
      if (tasks.error) return restError(tasks.error);

      const q = query.toLowerCase();
      const exact = z.uuid().safeParse(q).success;
      const matches = (id: string, name: string) => (exact ? id === q : id.startsWith(q) || name.toLowerCase().includes(q));

      const projectById = new Map(projects.rows.map((p) => [p.id, p]));
      const projectOrder = new Map(projects.rows.map((p, i) => [p.id, i]));
      const storyById = new Map(tasks.rows.filter((t) => t.level === "story").map((t) => [t.id, t]));
      const byOrder = (a: FindTaskRow, b: FindTaskRow) => projectOrder.get(a.project_id)! - projectOrder.get(b.project_id)! || a.sort_order - b.sort_order;
      const project = (id: string) => ({ id, name: projectById.get(id)!.name });

      const items = [
        ...(kind && kind !== "project" ? [] : projects.rows.filter((p) => matches(p.id, p.name)).map((p) => ({ kind: "project", id: p.id, name: p.name }))),
        ...(kind && kind !== "story"
          ? []
          : [...storyById.values()]
              .filter((s) => matches(s.id, s.title))
              .sort(byOrder)
              .map((s) => ({ kind: "story", id: s.id, title: s.title, status: s.status, project: project(s.project_id) }))),
        ...(kind && kind !== "task"
          ? []
          : tasks.rows
              .filter((t) => t.level === "task" && matches(t.id, t.title))
              // タスクの sort_order はストーリーごとの連番なので、ストーリーの並び → タスクの並びで並べる。
              .sort((a, b) => byOrder(storyById.get(a.parent_id!)!, storyById.get(b.parent_id!)!) || a.sort_order - b.sort_order)
              .map((t) => {
                const story = storyById.get(t.parent_id!)!;
                return { kind: "task", id: t.id, title: t.title, status: t.status, story: { id: story.id, title: story.title }, project: project(t.project_id) };
              })),
      ];
      return json({ items: items.slice(0, FIND_ITEMS_LIMIT), truncated: items.length > FIND_ITEMS_LIMIT });
    },
  );

  server.registerTool(
    "create_plan",
    {
      title: "ストーリーとタスクの一括登録",
      description:
        "プロジェクトにストーリーとその配下のタスクをまとめて登録する。既存のストーリーにタスクを足すときは stories[].id を指定する。" +
        "external_id が同じプロジェクトの既存の行と一致したら作らず（担当者も書き換えない）、その id を created: false で返すので、失敗したら同じ入力で呼び直してよい。" +
        "新規のストーリーは stories[].status（planning 計画中 / todo 未着手。既定は todo）、新規のタスクは status todo で、既存の末尾に並ぶ。" +
        "tasks[].assignee の user は呼び出した AI の持ち主（本人）。ほかのメンバーを担当にするときは tasks[].assignee_user_id（list_members の user_id）を渡す。" +
        "assignee と assignee_user_id を両方省略したら未割り当てになる",
      inputSchema: {
        project_id: z.uuid().describe("プロジェクトの id（list_projects で取る）"),
        stories: z.array(planStory).min(1).describe("登録するストーリー（配下のタスクを含む）"),
      },
    },
    async ({ project_id, stories }) => {
      // 登録の処理は RPC create_plan（0038_create_plan.sql）に一本化している。1 トランザクションで、
      // 入力の誤りは errcode 22023 の日本語のメッセージで返る。
      const { data, error } = await db.rpc("create_plan", { project: project_id, stories });
      if (error) return error.code === "22023" ? toolError(error.message) : restError(error);
      return json(data);
    },
  );

  server.registerTool(
    "update_story",
    {
      title: "ストーリーの更新",
      description:
        "ストーリーの名前・説明・コンテキスト・期間・状態を更新し、更新後のストーリーを返す。渡した項目だけ書き換える。" +
        "context を書き換えると、ストーリー詳細に AI が更新した版として履歴が残る。" +
        "status の planning（計画中）はストーリーだけの状態で、着手前のもの（バックログに置いておくもの）を表す。in_review はタスクだけなので渡せない。" +
        "期間を変えても配下のタスクの期間は変わらない",
      inputSchema: {
        story_id: z.uuid().describe("ストーリーの id（タスクは不可）"),
        title: z.string().trim().min(1).optional().describe("ストーリー名"),
        description: z.string().optional().describe("ストーリーの説明（置き換え）"),
        context: z.string().optional().describe("ストーリーのコンテキスト（Markdown。置き換え）"),
        start_date: z.iso.date().optional().describe("開始日（YYYY-MM-DD）"),
        due_date: z.iso.date().optional().describe("期限（YYYY-MM-DD）"),
        status: z
          .enum(["planning", "todo", "in_progress", "done", "closed"])
          .optional()
          .describe("状態（planning 計画中 / todo 未着手 / in_progress 進行中 / done 完了 / closed クローズ）"),
      },
    },
    async ({ story_id, ...fields }) => {
      if (Object.values(fields).every((v) => v === undefined)) {
        return toolError("更新する項目がありません。title / description / context / start_date / due_date / status のどれかを渡してください");
      }

      const { data: story, error: storyError } = await db.from("tasks").select(`${STORY_COLUMNS}, level`).eq("id", story_id).maybeSingle();
      if (storyError) return restError(storyError);
      if (!story) return toolError(`ストーリーが見つかりません: ${story_id}`);
      if (story.level === "task") return toolError(`タスクの id です。ストーリーの id を指定してください: ${story_id}`);

      const patch: Record<string, unknown> = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined));
      const { level: _level, ...current } = story;
      if (Object.keys(patch).length === 0) return json(current);

      // context の版はトリガが story_context_revisions に残す（編集者は AI になる）。
      const { data, error } = await db.from("tasks").update(patch).eq("id", story_id).select(STORY_COLUMNS);
      if (error) return restError(error);
      if (data.length === 0) return toolError(`ストーリーを更新できませんでした: ${story_id}`);
      return json(data[0]);
    },
  );

  server.registerTool(
    "update_task",
    {
      title: "タスクの更新",
      description:
        "タスクの名前・説明・期間・担当者を更新し、更新後のタスクを返す。渡した項目だけ書き換える。" +
        "description は置き換えなので、追記するときは get_task_context で今の説明を取り、末尾に足して渡す。" +
        "assignee の user は呼び出した AI の持ち主（本人）、ai は呼び出したエージェントの担当にする（別のエージェントは指定できない）。" +
        "組織プロジェクトでほかのメンバーを担当にするときは assignee_user_id（list_members の user_id）を渡す（assignee と同時には指定できない）。" +
        "状態は変えない（着手は start_task、レビュー依頼は request_task_review、完了は complete_task）",
      inputSchema: {
        task_id: z.uuid().describe("タスクの id（ストーリーは不可）"),
        title: z.string().trim().min(1).optional().describe("タスク名"),
        description: z.string().optional().describe("タスクの説明（Markdown。置き換え）"),
        start_date: z.iso.date().optional().describe("開始日（YYYY-MM-DD）"),
        due_date: z.iso.date().optional().describe("期限（YYYY-MM-DD）"),
        assignee: assigneeInput.optional(),
        assignee_user_id: assigneeUserIdInput.optional(),
      },
    },
    async ({ task_id, assignee, assignee_user_id, ...fields }) => {
      const patch: Record<string, unknown> = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined));
      if (assignee !== undefined && assignee_user_id !== undefined) {
        return toolError("assignee と assignee_user_id は同時に指定できません");
      }
      if (assignee === undefined && assignee_user_id === undefined && Object.keys(patch).length === 0) {
        return toolError("更新する項目がありません。title / description / start_date / due_date / assignee / assignee_user_id のどれかを渡してください");
      }

      const found = await findTask(db, task_id, "update_story を使ってください");
      if ("error" in found) return found.error;

      // 担当にできる人かは DB のトリガ check_task_assignee（0045）が確かめる。
      if (assignee !== undefined) Object.assign(patch, assigneeColumns(assignee, ownerId, clientId));
      if (assignee_user_id !== undefined) Object.assign(patch, { assignee_type: "human", assignee_id: assignee_user_id, assignee_client_id: null });

      const { data, error } = await db.from("tasks").update(patch).eq("id", task_id).select(TASK_COLUMNS);
      if (error) return assigneeError(error) ?? restError(error);
      if (data.length === 0) return toolError(`タスクを更新できませんでした: ${task_id}`);
      return json(data[0]);
    },
  );

  server.registerTool(
    "move_task",
    {
      title: "タスクのストーリー移動",
      description:
        "タスクを同じプロジェクトの別のストーリーへ移し、{ task, from_story: { id, title }, to_story: { id, title } } を返す。" +
        "移動先のタスクの末尾に並ぶ。ステータス・担当・期間は変えない。移せるのは同じプロジェクトのストーリーだけ。" +
        "移動は操作履歴（タイムラインの「ストーリーを移動」）に記録される",
      inputSchema: {
        task_id: z.uuid().describe("移すタスクの id（ストーリーは不可）"),
        story_id: z.uuid().describe("移動先のストーリーの id（タスクは不可）"),
      },
    },
    async ({ task_id, story_id }) => {
      const found = await findTask(db, task_id, "ストーリーは移せません。タスクの id を指定してください");
      if ("error" in found) return found.error;

      const { data: task, error: taskError } = await db.from("tasks").select("project_id, parent_id").eq("id", task_id).single();
      if (taskError) return restError(taskError);
      const { data: target, error: targetError } = await db.from("tasks").select("id, project_id, level, title").eq("id", story_id).maybeSingle();
      if (targetError) return restError(targetError);
      if (!target) return toolError(`ストーリーが見つかりません: ${story_id}`);
      if (target.level === "task") return toolError(`タスクの id です。ストーリーの id を指定してください: ${story_id}`);
      if (target.project_id !== task.project_id) return toolError(`同じプロジェクトのストーリーにだけ移せます: ${story_id}`);
      if (task.parent_id === story_id) return toolError(`すでにそのストーリーにあります: ${story_id}`);

      const { data: from, error: fromError } = await db.from("tasks").select("id, title").eq("id", task.parent_id).single();
      if (fromError) return restError(fromError);

      // 画面の moveTaskToStory と同じく、移動先の末尾（最大の sort_order + 1）に並べる。階層の最終確認は DB のトリガ check_task_hierarchy。
      const { data: last, error: lastError } = await db
        .from("tasks")
        .select("sort_order")
        .eq("parent_id", story_id)
        .eq("level", "task")
        .order("sort_order", { ascending: false })
        .limit(1);
      if (lastError) return restError(lastError);
      const sort_order = ((last[0]?.sort_order as number | undefined) ?? 0) + 1;

      const { data, error } = await db.from("tasks").update({ parent_id: story_id, sort_order }).eq("id", task_id).select(TASK_COLUMNS);
      if (error) return restError(error);
      if (data.length === 0) return toolError(`タスクを移動できませんでした: ${task_id}`);
      return json({ task: data[0], from_story: from, to_story: { id: target.id, title: target.title } });
    },
  );

  server.registerTool(
    "list_task_comments",
    {
      title: "タスクのコメントの一覧",
      description:
        "タスクのコメント（人と AI の作業メモ・確認したこと・申し送り）を古い順に返す。作業を始める前に経緯を確かめるのに使う。" +
        "author_type は human / ai。editable が true のもの（AI のコメント）だけ AI が編集・削除できる",
      inputSchema: { task_id: z.uuid().describe("タスクの id（ストーリーは不可）") },
    },
    async ({ task_id }) => {
      // 見つからないタスクを空配列と区別するため、先にタスクを引く（他人のものは RLS で見えない）。
      const { data: task, error: taskError } = await db.from("tasks").select("id, level").eq("id", task_id).maybeSingle();
      if (taskError) return restError(taskError);
      if (!task) return toolError(`タスクが見つかりません: ${task_id}`);
      if (task.level === "story") return toolError(`ストーリーにはコメントを付けられません。タスクの id を指定してください: ${task_id}`);

      const { data, error } = await db
        .from("task_comments")
        .select(COMMENT_COLUMNS)
        .eq("task_id", task_id)
        .order("created_at", { ascending: true });
      if (error) return restError(error);
      return json((data as CommentRow[]).map(withEditable));
    },
  );

  server.registerTool(
    "get_task_context",
    {
      title: "タスクの文脈の取得",
      description:
        "タスクの中身と、親ストーリー（context はストーリーのドキュメントで、決定事項などの正の情報）、プロジェクト、" +
        "コメント（過去の作業メモ・申し送り。list_task_comments と同じ形で古い順）をまとめて返す。作業を始める前に使う。" +
        "task の assignee_client_id は担当のエージェント、assigned_to_me は呼び出したエージェント自身の担当か",
      inputSchema: { task_id: z.uuid().describe("タスクの id（ストーリーは不可）") },
    },
    async ({ task_id }) => {
      const { data: task, error: taskError } = await db.from("tasks").select(TASK_CONTEXT_COLUMNS).eq("id", task_id).maybeSingle();
      if (taskError) return restError(taskError);
      if (!task) return toolError(`タスクが見つかりません: ${task_id}`);
      if (task.level === "story") return toolError(`ストーリーの id です。タスクの id を指定してください: ${task_id}`);

      const { data: comments, error } = await db
        .from("task_comments")
        .select(COMMENT_COLUMNS)
        .eq("task_id", task_id)
        .order("created_at", { ascending: true });
      if (error) return restError(error);

      const { level: _level, story, project, ...rest } = task;
      return json({ task: withAssignedToMe(rest), story, project, comments: (comments as CommentRow[]).map(withEditable) });
    },
  );

  server.registerTool(
    "get_next_task",
    {
      title: "次に着手するタスクの取得",
      description:
        "次に着手するタスクを1件返す。候補は進行中のストーリー配下で status が todo のタスク（カンバンに出ている範囲）のうち、" +
        "呼び出したエージェントの担当と、担当が未割り当て・AI（未指定）のもの。人の担当と別のエージェントの担当は返さない。" +
        "呼び出したエージェントの担当を優先し、その中の並びはプロジェクトの作成順 → ストーリーの並び → タスクの並びで、先頭を返す。状態は変えない。候補が無ければ task は null。" +
        "タスク間の依存関係はまだ見ない。task の assignee_client_id は担当のエージェント、assigned_to_me は呼び出したエージェント自身の担当か",
      inputSchema: {
        project_id: z.uuid().optional().describe("プロジェクトの id（list_projects で取る）。省略したら自分のすべてのプロジェクトから選ぶ"),
      },
    },
    async ({ project_id }) => {
      // 親ストーリーの status で絞るため、ストーリーは !inner で埋め込む。
      let query = db
        .from("tasks")
        .select(NEXT_TASK_COLUMNS)
        .eq("level", "task")
        .eq("status", "todo")
        .or("assignee_type.is.null,assignee_type.neq.human")
        .or(`assignee_client_id.is.null,assignee_client_id.eq."${clientId}"`)
        .eq("story.status", "in_progress");
      if (project_id) query = query.eq("project_id", project_id);
      const { data, error } = await query;
      if (error) return restError(error);

      // 埋め込んだ列では並べられないので、ここで並べる（自分の担当を先に、その中はカンバンと同じ並び）。
      const priority = (row: NextTaskRow) => (row.assignee_client_id === clientId ? 0 : 1);
      const rows = (data as unknown as NextTaskRow[]).sort(
        (a, b) =>
          priority(a) - priority(b) ||
          a.project.created_at.localeCompare(b.project.created_at) ||
          a.story.sort_order - b.story.sort_order ||
          a.sort_order - b.sort_order,
      );
      const next = rows[0];
      if (!next) return json({ task: null, message: "着手できるタスクがありません（進行中のストーリー配下に、未着手で人や別のエージェントの担当でないタスクがない）" });

      const { story, project, sort_order: _sortOrder, ...task } = next;
      const { created_at: _createdAt, ...projectFields } = project;
      return json({ task: withAssignedToMe(task), story: { id: story.id, title: story.title }, project: projectFields });
    },
  );

  server.registerTool(
    "start_task",
    {
      title: "タスクの着手",
      description:
        "タスクを進行中（in_progress）にして、更新後のタスクを返す。作業を始めるときと、" +
        "レビュー中（in_review）のタスクをレビューの指摘の対応で進行中に戻すときに使う。" +
        "すでに進行中なら何も変えずに返すので、呼び直してよい。完了（done / closed）のタスクは着手できない",
      inputSchema: { task_id: z.uuid().describe("タスクの id（ストーリーは不可）") },
    },
    async ({ task_id }) => {
      const found = await findTask(db, task_id);
      if ("error" in found) return found.error;
      if (found.task.status === "in_progress") return json(found.task);
      if (found.task.status !== "todo" && found.task.status !== "in_review") {
        return toolError(`完了したタスクは着手できません（status: ${found.task.status}）: ${task_id}`);
      }

      const updated = await updateStatus(db, task_id, ["todo", "in_review"], "in_progress");
      if ("error" in updated) return updated.error;
      return json(updated.task);
    },
  );

  // 状態を変えたあとで作業結果をコメントとして投稿し、{ task, comment } を返す（request_task_review / complete_task）。
  async function postResult(task: TaskStatusRow, result: string): Promise<CallToolResult> {
    const { data, error } = await db.from("task_comments").insert({ task_id: task.id, body: result }).select(COMMENT_COLUMNS).single();
    if (error) {
      return toolError(
        `タスクは ${task.status} になりましたが、作業結果のコメントを投稿できませんでした。add_task_comment で記録し直してください。` +
          `Supabase のエラー: ${error.message}${error.code ? ` (${error.code})` : ""}`,
      );
    }
    return json({ task, comment: withEditable(data as CommentRow) });
  }

  server.registerTool(
    "request_task_review",
    {
      title: "タスクのレビュー依頼と作業結果の記録",
      description:
        "タスクをレビュー中（in_review）にし、作業結果を AI のコメントとして投稿する。返り値は { task, comment }。" +
        "PR を作って人のレビュー・マージを待つときに使う（完了にするのは人がマージしたあと）。PR を作らないタスクは complete_task を使う。" +
        "result には、やったこと・確認したこと・PR の URL・次に作業する人への申し送りを書く。" +
        "すでにレビュー中のタスクは、作業結果を二重に記録しないよう isError になる。完了（done / closed）のタスクも isError",
      inputSchema: {
        task_id: z.uuid().describe("タスクの id（ストーリーは不可）"),
        result: z.string().trim().min(1).describe("作業結果（Markdown）。コメントとして残る"),
      },
    },
    async ({ task_id, result }) => {
      const found = await findTask(db, task_id);
      if ("error" in found) return found.error;
      if (found.task.status === "in_review") return toolError(`タスクはすでにレビュー中です: ${task_id}`);
      if (found.task.status === "done" || found.task.status === "closed") {
        return toolError(`タスクはすでに完了しています（status: ${found.task.status}）: ${task_id}`);
      }

      const updated = await updateStatus(db, task_id, ["todo", "in_progress"], "in_review");
      if ("error" in updated) return updated.error;
      return postResult(updated.task, result);
    },
  );

  server.registerTool(
    "complete_task",
    {
      title: "タスクの完了と作業結果の記録",
      description:
        "タスクを完了（done）にし、作業結果を AI のコメントとして投稿する。返り値は { task, comment }。" +
        "未着手・進行中・レビュー中（in_review）のタスクを完了にできる。" +
        "result には、やったこと・確認したこと・次に作業する人への申し送りを書く。" +
        "すでに完了（done / closed）のタスクは、作業結果を二重に記録しないよう isError になる",
      inputSchema: {
        task_id: z.uuid().describe("タスクの id（ストーリーは不可）"),
        result: z.string().trim().min(1).describe("作業結果（Markdown）。コメントとして残る"),
      },
    },
    async ({ task_id, result }) => {
      const found = await findTask(db, task_id);
      if ("error" in found) return found.error;
      if (found.task.status === "done" || found.task.status === "closed") {
        return toolError(`タスクはすでに完了しています（status: ${found.task.status}）: ${task_id}`);
      }

      // completed_at はトリガ（touch_updated_at()）が done にしたときに入れる。
      const updated = await updateStatus(db, task_id, ["todo", "in_progress", "in_review"], "done");
      if ("error" in updated) return updated.error;
      return postResult(updated.task, result);
    },
  );

  server.registerTool(
    "add_task_comment",
    {
      title: "タスクへのコメントの投稿",
      description:
        "タスクにコメントを投稿する。作業メモ、確認したこと、次に作業する人への申し送りを残すのに使う。投稿者は AI（author_type: ai）になる",
      inputSchema: {
        task_id: z.uuid().describe("タスクの id（ストーリーは不可）"),
        body: z.string().trim().min(1).describe("コメントの本文（Markdown）"),
      },
    },
    async ({ task_id, body }) => {
      // author_type / author_id は送らず、DB の既定値（current_actor_type() / current_actor_id()）に任せる。
      const { data, error } = await db.from("task_comments").insert({ task_id, body }).select(COMMENT_COLUMNS).single();
      if (error) return restError(error);
      return json(withEditable(data as CommentRow));
    },
  );

  server.registerTool(
    "update_task_comment",
    {
      title: "タスクのコメントの編集",
      description:
        "AI が書いたコメント（list_task_comments で editable が true のもの）の本文を書き換える。人のコメントは編集できない。更新後のコメントを返す",
      inputSchema: {
        comment_id: z.uuid().describe("コメントの id"),
        body: z.string().trim().min(1).describe("新しい本文（Markdown）"),
      },
    },
    async ({ comment_id, body }) => {
      // updated_at はトリガ check_task_comment() が now() にする。RLS で弾かれた行はエラーにならず 0 行になる。
      const { data, error } = await db.from("task_comments").update({ body }).eq("id", comment_id).select(COMMENT_COLUMNS);
      if (error) return restError(error);
      if (data.length === 0) return toolError(COMMENT_NOT_EDITABLE);
      return json(withEditable(data[0] as CommentRow));
    },
  );

  server.registerTool(
    "delete_task_comment",
    {
      title: "タスクのコメントの削除",
      description:
        "AI が書いたコメント（list_task_comments で editable が true のもの）を削除する。物理削除で元に戻せない。人のコメントは削除できない",
      inputSchema: { comment_id: z.uuid().describe("コメントの id") },
    },
    async ({ comment_id }) => {
      // 画面の deleteTaskComment と同じく、RLS で弾かれた 0 行を失敗として扱う。
      const { data, error } = await db.from("task_comments").delete().eq("id", comment_id).select("id");
      if (error) return restError(error);
      if (data.length === 0) return toolError(COMMENT_NOT_EDITABLE);
      return json({ deleted: data[0].id });
    },
  );

  server.registerTool(
    "create_attachment_upload",
    {
      title: "画像の添付の作成（署名付きアップロード URL の発行）",
      description:
        "タスクかストーリーに画像を添付するため、添付の行を作り、画像を上げる署名付きアップロード URL を返す。" +
        "返り値は { attachment_id, upload_url, token, method, headers, markdown, curl }。" +
        "続けてすぐに、返った upload_url へ curl -X PUT --data-binary @<ファイル> -H 'Content-Type: <mime_type>' で画像を上げ（curl に例がある）、" +
        "成功したら markdown（![名前](attachment:<id>)）を add_task_comment・update_task の description・update_story の context などの本文に入れる。" +
        "画像は png / jpeg / webp / gif だけで 5MB まで（SVG 不可。バケットが PUT のときに拒否する）。同じ添付への上書きはできない。" +
        "持ち主のプロジェクトのタスクだけが対象で、ゲストのユーザーは添付できない。AI は添付を削除できない（上げ損ねた添付は list_attachments で uploaded: false になる）",
      inputSchema: {
        task_id: z.uuid().describe("添付先のタスクかストーリーの id"),
        mime_type: z.enum(ATTACHMENT_MIME_TYPES).describe("画像の種類（image/png / image/jpeg / image/webp / image/gif）。PUT の Content-Type と同じにする"),
        size_bytes: z.number().int().min(1).max(ATTACHMENT_MAX_BYTES).describe(`画像のバイト数（1〜${ATTACHMENT_MAX_BYTES}）`),
        original_name: z.string().max(255).optional().describe("表示用の名前（ファイル名など。255 文字まで）。Markdown の代替テキストになる。省略したら「画像」"),
      },
    },
    async ({ task_id, mime_type, size_bytes, original_name }) => {
      const { data: task, error: taskError } = await db.from("tasks").select("id, project_id").eq("id", task_id).maybeSingle();
      if (taskError) return restError(taskError);
      if (!task) return toolError(`タスクが見つかりません: ${task_id}`);

      const id = crypto.randomUUID();
      const storagePath = attachmentPath(task.project_id as string, id, mime_type);
      const name = originalName(original_name);
      // created_by は送らず、DB の既定値 auth.uid() に任せる（ポリシーが created_by = auth.uid() を求める）。
      const { error: insertError } = await db.from("task_attachments").insert({
        id,
        project_id: task.project_id,
        task_id,
        storage_path: storagePath,
        mime_type,
        size_bytes,
        original_name: name,
      });
      if (insertError) {
        if (insertError.code === "42501") {
          return toolError(
            `添付を作れません（プロジェクトの持ち主ではないか、ゲストのユーザーは添付できません）。Supabase のエラー: ${insertError.message} (42501)`,
          );
        }
        return restError(insertError);
      }

      const { data: upload, error: uploadError } = await db.storage.from(ATTACHMENT_BUCKET).createSignedUploadUrl(storagePath);
      if (uploadError || !upload) {
        return toolError(
          `添付の行（${id}）は作りましたが、アップロード URL を発行できませんでした。ファイルの無い添付として残ります（list_attachments で uploaded: false）。` +
            `Storage のエラー: ${uploadError?.message ?? "不明"}`,
        );
      }

      return json({
        attachment_id: id,
        task_id,
        upload_url: upload.signedUrl,
        token: upload.token,
        method: "PUT",
        headers: { "Content-Type": mime_type },
        markdown: attachmentMarkdown({ id, original_name: name }),
        curl: `curl -sS -X PUT --data-binary @<ファイルのパス> -H ${shellQuote(`Content-Type: ${mime_type}`)} ${shellQuote(upload.signedUrl)}`,
      });
    },
  );

  server.registerTool(
    "list_attachments",
    {
      title: "添付の一覧",
      description:
        "タスクかストーリーの添付画像を新しい順に返す。各要素は id / original_name / mime_type / size_bytes / created_at / markdown / uploaded / signed_url。" +
        `signed_url は画像を読むための署名付き URL（${SIGNED_URL_SECONDS} 秒で切れる。curl などで取得する）。` +
        "uploaded が false の添付は、行だけあってファイルが上がっていない（create_attachment_upload のあと PUT していない・失敗した）もので、signed_url は null。" +
        "見つからない（他人のものを含む）タスクの id は isError",
      inputSchema: { task_id: z.uuid().describe("タスクかストーリーの id") },
    },
    async ({ task_id }) => {
      // 添付が 0 件のタスクと見えないタスクを区別するため、先にタスクを引く。
      const { data: task, error: taskError } = await db.from("tasks").select("id").eq("id", task_id).maybeSingle();
      if (taskError) return restError(taskError);
      if (!task) return toolError(`タスクが見つかりません: ${task_id}`);

      const { data, error } = await db
        .from("task_attachments")
        .select("id, storage_path, original_name, mime_type, size_bytes, created_at")
        .eq("task_id", task_id)
        .order("created_at", { ascending: false })
        .order("id");
      if (error) return restError(error);
      type AttachmentRow = { id: string; storage_path: string; original_name: string | null; mime_type: string; size_bytes: number; created_at: string };
      const rows = (data ?? []) as AttachmentRow[];
      if (rows.length === 0) return json([]);

      // ファイルの無いパスは要素ごとの error になり、signedUrl は null。
      const { data: signed, error: signError } = await db.storage
        .from(ATTACHMENT_BUCKET)
        .createSignedUrls(rows.map((r) => r.storage_path), SIGNED_URL_SECONDS);
      if (signError) return toolError(`署名付き URL を発行できませんでした。Storage のエラー: ${signError.message}`);
      const urlByPath = new Map<string, string>();
      for (const entry of signed ?? []) {
        if (entry.path && !entry.error && entry.signedUrl) urlByPath.set(entry.path, entry.signedUrl);
      }

      return json(
        rows.map(({ storage_path, ...row }) => {
          const url = urlByPath.get(storage_path) ?? null;
          return { ...row, markdown: attachmentMarkdown(row), uploaded: url !== null, signed_url: url };
        }),
      );
    },
  );
}
