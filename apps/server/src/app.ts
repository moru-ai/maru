import { prisma } from "@repo/db";
import { AvailableModels, ModelType } from "@repo/types";
import cors from "cors";
import express from "express";
import http from "http";
import { z } from "zod";
import config, { getCorsOrigins } from "./config";
import { ChatService } from "./agent/chat";
import { errorHandler } from "./middleware/error-handler";
import { apiKeyAuth } from "./middleware/api-key-auth";
import { createSocketServer } from "./socket";
import { updateTaskStatus } from "./utils/task-status";
import { hasReachedTaskLimit } from "./services/task-limit";
import { createWorkspaceManager } from "./execution";
import { filesRouter } from "./files/router";
import { modelContextService } from "./services/model-context-service";
import * as agentSession from "./services/agent-session";

const app = express();
export const chatService = new ChatService();

const initiateTaskSchema = z.object({
  message: z.string().min(1, "Message is required"),
  model: z.enum(Object.values(AvailableModels) as [string, ...string[]], {
    errorMap: () => ({ message: "Invalid model type" }),
  }),
  userId: z.string().min(1, "User ID is required"),
});

const socketIOServer = http.createServer(app);
createSocketServer(socketIOServer);

const corsOrigins = getCorsOrigins(config);

console.log(`[CORS] Allowing origins:`, corsOrigins);

app.use(
  cors({
    origin: corsOrigins,
    credentials: true,
  })
);

app.use(express.json());

// API key authentication for protected routes
app.use("/api", apiKeyAuth);

/* ROUTES */
app.get("/", (_req, res) => {
  res.send("<h1>Hello world</h1>");
});

app.get("/health", (_req, res) => {
  res
    .status(200)
    .json({ status: "healthy", timestamp: new Date().toISOString() });
});

// Files routes
app.use("/api/tasks", filesRouter);

// Get task details
app.get("/api/tasks/:taskId", async (req, res) => {
  try {
    const { taskId } = req.params;
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: {
        user: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    if (!task) {
      return res.status(404).json({ error: "Task not found" });
    }

    res.json(task);
  } catch (error) {
    console.error("Error fetching task:", error);
    res.status(500).json({ error: "Failed to fetch task" });
  }
});

// Initiate task - creates sandbox and processes initial message
app.post("/api/tasks/:taskId/initiate", async (req, res) => {
  try {
    console.log("[TASK_INITIATE] Received request");
    const { taskId } = req.params;

    // Validate request body
    const validation = initiateTaskSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        error: "Validation failed",
        details: validation.error.issues.map((issue) => ({
          field: issue.path.join("."),
          message: issue.message,
        })),
      });
    }

    const { model, userId } = validation.data;

    // Check task limit
    const isAtLimit = await hasReachedTaskLimit(userId);
    if (isAtLimit) {
      return res.status(429).json({
        error: "Task limit reached",
        message: "You have reached the maximum number of active tasks.",
      });
    }

    // Get task with initial message
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      select: { initialMessage: true, userId: true }
    });

    if (!task) {
      return res.status(404).json({ error: "Task not found" });
    }

    if (!task.initialMessage) {
      return res.status(400).json({ error: "No initial message to process" });
    }

    // Get API key from cookies
    const initContext = await modelContextService.createContext(
      taskId,
      req.headers.cookie,
      model as ModelType
    );

    if (!initContext.validateAccess()) {
      const provider = initContext.getProvider();
      const providerName =
        provider === "anthropic"
          ? "Anthropic"
          : provider === "openrouter"
            ? "OpenRouter"
            : "OpenAI";

      return res.status(400).json({
        error: `${providerName} API key required`,
        details: `Please configure your ${providerName} API key in settings to use ${model}.`,
      });
    }

    const anthropicApiKey = initContext.getProviderApiKey();
    if (!anthropicApiKey) {
      return res.status(400).json({ error: "API key not available" });
    }

    // Return immediately
    await updateTaskStatus(taskId, "RUNNING", "INIT");
    res.json({ success: true });

    // Process initial message in background
    console.log(`[TASK_INITIATE] Processing initial message for task ${taskId}`);
    agentSession.sendMessage(
      taskId,
      task.userId,
      task.initialMessage,
      anthropicApiKey
    ).then(() => {
      // Clear initial message after processing
      prisma.task.update({
        where: { id: taskId },
        data: { initialMessage: null }
      }).catch(err => console.error(`[TASK_INITIATE] Failed to clear initialMessage:`, err));
    }).catch(err => {
      console.error(`[TASK_INITIATE] Error processing initial message:`, err);
      updateTaskStatus(taskId, "FAILED", "INIT");
    });

  } catch (error) {
    console.error("Error initiating task:", error);
    res.status(500).json({ error: "Failed to initiate task" });
  }
});

