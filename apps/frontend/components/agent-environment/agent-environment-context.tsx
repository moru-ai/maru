"use client";

import { useFileContent } from "@/hooks/agent-environment/use-file-content";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  createContext,
  useContext,
  useState,
  ReactNode,
  useMemo,
  useRef,
  useCallback,
  useEffect,
} from "react";
import { ImperativePanelHandle } from "react-resizable-panels";
import { useFileTree } from "@/hooks/agent-environment/use-file-tree";

type FileWithContent = {
  name: string;
  type: "file";
  path: string;
  content: string;
};

type AgentEnvironmentContextType = {
  selectedFilePath: string | null;
  selectedFileWithContent: FileWithContent | null;
  updateSelectedFilePath: (path: string | null) => void;
  isLoadingContent: boolean;
  contentError: string | undefined;
  rightPanelRef: React.RefObject<ImperativePanelHandle | null>;
  lastPanelSizeRef: React.RefObject<number | null>;
  expandRightPanel: () => void;
  openAgentEnvironment: () => void;
  // Sheet management - exposed for page components
  isSheetOpen: boolean;
  setIsSheetOpen: (open: boolean) => void;
  shouldUseSheet: boolean;
};

const AgentEnvironmentContext = createContext<
  AgentEnvironmentContextType | undefined
>(undefined);

export function AgentEnvironmentProvider({
  children,
  taskId,
}: {
  children: ReactNode;
  taskId: string;
}) {
  // This is for the resizable agent environment panel
  const rightPanelRef = useRef<ImperativePanelHandle>(null);

  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  
  // Sheet management
  const shouldUseSheet = useIsMobile({ breakpoint: 1024 });
  const [isSheetOpen, setIsSheetOpen] = useState(false);

  function updateSelectedFilePath(path: string | null) {
    if (path && !path.startsWith("/")) {
      setSelectedFilePath("/" + path);
    } else {
      setSelectedFilePath(path);
    }
  }

  // Fetch file content when a file is selected
  const fileContentQuery = useFileContent(
    taskId,
    selectedFilePath || undefined
  );

  // Create selected file object with content for the editor
  const selectedFileWithContent = useMemo(() => {
    // Handle regular file content
    if (
      selectedFilePath &&
      fileContentQuery.data?.success &&
      fileContentQuery.data.content
    ) {
      return {
        name: selectedFilePath.split("/").pop() || "",
        type: "file" as const,
        path: selectedFilePath,
        content: fileContentQuery.data.content,
      };
    }
    return null;
  }, [selectedFilePath, fileContentQuery.data]);

  const lastPanelSizeRef = useRef<number | null>(null);

  const expandRightPanel = useCallback(() => {
    if (rightPanelRef.current && rightPanelRef.current.isCollapsed()) {
      const panel = rightPanelRef.current;

      panel.expand();
      if (!lastPanelSizeRef.current) {
        panel.resize(50);
      }
    }
  }, [rightPanelRef]);

  const openAgentEnvironment = useCallback(() => {
    if (shouldUseSheet) {
      setIsSheetOpen(true);
      return;
    }

    // Fall back to expanding the panel (desktop mode)
    expandRightPanel();
  }, [shouldUseSheet, expandRightPanel]);

  // Watch file tree and auto-open panel when files appear
  const { data: treeData } = useFileTree(taskId, { polling: true });
  const hasAutoOpenedRef = useRef(false);
  const prevTreeLengthRef = useRef<number>(0);

  // Helper to find the first file in a tree structure
  const findFirstFile = useCallback(
    (
      nodes: Array<{ name: string; type: "file" | "folder"; path: string; children?: Array<unknown> }>
    ): string | null => {
      for (const node of nodes) {
        if (node.type === "file") {
          return node.path;
        }
        if (node.type === "folder" && node.children && node.children.length > 0) {
          const found = findFirstFile(
            node.children as Array<{ name: string; type: "file" | "folder"; path: string; children?: Array<unknown> }>
          );
          if (found) return found;
        }
      }
      return null;
    },
    []
  );

  useEffect(() => {
    const currentLength = treeData?.tree?.length ?? 0;
    const prevLength = prevTreeLengthRef.current;

    // Auto-open when files first appear (0 -> >0)
    if (prevLength === 0 && currentLength > 0 && !hasAutoOpenedRef.current) {
      hasAutoOpenedRef.current = true;
      openAgentEnvironment();

      // Auto-select the first file
      if (treeData?.tree) {
        const firstFilePath = findFirstFile(treeData.tree);
        if (firstFilePath) {
          updateSelectedFilePath(firstFilePath);
        }
      }
    }

    prevTreeLengthRef.current = currentLength;
  }, [treeData?.tree, openAgentEnvironment, findFirstFile]);

  const value: AgentEnvironmentContextType = useMemo(
    () => ({
      selectedFilePath,
      selectedFileWithContent,
      updateSelectedFilePath,
      isLoadingContent: fileContentQuery.isLoading,
      contentError: fileContentQuery.error?.message,
      rightPanelRef,
      lastPanelSizeRef,
      expandRightPanel,
      openAgentEnvironment,
      isSheetOpen,
      setIsSheetOpen,
      shouldUseSheet,
    }),
    [
      selectedFilePath,
      selectedFileWithContent,
      updateSelectedFilePath,
      fileContentQuery.isLoading,
      fileContentQuery.error?.message,
      rightPanelRef,
      lastPanelSizeRef,
      expandRightPanel,
      openAgentEnvironment,
      isSheetOpen,
      shouldUseSheet,
    ]
  );

  return (
    <AgentEnvironmentContext.Provider value={value}>
      {children}
    </AgentEnvironmentContext.Provider>
  );
}

export function useAgentEnvironment() {
  const context = useContext(AgentEnvironmentContext);
  if (context === undefined) {
    throw new Error(
      "useAgentEnvironment must be used within an AgentEnvironmentProvider"
    );
  }
  return context;
}
