import { z } from "zod";
import type { ValidationErrorResult } from "../chat/streaming-client";

// === Base Schemas ===
const BaseResultSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  error: z.string().optional(),
});

const ExplanationSchema = z.object({
  explanation: z
    .string()
    .describe("One sentence explanation as to why this tool is being used"),
});

// === Tool Parameter Schemas ===
export const TodoWriteParamsSchema = z
  .object({
    merge: z
      .boolean()
      .describe(
        "Whether to merge with existing todos (true) or replace them (false)"
      ),
    todos: z
      .array(
        z.object({
          id: z.string().describe("Unique identifier for the todo item"),
          content: z.string().describe("Descriptive content of the todo"),
          status: z
            .enum(["pending", "in_progress", "completed", "cancelled"])
            .describe("Current status of the todo item"),
        })
      )
      .describe("Array of todo items to create or update"),
  })
  .merge(ExplanationSchema);

export const ReadFileParamsSchema = z
  .object({
    target_file: z.string().describe("The path of the file to read"),
    should_read_entire_file: z
      .boolean()
      .describe("Whether to read the entire file"),
    start_line_one_indexed: z
      .number()
      .optional()
      .describe("The one-indexed line number to start reading from"),
    end_line_one_indexed_inclusive: z
      .number()
      .optional()
      .describe("The one-indexed line number to end reading at"),
  })
  .merge(ExplanationSchema);

export const EditFileParamsSchema = z.object({
  target_file: z.string().describe("The target file to modify"),
  instructions: z
    .string()
    .describe(
      "A single sentence instruction describing what you are going to do"
    ),
  code_edit: z.string().describe("The precise lines of code to edit or create"),
  is_new_file: z
    .boolean()
    .optional()
    .describe(
      "Whether this is creating a new file (true) or editing an existing file (false)"
    ),
});

export const SearchReplaceParamsSchema = z.object({
  file_path: z
    .string()
    .describe("The path to the file to search and replace in"),
  old_string: z
    .string()
    .describe("The text to replace (must be unique within the file)"),
  new_string: z.string().describe("The edited text to replace the old_string"),
  is_new_file: z
    .boolean()
    .optional()
    .describe(
      "Whether this is creating a new file (true) or editing an existing file (false)"
    ),
});

export const RunTerminalCmdParamsSchema = z
  .object({
    command: z.string().describe("The terminal command to execute"),
    is_background: z
      .boolean()
      .describe("Whether the command should be run in the background"),
  })
  .merge(ExplanationSchema);

export const ListDirParamsSchema = z
  .object({
    relative_workspace_path: z
      .string()
      .describe("Path to list contents of, relative to the workspace root"),
  })
  .merge(ExplanationSchema);

export const GrepSearchParamsSchema = z
  .object({
    query: z.string().describe("The regex pattern to search for"),
    include_pattern: z
      .string()
      .optional()
      .describe("Glob pattern for files to include"),
    exclude_pattern: z
      .string()
      .optional()
      .describe("Glob pattern for files to exclude"),
    case_sensitive: z
      .boolean()
      .optional()
      .describe("Whether the search should be case sensitive"),
  })
  .merge(ExplanationSchema);

export const FileSearchParamsSchema = z
  .object({
    query: z.string().describe("Fuzzy filename to search for"),
  })
  .merge(ExplanationSchema);

export const DeleteFileParamsSchema = z
  .object({
    target_file: z.string().describe("The path of the file to delete"),
  })
  .merge(ExplanationSchema);

export const WebSearchParamsSchema = z
  .object({
    query: z.string().describe("The search query"),
    domain: z
      .string()
      .optional()
      .describe("Optional domain to filter results to"),
  })
  .merge(ExplanationSchema);

export const AddMemoryParamsSchema = z.object({
  content: z.string().describe("Concise memory content to store"),
  category: z
    .enum([
      "INFRA",
      "SETUP",
      "STYLES",
      "ARCHITECTURE",
      "TESTING",
      "PATTERNS",
      "BUGS",
      "PERFORMANCE",
      "CONFIG",
      "GENERAL",
    ])
    .describe("Category for organizing the memory"),
  explanation: z
    .string()
    .describe("One sentence explanation for why this memory is being added"),
});

export const ListMemoriesParamsSchema = z.object({
  category: z
    .enum([
      "INFRA",
      "SETUP",
      "STYLES",
      "ARCHITECTURE",
      "TESTING",
      "PATTERNS",
      "BUGS",
      "PERFORMANCE",
      "CONFIG",
      "GENERAL",
    ])
    .optional()
    .describe("Optional category filter"),
  explanation: z
    .string()
    .describe("One sentence explanation for why memories are being listed"),
});

export const RemoveMemoryParamsSchema = z.object({
  memoryId: z.string().describe("ID of the memory to remove"),
  explanation: z
    .string()
    .describe("One sentence explanation for why this memory is being removed"),
});

