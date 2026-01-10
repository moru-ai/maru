"use client";

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useTasks } from "@/hooks/tasks/use-tasks";
import { Task } from "@repo/db";
import { useEffect, useRef, useState } from "react";
import { SidebarAgentView } from "./agent-view";
import { SidebarNavigation } from "./navigation";
import { SidebarTasksView } from "./tasks-view";
import { Info } from "lucide-react";

export type SidebarView = "tasks" | "agent";

const sidebarViewLabels = {
  tasks: { label: "Tasks", tooltip: null },
  agent: { label: "Agent View", tooltip: null },
};

export function SidebarViews({
  initialTasks,
  currentTaskId = null,
}: {
  initialTasks: Task[];
  currentTaskId?: string | null;
}) {
  const {
    data: tasks,
    isLoading: isLoadingTasks,
    error: tasksError,
  } = useTasks(initialTasks);

  const [sidebarView, setSidebarView] = useState<SidebarView>(
    currentTaskId ? "agent" : "tasks"
  );

  // Initial render trick to avoid hydration issues on navigation
  const isInitialRender = useRef(true);
  useEffect(() => {
    if (isInitialRender.current) {
      isInitialRender.current = false;
      return;
    }
    if (currentTaskId) {
      setSidebarView("agent");
    } else {
      if (sidebarView === "agent") {
        setSidebarView("tasks");
      }
    }
  }, [currentTaskId]);

  return (
    <div className="flex">
      <SidebarNavigation
        currentTaskId={currentTaskId}
        sidebarView={sidebarView}
        setSidebarView={setSidebarView}
      />
      <Sidebar>
        <SidebarContent>
          <SidebarGroup className="flex h-7 flex-row items-center justify-between">
            <div className="flex select-none items-center gap-1.5 overflow-hidden">
              <div className="truncate font-medium">
                {sidebarViewLabels[sidebarView].label}
              </div>
              {sidebarViewLabels[sidebarView].tooltip && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="text-muted-foreground size-3.5" />
                  </TooltipTrigger>
                  <TooltipContent
                    lighter
                    sideOffset={8}
                    side="bottom"
                    className="h-auto max-w-52"
                  >
                    {sidebarViewLabels[sidebarView].tooltip}
                  </TooltipContent>
                </Tooltip>
              )}
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <SidebarTrigger className="hover:bg-sidebar-accent" />
              </TooltipTrigger>
              <TooltipContent lighter side="right" shortcut="⌘B">
                Toggle Sidebar
              </TooltipContent>
            </Tooltip>
          </SidebarGroup>
          <div className="mt-6 flex flex-col gap-4">
            {currentTaskId && sidebarView === "agent" ? (
              <SidebarAgentView taskId={currentTaskId} />
            ) : (
              <SidebarTasksView
                tasks={tasks}
                loading={isLoadingTasks}
                error={tasksError}
                currentTaskId={currentTaskId}
              />
            )}
          </div>
        </SidebarContent>
      </Sidebar>
    </div>
  );
}
