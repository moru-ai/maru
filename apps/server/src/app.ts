import { prisma } from "@repo/db";
import { AvailableModels, ModelType } from "@repo/types";
import cors from "cors";
import express from "express";
import http from "http";
import { z } from "zod";
import config, { getCorsOrigins } from "./config";
import { ChatService } from "./agent/chat";
import { TaskInitializationEngine } from "./initialization";
import { errorHandler } from "./middleware/error-handler";
import { apiKeyAuth } from "./middleware/api-key-auth";
import { createSocketServer } from "./socket";
import { updateTaskStatus } from "./utils/task-status";
import { hasReachedTaskLimit } from "./services/task-limit";
import { createWorkspaceManager } from "./execution";
import { filesRouter } from "./files/router";
import { modelContextService } from "./services/model-context-service";

const app = express();
export const chatService = new ChatService();
const initializationEngine = new TaskInitializationEngine();

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

// Initiate task with agent using new initialization system
app.post("/api/tasks/:taskId/initiate", async (req, res) => {
  try {
    console.log("RECEIVED TASK INITIATE REQUEST: /api/tasks/:taskId/initiate");
    const { taskId } = req.params;

    // Validate request body with Zod
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

    const { message: _message, model, userId } = validation.data;

    // Check task limit before processing (production only)
    const isAtLimit = await hasReachedTaskLimit(userId);
    if (isAtLimit) {
      return res.status(429).json({
        error: "Task limit reached",
        message:
          "You have reached the maximum number of active tasks. Please complete or archive existing tasks to create new ones.",
      });
    }

    const task = await prisma.task.findUnique({
      where: { id: taskId },
    });

    if (!task) {
      return res.status(404).json({ error: "Task not found" });
    }

    console.log(`[TASK_INITIATE] Starting task ${taskId}`);

    try {
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

        await updateTaskStatus(taskId, "FAILED", "INIT");

        return res.status(400).json({
          error: `${providerName} API key required`,
          details: `Please configure your ${providerName} API key in settings to use ${model}.`,
        });
      }

      await updateTaskStatus(taskId, "INITIALIZING", "INIT");
      console.log(
        `⏳ [TASK_INITIATE] Task ${taskId} status set to INITIALIZING - starting initialization...`
      );

      const initSteps = await initializationEngine.getDefaultStepsForTask();
      await initializationEngine.initializeTask(taskId, initSteps, userId);

      await updateTaskStatus(taskId, "RUNNING", "INIT");

      // NOTE: We no longer call chatService.processUserMessage() here.
      // The new agent flow is triggered via socket when user sends a message.
      // The agent will be started on-demand in the socket handler.

      res.json({
        success: true,
        message: "Task initiated successfully",
      });
    } catch (initError) {
      console.error(
        `[TASK_INITIATE] Initialization failed for task ${taskId}:`,
        initError
      );
      console.log(
        `❌ [TASK_INITIATE] Task ${taskId} initialization failed - setting status to FAILED`
      );

      await updateTaskStatus(taskId, "FAILED", "INIT");

      if (
        initError instanceof Error &&
        (initError.message.includes("authentication") ||
          initError.message.includes("access token") ||
          initError.message.includes("refresh"))
      ) {
        return res.status(401).json({
          error: "GitHub authentication failed",
          details: "Please reconnect your GitHub account and try again",
        });
      }

      return res.status(500).json({
        error: "Task initialization failed",
        details:
          initError instanceof Error ? initError.message : "Unknown error",
      });
    }
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
