import { Sandbox, EntryInfo } from "@moru-ai/core";
import * as diff from "diff";
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
  GrepMatch,
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
  RecursiveDirectoryEntry,
  MAX_LINES_PER_READ,
} from "@repo/types";
import { CommandResult } from "../interfaces/types";

/**
 * MoruToolExecutor implements tool operations using Moru Sandbox VMs
 */
export class MoruToolExecutor implements ToolExecutor {
  private taskId: string;
  private sandbox: Sandbox;
  private workspacePath: string = "/workspace";

  constructor(taskId: string, sandbox: Sandbox) {
    this.taskId = taskId;
    this.sandbox = sandbox;
  }

  /**
   * Calculate accurate line changes using diff library
   */
  private calculateDiffStats(
    oldContent: string,
    newContent: string
  ): { linesAdded: number; linesRemoved: number } {
    const changes = diff.diffLines(oldContent, newContent);
    let linesAdded = 0;
    let linesRemoved = 0;

    for (const change of changes) {
      if (change.added) {
        linesAdded += change.count || 0;
      } else if (change.removed) {
        linesRemoved += change.count || 0;
      }
    }

    return { linesAdded, linesRemoved };
  }

  /**
   * Resolve path relative to workspace
   */
  private resolvePath(relativePath: string): string {
    if (relativePath.startsWith("/")) {
      return relativePath;
    }
    return `${this.workspacePath}/${relativePath}`;
  }

  async readFile(
    targetFile: string,
    options?: ReadFileOptions
  ): Promise<FileResult> {
    try {
      const filePath = this.resolvePath(targetFile);
      const content = await this.sandbox.files.read(filePath);
      const lines = content.split("\n");

      if (options?.shouldReadEntireFile) {
        return {
          success: true,
          content: content,
          totalLines: lines.length,
          message: `Read entire file: ${targetFile} (${lines.length} lines)`,
        };
      }

      // Clamp and paginate line range
      const requestedStart = options?.startLineOneIndexed ?? 1;
      const safeStart = Math.max(
        1,
        Math.min(requestedStart, Math.max(1, lines.length))
      );

      const requestedEnd =
        options?.endLineOneIndexedInclusive ??
        safeStart + MAX_LINES_PER_READ - 1;
      const clampedEnd = Math.min(
        requestedEnd,
        safeStart + MAX_LINES_PER_READ - 1,
        lines.length
      );

      const startLine = safeStart;
      const endLine = clampedEnd;

      const selectedLines = lines.slice(startLine - 1, endLine);
      const selectedContent = selectedLines.join("\n");

      return {
        success: true,
        content: selectedContent,
        startLine,
        endLine,
        totalLines: lines.length,
        message: `Read lines ${startLine}-${endLine} of ${targetFile}`,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        message: `Failed to read file: ${targetFile}`,
      };
    }
  }

  async getFileStats(targetFile: string): Promise<FileStatsResult> {
    try {
      const filePath = this.resolvePath(targetFile);
      const info = await this.sandbox.files.getInfo(filePath);

      return {
        success: true,
        stats: {
          size: info.size,
          mtime: info.modifiedTime || new Date(),
          isFile: info.type === "file",
          isDirectory: info.type === "dir",
        },
        message: `Retrieved stats for: ${targetFile} (${info.size} bytes)`,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        message: `Failed to get file stats: ${targetFile}`,
      };
    }
  }

  async writeFile(
    targetFile: string,
    content: string,
    _instructions: string,
    providedIsNewFile?: boolean
  ): Promise<WriteResult> {
    try {
      const filePath = this.resolvePath(targetFile);

      // Use provided isNewFile parameter if available, otherwise detect
      let isNewFile = providedIsNewFile;
      let existingContent = "";

      if (isNewFile === undefined) {
        // Auto-detect if not provided
        try {
          existingContent = await this.sandbox.files.read(filePath);
          isNewFile = false;
        } catch {
          isNewFile = true;
        }
      } else if (!isNewFile) {
        // If explicitly marked as not new, try to read existing content
        try {
          existingContent = await this.sandbox.files.read(filePath);
        } catch {
          // File doesn't exist but marked as not new - treat as new anyway
          isNewFile = true;
        }
      }

      // Write the new content
      await this.sandbox.files.write(filePath, content);

      if (isNewFile) {
        return {
          success: true,
          isNewFile: true,
          message: `Created new file: ${targetFile}`,
          linesAdded: content.split("\n").length,
        };
      } else {
        const diffStats = this.calculateDiffStats(existingContent, content);

        return {
          success: true,
          isNewFile: false,
          message: `Modified file: ${targetFile}`,
          linesAdded: diffStats.linesAdded,
          linesRemoved: diffStats.linesRemoved,
        };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        message: `Failed to edit file: ${targetFile}`,
      };
    }
  }

