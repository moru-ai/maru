import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { Task, TaskStatus } from "@repo/db";
import { Search, X, Archive, Copy, Trash } from "lucide-react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "../ui/context-menu";
import { statusColorsConfig, getDisplayStatus } from "./status";
import { getStatusText } from "@repo/types";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useRef, useState } from "react";
import { useDebounceCallback } from "@/lib/debounce";
import { useArchiveTask } from "@/hooks/tasks/use-archive-task";
import { useDeleteTask } from "@/hooks/tasks/use-delete-task";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";
import { toast } from "sonner";

const HIDDEN_STATUSES: TaskStatus[] = ["ARCHIVED", "FAILED"];

export function SidebarTasksView({
  tasks,
  loading,
  error,
}: {
  tasks: Task[];
  loading: boolean;
  error: Error | null;
}) {
  const searchFormRef = useRef<HTMLFormElement>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const archiveTask = useArchiveTask();
  const deleteTask = useDeleteTask();
  const { copyToClipboard } = useCopyToClipboard();

  // Debounced search handler
  const debouncedSearch = useDebounceCallback((query: string) => {
    setSearchQuery(query);
  }, 300);

  // Handler for archiving tasks
  const handleArchiveTask = (taskId: string) => {
    archiveTask.mutate(taskId);
  };

  // Handler for deleting tasks
  const handleDeleteTask = (taskId: string) => {
    deleteTask.mutate(taskId);
  };

  // Handler for copying task ID
  const handleCopyTaskId = async (taskId: string) => {
    const success = await copyToClipboard(taskId);
    if (success) {
      toast.success("Task ID copied to clipboard");
    } else {
      toast.error("Failed to copy task ID");
    }
  };

  // Filter and sort tasks
  const visibleTasks = tasks
    .filter((task) => !HIDDEN_STATUSES.includes(task.status as TaskStatus))
    .filter((task) => {
      if (!searchQuery.trim()) return true;
      const query = searchQuery.toLowerCase().trim();
      return (
        task.title.toLowerCase().includes(query) ||
        task.status.toLowerCase().includes(query)
      );
    })
    .sort((a, b) => {
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });

  // Helper function to render task item
  const renderTaskItem = (task: Task) => {
    const displayStatus = getDisplayStatus(task);
    const StatusIcon = statusColorsConfig[displayStatus].icon;
    return (
      <SidebarMenuItem key={task.id}>
        <ContextMenu>
          <ContextMenuTrigger asChild>
            <SidebarMenuButton
              className="flex h-auto flex-col items-start gap-0 overflow-hidden"
              asChild
            >
              <a href={`/tasks/${task.id}`} className="w-full overflow-hidden">
                <div className="flex w-full items-center gap-1.5">
                  <div className="line-clamp-1 flex-1">{task.title}</div>
                </div>
                <div className="text-muted-foreground flex max-w-full items-center gap-1 overflow-hidden text-xs">
                  <StatusIcon
                    className={`!size-3 shrink-0 ${statusColorsConfig[displayStatus].className}`}
                  />
                  <span className="mr-0.5 whitespace-nowrap text-xs capitalize">
                    {getStatusText(task).startsWith("Failed")
                      ? "Failed"
                      : getStatusText(task)}
                  </span>
                </div>
              </a>
            </SidebarMenuButton>
          </ContextMenuTrigger>
          <ContextMenuContent className="bg-sidebar-accent border-sidebar-border">
            <ContextMenuItem
              onClick={() => handleCopyTaskId(task.id)}
              className="text-muted-foreground hover:text-foreground hover:bg-sidebar-border! h-7"
            >
              <Copy className="size-3.5 text-inherit" />
              <span className="text-[13px]">Copy Task ID</span>
            </ContextMenuItem>
            <ContextMenuItem
              onClick={() => handleArchiveTask(task.id)}
              disabled={archiveTask.isPending}
              className="text-muted-foreground hover:text-foreground hover:bg-sidebar-border! h-7"
            >
              <Archive className="size-3.5 text-inherit" />
              <span className="text-[13px]">Archive Task</span>
            </ContextMenuItem>
            <ContextMenuItem
              onClick={() => handleDeleteTask(task.id)}
              disabled={deleteTask.isPending}
              className="text-destructive hover:text-destructive! hover:bg-sidebar-border! h-7"
            >
              <Trash className="size-3.5 text-inherit" />
              <span className="text-[13px]">Delete Task</span>
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
      </SidebarMenuItem>
    );
  };

  return (
    <>
      {/* Search Input */}
      <SidebarGroup>
        <form ref={searchFormRef} className="relative">
          <Search className="text-muted-foreground absolute left-2 top-1/2 size-3.5 -translate-y-1/2" />
          <Input
            placeholder="Search tasks..."
            className="h-8 px-7"
            onChange={(e) => debouncedSearch(e.target.value)}
          />
          {searchQuery && (
            <Button
              type="button"
              variant="ghost"
              size="iconXs"
              className="text-muted-foreground hover:text-foreground absolute right-1 top-1/2 -translate-y-1/2 rounded p-0"
              onClick={() => {
                setSearchQuery("");
                searchFormRef.current?.reset();
              }}
            >
              <X className="size-3.5" />
              <span className="sr-only">Clear search</span>
            </Button>
          )}
        </form>
      </SidebarGroup>

      {/* Loading State */}
      {loading && (
        <SidebarGroup>
          <SidebarGroupLabel className="text-muted-foreground hover:text-muted-foreground">
            Loading tasks...
          </SidebarGroupLabel>
        </SidebarGroup>
      )}

      {/* Error State */}
      {error && (
        <SidebarGroup>
          <SidebarGroupLabel className="text-destructive hover:text-destructive">
            Error: {error instanceof Error ? error.message : String(error)}
          </SidebarGroupLabel>
        </SidebarGroup>
      )}

      {/* Tasks List */}
      {!loading && !error && visibleTasks.length > 0 && (
        <SidebarGroup>
          <SidebarGroupContent>
            {visibleTasks.map((task) => renderTaskItem(task))}
          </SidebarGroupContent>
        </SidebarGroup>
      )}

      {/* Empty State */}
      {!loading && !error && visibleTasks.length === 0 && (
        <SidebarGroup>
          <SidebarGroupLabel className="text-muted-foreground hover:text-muted-foreground">
            {searchQuery
              ? `No tasks match "${searchQuery}".`
              : "No active tasks."}
          </SidebarGroupLabel>
        </SidebarGroup>
      )}
    </>
  );
}