// === Tool Result Schemas ===
export const TodoWriteResultSchema = BaseResultSchema.extend({
  todos: z
    .array(
      z.object({
        action: z.enum(["created", "updated"]),
        id: z.string(),
        content: z.string(),
        status: z.string(),
      })
    )
    .optional(),
  count: z.number().optional(),
  totalTodos: z.number().optional(),
  completedTodos: z.number().optional(),
});

export const FileResultSchema = BaseResultSchema.extend({
  content: z.string().optional(),
  totalLines: z.number().optional(),
  startLine: z.number().optional(),
  endLine: z.number().optional(),
});

export const WriteResultSchema = BaseResultSchema.extend({
  isNewFile: z.boolean().optional(),
  linesAdded: z.number().optional(),
  linesRemoved: z.number().optional(),
});

export const SearchReplaceResultSchema = BaseResultSchema.extend({
  isNewFile: z.literal(false),
  linesAdded: z.number(),
  linesRemoved: z.number(),
  occurrences: z.number(),
  oldLength: z.number(),
  newLength: z.number(),
});

export const DeleteResultSchema = BaseResultSchema.extend({
  wasAlreadyDeleted: z.boolean().optional(),
});

export const DirectoryListingSchema = BaseResultSchema.extend({
  contents: z
    .array(
      z.object({
        name: z.string(),
        type: z.enum(["file", "directory"]),
        isDirectory: z.boolean(),
      })
    )
    .optional(),
  path: z.string(),
});

export const RecursiveDirectoryEntrySchema = z.object({
  name: z.string(),
  type: z.enum(["file", "directory"]),
  relativePath: z.string(),
  isDirectory: z.boolean(),
});

export const RecursiveDirectoryListingSchema = BaseResultSchema.extend({
  entries: z.array(RecursiveDirectoryEntrySchema),
  basePath: z.string(),
  totalCount: z.number(),
});

export const FileSearchResultSchema = BaseResultSchema.extend({
  files: z.array(z.string()),
  query: z.string(),
  count: z.number(),
});

export const GrepMatchSchema = z.object({
  file: z.string(),
  lineNumber: z.number(),
  content: z.string(),
});

export const GrepResultSchema = BaseResultSchema.extend({
  matches: z.array(z.string()),
  detailedMatches: z.array(GrepMatchSchema).optional(),
  query: z.string(),
  matchCount: z.number(),
});

export const WebSearchResultSchema = BaseResultSchema.extend({
  results: z.array(
    z.object({
      text: z.string(),
      url: z.string(),
      title: z.string().optional(),
    })
  ),
  query: z.string(),
  domain: z.string().optional(),
});

export const AddMemoryResultSchema = BaseResultSchema.extend({
  memory: z
    .object({
      id: z.string(),
      content: z.string(),
      category: z.string(),
      repoFullName: z.string(),
      createdAt: z.date(),
    })
    .optional(),
});

export const ListMemoriesResultSchema = BaseResultSchema.extend({
  memories: z
    .array(
      z.object({
        id: z.string(),
        content: z.string(),
        category: z.string(),
        repoFullName: z.string(),
        createdAt: z.date(),
      })
    )
    .optional(),
  memoriesByCategory: z.record(z.array(z.any())).optional(),
  totalCount: z.number().optional(),
});

export const RemoveMemoryResultSchema = BaseResultSchema.extend({
  removedMemory: z
    .object({
      id: z.string(),
      content: z.string(),
      category: z.string(),
    })
    .optional(),
});

export const CommandResultSchema = BaseResultSchema.extend({
  stdout: z.string().optional(),
  stderr: z.string().optional(),
  isBackground: z.boolean().optional(),
  command: z.string().optional(),
  securityLevel: z.string().optional(),
  exitCode: z.number().optional(),
});

export const FileStatsResultSchema = BaseResultSchema.extend({
  stats: z
    .object({
      size: z.number(),
      mtime: z.date(),
      isFile: z.boolean(),
      isDirectory: z.boolean(),
    })
    .optional(),
});

// === Inferred Types ===
export type TodoWriteParams = z.infer<typeof TodoWriteParamsSchema>;
export type ReadFileParams = z.infer<typeof ReadFileParamsSchema>;
export type EditFileParams = z.infer<typeof EditFileParamsSchema>;
export type SearchReplaceParams = z.infer<typeof SearchReplaceParamsSchema>;
export type RunTerminalCmdParams = z.infer<typeof RunTerminalCmdParamsSchema>;
export type ListDirParams = z.infer<typeof ListDirParamsSchema>;
export type GrepSearchParams = z.infer<typeof GrepSearchParamsSchema>;
export type FileSearchParams = z.infer<typeof FileSearchParamsSchema>;
export type DeleteFileParams = z.infer<typeof DeleteFileParamsSchema>;
export type WebSearchParams = z.infer<typeof WebSearchParamsSchema>;
export type AddMemoryParams = z.infer<typeof AddMemoryParamsSchema>;
export type ListMemoriesParams = z.infer<typeof ListMemoriesParamsSchema>;
export type RemoveMemoryParams = z.infer<typeof RemoveMemoryParamsSchema>;

