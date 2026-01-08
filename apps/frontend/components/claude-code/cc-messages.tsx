"use client";

import { useMemo } from "react";
import type {
  SessionEntry,
  UserMessage,
  AssistantMessage,
  ToolResultBlock,
} from "./types";
import {
  isUserMessage,
  isAssistantMessage,
  isToolResultBlock,
} from "./types";
import { CCUserMessage, isToolResultMessage } from "./cc-user-message";
import { CCAssistantMessage } from "./cc-assistant-message";

interface CCMessagesProps {
  entries: SessionEntry[];
}

/**
 * Process session entries to extract tool results and associate them with tool calls
 */
function processEntries(entries: SessionEntry[]): {
  displayEntries: SessionEntry[];
  toolResultsMap: Map<string, Map<string, ToolResultBlock>>;
} {
  const displayEntries: SessionEntry[] = [];
  const toolResultsMap = new Map<string, Map<string, ToolResultBlock>>();

  for (const entry of entries) {
    // Skip file-history-snapshot, queue-operation, and summary messages for display
    if (
      entry.type === "file-history-snapshot" ||
      entry.type === "queue-operation" ||
      entry.type === "summary"
    ) {
      continue;
    }

    // Skip system messages for now (can add later)
    if (entry.type === "system") {
      continue;
    }

    // Handle user messages that contain tool results
    if (isUserMessage(entry)) {
      const content = entry.message.content;
      if (typeof content !== "string") {
        // Extract tool results from user message content
        const toolResults = content.filter(isToolResultBlock);
        if (toolResults.length > 0) {
          // Find the parent assistant message UUID
          const parentUuid = entry.parentUuid;
          if (parentUuid) {
            const existingResults = toolResultsMap.get(parentUuid) || new Map();
            for (const result of toolResults) {
              existingResults.set(result.tool_use_id, result);
            }
            toolResultsMap.set(parentUuid, existingResults);
          }
          // Skip displaying pure tool result messages
          if (isToolResultMessage(entry)) {
            continue;
          }
        }
      }
    }

    displayEntries.push(entry);
  }

  return { displayEntries, toolResultsMap };
}

/**
 * Claude Code Messages Container
 * Renders a list of Claude Code session entries
 */
export function CCMessages({ entries }: CCMessagesProps) {
  const { displayEntries, toolResultsMap } = useMemo(
    () => processEntries(entries),
    [entries]
  );

  return (
    <div className="flex flex-col gap-6">
      {displayEntries.map((entry, index) => {
        if (isUserMessage(entry)) {
          return <CCUserMessage key={entry.uuid} message={entry} />;
        }

        if (isAssistantMessage(entry)) {
          // Find tool results for this assistant message
          // Results are stored against the assistant message that triggered them
          const results = toolResultsMap.get(entry.uuid);

          return (
            <CCAssistantMessage
              key={entry.uuid}
              message={entry}
              toolResults={results}
            />
          );
        }

        return null;
      })}
    </div>
  );
}
