"use client";

import "../messages/messages.css";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

import { createTask } from "@/lib/actions/create-task";
import { saveModelSelectorCookie } from "@/lib/actions/model-selector-cookie";
import { cn } from "@/lib/utils";
import { type ModelType } from "@repo/types";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowUp,
  Loader2,
  Square,
} from "lucide-react";
import { redirect, useParams } from "next/navigation";
import {
  useEffect,
  useRef,
  useState,
  useMemo,
  useCallback,
  TransitionStartFunction,
} from "react";
import { toast } from "sonner";
import { QueuedAction } from "../messages/queued-message";
import { ModelSelector } from "./model-selector";
import { useSelectedModel } from "@/hooks/chat/use-selected-model";

export function PromptForm({
  onSubmit,
  onStopStream,
  isStreaming = false,
  isHome = false,
  onFocus,
  onBlur,
  initialSelectedModel,
  isInitializing = false,
  transition,
}: {
  onSubmit?: (message: string, model: ModelType, queue: boolean) => void;
  onStopStream?: () => void;
  isStreaming?: boolean;
  isHome?: boolean;
  onFocus?: () => void;
  onBlur?: () => void;
  initialSelectedModel?: ModelType | null;
  isInitializing?: boolean;
  transition?: {
    isPending: boolean;
    startTransition: TransitionStartFunction;
  };
}) {
  const { taskId } = useParams<{ taskId: string }>();
  const { isPending, startTransition } = transition || {};

  const [message, setMessage] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { data: querySelectedModel } = useSelectedModel();
  const [selectedModel, setSelectedModel] = useState<ModelType | null>(
    initialSelectedModel ?? null
  );

  useEffect(() => {
    if (isHome) {
      setSelectedModel(querySelectedModel ?? null);
    }
  }, [isHome, querySelectedModel]);

  const handleSelectModel = useCallback(
    async (model: ModelType | null) => {
      setSelectedModel(model);
      // Persist the model selection if on home page
      if (isHome) {
        try {
          await saveModelSelectorCookie(model);
        } catch (error) {
          console.error("Failed to save model selection:", error);
        }
      }
    },
    [isHome]
  );

  const queryClient = useQueryClient();


  const handleInitiateTask = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();

      if (!message.trim() || !selectedModel || isPending) {
        return;
      }

      const formData = new FormData();
      formData.append("message", message);
      formData.append("model", selectedModel);

      startTransition?.(async () => {
        let taskId: string | null = null;
        try {
          taskId = await createTask(formData);
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : "Unknown error";

          // Show specific toast for task limit errors
          if (
            errorMessage.includes("maximum of") &&
            errorMessage.includes("active tasks")
          ) {
            toast.error("Task limit reached", {
              description: errorMessage,
            });
          } else {
            toast.error("Failed to create task", {
              description: errorMessage,
            });
          }
        }
        if (taskId) {
          queryClient.invalidateQueries({ queryKey: ["tasks"] });
          redirect(`/tasks/${taskId}`);
        }
      });
    },
    [message, selectedModel, queryClient, isPending, startTransition]
  );

  // Direct send action (no modal)
  const handleSendMessage = useCallback(() => {
    if (!selectedModel) {
      toast.error("Please select a model first");
      return;
    }
    onSubmit?.(message, selectedModel, false);
    setMessage("");
  }, [onSubmit, message, selectedModel]);

  // Submission handling
  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (isHome) {
        handleInitiateTask(e);
      } else {
        if (isStreaming && !message.trim()) {
          onStopStream?.();
        } else if (message.trim()) {
          handleSendMessage();
        }
      }
    },
    [isHome, message, handleInitiateTask, isStreaming, onStopStream, handleSendMessage]
  );

  // Textarea's onKeyDown handler for home page
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey && isHome) {
        e.preventDefault();
        handleSubmit(e);
      }
    },
    [isHome, handleSubmit]
  );


  // Keyboard shortcuts for task page
  useEffect(() => {
    const handleGlobalKeyDown = (event: KeyboardEvent) => {
      // For home page, enter handled by handleSubmit
      if (isHome) return;

      // Send message directly on Enter (no modal) - blocked while streaming
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        if (message.trim() && !isStreaming) {
          handleSendMessage();
        }
      } else if (event.key === "Escape" && event.metaKey) {
        event.preventDefault();
        if (isStreaming) {
          onStopStream?.();
        }
      }
    };

    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, [
    isHome,
    message,
    isStreaming,
    handleSendMessage,
    onStopStream,
  ]);

  const isSubmitButtonDisabled = useMemo(
    () =>
      isPending ||
      !selectedModel ||
      isInitializing ||
      !message.trim() ||
      (!isHome && isStreaming),
    [
      isPending,
      selectedModel,
      isInitializing,
      isHome,
      message,
      isStreaming,
    ]
  );

  return (
    <>
      <form
        onSubmit={handleSubmit}
        className={cn(
          "relative z-0 flex w-full flex-col",
          !isHome && "bg-background sticky bottom-0 pb-6"
        )}
      >
        {!isHome && (
          <div className="from-background via-background/60 pointer-events-none absolute -left-px -top-[calc(4rem-1px)] -z-10 h-16 w-[calc(100%+2px)] -translate-y-px bg-gradient-to-t to-transparent" />
        )}

        {!isHome && <QueuedAction />}

        {/* Wrapper div with textarea styling */}
        {/* Outer div acts as a border, with a border-radius 1px larger than the inner div and 1px padding */}
        <div
          className={cn(
            "shadow-highlight/10 relative z-0 rounded-[calc(var(--radius)+1px)] p-px shadow-lg transition-all",
            "focus-within:ring-ring/5 focus-within:border-sidebar-border focus-within:ring-4",
            "user-message-border hover:shadow-highlight/20 focus-within:shadow-highlight/20",
            isPending && "opacity-50"
          )}
        >
          {isHome && (
            <>
              <div className="bg-background absolute inset-px -z-10 rounded-[calc(var(--radius)+1px)]" />
              <div className="absolute inset-0 -z-20 overflow-hidden rounded-[calc(var(--radius)+1px)]">
                <div className="new-task-pulse rotate-right absolute left-1/2 top-1/2 aspect-square w-[110%] -translate-x-1/2 -translate-y-1/2"></div>
                <div className="new-task-pulse rotate-left absolute left-1/2 top-1/2 aspect-square w-[110%] -translate-x-1/2 -translate-y-1/2"></div>
              </div>
            </>
          )}

          <div className="from-card/10 to-card relative flex min-h-24 flex-col rounded-lg bg-gradient-to-t">
            <div className="bg-background absolute inset-0 -z-20 rounded-[calc(var(--radius)+1px)]" />
            <Textarea
              ref={textareaRef}
              autoFocus
              value={message}
              onChange={(e) => {
                if (!isPending) {
                  setMessage(e.target.value);
                }
              }}
              onKeyDown={onKeyDown}
              onFocus={onFocus}
              onBlur={onBlur}
              placeholder={
                isHome
                  ? "Ask anything"
                  : "Follow-up message..."
              }
              className="placeholder:text-muted-foreground/50 bg-transparent! max-h-48 flex-1 resize-none border-0 shadow-none focus-visible:ring-0"
            />

            {/* Buttons inside the container */}
            <div
              className="flex items-center justify-between gap-2 p-2"
              onClick={() => textareaRef.current?.focus()}
            >
              <ModelSelector
                selectedModel={selectedModel}
                handleSelectModel={handleSelectModel}
              />

              <div className="flex items-center gap-2 overflow-hidden">
                <div className="flex items-center gap-2">
                  <Button
                    type="submit"
                    size="iconSm"
                    disabled={isSubmitButtonDisabled}
                    className="focus-visible:ring-primary focus-visible:ring-offset-input rounded-full focus-visible:ring-2 focus-visible:ring-offset-2"
                  >
                    {isPending ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : isStreaming && !message.trim() ? (
                      <div className="p-0.5">
                        <Square className="fill-primary-foreground size-3" />
                      </div>
                    ) : (
                      <ArrowUp className="size-4" />
                    )}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </form>
    </>
  );
}