  async deleteFile(targetFile: string): Promise<DeleteResult> {
    try {
      const filePath = this.resolvePath(targetFile);
      await this.sandbox.files.remove(filePath);

      return {
        success: true,
        message: `Successfully deleted file: ${targetFile}`,
      };
    } catch (error) {
      if (error instanceof Error && error.message.includes("not found")) {
        return {
          success: true,
          message: `File does not exist: ${targetFile}`,
          wasAlreadyDeleted: true,
        };
      }

      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        message: `Failed to delete file: ${targetFile}`,
      };
    }
  }

  async searchReplace(
    filePath: string,
    oldString: string,
    newString: string,
    _providedIsNewFile?: boolean
  ): Promise<SearchReplaceResult> {
    try {
      // Input validation
      if (!oldString) {
        return {
          success: false,
          message: "Old string cannot be empty",
          error: "EMPTY_OLD_STRING",
          isNewFile: false,
          linesAdded: 0,
          linesRemoved: 0,
          occurrences: 0,
          oldLength: 0,
          newLength: 0,
        };
      }

      if (oldString === newString) {
        return {
          success: false,
          message: "Old string and new string are identical",
          error: "IDENTICAL_STRINGS",
          isNewFile: false,
          linesAdded: 0,
          linesRemoved: 0,
          occurrences: 0,
          oldLength: 0,
          newLength: 0,
        };
      }

      const resolvedPath = this.resolvePath(filePath);

      // Read existing content
      let existingContent: string;
      try {
        existingContent = await this.sandbox.files.read(resolvedPath);
      } catch (error) {
        return {
          success: false,
          message: `File not found: ${filePath}`,
          error: error instanceof Error ? error.message : "File read error",
          isNewFile: false,
          linesAdded: 0,
          linesRemoved: 0,
          occurrences: 0,
          oldLength: 0,
          newLength: 0,
        };
      }

      // Count occurrences
      const occurrences = existingContent.split(oldString).length - 1;

      if (occurrences === 0) {
        return {
          success: false,
          message: `Text not found in file: ${filePath}`,
          error: "TEXT_NOT_FOUND",
          isNewFile: false,
          linesAdded: 0,
          linesRemoved: 0,
          occurrences: 0,
          oldLength: existingContent.length,
          newLength: existingContent.length,
        };
      }

      if (occurrences > 1) {
        return {
          success: false,
          message: `Multiple occurrences found (${occurrences}). The old_string must be unique.`,
          error: "TEXT_NOT_UNIQUE",
          isNewFile: false,
          linesAdded: 0,
          linesRemoved: 0,
          occurrences,
          oldLength: existingContent.length,
          newLength: existingContent.length,
        };
      }

      // Perform replacement and calculate metrics
      const newContent = existingContent.replace(oldString, newString);

      // Calculate line changes using diff
      const diffStats = this.calculateDiffStats(existingContent, newContent);

      // Write the new content
      await this.sandbox.files.write(resolvedPath, newContent);

      return {
        success: true,
        message: `Successfully replaced text in ${filePath}: ${occurrences} occurrence(s), ${diffStats.linesAdded} lines added, ${diffStats.linesRemoved} lines removed`,
        isNewFile: false,
        linesAdded: diffStats.linesAdded,
        linesRemoved: diffStats.linesRemoved,
        occurrences,
        oldLength: existingContent.length,
        newLength: newContent.length,
      };
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

  async listDirectory(
    relativeWorkspacePath: string
  ): Promise<DirectoryListing> {
    try {
      // Handle path resolution correctly
      let normalizedPath = relativeWorkspacePath;
      if (normalizedPath.startsWith("/")) {
        normalizedPath = normalizedPath.slice(1);
      }
      if (normalizedPath === "") {
        normalizedPath = ".";
      }

      const dirPath =
        normalizedPath === "."
          ? this.workspacePath
          : `${this.workspacePath}/${normalizedPath}`;

      const entries = await this.sandbox.files.list(dirPath);

      const contents = entries.map((entry: EntryInfo) => ({
        name: entry.name,
        type: entry.type === "dir" ? ("directory" as const) : ("file" as const),
        isDirectory: entry.type === "dir",
      }));

      return {
        success: true,
        contents,
        path: relativeWorkspacePath,
        message: `Listed ${contents.length} items in ${relativeWorkspacePath}`,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        message: `Failed to list directory: ${relativeWorkspacePath}`,
        path: relativeWorkspacePath,
      };
    }
  }

  async listDirectoryRecursive(
    relativeWorkspacePath: string = "."
  ): Promise<RecursiveDirectoryListing> {
    try {
      // Handle path resolution correctly
      let normalizedPath = relativeWorkspacePath;
      if (normalizedPath.startsWith("/")) {
        normalizedPath = normalizedPath.slice(1);
      }
      if (normalizedPath === "") {
        normalizedPath = ".";
      }

      const dirPath =
        normalizedPath === "."
          ? this.workspacePath
          : `${this.workspacePath}/${normalizedPath}`;

      // Use depth option to get recursive listing
      const allEntries = await this.sandbox.files.list(dirPath, { depth: 100 });

      // Filter out ignored directories
      const IGNORE_DIRS = [
        "node_modules",
        ".git",
        ".next",
        ".turbo",
        "dist",
        "build",
      ];

      const entries: RecursiveDirectoryEntry[] = allEntries
        .filter((entry: EntryInfo) => {
          // Filter out entries in ignored directories
          const pathParts = (entry.path || "").split("/");
          return !pathParts.some((part: string) => IGNORE_DIRS.includes(part));
        })
        .map((entry: EntryInfo) => ({
          name: entry.name,
          type: entry.type === "dir" ? ("directory" as const) : ("file" as const),
          relativePath: (entry.path || "").replace(`${this.workspacePath}/`, ""),
          isDirectory: entry.type === "dir",
        }));

      // Sort entries: directories first, then files, both alphabetically
      entries.sort((a, b) => {
        if (a.isDirectory !== b.isDirectory) {
          return a.isDirectory ? -1 : 1;
        }
        return a.relativePath.localeCompare(b.relativePath);
      });

      return {
        success: true,
        entries,
        basePath: relativeWorkspacePath,
        totalCount: entries.length,
        message: `Recursively listed ${entries.length} items starting from ${relativeWorkspacePath}`,
      };
    } catch (error) {
      return {
        success: false,
        entries: [],
        basePath: relativeWorkspacePath,
        totalCount: 0,
        message: `Failed to list directory recursively: ${relativeWorkspacePath}`,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  async searchFiles(
    query: string,
    _options?: SearchOptions
  ): Promise<FileSearchResult> {
    try {
      const result = await this.sandbox.commands.run(
        `find "${this.workspacePath}" -name "*${query}*" -type f | head -10`,
        { timeoutMs: 30000 }
      );

      const files = result.stdout
        .trim()
        .split("\n")
        .filter((line: string) => line.length > 0)
        .map((file: string) => file.replace(this.workspacePath + "/", ""));

      return {
        success: true,
        files,
        query,
        count: files.length,
        message: `Found ${files.length} files matching: ${query}`,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        message: `Failed to search for files: ${query}`,
        files: [],
        query,
        count: 0,
      };
    }
  }

  async grepSearch(query: string, options?: GrepOptions): Promise<GrepResult> {
    try {
      // Build ripgrep command with file names and line numbers
      let command = `rg -n --with-filename "${query}" "${this.workspacePath}"`;

      if (!options?.caseSensitive) {
        command += " -i";
      }

      if (options?.includePattern) {
        command += ` --glob "${options.includePattern}"`;
      }

      if (options?.excludePattern) {
        command += ` --glob "!${options.excludePattern}"`;
      }

      command += " --max-count 50"; // Limit results

      const result = await this.sandbox.commands.run(command, {
        timeoutMs: 30000,
      });

      // Handle no matches (ripgrep returns exit code 1)
      if (result.exitCode === 1 && result.stdout.trim() === "") {
        return {
          success: true,
          matches: [],
          detailedMatches: [],
          query,
          matchCount: 0,
          message: `No matches found for pattern: ${query}`,
        };
      }

      const rawMatches = result.stdout
        .trim()
        .split("\n")
        .filter((line: string) => line.length > 0);

      // Parse structured output: "file:line:content"
      const detailedMatches: GrepMatch[] = [];
      const matches: string[] = [];

      for (const rawMatch of rawMatches) {
        const colonIndex = rawMatch.indexOf(":");
        const secondColonIndex = rawMatch.indexOf(":", colonIndex + 1);

        if (colonIndex > 0 && secondColonIndex > colonIndex) {
          const file = rawMatch.substring(0, colonIndex);
          const lineNumber = parseInt(
            rawMatch.substring(colonIndex + 1, secondColonIndex),
            10
          );
          let content = rawMatch.substring(secondColonIndex + 1);

          // Truncate content to 250 characters max
          if (content.length > 250) {
            content = content.substring(0, 250) + "...";
          }

          detailedMatches.push({ file, lineNumber, content });
          matches.push(rawMatch);
        } else {
          matches.push(rawMatch);
        }
      }

      return {
        success: true,
        matches,
        detailedMatches,
        query,
        matchCount: matches.length,
        message: `Found ${matches.length} matches for pattern: ${query}`,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        message: `Failed to search for pattern: ${query}`,
        matches: [],
        detailedMatches: [],
        query,
        matchCount: 0,
      };
    }
  }

  async executeCommand(
    command: string,
    options?: CommandOptions
  ): Promise<CommandResult> {
    console.log(`[MORU] Executing command: ${command}`);

    try {
      if (options?.isBackground) {
        // For background commands, run with background: true
        await this.sandbox.commands.run(command, {
          cwd: options?.cwd || this.workspacePath,
          background: true,
          timeoutMs: options?.timeout || 300000, // 5 min for background
        });

        return {
          success: true,
          message: `Background command started: ${command}`,
          isBackground: true,
        };
      } else {
        // For foreground commands
        const result = await this.sandbox.commands.run(command, {
          cwd: options?.cwd || this.workspacePath,
          timeoutMs: options?.timeout || 30000, // 30 seconds default
        });

        const success = result.exitCode === 0;
        return {
          success,
          stdout: result.stdout?.trim() || "",
          stderr: result.stderr?.trim() || "",
          exitCode: result.exitCode,
          message: success
            ? `Command executed successfully: ${command}`
            : `Command failed with exit code ${result.exitCode}: ${command}`,
        };
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";

      return {
        success: false,
        error: errorMessage,
        message: `Failed to execute command: ${command}`,
      };
    }
  }

  getWorkspacePath(): string {
    return this.workspacePath;
  }

  isRemote(): boolean {
    return true;
  }

  getTaskId(): string {
    return this.taskId;
  }

  // Git operations - run git commands via sandbox

  async getGitStatus(): Promise<GitStatusResponse> {
    try {
      const result = await this.sandbox.commands.run("git status --porcelain", {
        cwd: this.workspacePath,
        timeoutMs: 10000,
      });

      return {
        success: true,
        hasChanges: result.stdout.trim().length > 0,
        message: result.stdout.trim().length > 0
          ? "Uncommitted changes detected"
          : "No uncommitted changes",
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : "Failed to get git status",
        hasChanges: false,
      };
    }
  }

  async getGitDiff(): Promise<GitDiffResponse> {
    try {
      const result = await this.sandbox.commands.run("git diff", {
        cwd: this.workspacePath,
        timeoutMs: 30000,
      });

      return {
        success: true,
        diff: result.stdout,
        message: "Git diff retrieved successfully",
      };
    } catch (error) {
      return {
        success: false,
        diff: "",
        message: error instanceof Error ? error.message : "Failed to get git diff",
      };
    }
  }

  async commitChanges(request: GitCommitRequest): Promise<GitCommitResponse> {
    try {
      // Configure git user
      await this.sandbox.commands.run(
        `git config user.name "${request.user.name}"`,
        { cwd: this.workspacePath, timeoutMs: 5000 }
      );
      await this.sandbox.commands.run(
        `git config user.email "${request.user.email}"`,
        { cwd: this.workspacePath, timeoutMs: 5000 }
      );

      // Stage all changes
      await this.sandbox.commands.run("git add -A", {
        cwd: this.workspacePath,
        timeoutMs: 30000,
      });

      // Create commit with co-author
      const coAuthorLine = request.coAuthor
        ? `\n\nCo-authored-by: ${request.coAuthor.name} <${request.coAuthor.email}>`
        : "";
      const commitMessage = `${request.message}${coAuthorLine}`;
      const result = await this.sandbox.commands.run(
        `git commit -m "${commitMessage.replace(/"/g, '\\"')}"`,
        { cwd: this.workspacePath, timeoutMs: 30000 }
      );

      if (result.exitCode !== 0) {
        return {
          success: false,
          message: result.stderr || "Commit failed",
        };
      }

      // Get commit SHA
      const shaResult = await this.sandbox.commands.run("git rev-parse HEAD", {
        cwd: this.workspacePath,
        timeoutMs: 5000,
      });

      return {
        success: true,
        message: "Changes committed successfully",
        commitSha: shaResult.stdout.trim(),
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : "Commit failed",
      };
    }
  }

  async pushBranch(request: GitPushRequest): Promise<GitPushResponse> {
    try {
      let command = `git push origin ${request.branchName}`;
      if (request.setUpstream) {
        command = `git push -u origin ${request.branchName}`;
      }

      const result = await this.sandbox.commands.run(command, {
        cwd: this.workspacePath,
        timeoutMs: 60000, // 1 minute for push
      });

      if (result.exitCode !== 0) {
        return {
          success: false,
          message: result.stderr || "Push failed",
        };
      }

      return {
        success: true,
        message: "Branch pushed successfully",
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : "Push failed",
      };
    }
  }
}
