"use client";

import { useState, useEffect, useMemo } from "react";
import { CCMessages, CCTodoPanel, extractTodosFromEntries, SessionEntry } from "@/components/claude-code";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MOCK_CASES, MOCK_CASE_IDS } from "./mock-data";

export default function ClaudeCodeTestPage() {
  const [selectedCase, setSelectedCase] = useState<string>("");
  const [entries, setEntries] = useState<SessionEntry[]>([]);

  // Load entries when case is selected
  useEffect(() => {
    if (selectedCase) {
      const mockCase = MOCK_CASES[selectedCase];
      if (mockCase) {
        setEntries(mockCase.entries);
      }
    } else {
      setEntries([]);
    }
  }, [selectedCase]);

  // Extract todos from entries
  const todos = useMemo(() => extractTodosFromEntries(entries), [entries]);

  // Get current case info for display
  const currentMockCase = selectedCase ? MOCK_CASES[selectedCase] : null;

  return (
    <div className="flex min-h-screen flex-col">
      {/* Header */}
      <div className="bg-background/95 supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50 border-b backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-4 px-4 py-3">
          <h1 className="shrink-0 text-lg font-semibold">Claude Code Test</h1>

          <div className="flex flex-1 items-center gap-2">
            <Select value={selectedCase} onValueChange={setSelectedCase}>
              <SelectTrigger className="w-[400px]">
                <SelectValue placeholder="Select a test case..." />
              </SelectTrigger>
              <SelectContent className="max-h-[500px]">
                {MOCK_CASE_IDS.map((caseId) => {
                  const mockCase = MOCK_CASES[caseId];
                  return (
                    <SelectItem key={caseId} value={caseId}>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-orange-500">
                          {mockCase.name}
                        </span>
                        <span className="text-muted-foreground text-xs">
                          {mockCase.description}
                        </span>
                      </div>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          {entries.length > 0 && (
            <div className="text-muted-foreground shrink-0 text-sm">
              {entries.length} entries
            </div>
          )}
        </div>
      </div>

      {/* Case description banner */}
      {currentMockCase && (
        <div className="border-b bg-orange-500/10 px-4 py-2">
          <div className="mx-auto max-w-3xl">
            <span className="text-sm font-medium text-orange-600">
              {currentMockCase.name}:
            </span>{" "}
            <span className="text-muted-foreground text-sm">
              {currentMockCase.description}
            </span>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
        {entries.length > 0 ? (
          <CCMessages entries={entries} />
        ) : (
          <div className="text-muted-foreground py-12 text-center">
            Select a test case to view messages
          </div>
        )}
      </div>

      {/* Todo Panel - sticky at bottom */}
      <CCTodoPanel todos={todos} />

      {/* Debug: Show raw entries */}
      {entries.length > 0 && (
        <details className="border-t">
          <summary className="text-muted-foreground cursor-pointer px-4 py-2 text-sm">
            Debug: Raw entries ({entries.length})
          </summary>
          <pre className="bg-muted max-h-96 overflow-auto p-4 text-xs">
            {JSON.stringify(entries.slice(0, 10), null, 2)}
          </pre>
        </details>
      )}
    </div>
  );
}
