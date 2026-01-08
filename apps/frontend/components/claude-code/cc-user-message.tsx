"use client";

import Image from "next/image";
import { cn } from "@/lib/utils";
import type { UserMessage, ContentBlock } from "./types";
import { isTextBlock, isToolResultBlock, isImageBlock } from "./types";

interface CCUserMessageProps {
  message: UserMessage;
  className?: string;
}

/**
 * Claude Code User Message Component
 * Renders user messages from Claude Code session format
 */
export function CCUserMessage({ message, className }: CCUserMessageProps) {
  // Extract text content from message
  const content = message.message.content;

  // Handle string content (compact summary) vs array content
  const textContent =
    typeof content === "string" ? content : extractTextFromBlocks(content);

  // Extract images from content
  const images = typeof content === "string" ? [] : extractImagesFromBlocks(content);

  return (
    <div
      className={cn(
        "relative w-full rounded-lg p-px",
        "user-message-border user-message-shadow",
        className
      )}
    >
      <div className="from-card/10 to-card relative z-0 w-full overflow-clip rounded-lg bg-gradient-to-t px-3 py-2 text-sm">
        {/* Images */}
        {images.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {images.map((img, i) => (
              <div
                key={i}
                className="relative overflow-hidden rounded-md border border-border/50"
              >
                <Image
                  src={`data:${img.mediaType};base64,${img.data}`}
                  alt={`Attached image ${i + 1}`}
                  width={200}
                  height={200}
                  className="max-h-48 w-auto object-contain"
                  unoptimized
                />
              </div>
            ))}
          </div>
        )}
        {/* Text */}
        {textContent && <div className="whitespace-pre-wrap">{textContent}</div>}
      </div>
      <div className="bg-background absolute inset-px -z-10 rounded-[calc(var(--radius)+1px)]" />
    </div>
  );
}

/**
 * Extract text content from content blocks
 */
function extractTextFromBlocks(blocks: ContentBlock[]): string {
  return blocks
    .filter(isTextBlock)
    .map((block) => block.text)
    .join("\n");
}

/**
 * Extract images from content blocks
 */
function extractImagesFromBlocks(
  blocks: ContentBlock[]
): Array<{ mediaType: string; data: string }> {
  return blocks.filter(isImageBlock).map((block) => ({
    mediaType: block.source.media_type,
    data: block.source.data,
  }));
}

/**
 * Check if this is a tool result message (user message containing tool results)
 */
export function isToolResultMessage(message: UserMessage): boolean {
  const content = message.message.content;
  if (typeof content === "string") return false;
  return content.some(isToolResultBlock);
}
