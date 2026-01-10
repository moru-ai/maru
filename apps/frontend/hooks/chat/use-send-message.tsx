import type { ModelType, SessionEntry, ClaudeCode } from "@repo/types";
import {
  useMutation,
  useQueryClient,
  isCancelledError,
} from "@tanstack/react-query";

/**
 * Create an optimistic UserMessage entry for immediate display
 */
function createOptimisticUserMessage(message: string): ClaudeCode.UserMessage {
  const uuid = `pending-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const now = new Date().toISOString();

  return {
    type: "user",
    uuid,
    parentUuid: null,
    sessionId: "pending",
    timestamp: now,
    version: "0.0.0",
    cwd: "/workspace",
    isSidechain: false,
    userType: "external",
    message: {
      role: "user",
      content: message.trim(),
    },
  };
}

export function useSendMessage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      taskId,
      message,
    }: {
      taskId: string;
      message: string;
      model: ModelType;
    }) => {
      // This will be handled via socket, not direct API call
      // The actual sending happens through socket.emit in the component
      return { taskId, message };
    },
    onMutate: async ({ taskId, message }) => {
      try {
        await queryClient.cancelQueries({
          queryKey: ["session-entries", taskId],
        });
      } catch (error) {
        if (!isCancelledError(error)) {
          // Log unexpected errors but don't block optimistic update
          console.error("Failed to cancel queries for session-entries", error);
        }
      }

      const previousEntries = queryClient.getQueryData<SessionEntry[]>([
        "session-entries",
        taskId,
      ]);

      // Create optimistic user message entry
      const optimisticEntry = createOptimisticUserMessage(message);

      queryClient.setQueryData<SessionEntry[]>(
        ["session-entries", taskId],
        (old) => {
          const currentEntries = old || [];
          return [...currentEntries, optimisticEntry];
        }
      );

      return { previousEntries, optimisticUuid: optimisticEntry.uuid };
    },
    onError: (_err, variables, context) => {
      if (context?.previousEntries) {
        queryClient.setQueryData(
          ["session-entries", variables.taskId],
          context.previousEntries
        );
      }
    },
  });
}
