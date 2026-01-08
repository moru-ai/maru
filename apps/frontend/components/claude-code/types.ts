/**
 * Re-export Claude Code types for component use
 */
import { ClaudeCode } from "@repo/types";

// Re-export types
export type SessionEntry = ClaudeCode.SessionEntry;
export type UserMessage = ClaudeCode.UserMessage;
export type AssistantMessage = ClaudeCode.AssistantMessage;
export type SystemMessage = ClaudeCode.SystemMessage;
export type SummaryMessage = ClaudeCode.SummaryMessage;
export type ContentBlock = ClaudeCode.ContentBlock;
export type TextBlock = ClaudeCode.TextBlock;
export type ThinkingBlock = ClaudeCode.ThinkingBlock;
export type ToolUseBlock = ClaudeCode.ToolUseBlock;
export type ToolResultBlock = ClaudeCode.ToolResultBlock;
export type ImageBlock = ClaudeCode.ImageBlock;
export type UsageInfo = ClaudeCode.UsageInfo;
export type TodoItem = ClaudeCode.TodoItem;

// Re-export type guards
export const isUserMessage = ClaudeCode.isUserMessage;
export const isAssistantMessage = ClaudeCode.isAssistantMessage;
export const isSystemMessage = ClaudeCode.isSystemMessage;
export const isSummaryMessage = ClaudeCode.isSummaryMessage;
export const isTextBlock = ClaudeCode.isTextBlock;
export const isThinkingBlock = ClaudeCode.isThinkingBlock;
export const isToolUseBlock = ClaudeCode.isToolUseBlock;
export const isToolResultBlock = ClaudeCode.isToolResultBlock;
export const isImageBlock = ClaudeCode.isImageBlock;
