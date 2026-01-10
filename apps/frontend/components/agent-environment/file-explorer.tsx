"use client";

import {
  ChevronDown,
  ChevronRight,
  Download,
  Folder,
  FolderOpen,
  Loader2,
  MoreVertical,
} from "lucide-react";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { FileNode } from "@repo/types";
import { FileIcon } from "@/components/ui/file-icon";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface FileChangeOperation {
  filePath: string;
  operation: string;
}

type BaseProps = {
  files: FileNode[];
  onFileSelect: (file: FileNode) => void;
  onFileDownload?: (file: FileNode) => void;
};

type AgentEnvironmentProps = BaseProps & {
  isAgentEnvironment: true;
  selectedFilePath: string | null;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  isLoading?: boolean;
};

type OtherViewProps = BaseProps & {
  isAgentEnvironment: false;
  fileChangeOperations: FileChangeOperation[];
  defaultFolderExpansion: boolean;
};

export function FileExplorer(props: AgentEnvironmentProps | OtherViewProps) {
  const isAgentEnvironment = props.isAgentEnvironment;
  const files = props.files;
  const onFileSelect = props.onFileSelect;
  const onFileDownload = props.onFileDownload;

  const selectedFilePath = isAgentEnvironment ? props.selectedFilePath : null;
  const defaultFolderExpansion = isAgentEnvironment
    ? false
    : props.defaultFolderExpansion;

  // We use a single Set to track folder state.
  // If defaultFolderExpansion is true, the Set tracks collapsed folders (all open by default).
  // If defaultFolderExpansion is false, the Set tracks expanded folders (all closed by default).
  // This avoids up-front tree traversal and is efficient for both modes.
  // Note that these are prefixed with a slash.
  const [folderState, setFolderState] = useState<Set<string>>(new Set());

  const toggleFolder = (path: string) => {
    setFolderState((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  // Auto-expand folders leading to the selected file path
  useEffect(() => {
    if (isAgentEnvironment && selectedFilePath) {
      // Get all parent folder paths for the selected file
      const pathParts = selectedFilePath.split("/");
      const parentPaths: string[] = [];

      // Build all parent paths (excluding the file itself)
      for (let i = 1; i < pathParts.length; i++) {
        parentPaths.push(pathParts.slice(0, i).join("/"));
      }

      // Expand each parent folder if it's not already expanded
      setFolderState((prev) => {
        const next = new Set(prev);
        let hasChanges = false;

        parentPaths.forEach((parentPath) => {
          const shouldBeExpanded = next.has(parentPath);

          if (!shouldBeExpanded) {
            hasChanges = true;
            next.add(parentPath);
          }
        });

        return hasChanges ? next : prev;
      });
    }
  }, [selectedFilePath]);

  // Determine expansion based on defaultFolderExpansion mode and folderState
  // If defaultFolderExpansion: open unless in set; else: closed unless in set
  const isNodeExpanded = (path: string) =>
    defaultFolderExpansion ? !folderState.has(path) : folderState.has(path);

  const getOperationColor = (op: string) => {
    switch (op) {
      case "CREATE":
        return "text-green-400";
      case "UPDATE":
        return "text-yellow-600";
      case "DELETE":
        return "text-destructive";
      default:
        return "text-muted-foreground";
    }
  };

  const getOperationLetter = (op: string) => {
    switch (op) {
      case "CREATE":
        return "A";
      case "UPDATE":
        return "M";
      case "DELETE":
        return "D";
      case "RENAME":
        return "R";
      case "MOVE":
        return "M";
      default:
        return "?";
    }
  };

  const renderNode = (node: FileNode, depth = 0) => {
    const isExpanded = isNodeExpanded(node.path);
    const isSelected = selectedFilePath === node.path;
    const fileChange =
      !isAgentEnvironment && props.fileChangeOperations.length > 0
        ? props.fileChangeOperations.find(
            (change) => change.filePath === node.path
          ) || null
        : null;
    const operation = fileChange?.operation;

    return (
      <div key={node.path} className="relative flex flex-col gap-0.5">
        {isExpanded && (
          <div
            className="bg-border absolute bottom-0 hidden h-[calc(100%-30px)] w-px group-hover/files:block"
            style={{ left: `${depth * 12 + 12}px` }}
          />
        )}
        <div
          className={cn(
            "group/item text-foreground/80 hover:text-foreground flex cursor-pointer items-center justify-between overflow-hidden rounded-md px-2 py-1 hover:bg-white/10",
            isSelected && "bg-white/5"
          )}
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
        >
          <button
            className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden"
            onClick={() => {
              if (node.type === "folder") {
                toggleFolder(node.path);
              } else if (onFileSelect) {
                onFileSelect(node);
              }
            }}
          >
            <div
              className="flex items-center gap-1.5 overflow-hidden"
              title={node.name}
            >
              {node.type === "folder" ? (
                isExpanded ? (
                  <>
                    <FolderOpen className="size-4 shrink-0 group-hover/item:hidden" />
                    <ChevronDown className="hidden size-4 shrink-0 group-hover/item:block" />
                  </>
                ) : (
                  <>
                    <Folder className="size-4 shrink-0 group-hover/item:hidden" />
                    <ChevronRight className="hidden size-4 shrink-0 group-hover/item:block" />
                  </>
                )
              ) : (
                <FileIcon filename={node.name} className="size-4" useFallback />
              )}
              <span className="truncate text-sm">{node.name}</span>
            </div>
          </button>
          <div className="flex shrink-0 items-center gap-1">
            {node.type === "file" && operation && (
              <span
                className={cn(
                  "text-xs font-medium",
                  getOperationColor(operation)
                )}
              >
                {getOperationLetter(operation)}
              </span>
            )}
            {node.type === "file" && onFileDownload && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    className="text-muted-foreground hover:text-foreground rounded p-0.5 opacity-0 transition-opacity hover:bg-white/10 group-hover/item:opacity-100 data-[state=open]:opacity-100"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <MoreVertical className="size-3.5" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent side="bottom" align="start" sideOffset={4}>
                  <DropdownMenuItem
                    onClick={() => onFileDownload(node)}
                    className="cursor-pointer"
                  >
                    <Download className="size-3.5" />
                    Download
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
        {node.type === "folder" && isExpanded && node.children && (
          <div className="flex flex-col gap-0.5">
            {node.children.map((child) => renderNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  // If being used in Agent Environment
  if (isAgentEnvironment) {
    if (!props.isCollapsed) {
      return (
        <div className="bg-sidebar border-border @max-[500px]/agent-environment:w-36 flex w-48 shrink-0 select-none flex-col overflow-hidden border-r">
          {files.length > 0 ? (
            <div className="group/files flex w-full grow flex-col gap-0.5 overflow-y-auto p-1">
              {files.map((file) => renderNode(file))}
            </div>
          ) : props.isLoading ? (
            <div className="flex w-full justify-center p-4">
              <Loader2 className="text-muted-foreground size-3.5 animate-spin" />
            </div>
          ) : (
            <div className="text-muted-foreground flex w-full justify-center p-4 text-sm">
              No files
            </div>
          )}
        </div>
      );
    }
    return null;
  }

  // If used outside of Agent Environment (e.g. agent-view sidebar)
  return (
    <div className="group/files flex flex-col gap-0.5">
      {files.map((file) => renderNode(file))}
    </div>
  );
}
