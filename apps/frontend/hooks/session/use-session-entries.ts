'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useCallback, useState, useMemo, useRef } from 'react';
import { useSocket } from '../socket/use-socket';
import type { SessionEntry } from '@repo/types';

/**
 * Fetch session entries from API
 */
async function fetchSessionEntries(taskId: string): Promise<SessionEntry[]> {
  const res = await fetch(`/api/tasks/${taskId}/session-entries`);
  if (!res.ok) {
    throw new Error('Failed to fetch session entries');
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
 * - Performs minimal filtering (UUID dedup, type filtering)
 *
 * Note: Content processing (merging streaming chunks, associating tool results)
 * is done in cc-messages.tsx for cleaner separation of concerns.
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
  const {
    data: rawEntries = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ['session-entries', taskId],
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
      const uuid =
        'uuid' in entry && typeof entry.uuid === 'string' ? entry.uuid : null;
      if (uuid) {
        seenUuidsRef.current.add(uuid);
      }
    }
  }, [rawEntries, taskId]);

  // Filter entries - minimal processing, let cc-messages handle the rest
  const entries = useMemo(() => {
    // Step 1: UUID-based dedup only (for true duplicates from accumulation bugs)
    const seenUuids = new Set<string>();
    const uuidDeduped = rawEntries.filter(entry => {
      const uuid =
        'uuid' in entry && typeof entry.uuid === 'string' ? entry.uuid : null;
      if (!uuid) return true; // Keep entries without UUID (file-history-snapshot etc)
      if (seenUuids.has(uuid)) return false;
      seenUuids.add(uuid);
      return true;
    });

    // Step 2: Filter out entry types we never want to display
    const filtered = uuidDeduped.filter(entry => {
      // Skip internal/metadata types
      if (entry.type === 'queue-operation') return false;
      if (entry.type === 'file-history-snapshot') return false;
      if (entry.type === 'summary') return false;

      // Keep system messages - cc-messages can decide which subtypes to show
      // Keep all user and assistant messages - cc-messages will handle:
      //   - Merging streaming chunks (same message.id)
      //   - Extracting tool results
      //   - Filtering sidechain messages

      return true;
    });

    return filtered;
  }, [rawEntries]);

  // Handle adding new entries optimistically
  const addEntry = useCallback(
    (entry: SessionEntry) => {
      // Fast O(1) dedup check using ref
      const uuid =
        'uuid' in entry && typeof entry.uuid === 'string' ? entry.uuid : null;
      if (uuid) {
        if (seenUuidsRef.current.has(uuid)) {
          return;
        }
        seenUuidsRef.current.add(uuid);
      }

      // When a real user message arrives from server (UUID doesn't start with 'pending-'),
      // replace any optimistic pending entry in-place to prevent duplicates and preserve order.
      // This handles the case where we added an optimistic entry with pending-xxx UUID,
      // then the server sends back the real entry with a different UUID.
      if (entry.type === 'user' && uuid && !uuid.startsWith('pending-')) {
        queryClient.setQueryData<SessionEntry[]>(
          ['session-entries', taskId],
          (old = []) => {
            // Find the pending entry to replace in-place
            const pendingIndex = old.findIndex(e => {
              if (e.type !== 'user') return false;
              const eUuid =
                'uuid' in e && typeof e.uuid === 'string' ? e.uuid : null;
              return eUuid?.startsWith('pending-');
            });

            if (pendingIndex !== -1) {
              // Replace in-place to preserve order
              const pendingUuid = (old[pendingIndex] as any).uuid;
              if (pendingUuid) {
                seenUuidsRef.current.delete(pendingUuid);
              }
              const newEntries = [...old];
              newEntries[pendingIndex] = entry;
              return newEntries;
            }

            // No pending entry found, just append
            return [...old, entry];
          }
        );
        return;
      }

      queryClient.setQueryData<SessionEntry[]>(
        ['session-entries', taskId],
        (old = []) => [...old, entry]
      );
    },
    [queryClient, taskId]
  );

  // Handle batch entries
  const addEntries = useCallback(
    (newEntries: SessionEntry[]) => {
      // Filter using seenUuidsRef for O(1) lookups
      const uniqueNew = newEntries.filter(entry => {
        const uuid =
          'uuid' in entry && typeof entry.uuid === 'string' ? entry.uuid : null;
        if (uuid) {
          if (seenUuidsRef.current.has(uuid)) {
            return false;
          }
          seenUuidsRef.current.add(uuid);
        }
        return true;
      });

      if (uniqueNew.length === 0) return;

      // Find real user messages in the batch (not pending)
      const realUserMessages = uniqueNew.filter(
        entry =>
          entry.type === 'user' &&
          'uuid' in entry &&
          typeof entry.uuid === 'string' &&
          !entry.uuid.startsWith('pending-')
      );

      queryClient.setQueryData<SessionEntry[]>(
        ['session-entries', taskId],
        (old = []) => {
          let result = [...old];

          // For each real user message, replace any pending entry in-place
          for (const realEntry of realUserMessages) {
            const pendingIndex = result.findIndex(e => {
              if (e.type !== 'user') return false;
              const eUuid =
                'uuid' in e && typeof e.uuid === 'string' ? e.uuid : null;
              return eUuid?.startsWith('pending-');
            });

            if (pendingIndex !== -1) {
              // Replace in-place to preserve order
              const pendingUuid = (result[pendingIndex] as any).uuid;
              if (pendingUuid) {
                seenUuidsRef.current.delete(pendingUuid);
              }
              result[pendingIndex] = realEntry;
            } else {
              // No pending entry, will be added with other new entries
            }
          }

          // Append entries that aren't already in result (weren't used to replace pending)
          const toAppend = uniqueNew.filter(e => !result.includes(e));
          return [...result, ...toAppend];
        }
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
      queryClient.invalidateQueries({ queryKey: ['session-entries', taskId] });
    }

    function onSessionComplete(data: { taskId: string }) {
      if (data.taskId === taskId) {
        sessionCompletedRef.current = true;
        setIsStreaming(false);
        // Refetch to ensure we have all entries from the completed session
        queryClient.invalidateQueries({
          queryKey: ['session-entries', taskId],
        });
      }
    }

    function onAgentStopped(data: { taskId: string }) {
      if (data.taskId === taskId) {
        setIsStreaming(false);
      }
    }

    socket.on('session-entry', onSessionEntry);
    socket.on('session-entries', onSessionEntries);
    socket.on('stream-complete', onStreamComplete);
    socket.on('session-complete', onSessionComplete);
    socket.on('agent-stopped', onAgentStopped);

    return () => {
      socket.off('session-entry', onSessionEntry);
      socket.off('session-entries', onSessionEntries);
      socket.off('stream-complete', onStreamComplete);
      socket.off('session-complete', onSessionComplete);
      socket.off('agent-stopped', onAgentStopped);
    };
  }, [socket, taskId, isConnected, enabled, addEntry, addEntries, queryClient]);

  // Clear entries for a task (useful for resets)
  const clearEntries = useCallback(() => {
    seenUuidsRef.current.clear();
    queryClient.setQueryData(['session-entries', taskId], []);
  }, [queryClient, taskId]);

  return {
    entries,
    rawEntries, // Expose raw entries for debugging
    isLoading,
    error,
    isStreaming,
    addEntry,
    addEntries,
    clearEntries,
  };
}
