import { Sandbox, CommandHandle } from "@moru-ai/core";
import { prisma } from "@repo/db";
import { AgentProtocol } from "@repo/types";
import { emitToTask } from "../socket";
import { startMoruSessionWatcher, stopMoruSessionWatcher } from "./moru-session-watcher";

/**
 * Manages Claude Agent SDK processes running inside Moru sandboxes.
 * Handles stdin/stdout communication using the agent protocol.
 */

interface AgentProcess {
  sandbox: Sandbox;
  commandHandle: CommandHandle;
  pid: number;
  sessionId: string | null;
  isReady: boolean;
  taskId: string;
}

class AgentProcessManager {
  // Map of taskId -> AgentProcess
  private processes: Map<string, AgentProcess> = new Map();

  // Buffer for partial stdout lines (JSON might be split across chunks)
  private stdoutBuffers: Map<string, string> = new Map();

  /**
   * Start the agent process inside the sandbox
   */
  async startAgent(
    taskId: string,
    sandbox: Sandbox,
    anthropicApiKey: string
  ): Promise<void> {
    // Check if already running
    if (this.processes.has(taskId)) {
      console.log(`[AGENT_PROCESS] Agent already running for task ${taskId}`);
      return;
    }

    console.log(`[AGENT_PROCESS] Starting agent for task ${taskId}`);

    try {
      // Start agent.py with stdin open
      const commandHandle = await sandbox.commands.run(
        "cd /app/src && python3 agent.py",
        {
          background: true,
          stdin: true,
          envs: {
            ANTHROPIC_API_KEY: anthropicApiKey,
            WORKSPACE_DIR: "/workspace",
          },
          onStdout: (data: string) => this.handleStdout(taskId, data),
          onStderr: (data: string) => this.handleStderr(taskId, data),
        }
      );

      const agentProcess: AgentProcess = {
        sandbox,
        commandHandle,
        pid: commandHandle.pid,
        sessionId: null,
        isReady: false,
        taskId,
      };

      this.processes.set(taskId, agentProcess);
      this.stdoutBuffers.set(taskId, "");

      console.log(
        `[AGENT_PROCESS] Agent started for task ${taskId}, PID: ${commandHandle.pid}`
      );

      // Send process_start command
      await this.sendCommand(taskId, {
        type: "process_start",
      });

      // Wait for process_ready event
      await this.waitForReady(taskId);

      console.log(`[AGENT_PROCESS] Agent ready for task ${taskId}`);
    } catch (error) {
      console.error(
        `[AGENT_PROCESS] Failed to start agent for task ${taskId}:`,
        error
      );
      this.processes.delete(taskId);
      this.stdoutBuffers.delete(taskId);
      throw error;
    }
  }

