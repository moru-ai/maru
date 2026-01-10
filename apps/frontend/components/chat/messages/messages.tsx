import type { Message } from "@repo/types";
import {
  isAssistantMessage,
  isUserMessage,
  AvailableModels,
} from "@repo/types";
import { AssistantMessage } from "./assistant-message";
import { UserMessage } from "./user-message";
import InitializingAnimation from "../../task/initializing-animation";
import { useMemo, memo, useRef } from "react";

function groupMessages(messages: Message[]) {
  const messageGroups: Message[][] = [];
  let currentGroup: Message[] = [];

  for (const message of messages) {
    if (isUserMessage(message)) {
      if (
        currentGroup.length > 0 &&
        currentGroup[0] &&
        isUserMessage(currentGroup[0])
      ) {
        messageGroups.push([...currentGroup]);
        currentGroup = [message];
      } else {
        currentGroup.push(message);
      }
    } else if (isAssistantMessage(message)) {
      if (
        currentGroup.length > 0 &&
        currentGroup[0] &&
        isAssistantMessage(currentGroup[0])
      ) {
        messageGroups.push([...currentGroup]);
        currentGroup = [message];
      } else {
        currentGroup.push(message);
        if (currentGroup.length === 2) {
          messageGroups.push([...currentGroup]);
          currentGroup = [];
        }
      }
    }
  }
  if (currentGroup.length > 0) {
    messageGroups.push(currentGroup);
  }

  return messageGroups;
}

function MessagesComponent({
  taskId,
  messages,
  disableEditing,
  isStreamPending,
  isStreaming,
  isReInitializing,
}: {
  taskId: string;
  messages: Message[];
  disableEditing: boolean;
  isStreamPending: boolean;
  isStreaming: boolean;
  isReInitializing: boolean;
}) {
  // Used to properly space the initializing animation
  const userMessageWrapperRef = useRef<HTMLButtonElement>(null);

  // Group messages into pairs of [user, assistant] or single messages
  // This is for sticky user message grouping, so that there's a bottom boundary
  const messageGroups = useMemo(() => groupMessages(messages), [messages]);

  return (
    <div className="relative z-0 mb-24 flex w-full grow flex-col gap-6">
      <InitializingAnimation
        taskId={taskId}
        userMessageWrapperRef={userMessageWrapperRef}
      />

      {messageGroups.map((messageGroup, groupIndex) => {
        const isLastGroup = groupIndex === messageGroups.length - 1;
        const lastMessage = messageGroup[messageGroup.length - 1];
        const endsWithUserMessage = lastMessage && isUserMessage(lastMessage);

        const showGPT5Reasoning = () => {
          const isGPT5Family =
            lastMessage?.llmModel === AvailableModels.GPT_5 ||
            lastMessage?.llmModel === AvailableModels.GPT_5_MINI;
          if (!lastMessage || !isGPT5Family) return false;

          const isLastPartValid =
            isAssistantMessage(lastMessage) &&
            !!lastMessage.metadata?.parts &&
            lastMessage.metadata.parts.length > 0 &&
            (lastMessage.metadata.parts[lastMessage.metadata.parts.length - 1]
              ?.type === "tool-result" ||
              lastMessage.metadata.parts[lastMessage.metadata.parts.length - 1]
                ?.type === "text");

          return isLastGroup && isLastPartValid;
        };

        const shouldShowGenerating =
          isLastGroup && endsWithUserMessage && isStreamPending;

        return (
          <div className="flex flex-col gap-6" key={groupIndex}>
            {messageGroup.map((message) => {
              if (isUserMessage(message)) {
                return (
                  <UserMessage
                    key={message.id}
                    taskId={taskId}
                    message={message}
                    isFirstMessage={groupIndex === 0}
                    disableEditing={disableEditing}
                    userMessageWrapperRef={userMessageWrapperRef}
                  />
                );
              }
              if (isAssistantMessage(message)) {
                return (
                  <AssistantMessage
                    key={message.id}
                    message={message}
                    taskId={taskId}
                    showGenerating={isStreaming && showGPT5Reasoning()}
                  />
                );
              }
              return null;
            })}

            {/* Show GeneratingMessage when task is RUNNING but no streaming content exists */}
            {isReInitializing ? (
              <div className="shimmer flex h-7 w-fit items-center px-3 text-[13px]">
                Re-initializing inactive workspace (may take a minute)...
              </div>
            ) : shouldShowGenerating ? (
              <div className="shimmer flex h-7 w-fit items-center px-3 text-[13px]">
                Generating
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

export const Messages = memo(MessagesComponent);
