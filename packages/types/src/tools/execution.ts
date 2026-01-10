// Execution mode type (simplified to moru-only)
export type AgentMode = "moru";

// Tool operation options
export interface ReadFileOptions {
  shouldReadEntireFile?: boolean;
  startLineOneIndexed?: number;
  endLineOneIndexedInclusive?: number;
}

export interface SearchOptions {
  targetDirectories?: string[];
}

export interface GrepOptions {
  includePattern?: string;
  excludePattern?: string;
  caseSensitive?: boolean;
}

export interface CommandOptions {
  isBackground?: boolean;
  timeout?: number;
  cwd?: string;
}

export const MAX_LINES_PER_READ = 1000 as const;

// Tool Execution Status
// This is specifically for tool execution status, separate from database TaskStatus
export const ToolExecutionStatus = {
  RUNNING: "RUNNING",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
} as const;

export type ToolExecutionStatusType =
  (typeof ToolExecutionStatus)[keyof typeof ToolExecutionStatus];