  /**
   * Wait for the agent to be ready (receive process_ready event)
   */
  private waitForReady(taskId: string, timeoutMs: number = 30000): Promise<void> {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();

      const checkReady = () => {
        const process = this.processes.get(taskId);
        if (!process) {
          reject(new Error("Agent process not found"));
          return;
        }

        if (process.isReady) {
          resolve();
          return;
        }

        if (Date.now() - startTime > timeoutMs) {
          reject(new Error("Timeout waiting for agent to be ready"));
          return;
        }

        setTimeout(checkReady, 100);
      };

      checkReady();
    });
  }

  /**
   * Send a user message to the agent
   */
  async sendMessage(taskId: string, text: string): Promise<void> {
    const process = this.processes.get(taskId);
    if (!process) {
      throw new Error(`No agent process found for task ${taskId}`);
    }

    if (!process.isReady) {
      throw new Error(`Agent not ready for task ${taskId}`);
    }

    console.log(`[AGENT_PROCESS] Sending message to task ${taskId}: ${text.substring(0, 50)}...`);

    const command: AgentProtocol.SessionMessageCommand = {
      type: "session_message",
      text,
    };

    await this.sendCommand(taskId, command);
  }

  /**
   * Interrupt the current message processing
   */
  async interrupt(taskId: string): Promise<void> {
    const process = this.processes.get(taskId);
    if (!process) {
      console.warn(`[AGENT_PROCESS] No agent process to interrupt for task ${taskId}`);
      return;
    }

    console.log(`[AGENT_PROCESS] Interrupting agent for task ${taskId}`);

    const command: AgentProtocol.SessionInterruptCommand = {
      type: "session_interrupt",
    };

    await this.sendCommand(taskId, command);
  }

  /**
   * Stop the agent process
   */
  async stopAgent(taskId: string): Promise<void> {
    const process = this.processes.get(taskId);
    if (!process) {
      console.warn(`[AGENT_PROCESS] No agent process to stop for task ${taskId}`);
      return;
    }

    console.log(`[AGENT_PROCESS] Stopping agent for task ${taskId}`);

    try {
      // Stop session watcher
      try {
        await stopMoruSessionWatcher(taskId);
      } catch {
        // Ignore errors stopping watcher
      }

      // Send process_stop command
      const command: AgentProtocol.ProcessStopCommand = {
        type: "process_stop",
      };
      await this.sendCommand(taskId, command);

      // Wait a bit for graceful shutdown
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Kill the process if still running
      try {
        await process.commandHandle.kill();
      } catch {
        // Process may have already exited
      }
    } finally {
      this.processes.delete(taskId);
      this.stdoutBuffers.delete(taskId);
    }
  }

  /**
   * Check if agent is running for a task
   */
  isRunning(taskId: string): boolean {
    return this.processes.has(taskId);
  }

  /**
   * Check if agent is ready for a task
   */
  isReady(taskId: string): boolean {
    const process = this.processes.get(taskId);
    return process?.isReady ?? false;
  }

  /**
   * Get the session ID for a task
   */
  getSessionId(taskId: string): string | null {
    const process = this.processes.get(taskId);
    return process?.sessionId ?? null;
  }

  /**
   * Send a command to the agent via stdin
   */
  private async sendCommand(
    taskId: string,
    command: AgentProtocol.ServerToAgentMessage
  ): Promise<void> {
    const process = this.processes.get(taskId);
    if (!process) {
      throw new Error(`No agent process found for task ${taskId}`);
    }

    const json = JSON.stringify(command) + "\n";
    console.log(`[AGENT_PROCESS] Sending to stdin: ${json.trim()}`);

    await process.sandbox.commands.sendStdin(process.pid, json);
  }

  /**
   * Handle stdout data from the agent
   */
  private handleStdout(taskId: string, data: string): void {
    // Buffer partial lines
    let buffer = this.stdoutBuffers.get(taskId) || "";
    buffer += data;

    // Process complete lines
    const lines = buffer.split("\n");

    // Keep the last incomplete line in the buffer
    this.stdoutBuffers.set(taskId, lines.pop() || "");

    for (const line of lines) {
      if (!line.trim()) continue;

      try {
        const message = JSON.parse(line) as AgentProtocol.AgentToServerMessage;
        this.handleAgentMessage(taskId, message);
      } catch (error) {
        console.warn(`[AGENT_PROCESS] Failed to parse stdout line: ${line}`);
      }
    }
  }

  /**
   * Handle stderr data from the agent
   */
  private handleStderr(taskId: string, data: string): void {
    console.error(`[AGENT_PROCESS] stderr from task ${taskId}: ${data}`);
  }

  /**
   * Handle a parsed message from the agent
   */
  private handleAgentMessage(
    taskId: string,
    message: AgentProtocol.AgentToServerMessage
  ): void {
    console.log(`[AGENT_PROCESS] Received from task ${taskId}:`, message.type);

    const process = this.processes.get(taskId);

    switch (message.type) {
      case "process_ready": {
        if (process) {
          process.isReady = true;
          process.sessionId = message.session_id;
        }
        console.log(
          `[AGENT_PROCESS] Agent ready for task ${taskId}, session: ${message.session_id}`
        );
        emitToTask(taskId, "agent-ready", {
          taskId,
          sessionId: message.session_id,
          workspace: message.workspace,
        });
        break;
      }

      case "process_error": {
        console.error(
          `[AGENT_PROCESS] Agent error for task ${taskId}: ${message.message}`
        );
        emitToTask(taskId, "agent-error", {
          taskId,
          error: message.message,
          code: message.code,
        });
        break;
      }

      case "process_stopped": {
        console.log(
          `[AGENT_PROCESS] Agent stopped for task ${taskId}: ${message.reason}`
        );
        this.processes.delete(taskId);
        this.stdoutBuffers.delete(taskId);
        emitToTask(taskId, "agent-stopped", {
          taskId,
          reason: message.reason,
        });
        break;
      }

      case "session_started": {
        if (process) {
          process.sessionId = message.session_id;
        }
        console.log(
          `[AGENT_PROCESS] Session started for task ${taskId}: ${message.session_id}`
        );
        emitToTask(taskId, "session-started", {
          taskId,
          sessionId: message.session_id,
        });

        // Start session watcher now that Claude has created the projects directory
        this.startSessionWatcher(taskId, process?.sandbox);
        break;
      }

      case "session_complete": {
        console.log(
          `[AGENT_PROCESS] Session complete for task ${taskId}, result:`,
          message.result
        );
        emitToTask(taskId, "session-complete", {
          taskId,
          sessionId: message.session_id,
          result: message.result,
        });
        break;
      }

      case "session_interrupted": {
        console.log(
          `[AGENT_PROCESS] Session interrupted for task ${taskId}`
        );
        emitToTask(taskId, "session-interrupted", {
          taskId,
          sessionId: message.session_id,
        });
        break;
      }

      case "session_error": {
        console.error(
          `[AGENT_PROCESS] Session error for task ${taskId}: ${message.message}`
        );
        emitToTask(taskId, "session-error", {
          taskId,
          error: message.message,
          code: message.code,
        });
        break;
      }

      default:
        console.warn(
          `[AGENT_PROCESS] Unknown message type from task ${taskId}:`,
          message
        );
    }
  }

  /**
   * Start session watcher for a task (called when session_started is received)
   */
  private async startSessionWatcher(taskId: string, sandbox: Sandbox | undefined): Promise<void> {
    if (!sandbox) {
      console.warn(`[AGENT_PROCESS] No sandbox available to start session watcher for task ${taskId}`);
      return;
    }

    try {
      // Get userId from task
      const task = await prisma.task.findUnique({
        where: { id: taskId },
        select: { userId: true },
      });

      if (!task) {
        console.warn(`[AGENT_PROCESS] Task ${taskId} not found, cannot start session watcher`);
        return;
      }

      console.log(`[AGENT_PROCESS] Starting session watcher for task ${taskId}`);
      await startMoruSessionWatcher(taskId, task.userId, sandbox, "/workspace");
      console.log(`[AGENT_PROCESS] Session watcher started for task ${taskId}`);
    } catch (error) {
      console.warn(`[AGENT_PROCESS] Failed to start session watcher for task ${taskId}:`, error);
    }
  }

  /**
   * Cleanup all agent processes (for shutdown)
   */
  async cleanup(): Promise<void> {
    console.log(`[AGENT_PROCESS] Cleaning up ${this.processes.size} agent processes`);

    const stopPromises = Array.from(this.processes.keys()).map((taskId) =>
      this.stopAgent(taskId).catch((err) =>
        console.error(`[AGENT_PROCESS] Error stopping agent for ${taskId}:`, err)
      )
    );

    await Promise.all(stopPromises);
  }
}

// Export singleton instance
export const agentProcessManager = new AgentProcessManager();
