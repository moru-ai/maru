"use client";

import { patchMonacoWithShiki } from "@/lib/editor/highlighter";
import { AlertTriangle, ChevronRight } from "lucide-react";
import dynamic from "next/dynamic";
import { Fragment, useEffect, useState, memo, useMemo } from "react";
import { getLanguageFromPath } from "@repo/types";
import { LogoHover } from "../graphics/logo/logo-hover";
import { MemoizedMarkdown } from "../chat/markdown/memoized-markdown";

// Dynamic import Monaco Editor to avoid SSR issues
const MonacoEditor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
  loading: () => (
    <div className="bg-background flex size-full items-center justify-center">
      Loading editor...
    </div>
  ),
});

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

  // Extract content string or object
  const fileContentString = selectedFileContent || "";

  // Check if the selected file is a markdown file
  const isMarkdownFile =
    selectedFilePath?.endsWith(".md") ||
    selectedFilePath?.endsWith(".markdown");

  useEffect(() => {
    patchMonacoWithShiki().then(() => {
      setIsShikiReady(true);
    });
  }, []);

  const filePathHeader = useMemo(
    () => (
      <div className="text-muted-foreground flex items-center gap-0.5 px-5 pb-1 pt-2 text-[13px]">
        {selectedFilePath &&
          selectedFilePath.split("/").map((part, index) => (
            <Fragment key={index}>
              {index > 1 && (
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
    ),
    [selectedFilePath]
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
        {isMarkdownFile && fileContentString ? (
          <div className="h-full overflow-auto p-4">
            <MemoizedMarkdown
              content={fileContentString}
              id={selectedFilePath || ""}
            />
          </div>
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
