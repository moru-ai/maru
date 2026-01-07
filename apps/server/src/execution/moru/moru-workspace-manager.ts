import { Sandbox } from "@moru-ai/core";
import { prisma } from "@repo/db";
import config from "../../config";
import { WorkspaceManager } from "../interfaces/workspace-manager";
import { ToolExecutor } from "../interfaces/tool-executor";
import {
  TaskConfig,
  WorkspaceInfo,
  WorkspaceStatus,
  HealthStatus,
} from "../interfaces/types";
import { MoruToolExecutor } from "./moru-tool-executor";
import {
  startMoruFilesystemWatcher,
  stopMoruFilesystemWatcher,
} from "../../services/moru-filesystem-watcher";

/**
 * MoruWorkspaceManager handles workspace lifecycle using Moru Sandbox VMs
 */
export class MoruWorkspaceManager implements WorkspaceManager {
  // In-memory cache of sandbox instances by taskId
  private sandboxCache: Map<string, Sandbox> = new Map();
  private workspacePath: string = "/workspace";

  /**
   * Prepare a workspace by creating a new Moru sandbox
   */
  async prepareWorkspace(taskConfig: TaskConfig): Promise<WorkspaceInfo> {
    try {
      console.log(`[MORU_WORKSPACE] Creating sandbox for task ${taskConfig.id}`);

      // Create new Moru sandbox
      const sandbox = await Sandbox.create(config.moruTemplateId || "shadow-agent", {
        apiKey: config.moruApiKey,
        timeoutMs: config.moruSandboxTimeoutMs || 3600000,
        metadata: {
          taskId: taskConfig.id,
          userId: taskConfig.userId,
          repoUrl: taskConfig.repoUrl,
          repoFullName: taskConfig.repoFullName,
        },
      });

      console.log(`[MORU_WORKSPACE] Sandbox created: ${sandbox.sandboxId}`);

      // Store sandbox reference in cache
      this.sandboxCache.set(taskConfig.id, sandbox);

      // Store sandboxId in database for reconnection
      await prisma.taskSession.create({
        data: {
          taskId: taskConfig.id,
          sandboxId: sandbox.sandboxId,
          isActive: true,
        },
      });

      // Note: Don't create /workspace here - git clone will create it
      // Creating it beforehand causes "Permission denied" errors

      // Start filesystem watcher for real-time file change events
      try {
        await startMoruFilesystemWatcher(taskConfig.id, sandbox);
        console.log(`[MORU_WORKSPACE] Filesystem watcher started for task ${taskConfig.id}`);
      } catch (watchError) {
        // Don't fail workspace creation if watcher fails - just log warning
        console.warn(`[MORU_WORKSPACE] Failed to start filesystem watcher:`, watchError);
      }

      return {
        success: true,
        workspacePath: this.workspacePath,
      };
    } catch (error) {
      console.error(`[MORU_WORKSPACE] Failed to create sandbox:`, error);
      return {
        success: false,
        workspacePath: "",
        error: error instanceof Error ? error.message : "Failed to create sandbox",
      };
    }
  }

  /**
   * Clean up a task's workspace by killing the sandbox
   */
  async cleanupWorkspace(
    taskId: string
  ): Promise<{ success: boolean; message: string }> {
    try {
      console.log(`[MORU_WORKSPACE] Cleaning up sandbox for task ${taskId}`);

      // Stop filesystem watcher first
      try {
        await stopMoruFilesystemWatcher(taskId);
        console.log(`[MORU_WORKSPACE] Filesystem watcher stopped for task ${taskId}`);
      } catch (watchError) {
        console.warn(`[MORU_WORKSPACE] Failed to stop filesystem watcher:`, watchError);
      }

      const sandbox = await this.getSandbox(taskId);
      if (sandbox) {
        await sandbox.kill();
        this.sandboxCache.delete(taskId);
      }

      // Mark session as inactive
      await prisma.taskSession.updateMany({
        where: { taskId, isActive: true },
        data: { isActive: false, endedAt: new Date() },
      });

      return {
        success: true,
        message: "Sandbox killed successfully",
      };
    } catch (error) {
      console.error(`[MORU_WORKSPACE] Failed to cleanup sandbox:`, error);
      return {
        success: false,
        message: error instanceof Error ? error.message : "Cleanup failed",
      };
    }
  }

