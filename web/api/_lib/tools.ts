// MCP のツール。後のストーリー（起票・参照、作業進行、コメント）のツールもここに足す。
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { SupabaseClient } from "@supabase/supabase-js";

function json(value: unknown): CallToolResult {
  return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }] };
}

// REST のエラーは例外にせず、ツールの結果（isError）として AI に返す。
function restError(error: { message: string; code?: string }): CallToolResult {
  return { isError: true, content: [{ type: "text", text: `Supabase のエラー: ${error.message}${error.code ? ` (${error.code})` : ""}` }] };
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
}
