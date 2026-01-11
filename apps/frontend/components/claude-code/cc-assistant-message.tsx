"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { AlertCircle } from "lucide-react";
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
  /** Pre-merged content blocks from streaming chunk merging */
  mergedContent?: ContentBlock[];
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
  mergedContent,
  toolResults,
  isStreaming = false,
  className,
}: CCAssistantMessageProps) {
  // Use pre-merged content if provided, otherwise fall back to message content
  const content = mergedContent ?? message.message.content;

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

  // Handle API error messages (e.g., billing_error)
  if (message.isApiErrorMessage) {
    const errorContent = content
      .filter(isTextBlock)
      .map((b) => b.text)
      .join("\n");

    const errorTitle = message.error === "billing_error"
      ? "Billing Error"
      : "API Error";

    return (
      <div
        className={cn(
          "flex items-start gap-2 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive",
          className
        )}
      >
        <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
        <div className="flex-1">
          <div className="font-medium">{errorTitle}</div>
          {errorContent && (
            <div className="mt-1 text-xs opacity-90 whitespace-pre-wrap">
              {errorContent}
            </div>
          )}
        </div>
      </div>
    );
  }

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
