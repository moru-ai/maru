import {
  CommandOptions,
  DeleteResult,
  DirectoryListing,
  FileResult,
  FileSearchResult,
  FileStatsResult,
  GrepOptions,
  GrepResult,
  ReadFileOptions,
  WriteResult,
  SearchReplaceResult,
  SearchOptions,
  GitStatusResponse,
  GitDiffResponse,
  GitCommitResponse,
  GitPushResponse,
  GitCommitRequest,
  GitPushRequest,
  RecursiveDirectoryListing,
} from "@repo/types";
import { CommandResult } from "./types";

/**
 * ToolExecutor interface abstracts all tool operations for both local and remote execution
 */
export interface ToolExecutor {
  // File operations
  getFileStats(targetFile: string): Promise<FileStatsResult>;

  readFile(targetFile: string, options?: ReadFileOptions): Promise<FileResult>;

  writeFile(
    targetFile: string,
    content: string,
    instructions: string,
    isNewFile?: boolean
  ): Promise<WriteResult>;

  deleteFile(targetFile: string): Promise<DeleteResult>;

  searchReplace(
    filePath: string,
    oldString: string,
    newString: string,
    isNewFile?: boolean
  ): Promise<SearchReplaceResult>;

  // Directory operations
  listDirectory(relativeWorkspacePath: string): Promise<DirectoryListing>;
  
  listDirectoryRecursive(relativeWorkspacePath?: string): Promise<RecursiveDirectoryListing>;

  // Search operations
  searchFiles(
    query: string,
    options?: SearchOptions
  ): Promise<FileSearchResult>;

  grepSearch(query: string, options?: GrepOptions): Promise<GrepResult>;

  // Command execution
  executeCommand(
    command: string,
    options?: CommandOptions
  ): Promise<CommandResult>;

  // Workspace information
  getWorkspacePath(): string;
  isRemote(): boolean;

  // Task context
  getTaskId(): string;

  // Git operations
  getGitStatus(): Promise<GitStatusResponse>;
  getGitDiff(): Promise<GitDiffResponse>;
  commitChanges(request: GitCommitRequest): Promise<GitCommitResponse>;
  pushBranch(request: GitPushRequest): Promise<GitPushResponse>;
}
