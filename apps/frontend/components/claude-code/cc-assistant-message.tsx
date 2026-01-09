"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import type {
  AssistantMessage,
  ContentBlock,
  ToolResultBlock,
} from "./types";
import {
  isTextBlock,
  isThinkingBlock,
  isToolUseBlock,
  isToolResultBlock,
} from "./types";
import { MemoizedMarkdown } from "../chat/markdown/memoized-markdown";
import { CCThinkingBlock } from "./cc-thinking-block";
import { CCToolUseBlock } from "./cc-tool-use-block";

interface CCAssistantMessageProps {
  message: AssistantMessage;
  toolResults?: Map<string, ToolResultBlock>;
  isStreaming?: boolean;
  className?: string;
}

/**
 * Group content for better rendering:
 * - Consecutive text blocks are merged
 * - Thinking blocks rendered individually
 * - Tool use blocks rendered with their results
 */
type GroupedContent =
  | { type: "text"; text: string }
  | { type: "thinking"; block: ContentBlock }
  | { type: "tool-use"; block: ContentBlock; result?: ToolResultBlock };

function groupContentBlocks(
  blocks: ContentBlock[],
  toolResults?: Map<string, ToolResultBlock>
): GroupedContent[] {
  const groups: GroupedContent[] = [];
  let currentText = "";

  for (const block of blocks) {
    if (isTextBlock(block)) {
      currentText += block.text;
    } else {
      // Flush accumulated text
      if (currentText) {
        groups.push({ type: "text", text: currentText });
        currentText = "";
      }

      if (isThinkingBlock(block)) {
        groups.push({ type: "thinking", block });
      } else if (isToolUseBlock(block)) {
        // Skip TodoWrite - it's shown in the sticky todo panel
        if (block.name === "TodoWrite") {
          continue;
        }
        const result = toolResults?.get(block.id);
        groups.push({ type: "tool-use", block, result });
      }
      // Skip tool_result blocks - they're handled with tool_use
    }
  }

  // Don't forget remaining text
  if (currentText) {
    groups.push({ type: "text", text: currentText });
  }

  return groups;
}

/**
 * Claude Code Assistant Message Component
 * Renders assistant messages with all content block types
 */
export function CCAssistantMessage({
  message,
  toolResults,
  isStreaming = false,
  className,
}: CCAssistantMessageProps) {
  const content = message.message.content;

  // Build tool results map from content if not provided
  const resultsMap = useMemo(() => {
    if (toolResults) return toolResults;

    const map = new Map<string, ToolResultBlock>();
    // Tool results come in subsequent user messages, not in assistant content
    // So this is mainly for when we pass results explicitly
    return map;
  }, [toolResults]);

  // Group content blocks
  const groups = useMemo(
    () => groupContentBlocks(content, resultsMap),
    [content, resultsMap]
  );

  if (groups.length === 0) {
    return null;
  }

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      {groups.map((group, index) => {
        if (group.type === "text") {
          return (
            <div key={`text-${index}`} className="px-3 py-2 text-sm">
              <MemoizedMarkdown
                content={group.text}
                id={`${message.uuid}-text-${index}`}
              />
            </div>
          );
        }

        if (group.type === "thinking" && isThinkingBlock(group.block)) {
          const isLatest = index === groups.length - 1;
          return (
            <CCThinkingBlock
              key={`thinking-${index}`}
              block={group.block}
              isLoading={isStreaming && isLatest}
              defaultOpen={isStreaming && isLatest}
            />
          );
        }

        if (group.type === "tool-use" && isToolUseBlock(group.block)) {
          return (
            <CCToolUseBlock
              key={`tool-${group.block.id}`}
              block={group.block}
              result={group.result}
              isLoading={isStreaming && !group.result}
            />
          );
        }

        return null;
      })}

    </div>
  );
}
