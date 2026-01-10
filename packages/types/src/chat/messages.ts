import type {
  CoreMessage,
  TextPart,
  ToolCallPart as BaseToolCallPart,
  ToolResultPart,
  FinishReason,
} from "ai";
import { ToolExecutionStatusType } from "../tools/execution";
import { ToolResultTypes } from "../tools/tool-schemas";
import type { Todo } from "@repo/db";

// Error part type for AI SDK error chunks
export interface ErrorPart {
  type: "error";
  error: string;
  finishReason?: FinishReason;
}

export interface ReasoningPart {
  type: "reasoning";
  text: string;
  signature?: string;
}

export interface RedactedReasoningPart {
  type: "redacted-reasoning";
  data: string;
}

// Extended ToolCallPart with streaming state tracking
export interface ToolCallPart extends BaseToolCallPart {
  // Streaming state properties
  streamingState?: "starting" | "streaming" | "complete";
  argsComplete?: boolean; // Are args fully received?

  accumulatedArgsText?: string;
  partialArgs?: {
    target_file?: string;
    file_path?: string;
    command?: string;
    is_new_file?: boolean;
  };
}

export type AssistantMessagePart =
  | TextPart
  | ToolCallPart
  | ToolResultPart
  | ReasoningPart
  | RedactedReasoningPart
  | ErrorPart;

export type CompletionTokenUsage = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
};

export interface CheckpointData {
  commitSha: string;
  todoSnapshot: Todo[];
  createdAt: string;
  workspaceState: "clean" | "dirty";
}

export type Message = {
  id: string;
  role: "user" | "assistant" | "tool" | "system";
  content: string;
  llmModel: string;
  createdAt: string;
  metadata?: MessageMetadata;
};

export interface MessageMetadata {
  tool?: {
    name: string;
    args: Record<string, unknown>;
    status: ToolExecutionStatusType;
    result?: ToolResultTypes["result"];
  };

  parts?: AssistantMessagePart[];

  isStreaming?: boolean;
  streamingState?: "starting" | "streaming" | "complete";
  partialArgs?: {
    target_file?: string;
    file_path?: string;
    command?: string;
    is_new_file?: boolean;
  };

  // LLM usage metadata
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };

  // Finish reason
  finishReason?: FinishReason;

  // Checkpointing data for time-travel editing
  checkpoint?: CheckpointData;
}

// Type guards for runtime type checking
export const isUserMessage = (
  message: Message
): message is Message & { role: "user" } =>
  message.role.toLowerCase() === "user";

export const isAssistantMessage = (
  message: Message
): message is Message & { role: "assistant" } =>
  message.role.toLowerCase() === "assistant";

export const isSystemMessage = (
  message: Message
): message is Message & { role: "system" } =>
  message.role.toLowerCase() === "system";

// AI SDK compatible message conversion
export function toCoreMessage(message: Message): CoreMessage {
  return {
    role: message.role,
    content: message.content,
  } as CoreMessage;
}
