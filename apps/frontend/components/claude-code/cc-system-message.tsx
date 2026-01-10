"use client";

import { cn } from "@/lib/utils";
import { AlertCircle, Zap, Scissors } from "lucide-react";
import type { SystemMessage } from "./types";

interface CCSystemMessageProps {
  message: SystemMessage;
  className?: string;
}

/**
 * Format milliseconds to a human-readable duration
 */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = (seconds % 60).toFixed(0);
  return `${minutes}m ${remainingSeconds}s`;
}

/**
 * Format token count with K/M suffix
 */
function formatTokens(tokens: number): string {
  if (tokens < 1000) return tokens.toString();
  if (tokens < 1000000) return `${(tokens / 1000).toFixed(1)}K`;
  return `${(tokens / 1000000).toFixed(2)}M`;
}

/**
 * Claude Code System Message Component
 * Renders system messages like turn duration, API errors, and compact boundaries
 */
export function CCSystemMessage({ message, className }: CCSystemMessageProps) {
  switch (message.subtype) {
    case "turn_duration":
      return (
        <div
          className={cn(
            "flex items-center gap-1.5 text-xs text-muted-foreground py-1",
            className
          )}
        >
          <Zap className="h-3 w-3" />
          <span>Turn completed in {formatDuration(message.durationMs ?? 0)}</span>
        </div>
      );

    case "api_error":
      return (
        <div
          className={cn(
            "flex items-start gap-2 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive",
            className
          )}
        >
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <div className="flex-1">
            <div className="font-medium">API Error</div>
            {message.content && (
              <div className="mt-1 text-xs opacity-90 whitespace-pre-wrap">
                {message.content}
              </div>
            )}
          </div>
        </div>
      );

    case "compact_boundary":
      return (
        <div
          className={cn(
            "flex items-center justify-center gap-2 py-2",
            className
          )}
        >
          <div className="h-px flex-1 bg-border" />
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground px-2">
            <Scissors className="h-3 w-3" />
            <span>
              Context compacted
              {message.compactMetadata?.preTokens && (
                <span className="opacity-70">
                  {" "}({formatTokens(message.compactMetadata.preTokens)} tokens)
                </span>
              )}
            </span>
          </div>
          <div className="h-px flex-1 bg-border" />
        </div>
      );

    case "stop_hook_summary":
      // Usually not important to show, but could add if needed
      return null;

    case "local_command":
      // User ran a slash command - could show if needed
      return null;

    default:
      return null;
  }
}

/**
 * Check if a system message should be displayed
 */
export function shouldShowSystemMessage(message: SystemMessage): boolean {
  return (
    message.subtype === "turn_duration" ||
    message.subtype === "api_error" ||
    message.subtype === "compact_boundary"
  );
}
