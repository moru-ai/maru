"use client";

import { useParams } from "next/navigation";
import { useState, memo, useCallback } from "react";
import { Editor } from "./editor";
import { FileExplorer } from "./file-explorer";
import { Button } from "../ui/button";
import { AlertTriangle, X } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";
import { useFileTree } from "@/hooks/agent-environment/use-file-tree";
import { useAgentEnvironment } from "./agent-environment-context";
import { LogoHover } from "../graphics/logo/logo-hover";
import { LeftPanelIcon } from "../graphics/icons/left-panel-icon";
import { LeftPanelOpenIcon } from "../graphics/icons/left-panel-open-icon";
import { Close as SheetPrimitiveClose } from "@radix-ui/react-dialog";
import { useTaskStatus } from "@/hooks/tasks/use-task-status";
import { SheetTitle } from "../ui/sheet";
import { FileNode } from "@repo/types";
import { toast } from "sonner";

function AgentEnvironment({
  isSheetOverlay = false,
}: {
  isSheetOverlay?: boolean;
}) {
  const [isExplorerCollapsed, setIsExplorerCollapsed] = useState(false);

  const { taskId } = useParams<{ taskId: string }>();

  // Use context for file selection state
  const {
    rightPanelRef,
    selectedFilePath,
    selectedFileWithContent,
    updateSelectedFilePath,
    isLoadingContent,
    contentError,
    shouldUseSheet,
  } = useAgentEnvironment();

  const { data: treeData, error: treeError, isLoading: isTreeLoading } = useFileTree(taskId, { polling: true });
  const { data } = useTaskStatus(taskId);
  const { status } = data || {};
  const isLoading = status === "INITIALIZING";

  const handleClose = useCallback(() => {
    if (rightPanelRef.current) {
      const panel = rightPanelRef.current;
      panel.collapse();
    }
  }, [rightPanelRef]);

  const handleFileDownload = useCallback(
    async (file: FileNode) => {
      try {
        const params = new URLSearchParams({ path: file.path });
        const res = await fetch(`/api/tasks/${taskId}/files/content?${params}`);

        if (!res.ok) {
          throw new Error("Failed to fetch file");
        }

        const data = await res.json();
        if (!data.success || !data.content) {
          throw new Error("Failed to get file content");
        }

        const blob = new Blob([data.content], { type: "text/plain" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = file.name;
        a.click();
        URL.revokeObjectURL(url);
      } catch {
        toast.error("Failed to download file");
      }
    },
    [taskId]
  );

  // Loading state UI
  if (isLoading) {
    return (
      <EmptyStateWrapper onClose={handleClose} isSheetOverlay={isSheetOverlay}>
        <div className="font-departureMono flex items-center gap-4 text-xl font-medium tracking-tighter">
          <LogoHover forceAnimate />
          Initializing Maru Workspace...
        </div>
      </EmptyStateWrapper>
    );
  }

  // Error state UI
  if (treeError) {
    return (
      <EmptyStateWrapper onClose={handleClose} isSheetOverlay={isSheetOverlay}>
        <div className="font-departureMono flex items-center gap-4 text-xl font-medium tracking-tighter">
          <AlertTriangle className="text-destructive size-5 shrink-0" />
          Failed to Load Workspace
        </div>
        <Button
          size="lg"
          onClick={() => window.location.reload()}
          variant="secondary"
          className="border-sidebar-border hover:border-sidebar-border"
        >
          Try Again
        </Button>
      </EmptyStateWrapper>
    );
  }

  // Ready state - normal UI
  return (
    <div className="flex size-full h-svh flex-col overflow-hidden">
      <div className="border-border bg-card h-13 flex shrink-0 items-center justify-between border-b px-2">
        {shouldUseSheet ? (
          <SheetTitle className="font-departureMono font-normal tracking-tight">
            Maru Workspace
          </SheetTitle>
        ) : (
          <div className="font-departureMono font-normal tracking-tight">
            Maru Workspace
          </div>
        )}
        <div className="flex items-center gap-0.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="hover:bg-sidebar-accent size-7 cursor-pointer"
                onClick={() => setIsExplorerCollapsed((prev) => !prev)}
              >
                {isExplorerCollapsed ? (
                  <LeftPanelIcon className="size-4" />
                ) : (
                  <LeftPanelOpenIcon className="size-4" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" align="end">
              {isExplorerCollapsed ? "Open" : "Close"} File Explorer
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              {isSheetOverlay ? (
                <SheetPrimitiveClose asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="hover:bg-sidebar-accent size-7 cursor-pointer"
                    onClick={handleClose}
                  >
                    <X className="size-4" />
                  </Button>
                </SheetPrimitiveClose>
              ) : (
                <Button
                  variant="ghost"
                  size="icon"
                  className="hover:bg-sidebar-accent size-7 cursor-pointer"
                  onClick={handleClose}
                >
                  <X className="size-4" />
                </Button>
              )}
            </TooltipTrigger>
            <TooltipContent side="bottom" align="end">
              Close Maru Workspace
            </TooltipContent>
          </Tooltip>
        </div>
      </div>
      <div className="@container/agent-environment flex w-full grow overflow-hidden">
        <FileExplorer
          isAgentEnvironment={true}
          files={treeData?.tree || []}
          onFileSelect={(file) => updateSelectedFilePath(file.path)}
          onFileDownload={handleFileDownload}
          selectedFilePath={selectedFilePath}
          isCollapsed={isExplorerCollapsed}
          onToggleCollapse={() => setIsExplorerCollapsed(!isExplorerCollapsed)}
          isLoading={isTreeLoading}
        />
        <div className="flex-1 overflow-hidden">
          <Editor
            selectedFilePath={selectedFilePath}
            selectedFileContent={selectedFileWithContent?.content || ""}
            isLoadingContent={isLoadingContent}
            contentError={contentError}
          />
        </div>
      </div>
    </div>
  );
}

function EmptyStateWrapper({
  children,
  onClose,
  isSheetOverlay,
}: {
  children: React.ReactNode;
  onClose: () => void;
  isSheetOverlay: boolean;
}) {
  return (
    <div className="relative flex size-full max-h-svh select-none flex-col items-center justify-center gap-4 p-4 text-center">
      <Tooltip>
        <TooltipTrigger asChild>
          {isSheetOverlay ? (
            <SheetPrimitiveClose asChild>
              <Button
                variant="ghost"
                size="icon"
                className="hover:bg-sidebar-accent absolute right-2 top-2 size-7 cursor-pointer"
                onClick={onClose}
              >
                <X className="size-4" />
              </Button>
            </SheetPrimitiveClose>
          ) : (
            <Button
              variant="ghost"
              size="icon"
              className="hover:bg-sidebar-accent absolute right-2 top-2 size-7 cursor-pointer"
              onClick={onClose}
            >
              <X className="size-4" />
            </Button>
          )}
        </TooltipTrigger>
        <TooltipContent side="bottom" align="end">
          Close Maru Workspace
        </TooltipContent>
      </Tooltip>
      {children}
    </div>
  );
}

export const MemoizedAgentEnvironment = memo(AgentEnvironment);
