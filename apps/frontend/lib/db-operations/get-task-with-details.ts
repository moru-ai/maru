import type { Task } from "@repo/db";
import { db } from "@repo/db";
import { makeBackendRequest } from "../make-backend-request";

export interface FileChange {
  filePath: string;
  operation: "CREATE" | "UPDATE" | "DELETE" | "RENAME";
  additions: number;
  deletions: number;
  createdAt: string;
}

export interface DiffStats {
  additions: number;
  deletions: number;
  totalFiles: number;
}

// Note: Todos are now derived from session entries (JSONL), not stored in DB
export interface TaskWithDetails {
  task: Task | null;
  fileChanges: FileChange[];
  diffStats: DiffStats;
}

async function fetchFileChanges(
  taskId: string
): Promise<{ fileChanges: FileChange[]; diffStats: DiffStats }> {
  try {
    const response = await makeBackendRequest(
      `/api/tasks/${taskId}/file-changes`
    );
    if (!response.ok) {
      console.warn(
        `Failed to fetch file changes for task ${taskId}: ${response.status}`
      );
      return {
        fileChanges: [],
        diffStats: { additions: 0, deletions: 0, totalFiles: 0 },
      };
    }
    const data = await response.json();

    return {
      fileChanges: data.fileChanges,
      diffStats: data.diffStats,
    };
  } catch (error) {
    console.error(`Error fetching file changes for task ${taskId}:`, error);
    return {
      fileChanges: [],
      diffStats: { additions: 0, deletions: 0, totalFiles: 0 },
    };
  }
}

export async function getTaskWithDetails(
  taskId: string
): Promise<TaskWithDetails> {
  try {
    // Fetch task and file changes in parallel
    // Note: Todos are now derived from session entries, not fetched from DB
    const [task, { fileChanges, diffStats }] = await Promise.all([
      db.task.findUnique({
        where: { id: taskId },
      }),
      fetchFileChanges(taskId),
    ]);

    return {
      task,
      fileChanges,
      diffStats,
    };
  } catch (error) {
    console.error(`Failed to fetch task details for ${taskId}:`, error);
    // Return empty data structure on error
    return {
      task: null,
      fileChanges: [],
      diffStats: { additions: 0, deletions: 0, totalFiles: 0 },
    };
  }
}
