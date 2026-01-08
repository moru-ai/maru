/**
 * Claude Code Session Schema Types (v2.1.1)
 * Auto-generated from JSON Schema
 * @see https://github.com/moru-ai/agent-schemas/claude-code/v2.1.1/session.schema.json
 */

// ============================================================================
// Primitive Types
// ============================================================================

/** UUID v4 format */
export type UUID = string;

/** ISO-8601 timestamp */
export type ISO8601Timestamp = string;

/** CLI version string (semver) */
export type CLIVersion = string;

/** Claude model identifier */
export type ModelId = string;

// ============================================================================
// Tool Names
// ============================================================================

export type BuiltInToolName =
  | "Bash"
  | "Read"
  | "Write"
  | "Edit"
  | "Glob"
  | "Grep"
  | "WebSearch"
  | "WebFetch"
  | "Task"
  | "TodoWrite"
  | "AskUserQuestion"
  | "NotebookEdit"
  | "EnterPlanMode"
  | "ExitPlanMode"
  | "Skill"
  | "KillShell"
  | "TaskOutput";

/** MCP tool name pattern: mcp__<server>__<tool> */
export type MCPToolName = `mcp__${string}__${string}`;

export type ToolName = BuiltInToolName | MCPToolName;

// ============================================================================
// Tool Inputs
// ============================================================================

export interface BashInput {
  command: string;
  description?: string;
  timeout?: number;
  run_in_background?: boolean;
  dangerouslyDisableSandbox?: boolean;
}

export interface ReadInput {
  file_path: string;
  offset?: number;
  limit?: number;
}

export interface WriteInput {
  file_path: string;
  content: string;
}

export interface EditInput {
  file_path: string;
  old_string: string;
  new_string: string;
  replace_all?: boolean;
}

export interface GlobInput {
  pattern: string;
  path?: string;
}

export interface GrepInput {
  pattern: string;
  path?: string;
  output_mode?: "content" | "files_with_matches" | "count";
  glob?: string;
  type?: string;
  head_limit?: number;
  offset?: number;
  multiline?: boolean;
  "-A"?: number;
  "-B"?: number;
  "-C"?: number;
  "-i"?: boolean;
  "-n"?: boolean;
}

export interface WebSearchInput {
  query: string;
  allowed_domains?: string[];
  blocked_domains?: string[];
}

export interface WebFetchInput {
  url: string;
  prompt: string;
}

export interface TaskInput {
  description: string;
  prompt: string;
  subagent_type: string;
  run_in_background?: boolean;
  model?: "sonnet" | "opus" | "haiku";
  resume?: string;
}

export interface TodoItem {
  content: string;
  status: "pending" | "in_progress" | "completed";
  activeForm: string;
}

export interface TodoWriteInput {
  todos: TodoItem[];
}

export interface QuestionOption {
  label: string;
  description: string;
}

export interface Question {
  question: string;
  header: string;
  options: QuestionOption[];
  multiSelect: boolean;
}

export interface AskUserQuestionInput {
  questions: Question[];
  answers?: Record<string, string>;
}

export interface NotebookEditInput {
  notebook_path: string;
  new_source: string;
  cell_id?: string;
  cell_type?: "code" | "markdown";
  edit_mode?: "replace" | "insert" | "delete";
}

export interface EnterPlanModeInput {}

export interface ExitPlanModeInput {
  plan?: string;
}

export interface SkillInput {
  skill: string;
  args?: string;
}

export interface KillShellInput {
  shell_id: string;
}

export interface TaskOutputInput {
  task_id: string;
  block?: boolean;
  timeout?: number;
}

export interface MCPToolInput {
  [key: string]: unknown;
}

export type ToolInput =
  | BashInput
  | ReadInput
  | WriteInput
  | EditInput
  | GlobInput
  | GrepInput
  | WebSearchInput
  | WebFetchInput
  | TaskInput
  | TodoWriteInput
  | AskUserQuestionInput
  | NotebookEditInput
  | EnterPlanModeInput
  | ExitPlanModeInput
  | SkillInput
  | KillShellInput
  | TaskOutputInput
  | MCPToolInput;

// ============================================================================
// Content Blocks
// ============================================================================

export interface TextBlock {
  type: "text";
  text: string;
}

export interface ThinkingBlock {
  type: "thinking";
  thinking: string;
  signature: string;
}

export interface ToolUseBlock {
  type: "tool_use";
  id: string;
  name: ToolName;
  input: Record<string, unknown>;
}

export interface ImageSource {
  type: "base64";
  media_type: "image/png" | "image/jpeg" | "image/gif" | "image/webp";
  data: string;
}

export interface ImageBlock {
  type: "image";
  source: ImageSource;
}

export type ToolResultContentItem =
  | string
  | { type: "text"; text: string }
  | { type: "image"; source: ImageSource };

export interface ToolResultBlock {
  type: "tool_result";
  tool_use_id: string;
  content: string | ToolResultContentItem[];
  is_error?: boolean;
}

export type ContentBlock =
  | TextBlock
  | ThinkingBlock
  | ToolUseBlock
  | ToolResultBlock
  | ImageBlock;

// ============================================================================
// Metadata Types
// ============================================================================

export interface ThinkingMetadata {
  level?: "high" | "medium" | "low";
  disabled?: boolean;
  triggers?: string[];
  [key: string]: unknown;
}

export interface CacheCreation {
  ephemeral_5m_input_tokens?: number;
  ephemeral_1h_input_tokens?: number;
  [key: string]: unknown;
}

export interface UsageInfo {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation?: CacheCreation;
  service_tier?: string | null;
  server_tool_use?: Record<string, unknown>;
  [key: string]: unknown;
}

// ============================================================================
// Messages
// ============================================================================

