import { prisma, InitStatus } from "@repo/db";
import {
  StreamChunk,
  ServerToClientEvents,
  ClientToServerEvents,
  ModelType,
  ApiKeys,
} from "@repo/types";
import http from "http";
import { Server, Socket } from "socket.io";
import { chatService } from "./app";
import config, { getCorsOrigins } from "./config";
import { updateTaskStatus } from "./utils/task-status";
import { parseApiKeysFromCookies } from "./utils/cookie-parser";
import { modelContextService } from "./services/model-context-service";
import * as agentSession from "./services/agent-session";

interface ConnectionState {
  lastSeen: number;
  taskId?: string;
  reconnectCount: number;
  bufferPosition: number;
  apiKeys?: ApiKeys;
}

export type TypedSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

interface TaskStreamState {
  chunks: StreamChunk[];
  isStreaming: boolean;
}

const connectionStates = new Map<string, ConnectionState>();
const taskStreamStates = new Map<string, TaskStreamState>();
let io: Server<ClientToServerEvents, ServerToClientEvents>;

// Helper functions for task stream state management
function getOrCreateTaskStreamState(taskId: string): TaskStreamState {
  if (!taskStreamStates.has(taskId)) {
    taskStreamStates.set(taskId, { chunks: [], isStreaming: false });
  }
  return taskStreamStates.get(taskId)!;
}

function cleanupTaskStreamState(taskId: string): void {
  taskStreamStates.delete(taskId);
  console.log(`[SOCKET] Cleaned up stream state for task ${taskId}`);
}

async function verifyTaskAccess(
  _socketId: string,
  taskId: string
): Promise<boolean> {
  try {
    // For now, just check if task exists
    // TODO: Add proper user authentication and authorization
    const task = await prisma.task.findUnique({
      where: { id: taskId },
    });
    return !!task;
  } catch (error) {
    console.error(`[SOCKET] Error verifying task access:`, error);
    return false;
  }
}

export function emitToTask(
  taskId: string,
  event: keyof ServerToClientEvents,
  data: unknown
) {
  console.log(`[SOCKET] emitToTask: event=${event}, room=task-${taskId}`);
  io.to(`task-${taskId}`).emit(event, data);
}

