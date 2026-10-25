// MCP のツール。後のストーリー（起票・参照、作業進行、コメント）のツールもここに足す。
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { SupabaseClient } from "@supabase/supabase-js";
import * as z from "zod";

function json(value: unknown): CallToolResult {
  return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }] };
}

function toolError(text: string): CallToolResult {
  return { isError: true, content: [{ type: "text", text }] };
}

// REST のエラーは例外にせず、ツールの結果（isError）として AI に返す。
function restError(error: { message: string; code?: string }): CallToolResult {
  return toolError(`Supabase のエラー: ${error.message}${error.code ? ` (${error.code})` : ""}`);
}

// author_id は人と AI が同じ uid で見分けに使えないので返さない。
const COMMENT_COLUMNS = "id, author_type, body, created_at, updated_at";

type CommentRow = { id: string; author_type: "human" | "ai"; body: string; created_at: string; updated_at: string };

// MCP 経由の操作は常に ai なので、編集・削除できるのは AI のコメントだけ（RLS の task_comments_update / delete と同じ条件）。
function withEditable(comment: CommentRow) {
  return { ...comment, editable: comment.author_type === "ai" };
}

const COMMENT_NOT_EDITABLE = "コメントが見つからないか、編集・削除できません（AI が書いたコメントだけが対象）";

const externalId = z.string().trim().min(1).describe("呼び出し側で決める識別子。metadata.external_id に入れ、同じプロジェクトに同じ値があれば作らない");

const planTask = z.object({
  external_id: externalId.optional(),
  title: z.string().trim().min(1).describe("タスク名"),
  description: z.string().optional().describe("タスクの説明（仕様など）"),
  start_date: z.iso.date().optional().describe("開始日（YYYY-MM-DD）"),
  due_date: z.iso.date().optional().describe("期限（YYYY-MM-DD）"),
});

const planStory = z.object({
  id: z.uuid().optional().describe("既存のストーリーにタスクを足すときのストーリーの id。指定したら title などは使わない"),
  external_id: externalId.optional(),
  title: z.string().trim().min(1).optional().describe("ストーリー名（新規のとき必須）"),
  description: z.string().optional().describe("ストーリーの説明"),
  context: z.string().optional().describe("ストーリーのコンテキスト（Markdown）"),
  start_date: z.iso.date().optional().describe("開始日（YYYY-MM-DD）"),
  due_date: z.iso.date().optional().describe("期限（YYYY-MM-DD）"),
  active: z.boolean().optional().describe("true なら着手済み（カンバンに出る）。既定は false（バックログ）"),
  tasks: z.array(planTask).optional().describe("ストーリー配下に作るタスク"),
});

type PlanRow = { id: string; external_id: string | null; title: string; created: boolean };
type ExistingRow = { id: string; project_id: string; level: "story" | "task"; title: string; metadata: { external_id?: string } };

// 末尾の sort_order。無ければ fallback（画面の addRootStory / addChild と同じ並べ方）。
async function lastSortOrder(db: SupabaseClient, column: "project_id" | "parent_id", value: string, level: "story" | "task") {
  const { data, error } = await db
    .from("tasks")
    .select("sort_order")
    .eq(column, value)
    .eq("level", level)
    .order("sort_order", { ascending: false })
    .limit(1);
  return { last: (data?.[0]?.sort_order as number | undefined) ?? null, error };
}

// get_task_context で返すタスク・親ストーリー・プロジェクトの列。親とプロジェクトは外部キーの列名で埋め込む。
// supabase-js が select の文字列から型を推論するので、連結せず1つのリテラルにする。
const TASK_CONTEXT_COLUMNS = `id, level, title, description, status, assignee_type, start_date, due_date, metadata, created_at, updated_at, completed_at, closed_at,
  story:parent_id(id, title, description, status, context), project:project_id(id, name, description)`;

// get_next_task の候補の列。並べ替えに使う sort_order / created_at も取る。
const NEXT_TASK_COLUMNS = `id, title, description, status, assignee_type, start_date, due_date, sort_order,
  story:parent_id!inner(id, title, status, sort_order), project:project_id(id, name, created_at)`;

