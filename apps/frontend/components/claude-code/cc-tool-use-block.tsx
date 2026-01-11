"use client";

import { useState } from "react";
import { diffLines } from "diff";
import { cn } from "@/lib/utils";
import type { ToolUseBlock, ToolResultBlock } from "./types";

interface CCToolUseBlockProps {
  block: ToolUseBlock;
  result?: ToolResultBlock;
  isLoading?: boolean;
}

const MAX_COLLAPSED_LINES = 4;
const WEB_SEARCH_MAX_COLLAPSED_LINES = 1;

/**
 * Convert kebab-case to Title Case
 */
function toTitleCase(str: string): string {
  return str
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * Parse MCP tool name into parts
 */
function parseMcpToolName(toolName: string): {
  isMcp: boolean;
  serverName: string;
  methodName: string;
} {
  if (!toolName.startsWith("mcp__")) {
    return { isMcp: false, serverName: "", methodName: "" };
  }
  const parts = toolName.split("__");
  return {
    isMcp: true,
    serverName: parts[1] || "",
    methodName: parts[2] || "",
  };
}

/**
 * Get display name for a tool
 */
function getToolDisplayName(toolName: string): string {
  const mcp = parseMcpToolName(toolName);
  if (mcp.isMcp) {
    // Format: "Claude in Chrome[computer]"
    return `${toTitleCase(mcp.serverName)}[${mcp.methodName}]`;
  }
  return toolName;
}

/**
 * Format tool input for the header display (shown in parentheses)
 */
function formatToolHeader(
  toolName: string,
  input: Record<string, unknown>
): string {
  // MCP tools: show action parameter
  if (toolName.startsWith("mcp__")) {
    if ("action" in input) {
      return String(input.action);
    }
    // Fall through to default handling
  }

  // Bash: show command
  if (toolName === "Bash" && "command" in input) {
    const cmd = String(input.command);
    return cmd.length > 80 ? cmd.slice(0, 80) + "..." : cmd;
  }

  // Read/Write/Edit: show file path
  if (
    (toolName === "Read" || toolName === "Write" || toolName === "Edit") &&
    "file_path" in input
  ) {
    return String(input.file_path);
  }

  // Glob: show pattern
  if (toolName === "Glob" && "pattern" in input) {
    return String(input.pattern);
  }

  // Grep: show pattern
  if (toolName === "Grep" && "pattern" in input) {
    return String(input.pattern);
  }

  // WebFetch/WebSearch: show URL or query
  if (toolName === "WebFetch" && "url" in input) {
    return String(input.url);
  }
  if (toolName === "WebSearch" && "query" in input) {
    return String(input.query);
  }

  // Task: show description
  if (toolName === "Task" && "description" in input) {
    return String(input.description);
  }

  // Default: show first string value
  for (const value of Object.values(input)) {
    if (typeof value === "string" && value.length > 0) {
      return value.length > 60 ? value.slice(0, 60) + "..." : value;
    }
  }

  return "";
}

/**
 * Format result summary for collapsed view
 */
function formatResultSummary(
  toolName: string,
  result: ToolResultBlock
): string {
  const content = result.content;
  if (typeof content !== "string") return "";

  // Read: count lines
  if (toolName === "Read") {
    const lines = content.split("\n").length;
    return `Read ${lines} lines`;
  }

  // Write: show bytes written
  if (toolName === "Write") {
    return `Wrote ${content.length} bytes`;
  }

  // Edit: parse the result for added/removed lines
  if (toolName === "Edit") {
    // Result format is typically: "Updated file with X lines added, Y lines removed"
    // or similar. For now, just show a generic message
    return "Updated";
  }

  // Glob: count matches
  if (toolName === "Glob") {
    const matches = content.split("\n").filter((l) => l.trim()).length;
    return `${matches} matches`;
  }

  // Grep: count matches
  if (toolName === "Grep") {
    const matches = content.split("\n").filter((l) => l.trim()).length;
    return `${matches} matches`;
  }

  return "";
}

/**
 * Parse Edit tool input to extract old/new strings for diff display
 */
function parseEditInput(input: Record<string, unknown>): {
  oldString: string;
  newString: string;
} | null {
  if ("old_string" in input && "new_string" in input) {
    return {
      oldString: String(input.old_string),
      newString: String(input.new_string),
    };
  }
  return null;
}

/**
 * Render diff for Edit tool - unified view using diff library
 */
function EditDiff({
  oldString,
  newString,
}: {
  oldString: string;
  newString: string;
}) {
  const changes = diffLines(oldString, newString);

  // Flatten changes into individual lines with their type and line numbers
  const lines: Array<{
    type: "removed" | "added";
    line: string;
    lineNum: number;
  }> = [];

  let oldLineNum = 1;
  let newLineNum = 1;

  for (const change of changes) {
    const changeLines = change.value.split("\n");
    // Remove trailing empty string from split if value ends with newline
    if (changeLines[changeLines.length - 1] === "") {
      changeLines.pop();
    }

    for (const line of changeLines) {
      if (change.removed) {
        lines.push({ type: "removed", line, lineNum: oldLineNum });
        oldLineNum++;
      } else if (change.added) {
        lines.push({ type: "added", line, lineNum: newLineNum });
        newLineNum++;
      } else {
        // Unchanged - increment both counters
        oldLineNum++;
        newLineNum++;
      }
    }
  }

  if (lines.length === 0) {
    return (
      <div className="flex items-center gap-1.5">
        <span className="text-muted-foreground/50">└─</span>
        <span className="text-muted-foreground">No changes</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {lines.map((entry, i) => (
        <div key={i} className="flex items-start gap-1.5">
          <span className="text-muted-foreground/50 w-4 shrink-0 text-right">
            {entry.lineNum}
          </span>
          <span
            className={cn(
              "whitespace-pre-wrap break-all",
              entry.type === "removed" && "text-red-400",
              entry.type === "added" && "text-green-400"
            )}
          >
            {entry.type === "removed" ? "-" : "+"} {entry.line || " "}
          </span>
        </div>
      ))}
    </div>
  );
}

/**
 * Claude Code Tool Use Block Component
 * Renders tool calls in Claude Code CLI style
 */
export function CCToolUseBlock({
  block,
  result,
  isLoading = false,
}: CCToolUseBlockProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const toolName = getToolDisplayName(block.name);
  const headerInfo = formatToolHeader(block.name, block.input);
  const hasError = result?.is_error === true;

  // Check if this is an Edit tool
  const isEdit = block.name === "Edit";
  const editInput = isEdit ? parseEditInput(block.input) : null;

  // Process result content for display
  const resultContent =
    typeof result?.content === "string" ? result.content : "";
  const resultLines = resultContent.split("\n");
  const totalLines = resultLines.length;

  // Use fewer collapsed lines for WebSearch to keep results compact
  const isWebSearch = block.name === "WebSearch";
  const maxCollapsedLines = isWebSearch ? WEB_SEARCH_MAX_COLLAPSED_LINES : MAX_COLLAPSED_LINES;

  const displayLines = isExpanded
    ? resultLines
    : resultLines.slice(0, maxCollapsedLines);
  const hiddenLines = isExpanded ? 0 : totalLines - maxCollapsedLines;
  const resultSummary = result ? formatResultSummary(block.name, result) : "";

  return (
    <div className="font-mono text-[13px]">
      {/* Header row */}
      <div
        className={cn(
          "flex items-start gap-1.5",
          (result || (isEdit && editInput)) && "cursor-pointer"
        )}
        onClick={
          result || (isEdit && editInput)
            ? () => setIsExpanded(!isExpanded)
            : undefined
        }
      >
        {/* Status indicator */}
        <span
          className={cn(
            "mt-0.5 shrink-0 leading-none",
            isLoading || !result
              ? "text-yellow-500 animate-pulse"
              : hasError
                ? "text-red-500"
                : "text-green-500"
          )}
        >
          ●
        </span>

        {/* Tool name and header */}
        <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-1">
          <span className="text-foreground shrink-0 font-semibold">
            {toolName}
          </span>
          {headerInfo && (
            <span className="text-muted-foreground truncate">
              ({headerInfo})
            </span>
          )}
        </div>
      </div>

      {/* Result section - only show if we have a result or are loading */}
      {(result || isLoading || (isEdit && editInput)) && (
        <div className="text-muted-foreground mt-0.5 pl-4">
          {isLoading ? (
            <div className="flex items-center gap-1.5">
              <span className="text-muted-foreground/50">└─</span>
              <span className="animate-pulse">Running...</span>
            </div>
          ) : isEdit && editInput ? (
            // Show diff for Edit tool - always expanded
            <EditDiff
              oldString={editInput.oldString}
              newString={editInput.newString}
            />
          ) : resultSummary && !isExpanded && displayLines.length <= 1 ? (
            // Show summary for simple results
            <div className="flex items-center gap-1.5">
              <span className="text-muted-foreground/50">└─</span>
              <span>{resultSummary}</span>
            </div>
          ) : (
            // Show result lines
            <>
              {displayLines.map((line, i) => {
                const isLast = i === displayLines.length - 1 && hiddenLines <= 0;
                const prefix = isLast ? "└─" : "├─";
                return (
                  <div key={i} className="flex items-start gap-1.5">
                    <span className="text-muted-foreground/50 shrink-0">
                      {prefix}
                    </span>
                    <span
                      className={cn(
                        "whitespace-pre-wrap break-all",
                        hasError && "text-red-400"
                      )}
                    >
                      {line || " "}
                    </span>
                  </div>
                );
              })}
              {hiddenLines > 0 && (
                <div
                  className="text-muted-foreground/70 hover:text-muted-foreground flex cursor-pointer items-center gap-1.5"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsExpanded(true);
                  }}
                >
                  <span className="text-muted-foreground/50">└─</span>
                  <span className="italic">
                    +{hiddenLines} lines (click to expand)
                  </span>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
