import { Sandbox, WatchHandle, FilesystemEvent, FilesystemEventType } from "@moru-ai/core";
import { emitStreamChunk } from "../socket";

interface FileSystemChangeEvent {
  operation:
    | "file-created"
    | "file-modified"
    | "file-deleted"
    | "directory-created"
    | "directory-deleted";
  filePath: string;
  timestamp: number;
  source: "local" | "remote" | "moru";
  isDirectory: boolean;
}

/**
 * Moru Filesystem Watcher for moru execution mode
 * Watches sandbox workspace directory for changes and emits them via Socket.IO
 * Uses Moru SDK's watchDir API
 */
export class MoruFilesystemWatcher {
  private watchHandle: WatchHandle | null = null;
  private taskId: string;
  private watchedPath: string;
  private changeBuffer = new Map<string, FileSystemChangeEvent>();
  private flushTimer: NodeJS.Timeout | null = null;
  private readonly debounceMs = 100;
  private isPaused = false;

  constructor(taskId: string) {
    this.taskId = taskId;
    this.watchedPath = "/workspace";
  }

  /**
   * Start watching the workspace in the Moru sandbox
   */
  async startWatching(sandbox: Sandbox): Promise<void> {
    if (this.watchHandle) {
      console.warn(
        `[MORU_FS_WATCHER] Already watching for task ${this.taskId}`
      );
      return;
    }

    try {
      console.log(
        `[MORU_FS_WATCHER] Starting filesystem watch for task ${this.taskId} at ${this.watchedPath}`
      );

      this.watchHandle = await sandbox.files.watchDir(
        this.watchedPath,
        (event: FilesystemEvent) => {
          this.handleFileChange(event);
        },
        {
          recursive: true,
          timeoutMs: 0, // No timeout - watch indefinitely
          onExit: (err?: Error) => {
            if (err) {
              console.error(
                `[MORU_FS_WATCHER] Watch stopped with error for task ${this.taskId}:`,
                err
              );
            } else {
              console.log(
                `[MORU_FS_WATCHER] Watch stopped for task ${this.taskId}`
              );
            }
          },
        }
      );

      console.log(
        `[MORU_FS_WATCHER] Successfully started watching ${this.watchedPath} for task ${this.taskId}`
      );
    } catch (error) {
      console.error(
        `[MORU_FS_WATCHER] Failed to start watching ${this.watchedPath}:`,
        error
      );
      throw error;
    }
  }

  /**
   * Handle individual file system change events from Moru SDK
   */
  private handleFileChange(event: FilesystemEvent): void {
    // Skip processing if watcher is paused
    if (this.isPaused) {
      return;
    }

    const filePath = event.name;

    // Skip hidden files and common ignore patterns
    if (this.shouldIgnoreFile(filePath)) {
      return;
    }

    try {
      // Map Moru event types to our operation types
      const { operation, isDirectory } = this.mapEventType(event.type);

      const changeEvent: FileSystemChangeEvent = {
        operation,
        filePath,
        timestamp: Date.now(),
        source: "moru",
        isDirectory,
      };

      // Add to buffer for debouncing
      this.changeBuffer.set(filePath, changeEvent);

      // Schedule flush if not already scheduled
      if (!this.flushTimer) {
        this.flushTimer = setTimeout(() => {
          this.flushChanges();
        }, this.debounceMs);
      }
    } catch (error) {
      console.error(
        `[MORU_FS_WATCHER] Error processing change for ${filePath}:`,
        error
      );
    }
  }

  /**
   * Map Moru SDK event type to our operation type
   */
  private mapEventType(type: FilesystemEventType): {
    operation: FileSystemChangeEvent["operation"];
    isDirectory: boolean;
  } {
    switch (type) {
      case FilesystemEventType.CREATE:
        // Note: Moru SDK doesn't distinguish between file and directory creation
        // We'll default to file-created as that's more common
        return { operation: "file-created", isDirectory: false };
      case FilesystemEventType.WRITE:
        return { operation: "file-modified", isDirectory: false };
      case FilesystemEventType.REMOVE:
        return { operation: "file-deleted", isDirectory: false };
      case FilesystemEventType.RENAME:
        // Rename is treated as create (the new file appears)
        return { operation: "file-created", isDirectory: false };
      case FilesystemEventType.CHMOD:
        // Chmod is treated as modification
        return { operation: "file-modified", isDirectory: false };
      default:
        return { operation: "file-modified", isDirectory: false };
    }
  }

