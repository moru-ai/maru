"use client";

import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import type { ThinkingBlock } from "./types";
import { FadedMarkdown } from "../chat/markdown/memoized-markdown";

interface CCThinkingBlockProps {
  block: ThinkingBlock;
  isLoading?: boolean;
  defaultOpen?: boolean;
}

/**
 * Claude Code Thinking Block Component
 * Renders extended thinking/reasoning from Claude
 */
export function CCThinkingBlock({
  block,
  isLoading = false,
  defaultOpen = false,
}: CCThinkingBlockProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  const trimmedThinking = block.thinking.trim();

  return (
    <div className="border-border/50 bg-muted/30 rounded-lg border">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "flex w-full items-center gap-2 px-3 py-2 text-left text-sm",
          "hover:bg-muted/50 transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        )}
      >
        <ChevronDown
          className={cn(
            "text-muted-foreground size-4 transition-transform",
            isOpen && "rotate-180"
          )}
        />
        <span className="text-muted-foreground font-medium">
          {isLoading ? (
            <span className="shimmer">Thinking...</span>
          ) : (
            "Thinking"
          )}
        </span>
      </button>

      {isOpen && (
        <div className="border-border/50 border-t px-3 py-2">
          <div className="text-muted-foreground text-sm">
            <FadedMarkdown
              content={trimmedThinking}
              id={`thinking-${block.signature?.slice(0, 8) || "block"}`}
            />
          </div>
        </div>
      )}
    </div>
  );
}