type NextTaskRow = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  assignee_type: "human" | "ai" | null;
  start_date: string | null;
  due_date: string | null;
  sort_order: number;
  story: { id: string; title: string; status: string; sort_order: number };
  project: { id: string; name: string; created_at: string };
};

// start_task / complete_task で返すタスクの列。
const TASK_STATUS_COLUMNS = "id, title, status, updated_at, completed_at, closed_at";

type TaskStatusRow = { id: string; title: string; status: "todo" | "in_progress" | "done" | "closed"; updated_at: string; completed_at: string | null; closed_at: string | null };

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
const STORY_COLUMNS = "id, title, description, context, status, activated_at, start_date, due_date";

// update_task で返すタスクの列。
const TASK_COLUMNS = "id, title, description, status, start_date, due_date";

// find_items で返す件数の上限。超えたら truncated: true を付ける。
const FIND_ITEMS_LIMIT = 20;

// REST は1回に返す行数に上限（Supabase の max_rows、既定 1000）があるので、range で分けて全部取る。
const PAGE_SIZE = 1000;

type FindProjectRow = { id: string; name: string; created_at: string };
type FindTaskRow = { id: string; project_id: string; parent_id: string | null; level: "story" | "task"; title: string; status: string; sort_order: number };

async function selectAll<T>(db: SupabaseClient, table: string, columns: string, order: string) {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await db.from(table).select(columns).order(order, { ascending: true }).order("id").range(from, from + PAGE_SIZE - 1);
    if (error) return { rows, error };
    rows.push(...(data as T[]));
    if (data.length < PAGE_SIZE) return { rows, error: null };
  }
}

