import { prisma } from "@repo/db";
import { CheckpointData, MessageMetadata } from "@repo/types";
import type { Todo } from "@repo/db";
import { emitStreamChunk } from "../socket";
import { createToolExecutor } from "../execution";
import { getMoruFilesystemWatcher } from "./moru-filesystem-watcher";
import { buildTreeFromEntries } from "../files/build-tree";

/**
 * CheckpointService handles creating and restoring message-level checkpoints
 * for time-travel editing functionality
 *
 * Note: Git-related checkpoint functionality has been removed.
 * This service now only handles todo state snapshots.
 */
export class CheckpointService {
  /**
   * Create a checkpoint for a message after successful completion
   */
  async createCheckpoint(taskId: string, messageId: string): Promise<void> {
    console.log(
      `[CHECKPOINT] ✨ Starting checkpoint creation for task ${taskId}, message ${messageId}`
    );

    try {
      // Capture current todo state
      console.log(`[CHECKPOINT] 📸 Capturing current state...`);
      const todoSnapshot = await this.getTodoSnapshot(taskId);

      console.log(`[CHECKPOINT] 📝 Captured ${todoSnapshot.length} todos`);

      // Get existing message metadata
      const existingMessage = await prisma.chatMessage.findUnique({
        where: { id: messageId },
        select: { metadata: true },
      });

      const existingMetadata = existingMessage?.metadata || {};

      // Store checkpoint in message metadata
      const checkpointData: CheckpointData = {
        commitSha: "", // No git, no commit SHA
        todoSnapshot,
        createdAt: new Date().toISOString(),
        workspaceState: "clean",
      };

      const metadata = {
        ...(existingMetadata as MessageMetadata),
        checkpoint: checkpointData,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any;

      await prisma.chatMessage.update({
        where: { id: messageId },
        data: {
          metadata,
        },
      });

      console.log(
        `[CHECKPOINT] ✅ Successfully created checkpoint for message ${messageId}`
      );
    } catch (error) {
      console.error(
        `[CHECKPOINT] ❌ Failed to create checkpoint for message ${messageId}:`,
        error
      );
      // Non-blocking - don't fail the chat flow
    }
  }

  /**
   * Restore workspace to the state at a specific message
   */
  async restoreCheckpoint(
    taskId: string,
    targetMessageId: string
  ): Promise<void> {
    console.log(
      `[CHECKPOINT] 🔄 Starting checkpoint restoration for task ${taskId}, target message ${targetMessageId}`
    );

    try {
      // Find the most recent assistant message at or before target with checkpoint data
      console.log(
        `[CHECKPOINT] 🔍 Looking for checkpoint message at or before target...`
      );
      const checkpointMessage = await this.findCheckpointMessage(
        taskId,
        targetMessageId
      );

      if (!checkpointMessage?.metadata?.checkpoint) {
        console.log(
          `[CHECKPOINT] 📍 No checkpoint found - restoring to initial state for message ${targetMessageId}`
        );
        await this.restoreToInitialState(taskId);
        return;
      }

      const checkpoint = checkpointMessage.metadata.checkpoint as CheckpointData;

      console.log(
        `[CHECKPOINT] 🎯 Found checkpoint from message ${checkpointMessage.id}`
      );
      console.log(
        `[CHECKPOINT] 📅 Checkpoint created at: ${checkpoint.createdAt}`
      );
      console.log(
        `[CHECKPOINT] 📝 Checkpoint has ${checkpoint.todoSnapshot.length} todos`
      );

      // Pause filesystem watcher to prevent spurious events
      await this.pauseFilesystemWatcher(taskId);

      // Restore todo state
      await this.restoreTodoState(taskId, checkpoint.todoSnapshot);
      this.emitTodoUpdate(taskId, checkpoint.todoSnapshot);

      // Wait for state to settle, then recompute and emit file state
      await new Promise((resolve) => setTimeout(resolve, 150));
      await this.recomputeAndEmitFileState(taskId);

      // Resume filesystem watcher
      await new Promise((resolve) => setTimeout(resolve, 200));
      await this.resumeFilesystemWatcher(taskId);

      console.log(`[CHECKPOINT] Restored to message ${checkpointMessage.id}`);
    } catch (error) {
      console.error(`[CHECKPOINT] Failed to restore checkpoint:`, error);
      // Continue with edit flow even if restore fails
    }
  }

  /**
   * Get a snapshot of the current todo state
   */
  private async getTodoSnapshot(taskId: string): Promise<Todo[]> {
    return await prisma.todo.findMany({
      where: { taskId },
      orderBy: { sequence: "asc" },
    });
  }

  /**
   * Restore todo state from a snapshot
   */
  private async restoreTodoState(
    taskId: string,
    snapshot: Todo[]
  ): Promise<void> {
    console.log(
      `[CHECKPOINT] 💾 Starting database transaction to restore todos...`
    );

    await prisma.$transaction(async (tx) => {
      // Delete current todos
      console.log(
        `[CHECKPOINT] 🗑️ Deleting current todos for task ${taskId}...`
      );
      const deleteResult = await tx.todo.deleteMany({ where: { taskId } });
      console.log(
        `[CHECKPOINT] ✅ Deleted ${deleteResult.count} existing todos`
      );

      // Recreate from snapshot
      if (snapshot.length > 0) {
        console.log(
          `[CHECKPOINT] ➕ Creating ${snapshot.length} todos from snapshot...`
        );
        await tx.todo.createMany({
          data: snapshot.map((todo) => ({
            id: todo.id,
            content: todo.content,
            status: todo.status,
            sequence: todo.sequence,
            taskId, // Ensure correct task association
            createdAt: todo.createdAt,
            updatedAt: new Date(), // Update timestamp
          })),
        });
        console.log(
          `[CHECKPOINT] ✅ Successfully created ${snapshot.length} todos from snapshot`
        );
      } else {
        console.log(
          `[CHECKPOINT] 📝 No todos in snapshot, task will have empty todo list`
        );
      }
    });

    console.log(
      `[CHECKPOINT] ✅ Database transaction completed - restored ${snapshot.length} todos from snapshot`
    );
  }

  /**
   * Recompute and emit complete file state after checkpoint restoration
   */
  private async recomputeAndEmitFileState(taskId: string): Promise<void> {
    try {
      console.log(
        `[CHECKPOINT] 📊 Recomputing file state after restoration...`
      );

      // Get task details for workspace path
      const task = await prisma.task.findUnique({
        where: { id: taskId },
        select: { workspacePath: true },
      });

      if (!task?.workspacePath) {
        console.warn(
          `[CHECKPOINT] ❌ Missing workspace path for file state computation`
        );
        return;
      }

      // Get current codebase tree using tool executor
      console.log(`[CHECKPOINT] 🌳 Computing codebase tree...`);
      const toolExecutor = await createToolExecutor(taskId, task.workspacePath);
      const treeResult = await toolExecutor.listDirectoryRecursive(".");

      const codebaseTree = treeResult.success
        ? buildTreeFromEntries(treeResult.entries)
        : [];

      console.log(`[CHECKPOINT] ✅ Found ${codebaseTree.length} tree entries`);

      // Emit fs-override event with file state (no git diff stats)
      console.log(`[CHECKPOINT] 🔗 Emitting fs-override event to frontend...`);
      emitStreamChunk(
        {
          type: "fs-override",
          fsOverride: {
            fileChanges: [],
            diffStats: {
              additions: 0,
              deletions: 0,
              totalFiles: 0,
            },
            codebaseTree,
            message: "File state synchronized after checkpoint restoration",
          },
        },
        taskId
      );

      console.log(
        `[CHECKPOINT] ✅ Successfully emitted file state override with ${codebaseTree.length} tree entries`
      );
    } catch (error) {
      console.error(
        `[CHECKPOINT] ❌ Failed to recompute file state for task ${taskId}:`,
        error
      );
      // Non-blocking - continue even if file state computation fails
    }
  }

  /**
   * Emit todo update to frontend via WebSocket
   */
  private emitTodoUpdate(taskId: string, todos: Todo[]): void {
    try {
      const todoUpdate = {
        todos: todos.map((todo, index) => ({
          id: todo.id,
          content: todo.content,
          status: todo.status.toLowerCase() as
            | "pending"
            | "in_progress"
            | "completed"
            | "cancelled",
          sequence: index,
        })),
        action: "replaced" as const,
        totalTodos: todos.length,
        completedTodos: todos.filter((t) => t.status === "COMPLETED").length,
      };

      emitStreamChunk(
        {
          type: "todo-update",
          todoUpdate,
        },
        taskId
      );

      console.log(
        `[CHECKPOINT] Emitted todo update to frontend: ${todos.length} todos`
      );
    } catch (error) {
      console.error(
        `[CHECKPOINT] Failed to emit todo update for task ${taskId}:`,
        error
      );
      // Non-blocking - continue even if emission fails
    }
  }

  /**
   * Restore workspace to initial state (before any assistant changes)
   */
  private async restoreToInitialState(taskId: string): Promise<void> {
    console.log(
      `[CHECKPOINT] 🏁 Restoring to initial state for task ${taskId}`
    );

    try {
      // Pause filesystem watcher to prevent spurious events
      await this.pauseFilesystemWatcher(taskId);

      // Clear all todos (initial state has none)
      await this.restoreTodoState(taskId, []); // Empty array = no todos
      this.emitTodoUpdate(taskId, []);

      // Wait for state to settle, then recompute and emit file state
      await new Promise((resolve) => setTimeout(resolve, 150));
      await this.recomputeAndEmitFileState(taskId);

      // Resume filesystem watcher
      await new Promise((resolve) => setTimeout(resolve, 200));
      await this.resumeFilesystemWatcher(taskId);

      console.log(`[CHECKPOINT] Restored to initial state`);
    } catch (error) {
      console.error(`[CHECKPOINT] Failed to restore to initial state:`, error);
      // Continue with edit flow even if restore fails
    }
  }

  /**
   * Find the most recent assistant message with checkpoint data strictly before the target message
   */
  private async findCheckpointMessage(
    taskId: string,
    targetMessageId: string
  ): Promise<{ id: string; metadata: MessageMetadata } | null> {
    // Get the sequence number of the target message
    const targetMessage = await prisma.chatMessage.findUnique({
      where: { id: targetMessageId },
      select: { sequence: true },
    });

    if (!targetMessage) {
      console.warn(`[CHECKPOINT] Target message ${targetMessageId} not found`);
      return null;
    }

    // Find the most recent assistant message strictly before this sequence with checkpoint data
    const checkpointMessage = await prisma.chatMessage.findFirst({
      where: {
        taskId,
        role: "ASSISTANT",
        sequence: { lt: targetMessage.sequence },
        metadata: {
          path: ["checkpoint"],
          not: "null",
        },
      },
      orderBy: { sequence: "desc" },
      select: { id: true, metadata: true },
    });

    return checkpointMessage as {
      id: string;
      metadata: MessageMetadata;
    } | null;
  }

  /**
   * Pause filesystem watcher to prevent spurious events during operations
   */
  private async pauseFilesystemWatcher(taskId: string): Promise<void> {
    try {
      const watcher = getMoruFilesystemWatcher(taskId);
      if (watcher) {
        watcher.pause();
      }
    } catch (error) {
      console.warn(
        `[CHECKPOINT] Error pausing filesystem watcher for task ${taskId}:`,
        error
      );
      // Non-blocking - continue even if watcher pause fails
    }
  }

  /**
   * Resume filesystem watcher after operations are complete
   */
  private async resumeFilesystemWatcher(taskId: string): Promise<void> {
    try {
      const watcher = getMoruFilesystemWatcher(taskId);
      if (watcher) {
        watcher.resume();
      }
    } catch (error) {
      console.warn(
        `[CHECKPOINT] Error resuming filesystem watcher for task ${taskId}:`,
        error
      );
      // Non-blocking - continue even if watcher resume fails
    }
  }
}

// Export singleton instance
export const checkpointService = new CheckpointService();