export type TodoWriteResult = z.infer<typeof TodoWriteResultSchema>;
export type FileResult = z.infer<typeof FileResultSchema>;
export type WriteResult = z.infer<typeof WriteResultSchema>;
export type SearchReplaceResult = z.infer<typeof SearchReplaceResultSchema>;
export type DeleteResult = z.infer<typeof DeleteResultSchema>;
export type DirectoryListing = z.infer<typeof DirectoryListingSchema>;
export type RecursiveDirectoryEntry = z.infer<
  typeof RecursiveDirectoryEntrySchema
>;
export type RecursiveDirectoryListing = z.infer<
  typeof RecursiveDirectoryListingSchema
>;
export type FileSearchResult = z.infer<typeof FileSearchResultSchema>;
export type GrepMatch = z.infer<typeof GrepMatchSchema>;
export type GrepResult = z.infer<typeof GrepResultSchema>;
export type WebSearchResult = z.infer<typeof WebSearchResultSchema>;
export type CommandResult = z.infer<typeof CommandResultSchema>;
export type FileStatsResult = z.infer<typeof FileStatsResultSchema>;
export type AddMemoryResult = z.infer<typeof AddMemoryResultSchema>;
export type ListMemoriesResult = z.infer<typeof ListMemoriesResultSchema>;
export type RemoveMemoryResult = z.infer<typeof RemoveMemoryResultSchema>;

// === Tool Schema Map ===
export const ToolResultSchemas = {
  todo_write: TodoWriteResultSchema,
  read_file: FileResultSchema,
  edit_file: WriteResultSchema,
  search_replace: SearchReplaceResultSchema,
  run_terminal_cmd: CommandResultSchema,
  list_dir: DirectoryListingSchema,
  grep_search: GrepResultSchema,
  file_search: FileSearchResultSchema,
  web_search: WebSearchResultSchema,
  delete_file: DeleteResultSchema,
  add_memory: AddMemoryResultSchema,
  list_memories: ListMemoriesResultSchema,
  remove_memory: RemoveMemoryResultSchema,
} as const;

export type ToolName = keyof typeof ToolResultSchemas;

// === Discriminated Union for Tool Results ===
export type ToolResultTypes =
  | { toolName: "todo_write"; result: TodoWriteResult }
  | { toolName: "read_file"; result: FileResult }
  | { toolName: "edit_file"; result: WriteResult }
  | { toolName: "search_replace"; result: SearchReplaceResult }
  | { toolName: "run_terminal_cmd"; result: CommandResult }
  | { toolName: "list_dir"; result: DirectoryListing }
  | { toolName: "grep_search"; result: GrepResult }
  | { toolName: "file_search"; result: FileSearchResult }
  | { toolName: "web_search"; result: WebSearchResult }
  | { toolName: "delete_file"; result: DeleteResult }
  | { toolName: "add_memory"; result: AddMemoryResult }
  | { toolName: "list_memories"; result: ListMemoriesResult }
  | { toolName: "remove_memory"; result: RemoveMemoryResult };

// Extended type that includes validation errors
export type ToolResultTypesWithValidation = ToolResultTypes & {
  result: ToolResultTypes["result"] | ValidationErrorResult;
};

export enum ToolTypes {
  EDIT_FILE = "edit_file",
  READ_FILE = "read_file",
  SEARCH_REPLACE = "search_replace",
  GREP_SEARCH = "grep_search",
  FILE_SEARCH = "file_search",
  LIST_DIR = "list_dir",
  DELETE_FILE = "delete_file",
  WEB_SEARCH = "web_search",
  TODO_WRITE = "todo_write",
  RUN_TERMINAL_CMD = "run_terminal_cmd",
  ADD_MEMORY = "add_memory",
  LIST_MEMORIES = "list_memories",
  REMOVE_MEMORY = "remove_memory",
  REASONING = "reasoning",
  REDACTED_REASONING = "redacted-reasoning",
  MCP = "mcp",
}

// Tool prefixes for UI display
export const TOOL_PREFIXES: Record<ToolTypes, string> = {
  [ToolTypes.EDIT_FILE]: "Edit",
  [ToolTypes.READ_FILE]: "Read",
  [ToolTypes.SEARCH_REPLACE]: "Replace in",
  [ToolTypes.GREP_SEARCH]: "Grep",
  [ToolTypes.FILE_SEARCH]: "Search files",
  [ToolTypes.LIST_DIR]: "List",
  [ToolTypes.DELETE_FILE]: "Delete",
  [ToolTypes.WEB_SEARCH]: "Web search",
  [ToolTypes.TODO_WRITE]: "Update todo list",
  [ToolTypes.RUN_TERMINAL_CMD]: "Run",
  [ToolTypes.ADD_MEMORY]: "Add memory",
  [ToolTypes.LIST_MEMORIES]: "List memories",
  [ToolTypes.REMOVE_MEMORY]: "Remove memory",
  [ToolTypes.REASONING]: "Reasoning",
  [ToolTypes.REDACTED_REASONING]: "Reasoning",
  [ToolTypes.MCP]: "MCP", // This will be overridden with server name
};
