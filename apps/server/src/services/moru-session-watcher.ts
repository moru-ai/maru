import {
  Sandbox,
  WatchHandle,
  FilesystemEvent,
  FilesystemEventType,
} from "@moru-ai/core";
import { prisma } from "@repo/db";
import { ClaudeCode } from "@repo/types";
import { emitSessionEntry } from "../socket";

type SessionEntry = ClaudeCode.SessionEntry;

/**
 * Session file watcher for Claude Agent SDK
 *
 * Watches JSONL session files written by Claude Agent SDK in the sandbox.
 * File location: ~/.claude/projects/{encoded-cwd}/{session-id}.jsonl
 *
 * Path encoding: /workspace → -workspace
 *
 * Note: In our sandbox, Claude runs as 'user' so ~ expands to /home/user
 */
const CLAUDE_PROJECTS_DIR = "/home/user/.claude/projects";

/**
 * Encode a path for Claude's projects directory naming
 * /workspace → -workspace
 */
function encodePathForClaude(path: string): string {
  return path.replace(/\//g, "-");
}

/**
 * Parse a JSON line into a SessionEntry
 */
function parseSessionEntry(line: string): SessionEntry | null {
  try {
    const trimmed = line.trim();
    if (!trimmed) return null;
    return JSON.parse(trimmed) as SessionEntry;
  } catch (err) {
    console.error("[SESSION_WATCHER] Failed to parse JSON line:", err);
    return null;
  }
}

/**
 * Extract timestamp from a session entry
 * Some entries (summary, file-history-snapshot) may not have timestamp
 */
function getEntryTimestamp(entry: SessionEntry): Date {
  if ("timestamp" in entry && typeof entry.timestamp === "string") {
    return new Date(entry.timestamp);
  }
  return new Date();
}

interface WatchedFile {
  path: string;
  processedLines: number;
}

/**
 * Session watcher for a single task
 */
export class MoruSessionWatcher {
  private watchHandle: WatchHandle | null = null;
  private taskId: string;
  private userId: string;
  private workspacePath: string;
  private projectDir: string;
  private watchedFiles = new Map<string, WatchedFile>();

  constructor(taskId: string, userId: string, workspacePath: string = "/workspace") {
    this.taskId = taskId;
    this.userId = userId;
    this.workspacePath = workspacePath;
    // Compute the project directory path
    const encodedPath = encodePathForClaude(workspacePath);
    this.projectDir = `${CLAUDE_PROJECTS_DIR}/${encodedPath}`;
  }

  /**
   * Start watching the session directory in the sandbox
   */
  async startWatching(sandbox: Sandbox): Promise<void> {
    if (this.watchHandle) {
      console.warn(`[SESSION_WATCHER] Already watching for task ${this.taskId}`);
      return;
    }

    // Retry logic: wait for the projects directory to be created by Claude SDK
    const maxRetries = 10;
    const retryDelayMs = 500;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Check if projects directory exists
        const dirExists = await sandbox.files.exists(CLAUDE_PROJECTS_DIR);
        if (!dirExists) {
          if (attempt < maxRetries) {
            console.log(
              `[SESSION_WATCHER] Claude projects directory doesn't exist yet, waiting... (attempt ${attempt}/${maxRetries})`
            );
            await new Promise(resolve => setTimeout(resolve, retryDelayMs));
            continue;
          } else {
            console.warn(
              `[SESSION_WATCHER] Claude projects directory not created after ${maxRetries} attempts for task ${this.taskId}`
            );
            return;
          }
        }

        console.log(
          `[SESSION_WATCHER] Starting session watch for task ${this.taskId} at ${this.projectDir}`
        );

        // Watch the projects directory recursively
        this.watchHandle = await sandbox.files.watchDir(
          CLAUDE_PROJECTS_DIR,
          (event: FilesystemEvent) => {
            this.handleFileEvent(event, sandbox);
          },
          {
            recursive: true,
            timeoutMs: 0, // No timeout - watch indefinitely
            onExit: (err?: Error) => {
              if (err) {
                console.error(
                  `[SESSION_WATCHER] Watch stopped with error for task ${this.taskId}:`,
                  err
                );
              } else {
                console.log(
                  `[SESSION_WATCHER] Watch stopped for task ${this.taskId}`
                );
              }
            },
          }
        );

        console.log(
          `[SESSION_WATCHER] Successfully started watching for task ${this.taskId}`
        );
        return;
      } catch (error) {
        if (attempt < maxRetries) {
          console.log(
            `[SESSION_WATCHER] Failed to start watching (attempt ${attempt}/${maxRetries}), retrying...`
          );
          await new Promise(resolve => setTimeout(resolve, retryDelayMs));
        } else {
          console.error(
            `[SESSION_WATCHER] Failed to start watching for task ${this.taskId} after ${maxRetries} attempts:`,
            error
          );
          throw error;
        }
      }
    }
  }

  /**
   * Handle a filesystem event
   */
  private async handleFileEvent(
    event: FilesystemEvent,
    sandbox: Sandbox
  ): Promise<void> {
    const filePath = event.name;

    // Only process JSONL files in our project directory
    if (!filePath.endsWith(".jsonl")) {
      return;
    }

    // Check if the file is in our project directory
    const expectedPrefix = encodePathForClaude(this.workspacePath);
    if (!filePath.includes(expectedPrefix)) {
      return;
    }

    // Handle CREATE and WRITE events
    if (
      event.type === FilesystemEventType.CREATE ||
      event.type === FilesystemEventType.WRITE
    ) {
      await this.processJsonlFile(filePath, sandbox);
    }
  }

  /**
   * Process a JSONL file and extract new entries
   */
  private async processJsonlFile(
    relativePath: string,
    sandbox: Sandbox
  ): Promise<void> {
    const fullPath = `${CLAUDE_PROJECTS_DIR}/${relativePath}`;

    try {
      // Read the entire file content
      const content = await sandbox.files.read(fullPath);

      // Split into lines
      const lines = content.split("\n");

      // Get tracked state for this file
      let tracked = this.watchedFiles.get(fullPath);
      if (!tracked) {
        tracked = { path: fullPath, processedLines: 0 };
        this.watchedFiles.set(fullPath, tracked);
      }

      // Process only new lines
      const newLines = lines.slice(tracked.processedLines);
      const entries: SessionEntry[] = [];

      for (const line of newLines) {
        const entry = parseSessionEntry(line);
        if (entry) {
          entries.push(entry);
        }
      }

      // Update processed count
      tracked.processedLines = lines.length;

      if (entries.length === 0) {
        return;
      }

      console.log(
        `[SESSION_WATCHER] Processing ${entries.length} new entries for task ${this.taskId}`
      );

      // Save entries to database and emit to frontend
      await this.saveAndEmitEntries(entries);
    } catch (error) {
      console.error(
        `[SESSION_WATCHER] Error processing file ${fullPath}:`,
        error
      );
    }
  }

  /**
   * Save entries to database and emit to frontend via Socket.IO
   */
  private async saveAndEmitEntries(entries: SessionEntry[]): Promise<void> {
    for (const entry of entries) {
      const timestamp = getEntryTimestamp(entry);

      try {
        // Save to database
        await prisma.sessionEvent.create({
          data: {
            taskId: this.taskId,
            userId: this.userId,
            timestamp,
            data: entry as object,
          },
        });

        // Emit to frontend
        emitSessionEntry(this.taskId, entry);
      } catch (error) {
        console.error(
          `[SESSION_WATCHER] Error saving entry for task ${this.taskId}:`,
          error
        );
      }
    }
  }

  /**
   * Stop watching
   */
  async stop(): Promise<void> {
    if (this.watchHandle) {
      console.log(`[SESSION_WATCHER] Stopping watch for task ${this.taskId}`);
      await this.watchHandle.stop();
      this.watchHandle = null;
      this.watchedFiles.clear();
    }
  }

  /**
   * Check if watcher is active
   */
  isWatching(): boolean {
    return this.watchHandle !== null;
  }
}

// Map of task IDs to session watchers
const sessionWatchers = new Map<string, MoruSessionWatcher>();

/**
 * Start session watching for a task
 */
export async function startMoruSessionWatcher(
  taskId: string,
  userId: string,
  sandbox: Sandbox,
  workspacePath: string = "/workspace"
): Promise<MoruSessionWatcher> {
  // Stop existing watcher if any
  await stopMoruSessionWatcher(taskId);

  const watcher = new MoruSessionWatcher(taskId, userId, workspacePath);
  await watcher.startWatching(sandbox);

  sessionWatchers.set(taskId, watcher);
  return watcher;
}

/**
 * Stop session watching for a task
 */
export async function stopMoruSessionWatcher(taskId: string): Promise<void> {
  const watcher = sessionWatchers.get(taskId);
  if (watcher) {
    await watcher.stop();
    sessionWatchers.delete(taskId);
  }
}

/**
 * Get the session watcher for a task
 */
export function getMoruSessionWatcher(
  taskId: string
): MoruSessionWatcher | undefined {
  return sessionWatchers.get(taskId);
}