export function registerTools(server: McpServer, db: SupabaseClient): void {
  server.registerTool(
    "list_projects",
    {
      title: "プロジェクトの一覧",
      description: "自分のプロジェクトの id, name, description を作成順に返す",
    },
    async () => {
      const { data, error } = await db
        .from("projects")
        .select("id, name, description")
        .order("created_at", { ascending: true });
      if (error) return restError(error);
      return json(data);
    },
  );

  server.registerTool(
    "export_project",
    {
      title: "プロジェクトの全体の取得",
      description:
        "プロジェクトと、配下のストーリー（context・activated_at・status・期間・progress 込み）とタスクを入れ子の JSON で返す" +
        "（format task-branch/project、version 4。画面のエクスポートと同じ形）。計画の現状把握・タスクの一覧に使う。" +
        "コメントは含まない（get_task_context で取る）",
      inputSchema: { project_id: z.uuid().describe("プロジェクトの id（list_projects で取る）") },
    },
    async ({ project_id }) => {
      const { data, error } = await db.rpc("export_project", { project: project_id });
      if (error) return restError(error);
      // 他人のプロジェクトや存在しない id は RLS で見えず、RPC が null を返す。
      if (data === null) return toolError(`プロジェクトが見つかりません: ${project_id}`);
      return json(data);
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
        "external_id が同じプロジェクトの既存の行と一致したら作らず、その id を created: false で返すので、失敗したら同じ入力で呼び直してよい。" +
        "新規はすべて status todo で、既存の末尾に並ぶ",
      inputSchema: {
        project_id: z.uuid().describe("プロジェクトの id（list_projects で取る）"),
        stories: z.array(planStory).min(1).describe("登録するストーリー（配下のタスクを含む）"),
      },
    },
    async ({ project_id, stories }) => {
      for (const s of stories) {
        if (!s.id && !s.title) return toolError("stories[] には id（既存のストーリー）か title（新規）のどちらかが要ります");
      }

      // 入力の中の external_id の重複は、どちらを正とするか決められないので弾く。
      const inputIds = stories.flatMap((s) => [...(s.id ? [] : [s.external_id]), ...(s.tasks ?? []).map((t) => t.external_id)]);
      const externalIds = inputIds.filter((v): v is string => v !== undefined);
      const duplicated = externalIds.filter((v, i) => externalIds.indexOf(v) !== i);
      if (duplicated.length > 0) return toolError(`external_id が入力の中で重複しています: ${[...new Set(duplicated)].join(", ")}`);

      const { data: project, error: projectError } = await db.from("projects").select("id").eq("id", project_id).maybeSingle();
      if (projectError) return restError(projectError);
      if (!project) return toolError(`プロジェクトが見つかりません: ${project_id}`);

      const columns = "id, project_id, level, title, metadata";
      const byExternalId = new Map<string, ExistingRow>();
      if (externalIds.length > 0) {
        const { data, error } = await db
          .from("tasks")
          .select(columns)
          .eq("project_id", project_id)
          .in("metadata->>external_id", externalIds);
        if (error) return restError(error);
        for (const row of data as ExistingRow[]) byExternalId.set(row.metadata.external_id!, row);
      }

      const storyIds = stories.flatMap((s) => (s.id ? [s.id] : []));
      const byId = new Map<string, ExistingRow>();
      if (storyIds.length > 0) {
        const { data, error } = await db.from("tasks").select(columns).in("id", storyIds);
        if (error) return restError(error);
        for (const row of data as ExistingRow[]) byId.set(row.id, row);
      }

      // 既存の行と level が食い違うものは、作り直しも流用もできないので何も作らずに弾く。
      for (const s of stories) {
        if (s.id) {
          const row = byId.get(s.id);
          if (!row || row.project_id !== project_id || row.level !== "story") {
            return toolError(`このプロジェクトのストーリーが見つかりません: ${s.id}`);
          }
        } else if (s.external_id && byExternalId.get(s.external_id)?.level === "task") {
          return toolError(`external_id ${s.external_id} は既存のタスクに使われています（ストーリーには使えません）`);
        }
        for (const t of s.tasks ?? []) {
          if (t.external_id && byExternalId.get(t.external_id)?.level === "story") {
            return toolError(`external_id ${t.external_id} は既存のストーリーに使われています（タスクには使えません）`);
          }
        }
      }

      // ストーリーを一括で作る。並びはプロジェクトのストーリーの末尾に続ける。
      const newStories = stories.filter((s) => !s.id && !(s.external_id && byExternalId.has(s.external_id)));
      const storyRows = new Map<(typeof stories)[number], PlanRow>();
      if (newStories.length > 0) {
        const { last, error: lastError } = await lastSortOrder(db, "project_id", project_id, "story");
        if (lastError) return restError(lastError);
        const now = new Date().toISOString();
        const { data, error } = await db
          .from("tasks")
          .insert(
            newStories.map((s, i) => ({
              project_id,
              level: "story",
              title: s.title,
              description: s.description ?? null,
              context: s.context ?? null,
              start_date: s.start_date ?? null,
              due_date: s.due_date ?? null,
              activated_at: s.active ? now : null,
              sort_order: (last ?? 0) + 1 + i,
              metadata: s.external_id ? { external_id: s.external_id } : {},
            })),
          )
          .select("id, title");
        if (error) return restError(error);
        newStories.forEach((s, i) => storyRows.set(s, { id: data[i].id, external_id: s.external_id ?? null, title: data[i].title, created: true }));
      }
      for (const s of stories) {
        if (storyRows.has(s)) continue;
        const row = s.id ? byId.get(s.id)! : byExternalId.get(s.external_id!)!;
        storyRows.set(s, { id: row.id, external_id: row.metadata.external_id ?? null, title: row.title, created: false });
      }

      // タスクを一括で作る。並びはストーリーごとに、配下のタスクの末尾に続ける。
      const taskInserts: Record<string, unknown>[] = [];
      const taskRows = new Map<(typeof stories)[number], (PlanRow | number)[]>();
      for (const s of stories) {
        const story = storyRows.get(s)!;
        let next: number | null = null;
        const rows: (PlanRow | number)[] = [];
        for (const t of s.tasks ?? []) {
          const existing = t.external_id ? byExternalId.get(t.external_id) : undefined;
          if (existing) {
            rows.push({ id: existing.id, external_id: t.external_id!, title: existing.title, created: false });
            continue;
          }
          if (next === null) {
            const { last, error } = story.created ? { last: null, error: null } : await lastSortOrder(db, "parent_id", story.id, "task");
            if (error) return restError(error);
            next = (last ?? -1) + 1;
          }
          rows.push(taskInserts.length);
          taskInserts.push({
            project_id,
            parent_id: story.id,
            level: "task",
            title: t.title,
            description: t.description ?? null,
            start_date: t.start_date ?? null,
            due_date: t.due_date ?? null,
            sort_order: next++,
            metadata: t.external_id ? { external_id: t.external_id } : {},
          });
        }
        taskRows.set(s, rows);
      }
      let inserted: { id: string; title: string; metadata: { external_id?: string } }[] = [];
      if (taskInserts.length > 0) {
        const { data, error } = await db.from("tasks").insert(taskInserts).select("id, title, metadata");
        if (error) return restError(error);
        inserted = data;
      }

      return json({
        project_id,
        stories: stories.map((s) => ({
          ...storyRows.get(s)!,
          tasks: taskRows.get(s)!.map((r) =>
            typeof r === "number"
              ? { id: inserted[r].id, external_id: inserted[r].metadata.external_id ?? null, title: inserted[r].title, created: true }
              : r,
          ),
        })),
      });
    },
  );

  server.registerTool(
    "update_story",
    {
      title: "ストーリーの更新",
      description:
        "ストーリーの名前・説明・コンテキスト・期間・状態・着手（Active / InActive）を更新し、更新後のストーリーを返す。渡した項目だけ書き換える。" +
        "context を書き換えると、ストーリー詳細に AI が更新した版として履歴が残る。" +
        "active は true で着手済み（Active。すでに着手済みなら activated_at は変えない）、false でバックログ（InActive）に戻す。" +
        "期間を変えても配下のタスクの期間は変わらない",
      inputSchema: {
        story_id: z.uuid().describe("ストーリーの id（タスクは不可）"),
        title: z.string().trim().min(1).optional().describe("ストーリー名"),
        description: z.string().optional().describe("ストーリーの説明（置き換え）"),
        context: z.string().optional().describe("ストーリーのコンテキスト（Markdown。置き換え）"),
        start_date: z.iso.date().optional().describe("開始日（YYYY-MM-DD）"),
        due_date: z.iso.date().optional().describe("期限（YYYY-MM-DD）"),
        status: z.enum(["todo", "in_progress", "done", "closed"]).optional().describe("状態"),
        active: z.boolean().optional().describe("true なら着手済み、false ならバックログ"),
      },
    },
    async ({ story_id, active, ...fields }) => {
      if (active === undefined && Object.values(fields).every((v) => v === undefined)) {
        return toolError("更新する項目がありません。title / description / context / start_date / due_date / status / active のどれかを渡してください");
      }

      const { data: story, error: storyError } = await db.from("tasks").select(`${STORY_COLUMNS}, level`).eq("id", story_id).maybeSingle();
      if (storyError) return restError(storyError);
      if (!story) return toolError(`ストーリーが見つかりません: ${story_id}`);
      if (story.level === "task") return toolError(`タスクの id です。ストーリーの id を指定してください: ${story_id}`);

      // 画面の setActive と同じく activated_at で表す。着手済みに true を渡しても着手日時は上書きしない。
      const patch: Record<string, unknown> = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined));
      if (active === false) patch.activated_at = null;
      if (active === true && story.activated_at === null) patch.activated_at = new Date().toISOString();
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
        "タスクの名前・説明・期間を更新し、更新後のタスクを返す。渡した項目だけ書き換える。" +
        "description は置き換えなので、追記するときは get_task_context で今の説明を取り、末尾に足して渡す。" +
        "状態は変えない（着手は start_task、完了は complete_task）",
      inputSchema: {
        task_id: z.uuid().describe("タスクの id（ストーリーは不可）"),
        title: z.string().trim().min(1).optional().describe("タスク名"),
        description: z.string().optional().describe("タスクの説明（Markdown。置き換え）"),
        start_date: z.iso.date().optional().describe("開始日（YYYY-MM-DD）"),
        due_date: z.iso.date().optional().describe("期限（YYYY-MM-DD）"),
      },
    },
    async ({ task_id, ...fields }) => {
      const patch = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined));
      if (Object.keys(patch).length === 0) {
        return toolError("更新する項目がありません。title / description / start_date / due_date のどれかを渡してください");
      }

      const found = await findTask(db, task_id, "update_story を使ってください");
      if ("error" in found) return found.error;

      const { data, error } = await db.from("tasks").update(patch).eq("id", task_id).select(TASK_COLUMNS);
      if (error) return restError(error);
      if (data.length === 0) return toolError(`タスクを更新できませんでした: ${task_id}`);
      return json(data[0]);
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
        "コメント（過去の作業メモ・申し送り。list_task_comments と同じ形で古い順）をまとめて返す。作業を始める前に使う",
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
      return json({ task: rest, story, project, comments: (comments as CommentRow[]).map(withEditable) });
    },
  );

  server.registerTool(
    "get_next_task",
    {
      title: "次に着手するタスクの取得",
      description:
        "次に着手するタスクを1件返す。候補は進行中のストーリー配下で status が todo、担当が人でないタスク（カンバンに出ている範囲）。" +
        "並びはプロジェクトの作成順 → ストーリーの並び → タスクの並びで、先頭を返す。状態は変えない。候補が無ければ task は null。" +
        "タスク間の依存関係はまだ見ない",
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
        .eq("story.status", "in_progress");
      if (project_id) query = query.eq("project_id", project_id);
      const { data, error } = await query;
      if (error) return restError(error);

      // 埋め込んだ列では並べられないので、ここで並べる（カンバンと同じ並び）。
      const rows = (data as unknown as NextTaskRow[]).sort(
        (a, b) =>
          a.project.created_at.localeCompare(b.project.created_at) ||
          a.story.sort_order - b.story.sort_order ||
          a.sort_order - b.sort_order,
      );
      const next = rows[0];
      if (!next) return json({ task: null, message: "着手できるタスクがありません（進行中のストーリー配下に、未着手で人の担当でないタスクがない）" });

      const { story, project, sort_order: _sortOrder, ...task } = next;
      return json({ task, story: { id: story.id, title: story.title }, project: { id: project.id, name: project.name } });
    },
  );

  server.registerTool(
    "start_task",
    {
      title: "タスクの着手",
      description:
        "タスクを進行中（in_progress）にして、更新後のタスクを返す。作業を始めるときに使う。" +
        "すでに進行中なら何も変えずに返すので、呼び直してよい。完了（done / closed）のタスクは着手できない",
      inputSchema: { task_id: z.uuid().describe("タスクの id（ストーリーは不可）") },
    },
    async ({ task_id }) => {
      const found = await findTask(db, task_id);
      if ("error" in found) return found.error;
      if (found.task.status === "in_progress") return json(found.task);
      if (found.task.status !== "todo") return toolError(`完了したタスクは着手できません（status: ${found.task.status}）: ${task_id}`);

      const updated = await updateStatus(db, task_id, ["todo"], "in_progress");
      if ("error" in updated) return updated.error;
      return json(updated.task);
    },
  );

  server.registerTool(
    "complete_task",
    {
      title: "タスクの完了と作業結果の記録",
      description:
        "タスクを完了（done）にし、作業結果を AI のコメントとして投稿する。返り値は { task, comment }。" +
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
      const updated = await updateStatus(db, task_id, ["todo", "in_progress"], "done");
      if ("error" in updated) return updated.error;

      const { data, error } = await db.from("task_comments").insert({ task_id, body: result }).select(COMMENT_COLUMNS).single();
      if (error) {
        return toolError(
          `タスクは done になりましたが、作業結果のコメントを投稿できませんでした。add_task_comment で記録し直してください。` +
            `Supabase のエラー: ${error.message}${error.code ? ` (${error.code})` : ""}`,
        );
      }
      return json({ task: updated.task, comment: withEditable(data as CommentRow) });
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
}
