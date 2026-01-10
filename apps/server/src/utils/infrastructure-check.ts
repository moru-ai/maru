import { prisma } from "@repo/db";
import { createToolExecutor } from "../execution";
import { TaskInitializationEngine } from "../initialization";
import { MORU_INIT_STEPS } from "@repo/types";

/**
 * Ensures task infrastructure exists and is healthy
 * If infrastructure is missing or unhealthy, triggers re-initialization
 */
export async function ensureTaskInfrastructureExists(
  taskId: string,
  userId: string,
  anthropicApiKey?: string
): Promise<void> {
  console.log(`[INFRA_CHECK] Checking infrastructure for task ${taskId}`);

  try {
    // Step 1: Check if we have an active TaskSession
    const activeSession = await prisma.taskSession.findFirst({
      where: {
        taskId,
        isActive: true,
      },
      select: {
        id: true,
        podName: true,
        podNamespace: true,
        createdAt: true,
      },
    });

    if (!activeSession) {
      console.log(
        `[INFRA_CHECK] ${taskId}: No active session found, re-initialization required`
      );
      await triggerReinitialization(taskId, userId, anthropicApiKey);
      return;
    }

    // Step 2: Check if the sandbox is actually healthy by trying to create a tool executor
    try {
      const toolExecutor = await createToolExecutor(taskId);

      const healthCheck = await toolExecutor.listDirectory(".");

      if (!healthCheck.success) {
        console.log(
          `[INFRA_CHECK] ${taskId}: Sandbox unhealthy (health check failed), re-initialization required`
        );
        await triggerReinitialization(taskId, userId, anthropicApiKey);
        return;
      }

      console.log(
        `[INFRA_CHECK] ${taskId}: Infrastructure healthy, proceeding normally`
      );
    } catch (error) {
      console.log(
        `[INFRA_CHECK] ${taskId}: Sandbox inaccessible (${error instanceof Error ? error.message : "Unknown error"}), re-initialization required`
      );
      await triggerReinitialization(taskId, userId, anthropicApiKey);
      return;
    }
  } catch (error) {
    console.error(
      `[INFRA_CHECK] ${taskId}: Infrastructure check failed:`,
      error
    );
    throw new Error(
      `Failed to ensure task infrastructure: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

/**
 * Triggers full re-initialization for a task
 * Uses specific steps optimized for re-initialization (includes dependencies, skips background services)
 */
async function triggerReinitialization(
  taskId: string,
  userId: string,
  anthropicApiKey?: string
): Promise<void> {
  console.log(`[INFRA_CHECK] ${taskId}: Starting re-initialization`);

  await prisma.taskSession.updateMany({
    where: {
      taskId,
      isActive: true,
    },
    data: {
      isActive: false,
      endedAt: new Date(),
    },
  });

  // Use TaskInitializationEngine for re-initialization
  const initEngine = new TaskInitializationEngine();

  await initEngine.initializeTask(taskId, MORU_INIT_STEPS, userId, anthropicApiKey);

  console.log(
    `[INFRA_CHECK] ${taskId}: Re-initialization completed successfully`
  );
}
