import type { Sandbox } from "@moru-ai/core";
import type { FileNode } from "@repo/types";

/**
 * Options for saving sandbox state to storage
 */
export interface SaveOptions {
  /**
   * Paths to save - can be directories or files
   * @default ["/workspace"]
   * @example ["/workspace"]
   * @example ["/workspace", "/home/user/.claude"]
   * @example ["/workspace/package.json", "/workspace/src"]
   */
  paths?: string[];

  /**
   * Additional exclude patterns (only applies to directories)
   * Added to DEFAULT_EXCLUDE_PATTERNS
   */
  excludes?: string[];
}

/**
 * Result of a save operation
 */
export interface SaveResult {
  success: boolean;
  /** Unique identifier for the saved archive */
  archiveId: string;
  /** Size of the archive in bytes */
  sizeBytes: number;
  /** Which paths were saved */
  paths: string[];
  /** Error message if failed */
  error?: string;
}

/**
 * Result of a restore operation
 */
export interface RestoreResult {
  success: boolean;
  /** Number of files restored */
  fileCount: number;
  /** Total bytes restored */
  sizeBytes: number;
  /** Error message if failed */
  error?: string;
}

/**
 * SandboxStorage interface - pluggable storage backend abstraction
 *
 * Implementations handle persisting sandbox files to object storage
 * when sandboxes are killed, and restoring them when resuming.
 */
export interface SandboxStorage {
  /**
   * Get the provider name (e.g., "gcs", "supabase")
   */
  readonly provider: string;

  /**
   * Save sandbox files to storage
   * Creates a tar archive of specified paths (excluding node_modules, .git, etc.)
   *
   * @param taskId - Task identifier
   * @param userId - User identifier (for storage path organization)
   * @param sandbox - Moru sandbox instance to read files from
   * @param options - Save options
   */
  save(
    taskId: string,
    userId: string,
    sandbox: Sandbox,
    options?: SaveOptions
  ): Promise<SaveResult>;

  /**
   * Restore sandbox files from storage
   *
   * @param archiveId - Archive identifier from save result
   * @param sandbox - Moru sandbox instance to write files to
   */
  restore(archiveId: string, sandbox: Sandbox): Promise<RestoreResult>;

  /**
   * Get file tree from storage (for cached UI)
   *
   * @param archiveId - Archive identifier
   * @param rootPath - Optional root path to filter (e.g., "/workspace")
   */
  getFileTree(archiveId: string, rootPath?: string): Promise<FileNode[] | null>;

  /**
   * Get file content from storage (for cached UI)
   *
   * @param archiveId - Archive identifier
   * @param filePath - Path to file within archive
   */
  getFileContent(archiveId: string, filePath: string): Promise<string | null>;

  /**
   * Delete an archive
   *
   * @param archiveId - Archive identifier
   */
  delete(archiveId: string): Promise<void>;
}
