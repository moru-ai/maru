import { ToolExecutor } from "../interfaces/tool-executor";
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
  SearchOptions,
  WriteResult,
  SearchReplaceResult,
  GitStatusResponse,
  GitDiffResponse,
  GitCommitResponse,
  GitPushResponse,
  GitCommitRequest,
  GitPushRequest,
  GitConfigResponse,
  GitBranchResponse,
  GitBranchInfoResponse,
  GitCommitInfoResponse,
  GitCheckoutResponse,
  GitCommitMessagesResponse,
  RecursiveDirectoryListing,
} from "@repo/types";
import { CommandResult } from "../interfaces/types";
import { GitUser } from "../../services/git-manager";

/**
 * RemoteToolExecutor executes tools in remote VMs via sidecar API
 * Communicates with the sidecar service running inside the VM
 */
export class RemoteToolExecutor implements ToolExecutor {
  private taskId: string;
  private sidecarUrl: string;
  private timeout: number;

  constructor(taskId: string, sidecarUrl: string, timeout: number = 30000) {
    this.taskId = taskId;
    this.sidecarUrl = sidecarUrl;
    this.timeout = timeout;
  }

  /**
   * Make authenticated HTTP request to VM sidecar API
   */
  public async makeSidecarRequest<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.sidecarUrl}${endpoint}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    console.log(`[REMOTE_TOOL_EXECUTOR] Making request to: ${url}`);
    console.log(`[REMOTE_TOOL_EXECUTOR] Request options:`, {
      method: options.method || "GET",
      headers: options.headers,
      body: options.body,
    });

    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          "Content-Type": "application/json",
          ...options.headers,
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // console.log(`[REMOTE_TOOL_EXECUTOR] Response status: ${response.status} ${response.statusText}`);
      // console.log(`[REMOTE_TOOL_EXECUTOR] Response headers:`, Object.fromEntries(response.headers.entries()));

      if (!response.ok) {
        const errorText = await response.text();
        console.log(`[REMOTE_TOOL_EXECUTOR] Error response body:`, errorText);
        throw new Error(
          `VM Sidecar API error ${response.status}: ${response.statusText}. ${errorText}`
        );
      }

      const responseData = (await response.json()) as T;
      return responseData;
    } catch (error) {
      clearTimeout(timeoutId);
      console.log(`[REMOTE_TOOL_EXECUTOR] Request failed:`, error);
      throw error;
    }
  }

  /**
   * Read file contents from VM filesystem
   */
  async readFile(
    targetFile: string,
    options?: ReadFileOptions
  ): Promise<FileResult> {
    try {
      const response = await this.makeSidecarRequest<FileResult>(
        `/api/files/read`,
        {
          method: "POST",
          body: JSON.stringify({
            path: targetFile,
            ...options,
          }),
        }
      );

      return response;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        message: `Failed to read file: ${targetFile}`,
      };
    }
  }

  /**
   * Get file statistics from VM filesystem
   */
  async getFileStats(targetFile: string): Promise<FileStatsResult> {
    try {
      const response = await this.makeSidecarRequest<FileStatsResult>(
        `/api/files/stats`,
        {
          method: "POST",
          body: JSON.stringify({
            path: targetFile,
          }),
        }
      );

      return response;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        message: `Failed to get file stats: ${targetFile}`,
      };
    }
  }

  /**
   * Write content to file in VM filesystem
   */
  async writeFile(
    targetFile: string,
    content: string,
    instructions: string,
    isNewFile?: boolean
  ): Promise<WriteResult> {
    try {
      const response = await this.makeSidecarRequest<WriteResult>(
        `/api/files/write`,
        {
          method: "POST",
          body: JSON.stringify({
            path: targetFile,
            content,
            instructions,
            isNewFile,
          }),
        }
      );

      return response;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        message: `Failed to write file: ${targetFile}`,
      };
    }
  }

  /**
   * Delete file from VM filesystem
   */
  async deleteFile(targetFile: string): Promise<DeleteResult> {
    try {
      const response = await this.makeSidecarRequest<DeleteResult>(
        `/api/files/delete`,
        {
          method: "POST",
          body: JSON.stringify({
            path: targetFile,
          }),
        }
      );

      return response;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        message: `Failed to delete file: ${targetFile}`,
      };
    }
  }

  /**
   * Search and replace text in file
   */
  async searchReplace(
    filePath: string,
    oldString: string,
    newString: string,
    isNewFile?: boolean
  ): Promise<SearchReplaceResult> {
    try {
      const response = await this.makeSidecarRequest<SearchReplaceResult>(
        `/api/files/search-replace`,
        {
          method: "POST",
          body: JSON.stringify({
            path: filePath,
            oldString,
            newString,
            isNewFile,
          }),
        }
      );

      return response;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        message: `Failed to search and replace in file: ${filePath}`,
        isNewFile: false,
        linesAdded: 0,
        linesRemoved: 0,
        occurrences: 0,
        oldLength: 0,
        newLength: 0,
      };
    }
  }

  /**
   * List directory contents in VM filesystem
   */
  async listDirectory(
    relativeWorkspacePath: string
  ): Promise<DirectoryListing> {
    try {
      const response = await this.makeSidecarRequest<DirectoryListing>(
        `/api/files/list`,
        {
          method: "POST",
          body: JSON.stringify({
            path: relativeWorkspacePath,
          }),
        }
      );

      return response;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        path: relativeWorkspacePath,
        message: `Failed to list directory: ${relativeWorkspacePath}`,
      };
    }
  }

  /**
   * Recursively list all directory contents in VM filesystem (optimized for file tree building)
   */
  async listDirectoryRecursive(
    relativeWorkspacePath: string = "."
  ): Promise<RecursiveDirectoryListing> {
    try {
      const response = await this.makeSidecarRequest<RecursiveDirectoryListing>(
        `/api/files/list-recursive`,
        {
          method: "POST",
          body: JSON.stringify({
            path: relativeWorkspacePath,
          }),
        }
      );

      return response;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        entries: [],
        basePath: relativeWorkspacePath,
        totalCount: 0,
        message: `Failed to list directory recursively: ${relativeWorkspacePath}`,
      };
    }
  }

  /**
   * Search for files by name in VM filesystem
   */
  async searchFiles(
    query: string,
    options?: SearchOptions
  ): Promise<FileSearchResult> {
    try {
      const response = await this.makeSidecarRequest<FileSearchResult>(
        `/api/search/files`,
        {
          method: "POST",
          body: JSON.stringify({
            query,
            ...options,
          }),
        }
      );

      return response;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        query,
        files: [],
        count: 0,
        message: `Failed to search files: ${query}`,
      };
    }
  }

  /**
   * Search file contents using grep in VM
   */
  async grepSearch(query: string, options?: GrepOptions): Promise<GrepResult> {
    try {
      const response = await this.makeSidecarRequest<GrepResult>(
        `/api/search/grep`,
        {
          method: "POST",
          body: JSON.stringify({
            query,
            ...options,
          }),
        }
      );

      return response;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        query,
        matches: [],
        detailedMatches: [],
        matchCount: 0,
        message: `Failed to search with grep: ${query}`,
      };
    }
  }

  /**
   * Execute command in VM via sidecar
   */
  async executeCommand(
    command: string,
    options?: CommandOptions
  ): Promise<CommandResult> {
    try {
      const response = await this.makeSidecarRequest<CommandResult>(
        `/api/execute/command`,
        {
          method: "POST",
          body: JSON.stringify({
            command,
            ...options,
          }),
        }
      );

      return response;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        command,
        stdout: "",
        stderr: "",
        message: `Failed to execute command: ${command}`,
      };
    }
  }

  /**
   * Get workspace path (standard VM path)
   */
  getWorkspacePath(): string {
    return "/workspace";
  }

  /**
   * Check if this executor is remote (always true for Firecracker)
   */
  isRemote(): boolean {
    return true;
  }

  /**
   * Get task context
   */
  getTaskId(): string {
    return this.taskId;
  }

  /**
   * Get git status via sidecar API
   */
  async getGitStatus(): Promise<GitStatusResponse> {
    try {
      const response = await this.makeSidecarRequest<GitStatusResponse>(
        `/api/git/status`,
        {
          method: "GET",
        }
      );

      return response;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        message: "Failed to get git status",
        hasChanges: false,
      };
    }
  }

  /**
   * Get git diff via sidecar API
   */
  async getGitDiff(): Promise<GitDiffResponse> {
    try {
      const response = await this.makeSidecarRequest<GitDiffResponse>(
        `/api/git/diff`,
        {
          method: "GET",
        }
      );

      return response;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        message: "Failed to get git diff",
        diff: "",
      };
    }
  }

  /**
   * Commit changes via sidecar API
   */
  async commitChanges(request: GitCommitRequest): Promise<GitCommitResponse> {
    try {
      const response = await this.makeSidecarRequest<GitCommitResponse>(
        `/api/git/commit`,
        {
          method: "POST",
          body: JSON.stringify(request),
        }
      );

      return response;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        message: "Failed to commit changes",
      };
    }
  }

  /**
   * Push branch via sidecar API
   */
  async pushBranch(request: GitPushRequest): Promise<GitPushResponse> {
    try {
      const response = await this.makeSidecarRequest<GitPushResponse>(
        `/api/git/push`,
        {
          method: "POST",
          body: JSON.stringify(request),
        }
      );

      return response;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        message: "Failed to push branch",
      };
    }
  }

  /**
   * Configure git user via sidecar API
   */
  async configureGitUser(user: GitUser): Promise<GitConfigResponse> {
    try {
      const response = await this.makeSidecarRequest<GitConfigResponse>(
        `/api/git/config`,
        {
          method: "POST",
          body: JSON.stringify({
            name: user.name,
            email: user.email,
          }),
        }
      );

      return response;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        message: "Failed to configure git user",
      };
    }
  }

  /**
   * Create shadow branch via sidecar API
   */
  async createShadowBranch(baseBranch: string, shadowBranch: string): Promise<GitBranchResponse> {
    try {
      const response = await this.makeSidecarRequest<GitBranchResponse>(
        `/api/git/branch`,
        {
          method: "POST",
          body: JSON.stringify({ baseBranch, shadowBranch }),
        }
      );

      return response;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        message: "Failed to create shadow branch",
      };
    }
  }

  /**
   * Get current branch via sidecar API
   */
  async getCurrentBranch(): Promise<GitBranchInfoResponse> {
    try {
      const response = await this.makeSidecarRequest<GitBranchInfoResponse>(
        `/api/git/current-branch`,
        {
          method: "GET",
        }
      );

      return response;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        message: "Failed to get current branch",
      };
    }
  }

  /**
   * Get current commit SHA via sidecar API
   */
  async getCurrentCommitSha(): Promise<GitCommitInfoResponse> {
    try {
      const response = await this.makeSidecarRequest<GitCommitInfoResponse>(
        `/api/git/current-commit`,
        {
          method: "GET",
        }
      );

      return response;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        message: "Failed to get current commit SHA",
      };
    }
  }

  /**
   * Get git diff against a base branch via sidecar API
   */
  async getDiffAgainstBase(baseBranch: string): Promise<GitDiffResponse> {
    try {
      const response = await this.makeSidecarRequest<GitDiffResponse>(
        `/api/git/diff-against-base`,
        {
          method: "POST",
          body: JSON.stringify({ baseBranch }),
        }
      );

      return response;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        message: `Failed to get diff against ${baseBranch}`,
        diff: "",
      };
    }
  }

  /**
   * Safely checkout to a specific commit SHA via sidecar API
   */
  async safeCheckoutCommit(commitSha: string): Promise<GitCheckoutResponse> {
    try {
      const response = await this.makeSidecarRequest<GitCheckoutResponse>(
        `/api/git/checkout`,
        {
          method: "POST",
          body: JSON.stringify({ commitSha }),
        }
      );

      return response;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        message: `Failed to checkout ${commitSha}`,
      };
    }
  }

  /**
   * Get recent commit messages from current branch compared to base branch via sidecar API
   */
  async getRecentCommitMessages(baseBranch: string, limit = 5): Promise<GitCommitMessagesResponse> {
    try {
      const response = await this.makeSidecarRequest<GitCommitMessagesResponse>(
        `/api/git/commit-messages`,
        {
          method: "POST",
          body: JSON.stringify({ baseBranch, limit }),
        }
      );

      return response;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        message: `Failed to get recent commit messages`,
        commitMessages: [],
      };
    }
  }
}