export type UserMessageContent = string | ContentBlock[];

export interface UserMessagePayload {
  role: "user";
  content: UserMessageContent;
  [key: string]: unknown;
}

export interface UserMessage {
  type: "user";
  uuid: UUID;
  parentUuid: UUID | null;
  sessionId: UUID;
  timestamp: ISO8601Timestamp;
  version: CLIVersion;
  cwd: string;
  gitBranch?: string;
  isSidechain: boolean;
  userType: "external";
  message: UserMessagePayload;
  thinkingMetadata?: ThinkingMetadata;
  todos?: TodoItem[];
  isMeta?: boolean;
  isCompactSummary?: boolean;
  agentId?: string;
  slug?: string;
  toolUseResult?: Record<string, unknown> | string;
  sourceToolAssistantUUID?: UUID;
  [key: string]: unknown;
}

export type StopReason = "end_turn" | "tool_use" | "max_tokens" | "stop_sequence" | null;

export interface AssistantMessagePayload {
  model: ModelId;
  id: string;
  type: "message";
  role: "assistant";
  content: ContentBlock[];
  stop_reason: StopReason;
  stop_sequence: string | null;
  usage: UsageInfo;
  [key: string]: unknown;
}

export interface AssistantMessage {
  type: "assistant";
  uuid: UUID;
  parentUuid: UUID | null;
  sessionId: UUID;
  timestamp: ISO8601Timestamp;
  version: CLIVersion;
  cwd: string;
  gitBranch?: string;
  isSidechain: boolean;
  userType: "external";
  requestId?: string;
  message: AssistantMessagePayload;
  agentId?: string;
  slug?: string;
  isApiErrorMessage?: boolean;
  error?: string;
  [key: string]: unknown;
}

export type SystemMessageSubtype =
  | "local_command"
  | "turn_duration"
  | "api_error"
  | "stop_hook_summary"
  | "compact_boundary";

export type SystemMessageLevel = "info" | "warn" | "error" | "suggestion";

export interface CompactMetadata {
  trigger?: string;
  preTokens?: number;
}

export interface SystemMessage {
  type: "system";
  uuid: UUID;
  parentUuid: UUID | null;
  sessionId: UUID;
  timestamp: ISO8601Timestamp;
  version: CLIVersion;
  cwd: string;
  gitBranch?: string;
  isSidechain: boolean;
  userType: "external";
  subtype: SystemMessageSubtype;
  content?: string;
  level?: SystemMessageLevel;
  durationMs?: number;
  isMeta?: boolean;
  agentId?: string;
  slug?: string;
  hookCount?: number;
  hookInfos?: Record<string, unknown>[];
  hookErrors?: (Record<string, unknown> | string)[];
  preventedContinuation?: boolean;
  stopReason?: string;
  hasOutput?: boolean;
  toolUseID?: string;
  logicalParentUuid?: UUID;
  compactMetadata?: CompactMetadata;
  [key: string]: unknown;
}

export interface SummaryMessage {
  type: "summary";
  summary: string;
  leafUuid: UUID;
  [key: string]: unknown;
}

// ============================================================================
// File History
// ============================================================================

export interface FileBackupInfo {
  originalContent?: string;
  path?: string;
  backupFileName?: string | null;
  version?: number;
  backupTime?: ISO8601Timestamp;
  [key: string]: unknown;
}

export interface FileHistorySnapshotData {
  messageId: UUID;
  trackedFileBackups: Record<string, FileBackupInfo>;
  timestamp: ISO8601Timestamp;
  [key: string]: unknown;
}

export interface FileHistorySnapshot {
  type: "file-history-snapshot";
  messageId: UUID;
  snapshot: FileHistorySnapshotData;
  isSnapshotUpdate: boolean;
  [key: string]: unknown;
}

// ============================================================================
// Queue Operations
// ============================================================================

export type QueueOperationType = "enqueue" | "remove" | "dequeue" | "popAll";

export interface QueueOperation {
  type: "queue-operation";
  operation: QueueOperationType;
  timestamp: ISO8601Timestamp;
  sessionId: UUID;
  content?: string;
  [key: string]: unknown;
}

// ============================================================================
// Session Entry (Union of all message types)
// ============================================================================

export type SessionEntry =
  | UserMessage
  | AssistantMessage
  | SystemMessage
  | SummaryMessage
  | FileHistorySnapshot
  | QueueOperation;

// ============================================================================
// Type Guards
// ============================================================================

export function isUserMessage(entry: SessionEntry): entry is UserMessage {
  return entry.type === "user";
}

export function isAssistantMessage(entry: SessionEntry): entry is AssistantMessage {
  return entry.type === "assistant";
}

export function isSystemMessage(entry: SessionEntry): entry is SystemMessage {
  return entry.type === "system";
}

export function isSummaryMessage(entry: SessionEntry): entry is SummaryMessage {
  return entry.type === "summary";
}

export function isFileHistorySnapshot(entry: SessionEntry): entry is FileHistorySnapshot {
  return entry.type === "file-history-snapshot";
}

export function isQueueOperation(entry: SessionEntry): entry is QueueOperation {
  return entry.type === "queue-operation";
}

// Content block type guards
export function isTextBlock(block: ContentBlock): block is TextBlock {
  return block.type === "text";
}

export function isThinkingBlock(block: ContentBlock): block is ThinkingBlock {
  return block.type === "thinking";
}

export function isToolUseBlock(block: ContentBlock): block is ToolUseBlock {
  return block.type === "tool_use";
}

export function isToolResultBlock(block: ContentBlock): block is ToolResultBlock {
  return block.type === "tool_result";
}

export function isImageBlock(block: ContentBlock): block is ImageBlock {
  return block.type === "image";
}
