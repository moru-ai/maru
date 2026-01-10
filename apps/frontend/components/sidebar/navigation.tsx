import { cn } from "@/lib/utils";
import { Info, LayoutGrid, Play, Plus, Settings } from "lucide-react";
import Link from "next/link";
import { SidebarView } from ".";
import { useModal } from "../layout/modal-context";
import { UserMenu } from "../auth/user-menu";
import { Button } from "../ui/button";
import { useSidebar } from "../ui/sidebar";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";
import { statusColorsConfig } from "./status";
import { useMemo } from "react";
import { LogoBurst } from "../graphics/logo/logo-burst";
import { TaskStatus } from "@repo/db";
import { useTask } from "@/hooks/tasks/use-task";
import { GithubLogo } from "../graphics/github/github-logo";

const PINGING_STATUSES: TaskStatus[] = ["INITIALIZING", "RUNNING"];

export function SidebarNavigation({
  sidebarView,
  setSidebarView,
  currentTaskId,
}: {
  sidebarView: SidebarView;
  setSidebarView: (view: SidebarView) => void;
  currentTaskId: string | null;
}) {
  const { open, toggleSidebar } = useSidebar();
  const { task } = useTask(currentTaskId ?? "");
  const { openSettingsModal } = useModal();

  const currentTaskStatus = task?.status;

  // Status dot color (if current task exists)
  const statusColor = useMemo(() => {
    if (task) {
      return statusColorsConfig[task.status].bg;
    }

    return currentTaskStatus ? statusColorsConfig[currentTaskStatus].bg : "";
  }, [task, currentTaskStatus]);

  const agentViewTrigger = (
    <div className="relative z-0 h-7">
      <div className="bg-card pointer-events-none absolute -right-1.5 -top-1.5 z-10 rounded-full p-1">
        <div className={cn("relative size-2 rounded-full", statusColor)}>
          <div
            className={cn(
              "absolute -left-px -top-px size-2.5 rounded-full opacity-25",
              statusColor,
              task?.status
                ? PINGING_STATUSES.includes(task.status)
                  ? "animate-ping"
                  : ""
                : ""
            )}
          />
        </div>
      </div>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size="iconSm"
            variant="ghost"
            className={cn(
              "border",
              sidebarView === "agent" && open
                ? "text-foreground bg-sidebar-accent border-sidebar-border hover:bg-sidebar-border"
                : "text-muted-foreground hover:text-foreground hover:bg-sidebar-accent border-transparent"
            )}
            onClick={() => {
              if (!open || sidebarView === "agent") {
                toggleSidebar();
              }
              setSidebarView("agent");
            }}
          >
            <Play />
          </Button>
        </TooltipTrigger>
        <TooltipContent lighter side="right">
          Active Agent View
        </TooltipContent>
      </Tooltip>
    </div>
  );

  return (
    <div className="bg-card flex h-svh flex-col justify-between border-r p-3">
      <div className="flex flex-col gap-6">
        <Link
          href="/"
          className="flex size-7 items-center justify-center"
          aria-label="Home"
        >
          <LogoBurst
            className={cn(
              process.env.NEXT_PUBLIC_VERCEL_ENV === "preview"
                ? "text-destructive"
                : ""
            )}
          />
        </Link>
        <div className="flex flex-col gap-3">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="iconSm" asChild className="mb-1">
                <Link href="/">
                  <Plus />
                </Link>
              </Button>
            </TooltipTrigger>
            <TooltipContent lighter side="right">
              New Task
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="iconSm"
                variant="ghost"
                className={cn(
                  "border",
                  sidebarView === "tasks" && open
                    ? "text-foreground bg-sidebar-accent border-sidebar-border hover:bg-sidebar-border"
                    : "text-muted-foreground hover:text-foreground hover:bg-sidebar-accent border-transparent"
                )}
                onClick={() => {
                  if (!open || sidebarView === "tasks") {
                    toggleSidebar();
                  }
                  setSidebarView("tasks");
                }}
              >
                <LayoutGrid />
              </Button>
            </TooltipTrigger>
            <TooltipContent lighter side="right">
              Tasks
            </TooltipContent>
          </Tooltip>
          {currentTaskId ? (
            <>
              <div className="bg-border h-px w-full" />
              {agentViewTrigger}
            </>
          ) : null}
        </div>
      </div>
      <div className="flex flex-col gap-3">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="iconSm"
              variant="ghost"
              className="text-muted-foreground hover:text-foreground hover:bg-sidebar-accent"
            >
              <a
                target="_blank"
                href="https://github.com/moru-ai/maru"
                rel="noreferrer"
              >
                <GithubLogo />
              </a>
            </Button>
          </TooltipTrigger>
          <TooltipContent lighter side="right">
            Maru Source Code
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="iconSm"
              variant="ghost"
              className="text-muted-foreground hover:text-foreground hover:bg-sidebar-accent mb-2"
              onClick={() => openSettingsModal()}
            >
              <Settings />
            </Button>
          </TooltipTrigger>
          <TooltipContent lighter side="right" shortcut="⌘K">
            Settings
          </TooltipContent>
        </Tooltip>
        <UserMenu />
      </div>
    </div>
  );
}
