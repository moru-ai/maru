"use client";

import { createContext, useContext, ReactNode } from "react";
import { useTaskSocket } from "@/hooks/socket/use-task-socket";
import type { AssistantMessagePart } from "@repo/types";

interface TaskSocketContextValue {
  isConnected: boolean;
  streamingPartsMap: Map<string, AssistantMessagePart>;
  streamingPartsOrder: string[];
  isStreaming: boolean;
  setIsStreaming: (isStreaming: boolean) => void;
  isCompletionPending: boolean;
  sendMessage: (message: string, model: string, queue?: boolean) => void;
  stopStream: () => void;
  clearQueuedAction: () => void;
}

const TaskSocketContext = createContext<TaskSocketContextValue | null>(null);

interface TaskSocketProviderProps {
  taskId: string;
  children: ReactNode;
}

export function TaskSocketProvider({ taskId, children }: TaskSocketProviderProps) {
  const socketState = useTaskSocket(taskId);
  
  return (
    <TaskSocketContext.Provider value={socketState}>
      {children}
    </TaskSocketContext.Provider>
  );
}

export function useTaskSocketContext(): TaskSocketContextValue {
  const context = useContext(TaskSocketContext);
  if (!context) {
    throw new Error(
      'useTaskSocketContext must be used within a TaskSocketProvider'
    );
  }
  return context;
}