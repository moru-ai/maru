import { Sandbox } from "@moru-ai/core";
import { prisma } from "@repo/db";
import { emitToTask, emitSessionEntry } from "../socket";
import config from "../config";
import { createSandboxStorage, isSandboxStorageConfigured } from "./storage";

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
  const sandbox = await Sandbox.create(config.moruTemplateId || "base", {
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
  let done: () => void;
  const complete = new Promise<void>(r => (done = r));

  // Start agent
  const handle = await sandbox.commands.run("cd /app/src && python3 agent.py", {
    background: true,
    stdin: true,
    envs: { ANTHROPIC_API_KEY: apiKey, WORKSPACE_DIR: "/workspace" },
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
  });

  function handleMessage(msg: Record<string, unknown>) {
    if (msg.type === "session_started") {
      sessionId = msg.session_id as string;
      // Save sessionId to database - must handle promise to avoid silent failures
      prisma.task.update({ where: { id: taskId }, data: { sessionId } })
        .catch((err) => console.error(`[AGENT_SESSION] Failed to save sessionId:`, err));
      emitToTask(taskId, "session-started", { taskId, sessionId });

      // Start polling with setTimeout (sequential, no race)
      async function doPoll() {
        linesRead = await pollFile(taskId, userId, sessionId!, sandbox, linesRead);
        if (!stopped) {
          pollTimer = setTimeout(doPoll, 300);
        }
      }
      doPoll();
    }

    if (msg.type === "session_complete") {
      // Stop polling
      stopped = true;
      if (pollTimer) clearTimeout(pollTimer);

      // Final read, save workspace, kill sandbox
      (async () => {
        linesRead = await pollFile(taskId, userId, sessionId!, sandbox, linesRead);

        // Save workspace to storage before killing sandbox
        let workspaceSaved = false;
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
              workspaceSaved = true;
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

        emitToTask(taskId, "session-complete", { taskId, sessionId, result: msg.result, workspaceSaved });
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

async function pollFile(
  taskId: string,
  userId: string,
  sessionId: string,
  sandbox: Sandbox,
  fromLine: number
): Promise<number> {
  try {
    const path = `/home/user/.claude/projects/-workspace/${sessionId}.jsonl`;
    const content = await sandbox.files.read(path);
    const lines = content.split("\n");

    for (let i = fromLine; i < lines.length; i++) {
      const line = lines[i];
      if (!line?.trim()) continue;
      const entry = JSON.parse(line);

      await prisma.sessionEvent.create({
        data: { taskId, userId, sessionId, timestamp: new Date(), data: entry }
      });
      emitSessionEntry(taskId, entry);
      fromLine++;
    }
  } catch {}
  return fromLine;
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
