/**
 * Factory functions for creating execution layer components
 * This is the main entry point for the abstraction layer
 *
 * Simplified to only support Moru sandbox execution mode
 */

import { ToolExecutor } from "./interfaces/tool-executor";
import { WorkspaceManager } from "./interfaces/workspace-manager";
import { moruWorkspaceManager } from "./moru/moru-workspace-manager";

/**
 * Create a tool executor for the given task
 * Uses Moru sandbox for execution
 */
export async function createToolExecutor(
  taskId: string,
  _workspacePath?: string
): Promise<ToolExecutor> {
  return moruWorkspaceManager.getExecutor(taskId);
}

/**
 * Create a workspace manager
 * Returns the singleton Moru workspace manager
 */
export function createWorkspaceManager(): WorkspaceManager {
  return moruWorkspaceManager;
}

/**
 * Check if current mode is moru (always true now)
 */
export function isMoruMode(): boolean {
  return true;
}

// Re-export types and interfaces for convenience
export type { ToolExecutor, WorkspaceManager };
export type {
  FileResult,
  WriteResult,
  DeleteResult,
  DirectoryListing,
  FileSearchResult,
  GrepResult,
} from "@repo/types";
export type {
  CommandResult,
  WorkspaceInfo,
  WorkspaceStatus,
  HealthStatus,
} from "./interfaces/types";
