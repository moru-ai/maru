"use client";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { useTask } from "@/hooks/tasks/use-task";
import { useSessionEntries } from "@/hooks/session/use-session-entries";
import { extractTodosFromEntries } from "@/components/claude-code/cc-todo-panel";
import { cn } from "@/lib/utils";
import {
  CircleDashed,
  FileDiff,
  FolderGit2,
  ListTodo,
  Square,
  SquareCheck,
} from "lucide-react";
import { useCallback, useMemo, useState, useEffect, useRef } from "react";
import { statusColorsConfig } from "./status";
import { FileExplorer } from "@/components/agent-environment/file-explorer";
import { FileNode } from "@repo/types";
import { useAgentEnvironment } from "@/components/agent-environment/agent-environment-context";
import { Badge } from "../ui/badge";
import { Card } from "../ui/card";

const todoStatusConfig = {
  pending: { icon: Square, className: "text-muted-foreground" },
  in_progress: { icon: CircleDashed, className: "" },
  completed: { icon: SquareCheck, className: "" },
};

// Intermediate tree node structure for building the tree
interface TreeNode {
  name: string;
  type: "file" | "folder";
  path: string;
  children?: Record<string, TreeNode>;
}
type FileTree = Record<string, TreeNode>;

function createFileTree(filePaths: string[]): FileNode[] {
  const tree: FileTree = {};

  filePaths.forEach((filePath) => {
    const parts = filePath.split("/");
    let current: FileTree = tree;

    parts.forEach((part, index) => {
      if (!current[part]) {
        current[part] = {
          name: part,
          type: index === parts.length - 1 ? "file" : "folder",
          path: parts.slice(0, index + 1).join("/"),
          children: index === parts.length - 1 ? undefined : {},
        };
      }
      if (current[part].children) {
        current = current[part].children;
      }
    });
  });

  // Convert to array and sort (folders first, then files)
  const convertToArray = (obj: FileTree): FileNode[] => {
    return Object.values(obj)
      .sort((a: TreeNode, b: TreeNode) => {
        if (a.type !== b.type) {
          return a.type === "folder" ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
      })
      .map(
        (item: TreeNode): FileNode => ({
          name: item.name,
          type: item.type,
          path: item.path,
          children: item.children ? convertToArray(item.children) : undefined,
        })
      );
  };

  return convertToArray(tree);
}

export function SidebarAgentView({ taskId }: { taskId: string }) {
  const { task, fileChanges, diffStats } = useTask(taskId);
  const { entries } = useSessionEntries(taskId);
  const { updateSelectedFilePath, openAgentEnvironment } = useAgentEnvironment();
  const { setOpen } = useSidebar();

  // Derive todos from session entries (JSONL data)
  const todos = useMemo(() => extractTodosFromEntries(entries), [entries]);

  // Track previous todos to detect changes
  const prevTodosRef = useRef<typeof todos>([]);

  // Open sidebar when todos change (new todos added or status changed)
  useEffect(() => {
    const prevTodos = prevTodosRef.current;

    // Skip if both are empty ([] -> [] is not a change)
    if (prevTodos.length === 0 && todos.length === 0) {
      return;
    }

    const todosChanged =
      todos.length !== prevTodos.length ||
      todos.some((todo, i) =>
        prevTodos[i]?.content !== todo.content ||
        prevTodos[i]?.status !== todo.status
      );

    if (todosChanged && todos.length > 0) {
      setOpen(true);
    }

    prevTodosRef.current = todos;
  }, [todos, setOpen]);

  const completedTodos = useMemo(
    () => todos.filter((todo) => todo.status === "completed").length,
    [todos]
  );

  // Create file tree from file changes
  const modifiedFileTree = useMemo(() => {
    const filePaths = fileChanges.map((change) => change.filePath);
    return createFileTree(filePaths);
  }, [fileChanges]);

  if (!task) {
    return (
      <SidebarGroup>
        <SidebarGroupLabel>Loading task...</SidebarGroupLabel>
      </SidebarGroup>
    );
  }

  const handleFileSelect = useCallback(
    (file: FileNode) => {
      updateSelectedFilePath(file.path);
      openAgentEnvironment();
    },
    [openAgentEnvironment, updateSelectedFilePath]
  );

  return (
    <>
      <SidebarGroup>
        <SidebarGroupContent>
          <SidebarMenuItem>
            <div className="flex h-8 items-center gap-2 px-2 text-sm">
              {(() => {
                const StatusIcon =
                  statusColorsConfig[
                    task.status as keyof typeof statusColorsConfig
                  ]?.icon || Square;
                const statusClass =
                  statusColorsConfig[
                    task.status as keyof typeof statusColorsConfig
                  ]?.className || "text-muted-foreground";
                return (
                  <>
                    <StatusIcon
                      className={cn(
                        "size-4",
                        statusClass,
                        task.status === "INITIALIZING" &&
                          "animation-duration-[5s] size-4 animate-spin"
                      )}
                    />
                    <span className="capitalize">
                      {task.status.toLowerCase().replace("_", " ")}
                    </span>
                  </>
                );
              })()}
            </div>
          </SidebarMenuItem>

          {/* Error message for failed tasks */}
          {task.status === "FAILED" && (
            <SidebarMenuItem className="mt-2">
              <ExpandableErrorCard
                errorMessage={task.errorMessage || "Unknown error"}
              />
            </SidebarMenuItem>
          )}

          {/* Task total diff */}
          {(diffStats.additions > 0 || diffStats.deletions > 0) && (
            <SidebarMenuItem>
              <div className="flex h-8 items-center gap-2 px-2 text-sm">
                <FileDiff className="size-4" />
                <div className="flex items-center gap-1">
                  <span className="text-green-400">+{diffStats.additions}</span>
                  <span className="text-destructive">
                    -{diffStats.deletions}
                  </span>
                </div>
              </div>
            </SidebarMenuItem>
          )}
        </SidebarGroupContent>
      </SidebarGroup>

      {/* Task List (Todos) - derived from session entries */}
      {todos.length > 0 && (
        <SidebarGroup>
          <SidebarGroupLabel className="hover:text-muted-foreground select-none gap-1.5">
            <ListTodo className="!size-3.5" />
            Task List
            <Badge
              variant="secondary"
              className="bg-sidebar-accent border-sidebar-border text-muted-foreground rounded-full border px-1.5 py-0 text-[11px]"
            >
              {completedTodos}/{todos.length}
            </Badge>
          </SidebarGroupLabel>
          <SidebarGroupContent>
            {todos.map((todo, index) => {
              const config = todoStatusConfig[todo.status];
              const TodoIcon = config?.icon ?? Square;
              const iconClass = config?.className ?? "";
              return (
                <SidebarMenuItem key={index}>
                  <div
                    className={cn(
                      "flex min-h-8 items-start gap-2 p-2 pb-0 text-sm",
                      todo.status === "completed" &&
                        "text-muted-foreground line-through"
                    )}
                  >
                    <TodoIcon className={cn("size-4", iconClass)} />
                    <span className="line-clamp-2 flex-1 leading-4">
                      {todo.content}
                    </span>
                  </div>
                </SidebarMenuItem>
              );
            })}
          </SidebarGroupContent>
        </SidebarGroup>
      )}

      {/* Modified Files - Only show if file changes exist */}
      {fileChanges.length > 0 && (
        <SidebarGroup>
          <SidebarGroupLabel className="hover:text-muted-foreground select-none gap-1.5">
            <FolderGit2 className="!size-3.5" />
            Modified Files{" "}
            {diffStats.totalFiles > 0 && (
              <Badge
                variant="secondary"
                className="bg-sidebar-accent border-sidebar-border text-muted-foreground rounded-full border px-1.5 py-0 text-[11px]"
              >
                {diffStats.totalFiles}
              </Badge>
            )}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <FileExplorer
              isAgentEnvironment={false}
              files={modifiedFileTree}
              fileChangeOperations={fileChanges.map((fileChange) => ({
                filePath: fileChange.filePath,
                operation: fileChange.operation,
              }))}
              defaultFolderExpansion={true}
              onFileSelect={handleFileSelect}
            />
          </SidebarGroupContent>
        </SidebarGroup>
      )}
    </>
  );
}

function ExpandableErrorCard({ errorMessage }: { errorMessage: string }) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <Card
      onClick={() => setIsExpanded(!isExpanded)}
      className="border-destructive/10 bg-destructive/5 max-h-96 cursor-pointer overflow-y-auto rounded-lg p-2"
    >
      <p
        className={cn(
          "text-destructive text-sm",
          isExpanded ? "line-clamp-none" : "line-clamp-4"
        )}
      >
        {errorMessage}
      </p>
    </Card>
  );
}