  /**
   * Determine if a file should be ignored based on common patterns
   */
  private shouldIgnoreFile(filePath: string): boolean {
    const ignorePatterns = [
      /^\.git\//, // Git files
      /^node_modules\//, // Node.js dependencies
      /^\.vscode\//, // VS Code settings
      /^\.cursor\//, // Cursor settings
      /\.DS_Store$/, // macOS system files
      /\.tmp$/, // Temporary files
      /\.log$/, // Log files
      /~$/, // Temporary/backup files
      /^\./, // Other hidden files at root level
    ];

    return ignorePatterns.some((pattern) => pattern.test(filePath));
  }

  /**
   * Flush buffered changes to prevent spam
   */
  private flushChanges(): void {
    if (this.changeBuffer.size === 0) {
      this.flushTimer = null;
      return;
    }

    // Check if paused - if so, clear buffer but don't emit
    if (this.isPaused) {
      this.changeBuffer.clear();
      this.flushTimer = null;
      return;
    }

    const changes = Array.from(this.changeBuffer.values());
    this.changeBuffer.clear();
    this.flushTimer = null;

    console.log(`[MORU_FS_WATCHER] Flushing ${changes.length} changes`);

    // Emit each change as a stream chunk
    for (const change of changes) {
      emitStreamChunk(
        {
          type: "fs-change",
          fsChange: change,
        },
        this.taskId
      );
    }
  }

  /**
   * Stop watching the filesystem
   */
  async stop(): Promise<void> {
    if (this.watchHandle) {
      console.log(
        `[MORU_FS_WATCHER] Stopping filesystem watch for task ${this.taskId}`
      );

      await this.watchHandle.stop();
      this.watchHandle = null;

      // Flush any pending changes
      if (this.flushTimer) {
        clearTimeout(this.flushTimer);
        this.flushChanges();
      }
    }
  }

  /**
   * Check if watcher is currently active
   */
  isWatching(): boolean {
    return this.watchHandle !== null;
  }

  /**
   * Pause filesystem watching (stop processing events)
   */
  pause(): void {
    if (!this.isPaused) {
      console.log(`[MORU_FS_WATCHER] Paused`);
      this.isPaused = true;

      // Clear any pending flush timer
      if (this.flushTimer) {
        clearTimeout(this.flushTimer);
        this.flushTimer = null;
      }

      // Clear the change buffer to avoid processing stale events
      this.changeBuffer.clear();
    }
  }

  /**
   * Resume filesystem watching (start processing events again)
   */
  resume(): void {
    if (this.isPaused) {
      console.log(`[MORU_FS_WATCHER] Resumed`);
      this.isPaused = false;

      // Clear buffer again to ensure no stale events from pause period
      this.changeBuffer.clear();
    }
  }

  /**
   * Check if watcher is currently paused
   */
  isPausedState(): boolean {
    return this.isPaused;
  }

  /**
   * Get watcher statistics
   */
  getStats() {
    return {
      taskId: this.taskId,
      watchedPath: this.watchedPath,
      isWatching: this.isWatching(),
      isPaused: this.isPaused,
      pendingChanges: this.changeBuffer.size,
    };
  }
}

// Map of task IDs to their filesystem watchers
const watchers = new Map<string, MoruFilesystemWatcher>();

/**
 * Start watching filesystem for a task using Moru sandbox
 */
export async function startMoruFilesystemWatcher(
  taskId: string,
  sandbox: Sandbox
): Promise<MoruFilesystemWatcher> {
  // Stop existing watcher if any
  await stopMoruFilesystemWatcher(taskId);

  const watcher = new MoruFilesystemWatcher(taskId);
  await watcher.startWatching(sandbox);

  watchers.set(taskId, watcher);
  return watcher;
}

/**
 * Stop watching filesystem for a task
 */
export async function stopMoruFilesystemWatcher(taskId: string): Promise<void> {
  const watcher = watchers.get(taskId);
  if (watcher) {
    await watcher.stop();
    watchers.delete(taskId);
  }
}

/**
 * Get the filesystem watcher for a task
 */
export function getMoruFilesystemWatcher(
  taskId: string
): MoruFilesystemWatcher | undefined {
  return watchers.get(taskId);
}
