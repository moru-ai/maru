import { Sandbox } from "@moru-ai/core";
import {
  GitService,
  FileChange,
  DiffStats,
} from "../interfaces/git-service";
import { GitUser } from "../../services/git-manager";
import {
  GitStatusResponse,
  GitCommitResponse,
  GitPushResponse,
  GitConfigResponse,
} from "@repo/types";

/**
 * MoruGitService wraps Sandbox commands to provide unified git operations interface
 * for Moru execution mode
 */
export class MoruGitService implements GitService {
  private workspacePath: string = "/workspace";

  constructor(private sandbox: Sandbox) {}

  async hasChanges(): Promise<boolean> {
    const result = await this.sandbox.commands.run("git status --porcelain", {
      cwd: this.workspacePath,
      timeoutMs: 10000,
    });
    return result.stdout.trim().length > 0;
  }

  async getCurrentCommitSha(): Promise<string> {
    const result = await this.sandbox.commands.run("git rev-parse HEAD", {
      cwd: this.workspacePath,
      timeoutMs: 5000,
    });
    if (result.exitCode !== 0) {
      throw new Error(`Failed to get commit SHA: ${result.stderr}`);
    }
    return result.stdout.trim();
  }

  async getCurrentBranch(): Promise<string> {
    const result = await this.sandbox.commands.run(
      "git rev-parse --abbrev-ref HEAD",
      { cwd: this.workspacePath, timeoutMs: 5000 }
    );
    if (result.exitCode !== 0) {
      throw new Error(`Failed to get current branch: ${result.stderr}`);
    }
    return result.stdout.trim();
  }

  async createShadowBranch(
    baseBranch: string,
    shadowBranch: string
  ): Promise<string> {
    // First ensure we're on the base branch
    await this.sandbox.commands.run(`git checkout ${baseBranch}`, {
      cwd: this.workspacePath,
      timeoutMs: 10000,
    });

    // Get base commit SHA
    const baseCommitResult = await this.sandbox.commands.run(
      "git rev-parse HEAD",
      { cwd: this.workspacePath, timeoutMs: 5000 }
    );
    const baseCommitSha = baseCommitResult.stdout.trim();

    // Create and checkout shadow branch
    const result = await this.sandbox.commands.run(
      `git checkout -b ${shadowBranch}`,
      { cwd: this.workspacePath, timeoutMs: 10000 }
    );

    if (result.exitCode !== 0) {
      throw new Error(`Failed to create shadow branch: ${result.stderr}`);
    }

    return baseCommitSha;
  }

  async commitChanges(options: {
    user: GitUser;
    coAuthor: GitUser;
    message: string;
  }): Promise<GitCommitResponse> {
    try {
      // Configure git user
      await this.configureGitUser(options.user);

      // Stage all changes
      await this.sandbox.commands.run("git add -A", {
        cwd: this.workspacePath,
        timeoutMs: 30000,
      });

      // Create commit with co-author
      const commitMessage = `${options.message}\n\nCo-authored-by: ${options.coAuthor.name} <${options.coAuthor.email}>`;
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
      const commitSha = await this.getCurrentCommitSha();

      return {
        success: true,
        message: "Changes committed successfully",
        commitSha,
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : "Commit failed",
      };
    }
  }

