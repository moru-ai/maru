"use client";

import { useMemo } from "react";
import type {
  SessionEntry,
  UserMessage,
  AssistantMessage,
  SystemMessage,
  ContentBlock,
  ToolResultBlock,
  ToolUseBlock,
} from "./types";
import {
  isUserMessage,
  isAssistantMessage,
  isSystemMessage,
  isToolResultBlock,
  isToolUseBlock,
} from "./types";
import { CCUserMessage } from "./cc-user-message";
import { CCAssistantMessage } from "./cc-assistant-message";
import { CCSystemMessage, shouldShowSystemMessage } from "./cc-system-message";

interface CCMessagesProps {
  entries: SessionEntry[];
}

/**
 * Merged assistant message - combines streaming chunks with same message.id
 */
interface MergedAssistantMessage {
  type: "merged-assistant";
  messageId: string;
  /** The most complete message (last entry with this message.id) */
  message: AssistantMessage;
  /** All content blocks from all entries, deduplicated */
  mergedContent: ContentBlock[];
  /** All entry UUIDs that were merged */
  sourceUuids: string[];
}

type DisplayEntry = UserMessage | MergedAssistantMessage | SystemMessage;

/**
 * Check if a user message is purely tool results (no text content)
 */
function isPureToolResultMessage(entry: UserMessage): boolean {
  const content = entry.message.content;
  if (typeof content === "string") return false;
  // Has tool results and no text blocks
  const hasToolResult = content.some(isToolResultBlock);
  const hasText = content.some(
    (b) => "type" in b && b.type === "text" && "text" in b && b.text.trim()
  );
  return hasToolResult && !hasText;
}

/**
 * Process session entries into display-ready format:
 * 1. Merge assistant streaming chunks (same message.id)
 * 2. Extract tool results and map by tool_use_id
 * 3. Filter out pure tool result messages (they're shown inline with tool_use)
 * 4. Filter out sidechain messages (warmup/subagent)
 * 5. Include relevant system messages (api_error, turn_duration, compact_boundary)
 */
function processEntries(entries: SessionEntry[]): {
  displayEntries: DisplayEntry[];
  toolResultsMap: Map<string, ToolResultBlock>;
} {
  // Step 1: Build tool results map by tool_use_id
  // This is the correct way to associate results with tool calls
  const toolResultsMap = new Map<string, ToolResultBlock>();

  for (const entry of entries) {
    if (!isUserMessage(entry)) continue;
    const content = entry.message.content;
    if (typeof content === "string") continue;

    for (const block of content) {
      if (isToolResultBlock(block)) {
        toolResultsMap.set(block.tool_use_id, block);
      }
    }
  }

  // Step 2: Group assistant messages by message.id for merging streaming chunks
  const assistantByMessageId = new Map<
    string,
    { entries: AssistantMessage[]; allContent: ContentBlock[] }
  >();

  for (const entry of entries) {
    if (!isAssistantMessage(entry)) continue;

    // Skip sidechain messages (warmup/subagent internal messages)
    if (entry.isSidechain) continue;

    const msgId = entry.message.id;
    if (!msgId) continue;

    const existing = assistantByMessageId.get(msgId);
    if (existing) {
      existing.entries.push(entry);
      // Accumulate content blocks (we'll dedupe later)
      existing.allContent.push(...entry.message.content);
    } else {
      assistantByMessageId.set(msgId, {
        entries: [entry],
        allContent: [...entry.message.content],
      });
    }
  }

  // Step 3: Build display entries in order
  const displayEntries: DisplayEntry[] = [];
  const processedMessageIds = new Set<string>();

  for (const entry of entries) {
    // Handle system messages
    if (isSystemMessage(entry)) {
      // Only include system messages we want to display
      if (shouldShowSystemMessage(entry)) {
        displayEntries.push(entry);
      }
      continue;
    }

    // Handle user messages
    if (isUserMessage(entry)) {
      // Skip sidechain user messages
      if (entry.isSidechain) continue;

      // Skip pure tool result messages (they're shown inline with tool_use)
      if (isPureToolResultMessage(entry)) continue;

      displayEntries.push(entry);
      continue;
    }

    // Handle assistant messages
    if (isAssistantMessage(entry)) {
      // Skip sidechain
      if (entry.isSidechain) continue;

      const msgId = entry.message.id;
      if (!msgId) continue;

      // Only process each message.id once (use first occurrence position)
      if (processedMessageIds.has(msgId)) continue;
      processedMessageIds.add(msgId);

      const group = assistantByMessageId.get(msgId);
      if (!group || group.entries.length === 0) continue;

      // Merge content blocks - deduplicate by content identity
      const mergedContent = deduplicateContentBlocks(group.allContent);

      // Use the last entry as the "canonical" message (most complete metadata)
      const lastEntry = group.entries[group.entries.length - 1]!;

      displayEntries.push({
        type: "merged-assistant",
        messageId: msgId,
        message: lastEntry,
        mergedContent,
        sourceUuids: group.entries.map((e) => e.uuid),
      });
    }
  }

  return { displayEntries, toolResultsMap };
}

