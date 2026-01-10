"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useCallback, useState, useMemo, useRef } from "react";
import { useSocket } from "../socket/use-socket";
import type { SessionEntry } from "@repo/types";

/**
 * Fetch session entries from API
 */
async function fetchSessionEntries(taskId: string): Promise<SessionEntry[]> {
  const res = await fetch(`/api/tasks/${taskId}/session-entries`);
  if (!res.ok) {
    throw new Error("Failed to fetch session entries");
  }
  return res.json();
}

interface UseSessionEntriesOptions {
  enabled?: boolean;
}

/**
 * Hook to manage session entries from Claude Agent SDK
 * - Fetches initial entries from database
 * - Listens for real-time session-entry events via socket
 * - Maintains sorted list of entries by timestamp
 */
export function useSessionEntries(
  taskId: string | undefined,
  options: UseSessionEntriesOptions = {}
) {
  const { enabled = true } = options;
  const { socket, isConnected } = useSocket();
  const queryClient = useQueryClient();

  // Track if we're receiving streaming entries
  const [isStreaming, setIsStreaming] = useState(false);
  // Track if session has completed (to avoid setting isStreaming true after completion)
  const sessionCompletedRef = useRef(false);
  // Track seen UUIDs for O(1) dedup lookups
  const seenUuidsRef = useRef(new Set<string>());

  // Fetch initial entries from API
  const { data: rawEntries = [], isLoading, error } = useQuery({
    queryKey: ["session-entries", taskId],
    queryFn: () => fetchSessionEntries(taskId!),
    enabled: enabled && !!taskId,
    staleTime: 30000, // 30 seconds
  });

  // Sync seenUuidsRef with rawEntries for fast dedup
  useEffect(() => {
    // Reset when taskId changes
    seenUuidsRef.current.clear();

    // Add all UUIDs from fetched entries
    for (const entry of rawEntries) {
      const uuid = "uuid" in entry && typeof entry.uuid === "string" ? entry.uuid : null;
      if (uuid) {
        seenUuidsRef.current.add(uuid);
      }
    }
  }, [rawEntries, taskId]);

  // Deduplicate and filter entries
  const entries = useMemo(() => {
    // Debug: Log raw entries before any processing
    console.log(`[SESSION_ENTRIES] Raw entries (${rawEntries.length}):`, rawEntries.map(e => ({
      type: e.type,
      uuid: "uuid" in e ? (e.uuid as string)?.substring(0, 8) : undefined,
      parentUuid: "parentUuid" in e ? (e.parentUuid as string)?.substring(0, 8) : undefined,
      isSidechain: "isSidechain" in e ? e.isSidechain : undefined,
      hasToolResult: e.type === "user" && "message" in e && Array.isArray((e.message as {content?: unknown})?.content)
        ? ((e.message as {content: unknown[]}).content).some((b: unknown) => typeof b === "object" && b !== null && "type" in b && (b as {type: string}).type === "tool_result")
        : false,
    })));

    // Helper to get content key for deduplication
    const getContentKey = (entry: SessionEntry): string => {
      if (entry.type === "user" && "message" in entry) {
        const content = entry.message?.content;
        if (typeof content === "string") return `user:${content}`;
        if (Array.isArray(content)) {
          const text = content.map(b => "text" in b ? b.text : "").join("");
          return `user:${text}`;
        }
      }
      if (entry.type === "assistant" && "message" in entry) {
        const content = entry.message?.content;
        if (typeof content === "string") return `assistant:${content}`;
        if (Array.isArray(content)) {
          // For assistant, use first text block as key
          const textBlocks = content.filter(b => "text" in b);
          const firstTextBlock = textBlocks[0];
          if (firstTextBlock && "text" in firstTextBlock) {
            return `assistant:${(firstTextBlock as { text: string }).text}`;
          }
        }
      }
      // For other types, use uuid if available
      const uuid = "uuid" in entry && typeof entry.uuid === "string" ? entry.uuid : null;
      return uuid || `${entry.type}:${Math.random()}`;
    };

    // Deduplicate by content key (not UUID - session watcher creates new UUIDs each save)
    // IMPORTANT: Keep the LAST occurrence (not first) because streaming updates
    // may write multiple versions of the same entry, and later versions are more complete
    const seen = new Map<string, number>(); // key -> last index
    rawEntries.forEach((entry, index) => {
      const key = getContentKey(entry);
      seen.set(key, index);
    });
    const deduplicated = rawEntries.filter((entry, index) => {
      // Keep only entries that are the last occurrence of their key
      const key = getContentKey(entry);
      return seen.get(key) === index;
    });

    // Filter out entries we don't want to display
    const filtered = deduplicated.filter((entry) => {
      // Skip queue operations
      if (entry.type === "queue-operation") return false;

      // Skip file history snapshots
      if (entry.type === "file-history-snapshot") return false;

      // Skip summary messages
      if (entry.type === "summary") return false;

      // Skip system messages (for now)
      if (entry.type === "system") return false;

      // Skip sidechain messages (warmup/subagent messages)
      // isSidechain is a required field on user/assistant messages
      // BUT: Don't filter out tool results - they're part of the main conversation
      if (entry.type === "user" || entry.type === "assistant") {
        if (entry.isSidechain) {
          // Check if this is a tool result message - don't filter those
          if (entry.type === "user" && "message" in entry) {
            const content = entry.message?.content;
            if (Array.isArray(content)) {
              const hasToolResult = content.some(block => "type" in block && block.type === "tool_result");
              if (hasToolResult) {
                return true; // Keep tool result messages
              }
            }
          }
          return false;
        }
      }

      return true;
    });

    // Log what was filtered out for debugging
    const filteredOut = deduplicated.filter(e => !filtered.includes(e));
    if (filteredOut.length > 0) {
      console.log(`[SESSION_ENTRIES] Filtered out:`, filteredOut.map(e => {
        let hasToolResult = false;
        let contentPreview: string | undefined;
        if (e.type === "user" && "message" in e) {
          const msg = e.message as { content?: unknown };
          if (Array.isArray(msg?.content)) {
            hasToolResult = msg.content.some((b: unknown) => typeof b === "object" && b !== null && "type" in b && (b as { type: string }).type === "tool_result");
          }
          if (typeof msg?.content === "string") {
            contentPreview = msg.content.substring(0, 100);
          }
        }
        return {
          type: e.type,
          isSidechain: "isSidechain" in e ? e.isSidechain : undefined,
          hasToolResult,
          contentPreview
        };
      }));
    }
    console.log(`[SESSION_ENTRIES] ${rawEntries.length} raw → ${deduplicated.length} deduped → ${filtered.length} filtered`);

    // Log all entries for debugging
    console.log(`[SESSION_ENTRIES] All entries:`, deduplicated.map(e => ({
      type: e.type,
      isSidechain: "isSidechain" in e ? e.isSidechain : undefined,
    })));

    return filtered;
  }, [rawEntries]);

  // Handle adding new entries optimistically
  const addEntry = useCallback(
    (entry: SessionEntry) => {
      // Fast O(1) dedup check using ref
      const uuid = "uuid" in entry && typeof entry.uuid === "string" ? entry.uuid : null;
      if (uuid) {
        if (seenUuidsRef.current.has(uuid)) {
          console.log(`[SESSION_ENTRIES] Skipping duplicate entry: ${uuid.substring(0, 8)}...`);
          return;
        }
        seenUuidsRef.current.add(uuid);
      }

      queryClient.setQueryData<SessionEntry[]>(
        ["session-entries", taskId],
        (old = []) => [...old, entry]
      );
    },
    [queryClient, taskId]
  );

  // Handle batch entries
  const addEntries = useCallback(
    (newEntries: SessionEntry[]) => {
      // Filter using seenUuidsRef for O(1) lookups
      const uniqueNew = newEntries.filter((entry) => {
        const uuid = "uuid" in entry && typeof entry.uuid === "string" ? entry.uuid : null;
        if (uuid) {
          if (seenUuidsRef.current.has(uuid)) {
            console.log(`[SESSION_ENTRIES] Skipping duplicate entry: ${uuid.substring(0, 8)}...`);
            return false;
          }
          seenUuidsRef.current.add(uuid);
        }
        return true;
      });

      if (uniqueNew.length === 0) return;

      queryClient.setQueryData<SessionEntry[]>(
        ["session-entries", taskId],
        (old = []) => [...old, ...uniqueNew]
      );
    },
    [queryClient, taskId]
  );

  // Socket event listeners
  useEffect(() => {
    if (!socket || !taskId || !isConnected || !enabled) return;

    // Reset session completed flag for new tasks/sessions
    sessionCompletedRef.current = false;

    function onSessionEntry(data: { taskId: string; entry: SessionEntry }) {
      if (data.taskId === taskId) {
        // Only set streaming if session hasn't completed yet
        if (!sessionCompletedRef.current) {
          setIsStreaming(true);
        }
        addEntry(data.entry);
      }
    }

    function onSessionEntries(data: {
      taskId: string;
      entries: SessionEntry[];
    }) {
      if (data.taskId === taskId) {
        // Only set streaming if session hasn't completed yet
        if (!sessionCompletedRef.current) {
          setIsStreaming(true);
        }
        addEntries(data.entries);
      }
    }

    function onStreamComplete() {
      sessionCompletedRef.current = true;
      setIsStreaming(false);
      // Refetch to ensure we have all entries
      queryClient.invalidateQueries({ queryKey: ["session-entries", taskId] });
    }

    function onSessionComplete(data: { taskId: string }) {
      if (data.taskId === taskId) {
        console.log("[SESSION_ENTRIES] Session complete, refetching entries");
        sessionCompletedRef.current = true;
        setIsStreaming(false);
        // Refetch to ensure we have all entries from the completed session
        queryClient.invalidateQueries({ queryKey: ["session-entries", taskId] });
      }
    }

    function onAgentStopped(data: { taskId: string }) {
      if (data.taskId === taskId) {
        setIsStreaming(false);
      }
    }

    socket.on("session-entry", onSessionEntry);
    socket.on("session-entries", onSessionEntries);
    socket.on("stream-complete", onStreamComplete);
    socket.on("session-complete", onSessionComplete);
    socket.on("agent-stopped", onAgentStopped);

    return () => {
      socket.off("session-entry", onSessionEntry);
      socket.off("session-entries", onSessionEntries);
      socket.off("stream-complete", onStreamComplete);
      socket.off("session-complete", onSessionComplete);
      socket.off("agent-stopped", onAgentStopped);
    };
  }, [socket, taskId, isConnected, enabled, addEntry, addEntries, queryClient]);

  // Clear entries for a task (useful for resets)
  const clearEntries = useCallback(() => {
    seenUuidsRef.current.clear();
    queryClient.setQueryData(["session-entries", taskId], []);
  }, [queryClient, taskId]);

  return {
    entries,
    isLoading,
    error,
    isStreaming,
    addEntry,
    addEntries,
    clearEntries,
  };
}
