import { Sandbox } from "@moru-ai/core";
import { prisma } from "@repo/db";
import { emitToTask, emitSessionEntry } from "../socket";
import config from "../config";
import { createSandboxStorage, isSandboxStorageConfigured } from "./storage";
import { updateTaskStatus } from "../utils/task-status";

const active = new Map<string, { sandbox: Sandbox; pid: number; stop: () => void }>();

export function isProcessing(taskId: string): boolean {
  return active.has(taskId);
}

export async function interrupt(taskId: string): Promise<void> {
  const a = active.get(taskId);
  if (!a) return;
  await a.sandbox.commands.sendStdin(a.pid, '{"type":"session_interrupt"}\n');
}

export async function sendMessage(
  taskId: string,
  userId: string,
  message: string,
  apiKey: string
): Promise<void> {
  if (active.has(taskId)) {
    throw new Error("Already processing a message");
  }

  // Get existing task data for restoration
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { sessionId: true, workspaceArchiveId: true }
  });

  // Create sandbox
  const templateId = config.moruTemplateId || "base";
  console.log(`[AGENT_SESSION] Creating sandbox with template: ${templateId}`);
  const sandbox = await Sandbox.create(templateId, {
    apiKey: config.moruApiKey,
    timeoutMs: config.moruSandboxTimeoutMs || 3600000,
    metadata: { taskId, userId }
  });

  // Restore workspace from storage if exists
  if (task?.workspaceArchiveId && isSandboxStorageConfigured()) {
    try {
      const storage = createSandboxStorage();
      const restoreResult = await storage.restore(task.workspaceArchiveId, sandbox);
      if (restoreResult.success) {
        console.log(`[AGENT_SESSION] Restored workspace: ${restoreResult.fileCount} files`);
      } else {
        console.warn(`[AGENT_SESSION] Failed to restore workspace: ${restoreResult.error}`);
      }
    } catch (error) {
      console.warn(`[AGENT_SESSION] Workspace restore error:`, error);
    }
  }

  let sessionId = task?.sessionId;
  let linesRead = 0;

  // Restore session JSONL if resuming
  if (sessionId) {
    linesRead = await restoreSession(taskId, sessionId, sandbox);
    console.log(`[AGENT_SESSION] Resuming session ${sessionId} (${linesRead} entries restored)`);
  }

  // Closure state
  let buffer = "";
  let pollTimer: NodeJS.Timeout | null = null;
  let stopped = false;
  let hasApiError = false;
  let apiErrorMessage: string | null = null;
  const sessionStartTime = Date.now();
  const MAX_SESSION_TIMEOUT_MS = 1800000;  // 30 minutes absolute max (safety net)
  let done: () => void;
  const complete = new Promise<void>(r => (done = r));

  // Start agent
  const handle = await sandbox.commands.run("cd /app/src && python3 agent.py", {
    background: true,
    stdin: true,
    envs: { ANTHROPIC_API_KEY: apiKey, WORKSPACE_DIR: "/workspace" },
    // Agent sessions can run for extended periods (web searches, complex tasks).
    // Default SDK timeout is 60 seconds which causes silent failures on longer tasks.
    timeoutMs: MAX_SESSION_TIMEOUT_MS,
    onStdout: (data: string) => {
      buffer += data;
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          handleMessage(JSON.parse(line));
        } catch (err) {
          console.error(`[AGENT_SESSION] Failed to parse agent output:`, err);
        }
      }
    },
    onStderr: (data: string) => {
      console.error(`[AGENT_SESSION] Agent stderr: ${data}`);
      // Check for common startup errors
      if (data.includes("No such file or directory") || data.includes("not found")) {
        handleMessage({
          type: "session_error",
          message: `Agent failed to start: ${data.trim()}. The claude-agent template may need to be rebuilt.`
        });
      }
    },
  });

  function handleMessage(msg: Record<string, unknown>) {
    if (msg.type === "session_started") {
      sessionId = msg.session_id as string;
      prisma.task.update({ where: { id: taskId }, data: { sessionId } })
        .catch((err) => console.error(`[AGENT_SESSION] Failed to save sessionId:`, err));
      emitToTask(taskId, "session-started", { taskId, sessionId });

      // Start polling for session entries
      async function doPoll() {
        const result = await pollFile(taskId, userId, sessionId!, sandbox, linesRead);
        linesRead = result.linesRead;

        if (result.apiError) {
          hasApiError = true;
          apiErrorMessage = result.apiError.message;
        }

        // Safety net: absolute session timeout (30 min)
        const sessionRunningMs = Date.now() - sessionStartTime;
        if (sessionRunningMs > MAX_SESSION_TIMEOUT_MS && !stopped) {
          console.log(`[AGENT_SESSION] Task ${taskId} hit absolute session timeout (${sessionRunningMs}ms)`);
          handleMessage({ type: "session_complete", result: { timed_out: true, reason: "session_timeout" } });
          return;
        }

        if (!stopped) {
          pollTimer = setTimeout(doPoll, 300);
        }
      }
      doPoll();
    }

    if (msg.type === "session_complete") {
      stopped = true;
      if (pollTimer) clearTimeout(pollTimer);

      (async () => {
        // Read final entries
        const result = await pollFile(taskId, userId, sessionId!, sandbox, linesRead);
        linesRead = result.linesRead;
        if (result.apiError) {
          hasApiError = true;
          apiErrorMessage = result.apiError.message;
        }

        // Emit completion
        if (hasApiError) {
          emitToTask(taskId, "session-error", { taskId, sessionId, error: apiErrorMessage });
        } else {
          emitToTask(taskId, "session-complete", { taskId, sessionId, result: msg.result });
        }

        // Save workspace
        if (isSandboxStorageConfigured()) {
          try {
            const storage = createSandboxStorage();
            const saveResult = await storage.save(taskId, userId, sandbox, {
              paths: ["/workspace", "/home/user/.claude"]
            });

            if (saveResult.success) {
              await prisma.task.update({
                where: { id: taskId },
                data: { workspaceArchiveId: saveResult.archiveId }
              });
              console.log(`[AGENT_SESSION] Saved workspace: ${saveResult.archiveId} (${saveResult.sizeBytes} bytes)`);
            } else {
              console.warn(`[AGENT_SESSION] Failed to save workspace: ${saveResult.error}`);
            }
          } catch (error) {
            console.warn(`[AGENT_SESSION] Workspace save error:`, error);
          }
        }

        // Kill sandbox
        try {
          await sandbox.kill();
          console.log(`[AGENT_SESSION] Killed sandbox for task ${taskId}`);
        } catch (error) {
          console.warn(`[AGENT_SESSION] Failed to kill sandbox:`, error);
        }

        // Update task status
        if (hasApiError) {
          console.log(`[AGENT_SESSION] Task ${taskId} failed due to API error: ${apiErrorMessage}`);
          await updateTaskStatus(taskId, "FAILED", "AGENT_SESSION");
        } else {
          await updateTaskStatus(taskId, "COMPLETED", "AGENT_SESSION");
        }

        done();
      })();
    }

    if (msg.type === "session_error") {
      stopped = true;
      if (pollTimer) clearTimeout(pollTimer);

      const errorMessage = msg.message as string;
      console.error(`[AGENT_SESSION] Session error for task ${taskId}: ${errorMessage}`);

      (async () => {
        // Read final entries
        if (sessionId) {
          await pollFile(taskId, userId, sessionId, sandbox, linesRead);
        }

        emitToTask(taskId, "session-error", { taskId, sessionId, error: errorMessage });

        // Save workspace (partial work)
        if (isSandboxStorageConfigured()) {
          try {
            const storage = createSandboxStorage();
            const saveResult = await storage.save(taskId, userId, sandbox, {
              paths: ["/workspace", "/home/user/.claude"]
            });

            if (saveResult.success) {
              await prisma.task.update({
                where: { id: taskId },
                data: { workspaceArchiveId: saveResult.archiveId }
              });
              console.log(`[AGENT_SESSION] Saved workspace on error: ${saveResult.archiveId}`);
            }
          } catch (error) {
            console.warn(`[AGENT_SESSION] Workspace save error:`, error);
          }
        }

        // Kill sandbox
        try {
          await sandbox.kill();
          console.log(`[AGENT_SESSION] Killed sandbox for task ${taskId} (error)`);
        } catch (error) {
          console.warn(`[AGENT_SESSION] Failed to kill sandbox:`, error);
        }

        await updateTaskStatus(taskId, "FAILED", "AGENT_SESSION");
        done();
      })();
    }
  }

  active.set(taskId, {
    sandbox,
    pid: handle.pid,
    stop: () => {
      stopped = true;
      if (pollTimer) clearTimeout(pollTimer);
    }
  });

  try {
    const send = (cmd: object) => sandbox.commands.sendStdin(handle.pid, JSON.stringify(cmd) + "\n");
    await send({ type: "process_start", session_id: sessionId });
    await send({ type: "session_message", text: message });
    await complete;
  } finally {
    active.delete(taskId);
  }
}

