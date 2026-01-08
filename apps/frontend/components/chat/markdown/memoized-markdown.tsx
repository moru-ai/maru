import { marked } from "marked";
import { memo, useMemo, useEffect, useState, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ShikiCode } from "@/components/ui/shiki-code";
import { useStickToBottom } from "use-stick-to-bottom";

function parseMarkdownIntoBlocks(markdown: string): string[] {
  const tokens = marked.lexer(markdown);
  return tokens.map((token) => token.raw);
}

const MemoizedMarkdownBlock = memo(
  ({ content }: { content: string }) => {
    return (
      <div className="prose text-foreground prose-headings:font-medium prose-h1:text-2xl prose-sm prose-invert prose-neutral prose-ul:list-disc prose-ol:list-decimal prose-li:marker:text-muted-foreground prose-code:rounded-sm prose-code:border prose-code:bg-card prose-code:px-1 prose-code:before:content-none prose-code:after:content-none prose-code:font-normal prose-pre:p-0 prose-pre:bg-background prose-table:border-collapse prose-th:border prose-th:border-border prose-th:px-4 prose-th:py-2 prose-th:bg-muted/50 prose-th:first:pl-4 prose-td:border prose-td:border-border prose-td:px-4 prose-td:py-2 prose-td:first:pl-4 max-w-none">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            code: ({ inline, children, className, ...props }: any) => {
              const isInline = inline ?? !className;
              return (
                <ShikiCode
                  inline={isInline}
                  {...(className && { className })}
                  {...props}
                >
                  {String(children).replace(/\n$/, "")}
                </ShikiCode>
              );
            },
          }}
        >
          {content}
        </ReactMarkdown>
      </div>
    );
  },
  (prevProps, nextProps) => {
    if (prevProps.content !== nextProps.content) return false;
    return true;
  }
);

MemoizedMarkdownBlock.displayName = "MemoizedMarkdownBlock";

export const MemoizedMarkdown = memo(
  ({ content, id }: { content: string; id: string }) => {
    const blocks = useMemo(() => parseMarkdownIntoBlocks(content), [content]);

    return (
      <div className="space-y-2">
        {blocks.map((block, index) => (
          <MemoizedMarkdownBlock content={block} key={`${id}-block_${index}`} />
        ))}
      </div>
    );
  }
);

MemoizedMarkdown.displayName = "MemoizedMarkdown";

export function FadedMarkdown({
  content,
  id,
}: {
  content: string;
  id: string;
}) {
  const { scrollRef, contentRef } = useStickToBottom();
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [isAtTop, setIsAtTop] = useState(true);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [hasOverflow, setHasOverflow] = useState(false);

  // Check if content overflows and handle top scroll detection
  useEffect(() => {
    const container = scrollContainerRef.current;
    const content = contentRef.current;

    if (!container || !content) return;

    const checkOverflowAndPosition = () => {
      // Check if content height exceeds container height
      const containerHeight = container.clientHeight;
      const contentHeight = content.scrollHeight;
      const hasContentOverflow = contentHeight > containerHeight;
      setHasOverflow(hasContentOverflow);

      // Check if at top (within 10px buffer)
      const scrollTop = container.scrollTop;
      setIsAtTop(scrollTop <= 10);

      // Check if at bottom (within 10px buffer)
      const scrollHeight = container.scrollHeight;
      const clientHeight = container.clientHeight;
      const isNearBottom = scrollTop + clientHeight >= scrollHeight - 10;
      setIsAtBottom(isNearBottom);
    };

    checkOverflowAndPosition();

    // Listen to scroll events with passive option
    container.addEventListener("scroll", checkOverflowAndPosition, {
      passive: true,
    });

    // Use ResizeObserver to detect content changes
    const resizeObserver = new ResizeObserver(checkOverflowAndPosition);
    resizeObserver.observe(content);

    return () => {
      container.removeEventListener("scroll", checkOverflowAndPosition);
      resizeObserver.disconnect();
    };
  }, [content, contentRef]);

  const showTopFade = hasOverflow && !isAtTop;
  const showBottomFade = hasOverflow && !isAtBottom;

  return (
    <div className="relative z-0">
      {/* Top fade */}
      {showTopFade && (
        <div className="from-background pointer-events-none absolute -top-px left-0 z-10 h-16 w-full bg-gradient-to-b to-transparent" />
      )}

      {/* Bottom fade */}
      {showBottomFade && (
        <div className="from-background pointer-events-none absolute -bottom-px left-0 z-10 h-16 w-full bg-gradient-to-t to-transparent" />
      )}

      <div
        className="max-h-80 overflow-auto opacity-70"
        ref={(el) => {
          scrollRef.current = el;
          scrollContainerRef.current = el;
        }}
      >
        <div ref={contentRef}>
          <MemoizedMarkdown content={content} id={id} />
        </div>
      </div>
    </div>
  );
}