app.get("/api/tasks/:taskId/messages", async (req, res) => {
  try {
    const { taskId } = req.params;
    const messages = await chatService.getChatHistory(taskId);
    res.json({ messages });
  } catch (error) {
    console.error("Error fetching messages:", error);
    res.status(500).json({ error: "Failed to fetch messages" });
  }
});

// Get session entries for Claude Agent SDK
app.get("/api/tasks/:taskId/session-entries", async (req, res) => {
  try {
    const { taskId } = req.params;

    // Get all events for this task
    const allEvents = await prisma.sessionEvent.findMany({
      where: { taskId },
      orderBy: { timestamp: "asc" },
    });

    if (allEvents.length === 0) {
      res.json([]);
      return;
    }

    // Find the latest sessionId from the events
    // Session entries have sessionId in the data field
    let latestSessionId: string | null = null;
    let latestTimestamp: Date | null = null;

    for (const event of allEvents) {
      const data = event.data as { sessionId?: string };
      if (data.sessionId) {
        if (!latestTimestamp || event.timestamp > latestTimestamp) {
          latestTimestamp = event.timestamp;
          latestSessionId = data.sessionId;
        }
      }
    }

    // Filter to only include entries from the latest session
    const filteredEvents = latestSessionId
      ? allEvents.filter((event) => {
          const data = event.data as { sessionId?: string };
          return data.sessionId === latestSessionId;
        })
      : allEvents;

    console.log(`[SESSION_ENTRIES] Task ${taskId}: ${allEvents.length} total, ${filteredEvents.length} from latest session ${latestSessionId?.substring(0, 8)}...`);

    res.json(filteredEvents.map((event) => event.data));
  } catch (error) {
    console.error("Error fetching session entries:", error);
    res.status(500).json({ error: "Failed to fetch session entries" });
  }
});

app.delete("/api/tasks/:taskId/cleanup", async (req, res) => {
  try {
    const { taskId } = req.params;

    console.log(`[TASK_CLEANUP] Starting cleanup for task ${taskId}`);

    const task = await prisma.task.findUnique({
      where: { id: taskId },
      select: {
        id: true,
        status: true,
        workspacePath: true,
        workspaceCleanedUp: true,
        repoUrl: true,
      },
    });

    if (!task) {
      console.warn(`[TASK_CLEANUP] Task ${taskId} not found`);
      return res.status(404).json({
        success: false,
        error: "Task not found",
      });
    }

    if (task.workspaceCleanedUp) {
      console.log(`[TASK_CLEANUP] Task ${taskId} workspace already cleaned up`);
      return res.json({
        success: true,
        message: "Workspace already cleaned up",
        alreadyCleanedUp: true,
        task: {
          id: taskId,
          status: task.status,
          workspaceCleanedUp: true,
        },
      });
    }

    const workspaceManager = createWorkspaceManager();

    console.log(`[TASK_CLEANUP] Cleaning up workspace for task ${taskId}`);

    const cleanupResult = await workspaceManager.cleanupWorkspace(taskId);

    if (!cleanupResult.success) {
      console.error(
        `[TASK_CLEANUP] Cleanup failed for task ${taskId}:`,
        cleanupResult.message
      );
      return res.status(500).json({
        success: false,
        error: "Workspace cleanup failed",
        details: cleanupResult.message,
      });
    }

    await prisma.task.update({
      where: { id: taskId },
      data: { workspaceCleanedUp: true },
    });

    res.json({
      success: true,
      message: cleanupResult.message,
      task: {
        id: taskId,
        status: task.status,
        workspaceCleanedUp: true,
      },
      cleanupDetails: {
        workspacePath: task.workspacePath,
      },
    });
  } catch (error) {
    console.error(
      `[TASK_CLEANUP] Error cleaning up task ${req.params.taskId}:`,
      error
    );
    res.status(500).json({
      success: false,
      error: "Failed to cleanup task",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

app.use(errorHandler);

export { app, socketIOServer };
