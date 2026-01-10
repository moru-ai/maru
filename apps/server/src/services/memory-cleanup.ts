import { cleanupTaskStreamState, stopTerminalPolling } from "../socket";
import { cleanupTaskTerminalCounters } from "../agent/tools";
import { stopMoruFilesystemWatcher } from "./moru-filesystem-watcher";
import { chatService } from "../app";

/**
 * Memory cleanup service for task-related data structures
 * Prevents memory leaks by cleaning up Maps and other structures when tasks complete
 */
export class MemoryCleanupService {
  /**
   * Clean up all memory structures associated with a task
   */
  static async cleanupTaskMemory(taskId: string): Promise<void> {
    console.log(`[MEMORY_CLEANUP] Starting memory cleanup for task ${taskId}`);

    try {
      chatService.cleanupTask(taskId);
      cleanupTaskStreamState(taskId);
      stopTerminalPolling(taskId);
      await stopMoruFilesystemWatcher(taskId);
      cleanupTaskTerminalCounters(taskId);

      console.log(
        `[MEMORY_CLEANUP] Successfully cleaned up memory for task ${taskId}`
      );
    } catch (error) {
      console.error(
        `[MEMORY_CLEANUP] Error cleaning up memory for task ${taskId}:`,
        error
      );
      // Don't throw - cleanup should be best-effort and not fail task completion
    }
  }
}
