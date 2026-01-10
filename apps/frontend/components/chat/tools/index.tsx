import type { Message } from "@repo/types";
import { isMCPTool as checkIfMCPTool } from "@repo/types";

// Tool-specific components
import { DeleteFileTool } from "./delete-file";
import { EditFileTool } from "./edit-file";
import { FileSearchTool } from "./file-search";
import { GrepSearchTool } from "./grep-search";
import { ListDirTool } from "./list-dir";
import { ReadFileTool } from "./read-file";
import { RunTerminalCmdTool } from "./run-terminal-cmd";
import { SearchReplaceTool } from "./search-replace";
import { TodoWriteTool } from "./todo-write";
import { WebSearchTool } from "./web-search";
import { MCPTool } from "./mcp-tool";

const TOOL_COMPONENTS = {
  todo_write: TodoWriteTool,
  read_file: ReadFileTool,
  run_terminal_cmd: RunTerminalCmdTool,
  list_dir: ListDirTool,
  grep_search: GrepSearchTool,
  edit_file: EditFileTool,
  search_replace: SearchReplaceTool,
  file_search: FileSearchTool,
  delete_file: DeleteFileTool,
  web_search: WebSearchTool,
} as const;

export type ToolName = keyof typeof TOOL_COMPONENTS;

export function ToolMessage({ message }: { message: Message }) {
  if (!message.metadata?.tool) {
    return <div className="text-muted-foreground">{message.content}</div>;
  }

  const toolMeta = message.metadata?.tool;
  if (!toolMeta) {
    return <span className="text-muted-foreground">{message.content}</span>;
  }

  if (checkIfMCPTool(toolMeta.name)) {
    return <MCPTool message={message} />;
  }

  const ToolComponent = TOOL_COMPONENTS[toolMeta.name as ToolName];

  if (!ToolComponent) {
    return (
      <div className="text-muted-foreground">
        <span className="opacity-60">Unknown tool:</span> {toolMeta.name}
      </div>
    );
  }

  return <ToolComponent message={message} />;
}

export {
  DeleteFileTool,
  EditFileTool,
  FileSearchTool,
  GrepSearchTool,
  ListDirTool,
  ReadFileTool,
  RunTerminalCmdTool,
  SearchReplaceTool,
  TodoWriteTool,
  WebSearchTool,
  MCPTool,
};
