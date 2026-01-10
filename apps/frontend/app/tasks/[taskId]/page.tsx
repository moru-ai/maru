"use client";

import { Button } from "@/components/ui/button";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { AppWindowMac } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ImperativePanelGroupHandle } from "react-resizable-panels";
import { StickToBottom } from "use-stick-to-bottom";
import { MemoizedAgentEnvironment as AgentEnvironment } from "@/components/agent-environment/agent-environment";
import { MemoizedCCTaskPageContent as TaskPageContent } from "@/components/task/cc-task-content";
import { useAgentEnvironment } from "@/components/agent-environment/agent-environment-context";
import { useTaskTitle, useUpdateTaskTitle } from "@/hooks/tasks/use-task-title";
import { useTaskStatus } from "@/hooks/tasks/use-task-status";
import { useParams } from "next/navigation";

export default function TaskPage() {
  const { taskId } = useParams<{ taskId: string }>();

  const { open } = useSidebar();

  const [isEditing, setIsEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data } = useTaskStatus(taskId);
  const taskStatus = data?.status;
  const isArchived = taskStatus === "ARCHIVED";

  const { data: taskTitle } = useTaskTitle(taskId);
  const [editValue, setEditValue] = useState(taskTitle || "");
  const {
    mutate: mutateTaskTitle,
    variables: taskTitleVariables,
    isPending: isUpdatingTaskTitle,
  } = useUpdateTaskTitle();

  useEffect(() => {
    if (taskTitle) {
      setEditValue(taskTitle);
    }
  }, [taskTitle]);

  /* 
  Resizable panel state
  */

  const { 
    rightPanelRef, 
    lastPanelSizeRef, 
    triggerTerminalResize,
    isSheetOpen,
    setIsSheetOpen,
    shouldUseSheet,
  } = useAgentEnvironment();
  const [isAgentEnvironmentOpen, setIsAgentEnvironmentOpen] = useState(false);
  const resizablePanelGroupRef = useRef<ImperativePanelGroupHandle>(null);

  const handleLayout = useCallback(() => {
    triggerTerminalResize();

    if (rightPanelRef.current) {
      if (rightPanelRef.current.isCollapsed() && isAgentEnvironmentOpen) {
        setIsAgentEnvironmentOpen(false);
      } else if (
        !rightPanelRef.current.isCollapsed() &&
        !isAgentEnvironmentOpen
      ) {
        setIsAgentEnvironmentOpen(true);
      }
    }
  }, [triggerTerminalResize, rightPanelRef, isAgentEnvironmentOpen]);

  /* 
  Keyboard shortcuts
  */

  const handleToggleRightPanel = useCallback(() => {
    if (shouldUseSheet) {
      setIsSheetOpen(true);
      return;
    }

    const panel = rightPanelRef.current;
    if (!panel) return;
    if (panel.isCollapsed()) {
      panel.expand();
      if (!lastPanelSizeRef.current) {
        panel.resize(40);
      }
    } else {
      lastPanelSizeRef.current = rightPanelRef.current?.getSize() ?? null;
      panel.collapse();
    }
  }, [shouldUseSheet, rightPanelRef]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "j" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        handleToggleRightPanel();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleToggleRightPanel]);

  const titleRef = useRef<HTMLDivElement>(null);

  const handleTitleClick = useCallback(() => {
    if (isArchived) {
      return;
    }
    setIsEditing(true);
  }, [isArchived]);

  const handleInputKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.stopPropagation();
        if (editValue.trim() && editValue !== taskTitle) {
          mutateTaskTitle({ taskId, title: editValue.trim() });
        }
        setIsEditing(false);
      } else if (e.key === "Escape") {
        e.stopPropagation();
        setIsEditing(false);
        setEditValue(taskTitle || "");
      }
    },
    [editValue, taskTitle, mutateTaskTitle, taskId]
  );

  const handleInputBlur = useCallback(() => {
    if (editValue.trim() && editValue !== taskTitle) {
      mutateTaskTitle({ taskId, title: editValue.trim() });
    } else {
      setEditValue(taskTitle || "");
    }
    setIsEditing(false);
  }, [editValue, taskTitle, mutateTaskTitle, taskId]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  return (
    <>
      <ResizablePanelGroup
        ref={resizablePanelGroupRef}
        direction="horizontal"
        className="min-h-svh"
        onLayout={handleLayout}
      >
        <ResizablePanel minSize={30} defaultSize={100}>
          <StickToBottom
            className="relative flex size-full max-h-svh flex-col overflow-y-auto"
            resize="smooth"
            initial="smooth"
          >
            <StickToBottom.Content className="relative flex min-h-svh w-full flex-col">
              <div className="bg-background sticky top-0 z-10 flex w-full items-center justify-between pb-3">
                <div className="h-13 flex grow items-center gap-1 overflow-hidden p-3 pr-0">
                  {!open && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <SidebarTrigger />
                      </TooltipTrigger>
                      <TooltipContent side="right" shortcut="⌘B">
                        {open ? "Close Sidebar" : "Open Sidebar"}
                      </TooltipContent>
                    </Tooltip>
                  )}

                  <div className="relative">
                    <input
                      ref={inputRef}
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onKeyDown={handleInputKeyDown}
                      onBlur={handleInputBlur}
                      className={cn(
                        "focus:ring-ring/10 focus:border-border absolute left-0 top-0 z-10 h-7 w-full min-w-36 items-center rounded-md border border-transparent bg-transparent px-2 focus:outline-none focus:ring-2",
                        isEditing ? "flex" : "pointer-events-none hidden"
                      )}
                    />
                    <div
                      className={cn(
                        " flex h-7 cursor-text items-center truncate rounded-md border border-transparent px-2",
                        isEditing
                          ? "pointer-events-none opacity-0"
                          : "opacity-100",
                        isArchived ? "" : "hover:border-border"
                      )}
                      onClick={handleTitleClick}
                      ref={titleRef}
                    >
                      {isUpdatingTaskTitle ? (
                        <span className="animate-pulse truncate">
                          {taskTitleVariables?.title}
                        </span>
                      ) : (
                        <span className="truncate">
                          {isArchived ? "[ARCHIVED] " : ""}
                          {editValue}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {(!isAgentEnvironmentOpen || shouldUseSheet) && (
                  <div className="p-3">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className={cn("size-7 cursor-pointer")}
                          onClick={handleToggleRightPanel}
                        >
                          <AppWindowMac className="size-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="left" shortcut="⌘J">
                        Toggle Shadow Realm
                      </TooltipContent>
                    </Tooltip>
                  </div>
                )}
              </div>
              <TaskPageContent />
            </StickToBottom.Content>
          </StickToBottom>
        </ResizablePanel>
        {!shouldUseSheet && (
          <>
            <ResizableHandle />
            <ResizablePanel
              minSize={40}
              collapsible
              collapsedSize={0}
              defaultSize={0}
              ref={rightPanelRef}
            >
              <AgentEnvironment />
            </ResizablePanel>
          </>
        )}
      </ResizablePanelGroup>

      {shouldUseSheet && (
        <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
          <SheetContent
            side="right"
            hideCloseButton
            className="w-[90%] sm:w-3/4 sm:max-w-none"
          >
            <div className="flex-1 overflow-hidden">
              <AgentEnvironment isSheetOverlay />
            </div>
          </SheetContent>
        </Sheet>
      )}
    </>
  );
}
