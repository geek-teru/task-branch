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
}