/**
 * Deduplicate content blocks - keep unique blocks by their content
 * For streaming, later blocks may have more content, so we process in order
 * and keep the last occurrence of each "type" of block
 */
function deduplicateContentBlocks(blocks: ContentBlock[]): ContentBlock[] {
  const result: ContentBlock[] = [];
  const seenToolUseIds = new Set<string>();
  const seenThinkingSignatures = new Set<string>();
  let lastTextContent = "";

  for (const block of blocks) {
    if ("type" in block) {
      switch (block.type) {
        case "tool_use": {
          const toolBlock = block as ToolUseBlock;
          // Keep each tool_use only once (by id)
          if (!seenToolUseIds.has(toolBlock.id)) {
            seenToolUseIds.add(toolBlock.id);
            result.push(block);
          }
          break;
        }
        case "thinking": {
          // Keep thinking blocks, dedupe by signature if present
          const thinkingBlock = block as { type: "thinking"; signature?: string };
          const sig = thinkingBlock.signature || Math.random().toString();
          if (!seenThinkingSignatures.has(sig)) {
            seenThinkingSignatures.add(sig);
            result.push(block);
          }
          break;
        }
        case "text": {
          // For text blocks, keep the longest/last version
          const textBlock = block as { type: "text"; text: string };
          // If this text is a prefix of what we've seen, skip it
          // If it's longer, it's a more complete version
          if (textBlock.text.length > lastTextContent.length) {
            // Remove previous text blocks that are prefixes
            const newResult = result.filter(
              (b) =>
                !("type" in b) ||
                b.type !== "text" ||
                !("text" in b) ||
                !(textBlock.text as string).startsWith((b as { text: string }).text)
            );
            result.length = 0;
            result.push(...newResult);
            result.push(block);
            lastTextContent = textBlock.text;
          }
          break;
        }
        case "tool_result":
          // Tool results shouldn't be in assistant content, skip
          break;
        case "image":
          // Keep all images
          result.push(block);
          break;
        default:
          result.push(block);
      }
    }
  }

  return result;
}

/**
 * Claude Code Messages Container
 * Renders a list of Claude Code session entries with proper:
 * - Streaming chunk merging
 * - Tool result association
 * - Sidechain filtering
 * - System messages (errors, duration, compact boundaries)
 */
export function CCMessages({ entries }: CCMessagesProps) {
  const { displayEntries, toolResultsMap } = useMemo(
    () => processEntries(entries),
    [entries]
  );

  return (
    <div className="flex flex-col gap-6">
      {displayEntries.map((entry) => {
        // System message
        if ("type" in entry && entry.type === "system") {
          return (
            <CCSystemMessage
              key={(entry as SystemMessage).uuid}
              message={entry as SystemMessage}
            />
          );
        }

        // User message
        if ("type" in entry && entry.type === "user") {
          return <CCUserMessage key={entry.uuid} message={entry as UserMessage} />;
        }

        // Merged assistant message
        if ("type" in entry && entry.type === "merged-assistant") {
          const merged = entry as MergedAssistantMessage;

          // Build tool results map for this specific message's tool_use blocks
          const messageToolResults = new Map<string, ToolResultBlock>();
          for (const block of merged.mergedContent) {
            if (isToolUseBlock(block)) {
              const result = toolResultsMap.get(block.id);
              if (result) {
                messageToolResults.set(block.id, result);
              }
            }
          }

          return (
            <CCAssistantMessage
              key={merged.messageId}
              message={merged.message}
              mergedContent={merged.mergedContent}
              toolResults={messageToolResults}
            />
          );
        }

        return null;
      })}
    </div>
  );
}
