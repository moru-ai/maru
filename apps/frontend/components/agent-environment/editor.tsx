"use client";

import { patchMonacoWithShiki } from "@/lib/editor/highlighter";
import { AlertTriangle, ChevronRight, Code, Eye } from "lucide-react";
import dynamic from "next/dynamic";
import { Fragment, useEffect, useState, memo, useMemo } from "react";
import { getLanguageFromPath } from "@repo/types";
import { LogoHover } from "../graphics/logo/logo-hover";
import { MemoizedMarkdown } from "../chat/markdown/memoized-markdown";
import { Button } from "../ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";

// Dynamic import Monaco Editor to avoid SSR issues
const MonacoEditor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
  loading: () => (
    <div className="bg-background flex size-full items-center justify-center">
      Loading editor...
    </div>
  ),
});

type ViewMode = "preview" | "source";

function EditorComponent({
  selectedFilePath,
  selectedFileContent,
  isLoadingContent,
  contentError,
}: {
  selectedFilePath?: string | null;
  selectedFileContent?: string;
  isLoadingContent?: boolean;
  contentError?: string;
}) {
  const [isShikiReady, setIsShikiReady] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("preview");

  // Extract content string or object
  const fileContentString = selectedFileContent || "";

  // Check file types for preview support
  const isMarkdownFile =
    selectedFilePath?.endsWith(".md") ||
    selectedFilePath?.endsWith(".markdown");
  const isHtmlFile =
    selectedFilePath?.endsWith(".html") ||
    selectedFilePath?.endsWith(".htm");
  const isPdfFile = selectedFilePath?.endsWith(".pdf");

  // Files that support preview mode
  const hasPreviewSupport = isMarkdownFile || isHtmlFile || isPdfFile;

  // Reset to preview mode when file changes (if it supports preview)
  useEffect(() => {
    if (hasPreviewSupport) {
      setViewMode("preview");
    } else {
      setViewMode("source");
    }
  }, [selectedFilePath, hasPreviewSupport]);

  useEffect(() => {
    patchMonacoWithShiki().then(() => {
      setIsShikiReady(true);
    });
  }, []);

  const filePathHeader = (
    <div className="text-muted-foreground flex items-center justify-between px-5 pb-1 pt-2 text-[13px]">
      <div className="flex items-center gap-0.5">
        {selectedFilePath &&
          selectedFilePath
            .split("/")
            .filter((part) => part && part !== "workspace")
            .map((part, index) => (
              <Fragment key={index}>
                {index > 0 && (
                  <span className="text-muted-foreground">
                    <ChevronRight className="size-3" />
                  </span>
                )}
                <span className="text-muted-foreground leading-tight">
                  {part}
                </span>
              </Fragment>
            ))}
      </div>
      <div className="flex items-center gap-2">
        {hasPreviewSupport && selectedFilePath && (
          <div className="flex items-center rounded-md border border-border">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className={`h-6 rounded-r-none px-2 ${viewMode === "preview" ? "bg-muted" : ""}`}
                  onClick={() => setViewMode("preview")}
                >
                  <Eye className="size-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Preview</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className={`h-6 rounded-l-none px-2 ${viewMode === "source" ? "bg-muted" : ""}`}
                  onClick={() => setViewMode("source")}
                >
                  <Code className="size-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Source</TooltipContent>
            </Tooltip>
          </div>
        )}
        {selectedFilePath && (
          <span className="bg-muted text-muted-foreground rounded px-2 py-0.5 text-xs">
            Read-only
          </span>
        )}
      </div>
    </div>
  );

  return (
    <div className="bg-background flex size-full flex-col">
      {filePathHeader}
      <div className="code-editor relative z-0 flex-1 overflow-hidden pl-2">
        {(isLoadingContent || contentError || !selectedFilePath) && (
          <div className="bg-background text-muted-foreground absolute inset-0 z-10 flex select-none items-center justify-center gap-2 text-sm">
            {isLoadingContent ? (
              <div className="flex items-center gap-2">
                <LogoHover size="sm" forceAnimate className="opacity-60" />
                Loading file content
              </div>
            ) : contentError ? (
              <div className="flex items-center justify-center gap-2 break-words leading-none">
                <AlertTriangle className="text-destructive size-4 shrink-0" />
                Error loading file: {contentError || "Unknown error"}
              </div>
            ) : (
              <div>No file selected</div>
            )}
          </div>
        )}
        {viewMode === "preview" && isMarkdownFile && fileContentString ? (
          <div className="h-full overflow-auto p-4">
            <MemoizedMarkdown
              content={fileContentString}
              id={selectedFilePath || ""}
            />
          </div>
        ) : viewMode === "preview" && isHtmlFile && fileContentString ? (
          <iframe
            srcDoc={fileContentString}
            className="h-full w-full bg-white"
            sandbox="allow-scripts"
            title="HTML Preview"
          />
        ) : viewMode === "preview" && isPdfFile && fileContentString ? (
          <iframe
            src={`data:application/pdf;base64,${btoa(fileContentString)}`}
            className="h-full w-full"
            title="PDF Preview"
          />
        ) : (
          <MonacoEditor
            height="100%"
            language={
              selectedFilePath
                ? getLanguageFromPath(selectedFilePath)
                : "plaintext"
            }
            value={fileContentString}
            theme={isShikiReady ? "vesper" : "vs-dark"}
            options={{
              readOnly: true,
              minimap: { enabled: false },
              fontSize: 13,
              wordWrap: "on",
              scrollBeyondLastLine: false,
              lineNumbersMinChars: 2,
              padding: {
                top: 8,
                bottom: 8,
              },
            }}
          />
        )}
      </div>
    </div>
  );
}

export const Editor = memo(EditorComponent, (prevProps, nextProps) => {
  return (
    prevProps.selectedFilePath === nextProps.selectedFilePath &&
    prevProps.selectedFileContent === nextProps.selectedFileContent &&
    prevProps.isLoadingContent === nextProps.isLoadingContent &&
    prevProps.contentError === nextProps.contentError
  );
});
