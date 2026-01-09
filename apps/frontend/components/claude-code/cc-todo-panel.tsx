"use client";

import { cn } from "@/lib/utils";
import type { SessionEntry, TodoItem, ToolUseBlock } from "./types";
import { isToolUseBlock, isAssistantMessage } from "./types";

interface CCTodoPanelProps {
  todos: TodoItem[];
  className?: string;
}

/**
 * Sticky todo panel that shows at the bottom of the session
 * Displays the latest state of todos from TodoWrite tool calls
 */
export function CCTodoPanel({ todos, className }: CCTodoPanelProps) {
  if (todos.length === 0) return null;

  return (
    <div
      className={cn(
        "sticky bottom-0 border-t bg-muted/50 backdrop-blur-sm",
        className
      )}
    >
      <div className="mx-auto max-w-3xl px-4 py-3">
        <div className="text-sm font-medium mb-2">Todos</div>
        <div className="flex flex-col gap-1">
          {todos.map((todo, index) => (
            <div
              key={index}
              className={cn(
                "flex items-start gap-2 text-sm font-mono",
                todo.status === "completed" && "text-muted-foreground line-through",
                todo.status === "in_progress" && "font-semibold"
              )}
            >
              <span className="shrink-0 w-4">
                {todo.status === "completed" ? "☒" : "☐"}
              </span>
              <span>{todo.content}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Extract the latest todos from session entries
 * Finds the most recent TodoWrite tool call and returns its todos
 */
export function extractTodosFromEntries(entries: SessionEntry[]): TodoItem[] {
  let latestTodos: TodoItem[] = [];

  for (const entry of entries) {
    if (isAssistantMessage(entry)) {
      const content = entry.message.content;
      if (Array.isArray(content)) {
        for (const block of content) {
          if (isToolUseBlock(block) && block.name === "TodoWrite") {
            const input = block.input as { todos?: TodoItem[] };
            if (input.todos) {
              latestTodos = input.todos;
            }
          }
        }
      }
    }
  }

  return latestTodos;
}