export function createSocketServer(
  server: http.Server
): Server<ClientToServerEvents, ServerToClientEvents> {
  const socketCorsOrigins = getCorsOrigins(config);

  console.log(`[SOCKET] Allowing origins:`, socketCorsOrigins);

  const isProduction = config.nodeEnv === "production";

  io = new Server(server, {
    cors: {
      origin: socketCorsOrigins,
      methods: ["GET", "POST"],
      credentials: true,
    },
    cookie: {
      name: "io",
      httpOnly: true,
      // Use "none" for production to allow cross-domain cookies, "lax" for development
      sameSite: isProduction ? "none" : "lax",
      secure: isProduction,
    },
  });

  io.on("connection", (socket: TypedSocket) => {
    const connectionId = socket.id;

    const cookieHeader = socket.request.headers.cookie;

    console.log(`[SOCKET] User connected: ${connectionId}`);

    const apiKeys = parseApiKeysFromCookies(cookieHeader);

    // Initialize connection state
    const existingState = connectionStates.get(connectionId);
    const connectionState: ConnectionState = {
      lastSeen: Date.now(),
      taskId: existingState?.taskId,
      reconnectCount: existingState ? existingState.reconnectCount + 1 : 0,
      bufferPosition: existingState?.bufferPosition || 0,
      apiKeys,
    };
    connectionStates.set(connectionId, connectionState);

    socket.emit("connection-info", {
      connectionId,
      reconnectCount: connectionState.reconnectCount,
      timestamp: connectionState.lastSeen,
    });

    // Send current stream state to new connections
    if (connectionState.taskId) {
      const streamState = taskStreamStates.get(connectionState.taskId);
      if (
        streamState &&
        streamState.isStreaming &&
        streamState.chunks.length > 0
      ) {
        console.log(
          `[SOCKET] Sending stream state to ${connectionId} for task ${connectionState.taskId}:`,
          streamState.chunks.length
        );
        socket.emit("stream-state", {
          chunks: streamState.chunks,
          isStreaming: true,
          totalChunks: streamState.chunks.length,
        });
      } else {
        socket.emit("stream-state", {
          chunks: [],
          isStreaming: false,
          totalChunks: 0,
        });
      }
    } else {
      // No task associated yet, send empty state
      socket.emit("stream-state", {
        chunks: [],
        isStreaming: false,
        totalChunks: 0,
      });
    }

    socket.on("join-task", async (data) => {
      try {
        const hasAccess = await verifyTaskAccess(connectionId, data.taskId);
        if (!hasAccess) {
          socket.emit("message-error", { error: "Access denied to task" });
          return;
        }

        // Join the task room
        await socket.join(`task-${data.taskId}`);
        console.log(
          `[SOCKET] User ${connectionId} joined task room: ${data.taskId}`
        );

        // Update connection state
        const state = connectionStates.get(connectionId);
        if (state) {
          state.taskId = data.taskId;
          connectionStates.set(connectionId, state);
        }
      } catch (error) {
        console.error(`[SOCKET] Error joining task room:`, error);
        socket.emit("message-error", { error: "Failed to join task room" });
      }
    });

    socket.on("leave-task", async (data) => {
      try {
        await socket.leave(`task-${data.taskId}`);
        console.log(
          `[SOCKET] User ${connectionId} left task room: ${data.taskId}`
        );

        // Update connection state
        const state = connectionStates.get(connectionId);
        if (state) {
          state.taskId = undefined;
          connectionStates.set(connectionId, state);
        }
      } catch (error) {
        console.error(`[SOCKET] Error leaving task room:`, error);
      }
    });

    // Handle user message
    socket.on("user-message", async (data) => {
      try {
        console.log("Received user message:", data);

        const hasAccess = await verifyTaskAccess(connectionId, data.taskId);
        if (!hasAccess) {
          socket.emit("message-error", { error: "Access denied to task" });
          return;
        }

        // Get API key from connection state
        const state = connectionStates.get(connectionId);
        const anthropicApiKey = state?.apiKeys?.anthropic;

        if (!anthropicApiKey) {
          socket.emit("message-error", {
            error: "Anthropic API key required. Please configure your API key in settings.",
          });
          return;
        }

        // Get task workspace path and user info from database
        const task = await prisma.task.findUnique({
          where: { id: data.taskId },
          select: { workspacePath: true, userId: true },
        });

        if (!task) {
          socket.emit("message-error", { error: "Task not found" });
          return;
        }

        await updateTaskStatus(data.taskId, "RUNNING", "SOCKET");

        // Send message (creates sandbox internally, handles agent lifecycle, polling, completion)
        await agentSession.sendMessage(
          data.taskId,
          task.userId,
          data.message,
          anthropicApiKey
        );

      } catch (error) {
        console.error("Error processing user message:", error);
        socket.emit("message-error", { error: "Failed to process message" });
      }
    });

    socket.on("clear-queued-action", async (data: { taskId: string }) => {
      try {
        chatService.clearQueuedAction(data.taskId);
      } catch (error) {
        console.error("Error clearing queued action:", error);
      }
    });

    socket.on("edit-user-message", async (data) => {
      try {
        console.log("Received edit user message:", data);

        const hasAccess = await verifyTaskAccess(connectionId, data.taskId);
        if (!hasAccess) {
          socket.emit("message-error", { error: "Access denied to task" });
          return;
        }

        // Get task workspace path and user info from database
        const task = await prisma.task.findUnique({
          where: { id: data.taskId },
          select: { workspacePath: true, userId: true },
        });

        if (!task) {
          socket.emit("message-error", { error: "Task not found" });
          return;
        }

        // Create model context for this task
        const modelContext = await modelContextService.createContext(
          data.taskId,
          socket.handshake.headers.cookie,
          data.llmModel as ModelType
        );

        await updateTaskStatus(data.taskId, "RUNNING", "SOCKET");

        // Validate that user has the required API key for the selected model
        if (!modelContext.validateAccess()) {
          const provider = modelContext.getProvider();
          const providerName =
            provider === "anthropic"
              ? "Anthropic"
              : provider === "openrouter"
                ? "OpenRouter"
                : "OpenAI";
          socket.emit("message-error", {
            error: `${providerName} API key required. Please configure your API key in settings to use ${data.llmModel}.`,
          });
          return;
        }

        await chatService.editUserMessage({
          taskId: data.taskId,
          messageId: data.messageId,
          newContent: data.message,
          newModel: data.llmModel,
          context: modelContext,
          workspacePath: task?.workspacePath || undefined,
        });
      } catch (error) {
        console.error("Error editing user message:", error);
        socket.emit("message-error", { error: "Failed to edit message" });
      }
    });

    // Handle request for chat history
    socket.on("get-chat-history", async (data) => {
      console.log(`[SOCKET] Received get-chat-history request:`, {
        taskId: data.taskId,
        complete: data.complete,
        connectionId,
      });

      try {
        const hasAccess = await verifyTaskAccess(connectionId, data.taskId);
        if (!hasAccess) {
          console.warn(`[SOCKET] Access denied for chat history request:`, {
            taskId: data.taskId,
            connectionId,
          });
          socket.emit("chat-history-error", { error: "Access denied to task" });
          return;
        }

        const history = await chatService.getChatHistory(data.taskId);
        console.log(`[SOCKET] Successfully retrieved chat history:`, {
          taskId: data.taskId,
          messageCount: history.length,
          complete: data.complete,
        });

        socket.emit("chat-history", {
          taskId: data.taskId,
          messages: history,
          queuedAction: data.complete
            ? null
            : chatService.getQueuedAction(data.taskId),
        });

        // Note: Initial message is now processed by /initiate endpoint (via after() in create-task)
      } catch (error) {
        console.error(
          `[SOCKET] Error getting chat history for task ${data.taskId}:`,
          error
        );
        socket.emit("chat-history-error", {
          error: "Failed to get chat history",
        });
      }
    });

    socket.on("stop-stream", async (data) => {
      try {
        console.log("Received stop stream request for task:", data.taskId);

        const hasAccess = await verifyTaskAccess(connectionId, data.taskId);
        if (!hasAccess) {
          socket.emit("message-error", { error: "Access denied to task" });
          return;
        }

        // Interrupt the agent if running
        if (agentSession.isProcessing(data.taskId)) {
          await agentSession.interrupt(data.taskId);
        }

        endStream(data.taskId);

        emitToTask(data.taskId, "stream-complete", undefined);
      } catch (error) {
        console.error("Error stopping stream:", error);
        socket.emit("stream-error", { error: "Failed to stop stream" });
      }
    });

    socket.on("heartbeat", () => {
      const state = connectionStates.get(connectionId);
      if (state) {
        state.lastSeen = Date.now();
        connectionStates.set(connectionId, state);
      }
    });

    socket.on("request-history", async (data) => {
      try {
        const hasAccess = await verifyTaskAccess(connectionId, data.taskId);
        if (!hasAccess) {
          socket.emit("history-error", { error: "Access denied to task" });
          return;
        }

        const state = connectionStates.get(connectionId);
        if (state) {
          state.taskId = data.taskId;
          connectionStates.set(connectionId, state);
        }

        // Send structured chunks instead of positional content
        const streamState = taskStreamStates.get(data.taskId);
        if (streamState && streamState.chunks.length > 0) {
          // Send all chunks - let frontend handle deduplication
          socket.emit("stream-state", {
            chunks: streamState.chunks,
            isStreaming: streamState.isStreaming,
            totalChunks: streamState.chunks.length,
          });
        }

        socket.emit("history-complete", {
          taskId: data.taskId,
          totalLength: streamState?.chunks.length || 0,
        });
      } catch (error) {
        console.error(
          `[SOCKET] Error sending history to ${connectionId}:`,
          error
        );
        socket.emit("history-error", { error: "Failed to retrieve history" });
      }
    });

    // Handle connection errors
    socket.on("error", (error) => {
      console.error(`[SOCKET] Connection error for ${connectionId}:`, error);
    });

    socket.on("disconnect", (reason) => {
      console.log(
        `[SOCKET] User disconnected: ${connectionId}, reason: ${reason}`
      );

      // Keep connection state for potential reconnection
      const state = connectionStates.get(connectionId);
      if (state) {
        // Mark as disconnected but keep state for 5 minutes
        setTimeout(
          () => {
            connectionStates.delete(connectionId);
            console.log(
              `[SOCKET] Cleaned up connection state for ${connectionId}`
            );
          },
          5 * 60 * 1000
        ); // 5 minutes
      }
    });
  });

  return io;
}