  async pushBranch(
    branchName: string,
    setUpstream: boolean = false
  ): Promise<GitPushResponse> {
    try {
      let command = `git push origin ${branchName}`;
      if (setUpstream) {
        command = `git push -u origin ${branchName}`;
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

  async getDiff(): Promise<string> {
    const result = await this.sandbox.commands.run("git diff", {
      cwd: this.workspacePath,
      timeoutMs: 30000,
    });
    return result.stdout;
  }

  async getDiffAgainstBase(baseBranch: string): Promise<string> {
    const result = await this.sandbox.commands.run(
      `git diff ${baseBranch}...HEAD`,
      { cwd: this.workspacePath, timeoutMs: 30000 }
    );
    return result.stdout;
  }

  async safeCheckoutCommit(commitSha: string): Promise<boolean> {
    const result = await this.sandbox.commands.run(`git checkout ${commitSha}`, {
      cwd: this.workspacePath,
      timeoutMs: 30000,
    });
    return result.exitCode === 0;
  }

  async configureGitUser(user: GitUser): Promise<GitConfigResponse> {
    try {
      await this.sandbox.commands.run(`git config user.name "${user.name}"`, {
        cwd: this.workspacePath,
        timeoutMs: 5000,
      });
      await this.sandbox.commands.run(`git config user.email "${user.email}"`, {
        cwd: this.workspacePath,
        timeoutMs: 5000,
      });

      return {
        success: true,
        message: "Git user configured successfully",
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : "Config failed",
      };
    }
  }

  async getGitStatus(): Promise<GitStatusResponse> {
    try {
      const result = await this.sandbox.commands.run("git status --porcelain", {
        cwd: this.workspacePath,
        timeoutMs: 10000,
      });

      return {
        success: true,
        hasChanges: result.stdout.trim().length > 0,
        message:
          result.stdout.trim().length > 0
            ? "Uncommitted changes detected"
            : "No uncommitted changes",
      };
    } catch (error) {
      return {
        success: false,
        message:
          error instanceof Error ? error.message : "Failed to get git status",
        hasChanges: false,
      };
    }
  }

  async getRecentCommitMessages(
    baseBranch: string,
    limit: number = 5
  ): Promise<string[]> {
    try {
      const result = await this.sandbox.commands.run(
        `git log ${baseBranch}..HEAD --format=%s -n ${limit}`,
        { cwd: this.workspacePath, timeoutMs: 10000 }
      );

      if (result.exitCode !== 0) {
        return [];
      }

      return result.stdout
        .trim()
        .split("\n")
        .filter((msg: string) => msg.length > 0);
    } catch {
      return [];
    }
  }

  async getFileChanges(baseBranch: string = "main"): Promise<{
    fileChanges: FileChange[];
    diffStats: DiffStats;
  }> {
    try {
      // Get detailed file info using git diff --name-status
      const nameStatusResult = await this.sandbox.commands.run(
        `git diff --name-status ${baseBranch}...HEAD`,
        { cwd: this.workspacePath, timeoutMs: 30000 }
      );

      // Get numstat for additions/deletions
      const numstatResult = await this.sandbox.commands.run(
        `git diff --numstat ${baseBranch}...HEAD`,
        { cwd: this.workspacePath, timeoutMs: 30000 }
      );

      const fileChanges: FileChange[] = [];
      let totalAdditions = 0;
      let totalDeletions = 0;

      // Parse name-status output
      const statusLines = nameStatusResult.stdout.trim().split("\n");
      const numstatLines = numstatResult.stdout.trim().split("\n");

      for (let i = 0; i < statusLines.length; i++) {
        const statusLine = statusLines[i];
        if (!statusLine) continue;

        const [status, ...pathParts] = statusLine.split("\t");
        const filePath = pathParts.join("\t");

        // Parse numstat for this file if available
        let additions = 0;
        let deletions = 0;
        const numstatLine = numstatLines[i];
        if (numstatLine) {
          const numstatParts = numstatLine.split("\t");
          additions = parseInt(numstatParts[0] || "0") || 0;
          deletions = parseInt(numstatParts[1] || "0") || 0;
        }

        totalAdditions += additions;
        totalDeletions += deletions;

        // Map git status to operation
        let operation: FileChange["operation"] = "UPDATE";
        if (status === "A") operation = "CREATE";
        else if (status === "D") operation = "DELETE";
        else if (status && status.startsWith("R")) operation = "RENAME";
        else if (status === "M") operation = "UPDATE";

        fileChanges.push({
          filePath,
          operation,
          additions,
          deletions,
          createdAt: new Date().toISOString(),
        });
      }

      return {
        fileChanges,
        diffStats: {
          additions: totalAdditions,
          deletions: totalDeletions,
          totalFiles: fileChanges.length,
        },
      };
    } catch (error) {
      console.error(`[MORU_GIT_SERVICE] Failed to get file changes:`, error);
      return {
        fileChanges: [],
        diffStats: { additions: 0, deletions: 0, totalFiles: 0 },
      };
    }
  }

  /**
   * Clone a repository into the workspace
   */
  async cloneRepository(
    repoUrl: string,
    branch: string,
    githubToken: string
  ): Promise<void> {
    // Inject token into URL
    const cloneUrl = repoUrl.replace("https://", `https://${githubToken}@`);

    const result = await this.sandbox.commands.run(
      `git clone --depth 1 --branch ${branch} ${cloneUrl} ${this.workspacePath}`,
      { timeoutMs: 300000 } // 5 minutes for clone
    );

    if (result.exitCode !== 0) {
      throw new Error(`Failed to clone repository: ${result.stderr}`);
    }
  }
}
