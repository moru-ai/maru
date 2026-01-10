import { InitStatus, prisma } from "@repo/db";
import { MORU_INIT_STEPS, InitializationProgress } from "@repo/types";
import { emitStreamChunk } from "../socket";
import { moruWorkspaceManager } from "../execution/moru/moru-workspace-manager";
import {
  setInitStatus,
  setTaskFailed,
  clearTaskProgress,
  setTaskInitialized,
} from "../utils/task-status";

export class TaskInitializationEngine {
  constructor() {
    // Workspace manager is accessed directly via moruWorkspaceManager singleton
  }

  /**
   * Initialize a task with the specified steps
   */
  async initializeTask(
    taskId: string,
    steps: InitStatus[] = ["CREATE_SANDBOX"],
    userId: string
  ): Promise<void> {
    try {
      // Clear any previous progress and start fresh
      await clearTaskProgress(taskId);

      // Emit start event
      this.emitProgress(taskId, {
        type: "init-start",
        taskId,
      });

      // Execute each step in sequence
      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        if (!step) continue;
        const stepNumber = i + 1;

        try {
          // Set step as in progress
          await setInitStatus(taskId, step);

          // Emit step start
          this.emitProgress(taskId, {
            type: "step-start",
            taskId,
            currentStep: step,
          });

          // Execute the step
          await this.executeStep(taskId, step, userId);

          // Mark step as completed
          await setInitStatus(taskId, step);
        } catch (error) {
          console.error(
            `[TASK_INIT] ${taskId}: Failed at step ${stepNumber}/${steps.length}: ${step}:`,
            error
          );

          // Mark as failed with error details
          await setTaskFailed(
            taskId,
            step,
            error instanceof Error ? error.message : "Unknown error"
          );

          // Emit error
          this.emitProgress(taskId, {
            type: "init-error",
            taskId,
            currentStep: step,
            error: error instanceof Error ? error.message : "Unknown error",
          });

          throw error;
        }
      }

      // All steps completed successfully - set to ACTIVE
      await setInitStatus(taskId, "ACTIVE");
      await setTaskInitialized(taskId);

      console.log(`✅ [TASK_INIT] ${taskId}: Ready for RUNNING status`);

      // Emit completion
      this.emitProgress(taskId, {
        type: "init-complete",
        taskId,
      });
    } catch (error) {
      console.error(`[TASK_INIT] ${taskId}: Initialization failed:`, error);
      throw error;
    }
  }

  /**
   * Execute a specific initialization step
   */
  private async executeStep(
    taskId: string,
    step: InitStatus,
    userId: string
  ): Promise<void> {
    switch (step) {
      case "CREATE_SANDBOX":
        await this.executeCreateSandbox(taskId, userId);
        break;

      case "INACTIVE":
      case "ACTIVE":
        // These are state markers, not executable steps
        break;

      default:
        throw new Error(`Unknown or unsupported initialization step: ${step}`);
    }
  }

  /**
   * Create Moru Sandbox step
   * Creates a new Moru sandbox VM for the task
   */
  private async executeCreateSandbox(
    taskId: string,
    userId: string
  ): Promise<void> {
    try {
      // Get task info
      const task = await prisma.task.findUnique({
        where: { id: taskId },
        select: {
          repoFullName: true,
          repoUrl: true,
          baseBranch: true,
          shadowBranch: true,
        },
      });

      if (!task) {
        throw new Error(`Task not found: ${taskId}`);
      }

      console.log(`[TASK_INIT] ${taskId}: Creating Moru sandbox...`);

      // Create sandbox via workspace manager
      const workspaceInfo = await moruWorkspaceManager.prepareWorkspace({
        id: taskId,
        repoFullName: task.repoFullName,
        repoUrl: task.repoUrl,
        baseBranch: task.baseBranch || "main",
        shadowBranch: task.shadowBranch || `shadow/task-${taskId}`,
        userId,
      });

      if (!workspaceInfo.success) {
        throw new Error(`Failed to create sandbox: ${workspaceInfo.error}`);
      }

      // Update task with workspace path
      await prisma.task.update({
        where: { id: taskId },
        data: {
          workspacePath: workspaceInfo.workspacePath,
        },
      });

      console.log(`[TASK_INIT] ${taskId}: Moru sandbox created successfully`);
    } catch (error) {
      console.error(`[TASK_INIT] ${taskId}: Failed to create sandbox:`, error);
      throw error;
    }
  }

  /**
   * Emit progress events via WebSocket
   */
  private emitProgress(taskId: string, progress: InitializationProgress): void {
    emitStreamChunk(
      {
        type: "init-progress",
        initProgress: progress,
      },
      taskId
    );
  }

  /**
   * Get default initialization steps for moru mode
   */
  async getDefaultStepsForTask(): Promise<InitStatus[]> {
    return MORU_INIT_STEPS;
  }
}