// --- Helpers ---

interface PollResult {
  linesRead: number;
  apiError?: { message: string };
}

async function pollFile(
  taskId: string,
  userId: string,
  sessionId: string,
  sandbox: Sandbox,
  fromLine: number
): Promise<PollResult> {
  let apiError: { message: string } | undefined;

  try {
    const path = `/home/user/.claude/projects/-workspace/${sessionId}.jsonl`;
    const content = await sandbox.files.read(path);
    const lines = content.split("\n");

    for (let i = fromLine; i < lines.length; i++) {
      const line = lines[i];
      if (!line?.trim()) continue;
      const entry = JSON.parse(line);

      // Detect API error entries
      if (entry.isApiErrorMessage === true && entry.message?.content?.[0]?.text) {
        apiError = { message: entry.message.content[0].text };
        console.log(`[AGENT_SESSION] Detected API error in session: ${apiError.message}`);
      }

      await prisma.sessionEvent.create({
        data: { taskId, userId, sessionId, timestamp: new Date(), data: entry }
      });
      emitSessionEntry(taskId, entry);
      fromLine++;
    }
  } catch {}

  return { linesRead: fromLine, apiError };
}

async function restoreSession(
  taskId: string,
  sessionId: string,
  sandbox: Sandbox
): Promise<number> {
  const entries = await prisma.sessionEvent.findMany({
    where: { taskId, sessionId },
    orderBy: { createdAt: "asc" }
  });

  if (!entries.length) return 0;

  const jsonl = entries.map(e => JSON.stringify(e.data)).join("\n") + "\n";
  await sandbox.commands.run("mkdir -p /home/user/.claude/projects/-workspace");
  await sandbox.files.write(`/home/user/.claude/projects/-workspace/${sessionId}.jsonl`, jsonl);

  return entries.length;
}