export function startStream(taskId: string) {
  const streamState = getOrCreateTaskStreamState(taskId);
  streamState.chunks = [];
  streamState.isStreaming = true;
  console.log(`[SOCKET] Started stream for task ${taskId}`);
}

export function endStream(taskId: string) {
  const streamState = getOrCreateTaskStreamState(taskId);
  streamState.isStreaming = false;
  if (io) {
    emitToTask(taskId, "stream-complete", undefined);
  }
  console.log(`[SOCKET] Ended stream for task ${taskId}`);
}

export function handleStreamError(error: unknown, taskId: string) {
  const streamState = getOrCreateTaskStreamState(taskId);
  streamState.isStreaming = false;
  if (io) {
    emitToTask(taskId, "stream-error", error);
  }
  console.log(`[SOCKET] Stream error for task ${taskId}:`, error);
}

export async function emitTaskStatusUpdate(
  taskId: string,
  status: string,
  initStatus?: InitStatus
) {
  if (io) {
    // If initStatus not provided, fetch current task state including error message
    let currentInitStatus = initStatus;
    let errorMessage: string | undefined;

    if (!currentInitStatus || status === "FAILED") {
      try {
        const task = await prisma.task.findUnique({
          where: { id: taskId },
          select: { initStatus: true, errorMessage: true },
        });
        currentInitStatus = currentInitStatus || task?.initStatus;
        errorMessage = task?.errorMessage || undefined;
      } catch (error) {
        console.error(
          `[SOCKET] Error fetching task data for ${taskId}:`,
          error
        );
      }
    }

    const statusUpdateEvent = {
      taskId,
      status,
      initStatus: currentInitStatus,
      timestamp: new Date().toISOString(),
      ...(errorMessage && { errorMessage }),
    };

    console.log(`[SOCKET] Emitting task status update:`, statusUpdateEvent);
    emitToTask(taskId, "task-status-updated", statusUpdateEvent);
  }
}

export function emitStreamChunk(chunk: StreamChunk, taskId: string) {
  // Store the chunk for state recovery (exclude complete/error chunks from state)
  if (chunk.type !== "complete" && chunk.type !== "error") {
    const streamState = getOrCreateTaskStreamState(taskId);
    streamState.chunks.push(chunk);
  }

  if (io) {
    emitToTask(taskId, "stream-chunk", chunk);
  }

  if (chunk.type === "complete") {
    console.log(`[SOCKET] Chunk type: complete for task ${taskId}`);
    endStream(taskId);
  }
}

export function emitSessionEntry(taskId: string, entry: unknown) {
  if (io) {
    emitToTask(taskId, "session-entry", { taskId, entry });
  }
}

// Export cleanup functions for task memory management
export { cleanupTaskStreamState };
