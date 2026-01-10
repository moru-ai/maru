'use client';

import { PromptForm } from '@/components/chat/prompt-form/prompt-form';
import { useSessionEntries } from '@/hooks/session/use-session-entries';
import { useTaskSocketContext } from '@/contexts/task-socket-context';
import { useParams } from 'next/navigation';
import { ScrollToBottom } from './scroll-to-bottom';
import { useCallback, useMemo, memo, useRef, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ModelType, ClaudeCode } from '@repo/types';
import { useTask } from '@/hooks/tasks/use-task';
import { useSendMessage } from '@/hooks/chat/use-send-message';
import { CCMessages } from '@/components/claude-code';
import InitializingAnimation from './initializing-animation';

/**
 * Create a pending user message entry for the initial message
 */
function createPendingInitialMessage(message: string): ClaudeCode.UserMessage {
  return {
    type: "user",
    uuid: `initial-pending-${Date.now()}`,
    parentUuid: null,
    sessionId: "pending",
    timestamp: new Date().toISOString(),
    version: "0.0.0",
    cwd: "/workspace",
    isSidechain: false,
    userType: "external",
    message: {
      role: "user",
      content: message,
    },
  };
}

function CCTaskPageContent() {
  const { taskId } = useParams<{ taskId: string }>();
  const queryClient = useQueryClient();
  const userMessageWrapperRef = useRef<HTMLButtonElement>(null);

  const { task } = useTask(taskId);

  // Use session entries instead of regular messages
  const {
    entries: rawEntries,
    isLoading: entriesLoading,
    error: entriesError,
    isStreaming: isSessionStreaming,
  } = useSessionEntries(taskId);

  // Combine initial message with entries if no entries yet
  const initialMessage = (task as { initialMessage?: string | null })?.initialMessage;

  const entries = useMemo(() => {
    // If we have entries, use them directly
    if (rawEntries.length > 0) {
      return rawEntries;
    }

    // Show initial message immediately if available (don't wait for entries to load)
    if (initialMessage) {
      return [createPendingInitialMessage(initialMessage)];
    }

    return rawEntries;
  }, [rawEntries, initialMessage]);

  const sendMessageMutation = useSendMessage();

  const {
    sendMessage,
    stopStream,
    isStreaming: isSocketStreaming,
  } = useTaskSocketContext();

  // Combined streaming state
  const isStreaming = isSessionStreaming || isSocketStreaming;

  // Check if we have any displayable content
  const hasContent = entries.length > 0;

  // Debug: Log entries passed to CCMessages
  console.log('entries', entries);

  // Auto-scroll when new entries arrive
  const prevEntriesLength = useRef(entries.length);
  useEffect(() => {
    if (entries.length > prevEntriesLength.current) {
      // New entries arrived, scroll will be handled by ScrollToBottom
      prevEntriesLength.current = entries.length;
    }
  }, [entries.length]);

  const handleSendMessage = useCallback(
    (message: string, model: ModelType, queue: boolean) => {
      if (!taskId || !message.trim()) return;

      // Use the mutation for optimistic updates
      if (!queue) {
        sendMessageMutation.mutate({ taskId, message, model });
      }

      // Send via socket
      sendMessage(message, model, queue);
    },
    [taskId, sendMessageMutation, sendMessage]
  );

  const handleStopStream = useCallback(() => {
    stopStream();
  }, [stopStream]);

  if (entriesError) {
    return (
      <div className='mx-auto flex w-full max-w-xl grow flex-col items-center justify-center'>
        <div className='text-destructive'>
          Error fetching session: {entriesError.message}
        </div>
      </div>
    );
  }

  return (
    <div className='relative z-0 mx-auto flex w-full max-w-xl grow flex-col items-center px-4 sm:px-6'>
      {/* Messages area */}
      <div className='relative z-0 mb-24 flex w-full grow flex-col gap-6'>
        <InitializingAnimation
          taskId={taskId}
          userMessageWrapperRef={userMessageWrapperRef}
        />

        {hasContent ? (
          <CCMessages entries={entries} />
        ) : entriesLoading && !initialMessage ? (
          <div className='relative w-full rounded-lg p-px user-message-border'>
            <div className='shimmer-skeleton relative z-0 w-full overflow-clip rounded-lg px-3 py-2'>
              <div className='h-5 w-full' />
            </div>
            <div className='bg-background absolute inset-px -z-10 rounded-[calc(var(--radius)+1px)]' />
          </div>
        ) : null}

        {/* Show processing indicator when waiting for agent response */}
        {(isStreaming || (initialMessage && rawEntries.length === 0)) && (
          <div className='shimmer flex h-7 w-fit items-center px-3 text-[13px]'>
            Processing...
          </div>
        )}
      </div>

      {task?.status !== 'ARCHIVED' && (
        <>
          <ScrollToBottom />

          <PromptForm
            onSubmit={handleSendMessage}
            onStopStream={handleStopStream}
            isStreaming={isStreaming || sendMessageMutation.isPending || (!!initialMessage && rawEntries.length === 0)}
            initialSelectedModel={task?.mainModel as ModelType | null}
            onFocus={() => {
              queryClient.setQueryData(['edit-message-id', taskId], null);
            }}
            isInitializing={task?.status === 'INITIALIZING'}
          />
        </>
      )}
    </div>
  );
}

export const MemoizedCCTaskPageContent = memo(CCTaskPageContent);