  /**
   * Get the current status of a workspace
   */
  async getWorkspaceStatus(taskId: string): Promise<WorkspaceStatus> {
    try {
      const sandbox = await this.getSandbox(taskId);
      if (!sandbox) {
        return {
          exists: false,
          path: this.workspacePath,
          isReady: false,
          error: "No sandbox found for task",
        };
      }

      const isRunning = await sandbox.isRunning();

      return {
        exists: isRunning,
        path: this.workspacePath,
        isReady: isRunning,
      };
    } catch (error) {
      return {
        exists: false,
        path: this.workspacePath,
        isReady: false,
        error: error instanceof Error ? error.message : "Status check failed",
      };
    }
  }

  /**
   * Get the workspace path for a task
   */
  getWorkspacePath(_taskId: string): string {
    return this.workspacePath;
  }

  /**
   * Check if a workspace exists for a task
   */
  async workspaceExists(taskId: string): Promise<boolean> {
    try {
      const sandbox = await this.getSandbox(taskId);
      if (!sandbox) return false;

      return await sandbox.isRunning();
    } catch {
      return false;
    }
  }

  /**
   * Get workspace size in bytes
   */
  async getWorkspaceSize(_taskId: string): Promise<number> {
    // Return a default size - Moru sandbox has configurable limits
    return 10 * 1024 * 1024 * 1024; // 10GB default
  }

  /**
   * Get a tool executor for the given task
   */
  async getExecutor(taskId: string): Promise<ToolExecutor> {
    const sandbox = await this.getSandbox(taskId);
    if (!sandbox) {
      throw new Error(`No sandbox found for task ${taskId}`);
    }

    return new MoruToolExecutor(taskId, sandbox);
  }

  /**
   * Health check for the workspace
   */
  async healthCheck(taskId: string): Promise<HealthStatus> {
    try {
      const sandbox = await this.getSandbox(taskId);
      if (!sandbox) {
        return {
          healthy: false,
          message: "No sandbox found for task",
        };
      }

      const isRunning = await sandbox.isRunning();

      return {
        healthy: isRunning,
        message: isRunning ? "Sandbox is healthy" : "Sandbox is not running",
        details: {
          sandboxId: sandbox.sandboxId,
        },
      };
    } catch (error) {
      return {
        healthy: false,
        message: error instanceof Error ? error.message : "Health check failed",
      };
    }
  }

  /**
   * Check if this workspace manager supports remote execution
   */
  isRemote(): boolean {
    return true;
  }

  /**
   * Get sandbox instance for a task, reconnecting if needed
   */
  async getSandbox(taskId: string): Promise<Sandbox | null> {
    // Check cache first
    let sandbox = this.sandboxCache.get(taskId);
    if (sandbox) {
      return sandbox;
    }

    // Try to reconnect using stored sandboxId
    try {
      const session = await prisma.taskSession.findFirst({
        where: { taskId, isActive: true },
        select: { sandboxId: true },
      });

      if (session?.sandboxId) {
        console.log(
          `[MORU_WORKSPACE] Reconnecting to sandbox ${session.sandboxId}`
        );
        sandbox = await Sandbox.connect(session.sandboxId, {
          apiKey: config.moruApiKey,
        });
        this.sandboxCache.set(taskId, sandbox);
        return sandbox;
      }
    } catch (error) {
      console.error(`[MORU_WORKSPACE] Failed to reconnect to sandbox:`, error);
    }

    return null;
  }

  /**
   * Get sandbox directly (for initialization steps)
   */
  getSandboxFromCache(taskId: string): Sandbox | undefined {
    return this.sandboxCache.get(taskId);
  }

  /**
   * Store sandbox in cache (for initialization steps)
   */
  setSandboxInCache(taskId: string, sandbox: Sandbox): void {
    this.sandboxCache.set(taskId, sandbox);
  }
}

// Export singleton instance for shared state
export const moruWorkspaceManager = new MoruWorkspaceManager();
