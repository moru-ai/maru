/**
 * Mock data sets for testing Claude Code message rendering
 * Each mock represents a specific scenario to test
 */
import type { SessionEntry } from "@/components/claude-code/types";

// Helper to generate UUIDs - reset for each case
let uuidCounter = 0;
const uuid = () => `mock-uuid-${++uuidCounter}`;

// Reset counter for each mock case
const resetUuidCounter = () => { uuidCounter = 0; };

// Base entry fields - now accepts parentUuid
const base = (parentUuid: string | null = null) => ({
  uuid: uuid(),
  parentUuid,
  sessionId: "mock-session",
  timestamp: new Date().toISOString(),
  version: "2.1.1" as const,
  cwd: "/Users/demo/project",
  isSidechain: false,
  userType: "external" as const,
});

// Create an entry with a specific UUID (for entries that will be referenced)
const baseWithId = (id: string, parentUuid: string | null = null) => ({
  uuid: id,
  parentUuid,
  sessionId: "mock-session",
  timestamp: new Date().toISOString(),
  version: "2.1.1" as const,
  cwd: "/Users/demo/project",
  isSidechain: false,
  userType: "external" as const,
});

// ============================================================================
// Mock Data Sets
// ============================================================================

export const MOCK_CASES: Record<string, { name: string; description: string; entries: SessionEntry[] }> = {
  // 1. Simple text exchange
  "simple-text": {
    name: "Simple Text",
    description: "Basic user + assistant text exchange",
    entries: [
      {
        type: "user",
        ...base(),
        message: { role: "user", content: "Hello, can you help me with my code?" },
      },
      {
        type: "assistant",
        ...base(),
        requestId: "req_001",
        message: {
          model: "claude-opus-4-5-20251101",
          id: "msg_001",
          type: "message",
          role: "assistant",
          content: [{ type: "text", text: "Of course! I'd be happy to help you with your code. What would you like assistance with?" }],
          stop_reason: "end_turn",
          stop_sequence: null,
          usage: { input_tokens: 50, output_tokens: 30 },
        },
      },
    ] as SessionEntry[],
  },

  // 2. With thinking block
  "with-thinking": {
    name: "With Thinking",
    description: "Assistant message with extended thinking",
    entries: [
      {
        type: "user",
        ...base(),
        message: { role: "user", content: "What's the best way to implement a binary search?" },
      },
      {
        type: "assistant",
        ...base(),
        requestId: "req_001",
        message: {
          model: "claude-opus-4-5-20251101",
          id: "msg_001",
          type: "message",
          role: "assistant",
          content: [
            {
              type: "thinking",
              thinking: "The user is asking about binary search implementation. Let me think about the key considerations:\n\n1. Binary search requires a sorted array\n2. We need to track low, high, and mid pointers\n3. We compare the middle element with target\n4. Time complexity is O(log n)\n\nI should provide both iterative and recursive approaches.",
              signature: "mock-sig-001",
            },
            {
              type: "text",
              text: "Binary search is an efficient algorithm for finding an element in a sorted array. Here's a clean implementation:\n\n```typescript\nfunction binarySearch(arr: number[], target: number): number {\n  let low = 0;\n  let high = arr.length - 1;\n  \n  while (low <= high) {\n    const mid = Math.floor((low + high) / 2);\n    if (arr[mid] === target) return mid;\n    if (arr[mid] < target) low = mid + 1;\n    else high = mid - 1;\n  }\n  return -1;\n}\n```",
            },
          ],
          stop_reason: "end_turn",
          stop_sequence: null,
          usage: { input_tokens: 100, output_tokens: 200 },
        },
      },
    ] as SessionEntry[],
  },

  // 3. Read tool
  "tool-read": {
    name: "Read Tool",
    description: "Read file tool with content result",
    entries: [
      {
        type: "user",
        ...base(),
        message: { role: "user", content: "Show me the package.json file" },
      },
      {
        type: "assistant",
        ...baseWithId("assistant-read-001"),
        requestId: "req_001",
        message: {
          model: "claude-opus-4-5-20251101",
          id: "msg_001",
          type: "message",
          role: "assistant",
          content: [
            { type: "text", text: "I'll read the package.json file for you." },
            { type: "tool_use", id: "toolu_read_001", name: "Read", input: { file_path: "/Users/demo/project/package.json" } },
          ],
          stop_reason: "tool_use",
          stop_sequence: null,
          usage: { input_tokens: 50, output_tokens: 30 },
        },
      },
      {
        type: "user",
        ...base("assistant-read-001"),
        message: {
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: "toolu_read_001",
              content: `{\n  "name": "my-project",\n  "version": "1.0.0",\n  "scripts": {\n    "dev": "next dev",\n    "build": "next build",\n    "test": "jest"\n  },\n  "dependencies": {\n    "next": "^14.0.0",\n    "react": "^18.0.0"\n  }\n}`,
            },
          ],
        },
      },
    ] as SessionEntry[],
  },

  // 4. Bash success
  "tool-bash-success": {
    name: "Bash Success",
    description: "Bash command with successful output",
    entries: [
      {
        type: "user",
        ...base(),
        message: { role: "user", content: "Run the tests" },
      },
      {
        type: "assistant",
        ...baseWithId("assistant-bash-success-001"),
        requestId: "req_001",
        message: {
          model: "claude-opus-4-5-20251101",
          id: "msg_001",
          type: "message",
          role: "assistant",
          content: [
            { type: "text", text: "I'll run the tests for you." },
            { type: "tool_use", id: "toolu_bash_001", name: "Bash", input: { command: "npm test", description: "Run test suite" } },
          ],
          stop_reason: "tool_use",
          stop_sequence: null,
          usage: { input_tokens: 50, output_tokens: 30 },
        },
      },
      {
        type: "user",
        ...base("assistant-bash-success-001"),
        message: {
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: "toolu_bash_001",
              content: "PASS  src/utils.test.ts\n  ✓ should add numbers (2ms)\n  ✓ should subtract numbers (1ms)\n\nTest Suites: 1 passed, 1 total\nTests:       2 passed, 2 total\nTime:        1.234s",
            },
          ],
        },
      },
    ] as SessionEntry[],
  },

  // 5. Bash error
  "tool-bash-error": {
    name: "Bash Error",
    description: "Bash command with error result",
    entries: [
      {
        type: "user",
        ...base(),
        message: { role: "user", content: "Delete the system files" },
      },
      {
        type: "assistant",
        ...baseWithId("assistant-bash-error-001"),
        requestId: "req_001",
        message: {
          model: "claude-opus-4-5-20251101",
          id: "msg_001",
          type: "message",
          role: "assistant",
          content: [
            { type: "tool_use", id: "toolu_bash_001", name: "Bash", input: { command: "rm -rf /important/system/file" } },
          ],
          stop_reason: "tool_use",
          stop_sequence: null,
          usage: { input_tokens: 50, output_tokens: 20 },
        },
      },
      {
        type: "user",
        ...base("assistant-bash-error-001"),
        message: {
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: "toolu_bash_001",
              content: "Error: Permission denied. This command was blocked for safety reasons.",
              is_error: true,
            },
          ],
        },
      },
    ] as SessionEntry[],
  },

  // 6. Bash running (no result)
  "tool-bash-running": {
    name: "Bash Running",
    description: "Bash command still executing (no result yet)",
    entries: [
      {
        type: "user",
        ...base(),
        message: { role: "user", content: "Build the project" },
      },
      {
        type: "assistant",
        ...base(),
        requestId: "req_001",
        message: {
          model: "claude-opus-4-5-20251101",
          id: "msg_001",
          type: "message",
          role: "assistant",
          content: [
            { type: "text", text: "Building the project now..." },
            { type: "tool_use", id: "toolu_bash_001", name: "Bash", input: { command: "npm run build", description: "Build production bundle" } },
          ],
          stop_reason: "tool_use",
          stop_sequence: null,
          usage: { input_tokens: 50, output_tokens: 30 },
        },
      },
      // No tool_result - simulates running state
    ] as SessionEntry[],
  },

  // 7. Edit tool
  "tool-edit": {
    name: "Edit Tool",
    description: "Edit file with diff view",
    entries: [
      {
        type: "user",
        ...base(),
        message: { role: "user", content: "Enable debug mode in the config" },
      },
      {
        type: "assistant",
        ...baseWithId("assistant-edit-001"),
        requestId: "req_001",
        message: {
          model: "claude-opus-4-5-20251101",
          id: "msg_001",
          type: "message",
          role: "assistant",
          content: [
            { type: "text", text: "I'll update the config to enable debug mode." },
            {
              type: "tool_use",
              id: "toolu_edit_001",
              name: "Edit",
              input: {
                file_path: "/Users/demo/project/src/config.ts",
                old_string: `export const config = {\n  debug: false,\n  timeout: 5000,\n};`,
                new_string: `export const config = {\n  debug: true,\n  timeout: 10000,\n  retries: 3,\n};`,
              },
            },
          ],
          stop_reason: "tool_use",
          stop_sequence: null,
          usage: { input_tokens: 100, output_tokens: 50 },
        },
      },
      {
        type: "user",
        ...base("assistant-edit-001"),
        message: {
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: "toolu_edit_001",
              content: "Successfully updated /Users/demo/project/src/config.ts",
            },
          ],
        },
      },
    ] as SessionEntry[],
  },

  // 8. Glob and Grep
  "tool-glob-grep": {
    name: "Glob & Grep",
    description: "File search with Glob and Grep tools",
    entries: [
      {
        type: "user",
        ...base(),
        message: { role: "user", content: "Find all TypeScript files with TODO comments" },
      },
      {
        type: "assistant",
        ...baseWithId("assistant-glob-grep-001"),
        requestId: "req_001",
        message: {
          model: "claude-opus-4-5-20251101",
          id: "msg_001",
          type: "message",
          role: "assistant",
          content: [
            { type: "text", text: "I'll search for TypeScript files and then look for TODO comments." },
            { type: "tool_use", id: "toolu_glob_001", name: "Glob", input: { pattern: "**/*.ts" } },
            { type: "tool_use", id: "toolu_grep_001", name: "Grep", input: { pattern: "TODO", glob: "*.ts" } },
          ],
          stop_reason: "tool_use",
          stop_sequence: null,
          usage: { input_tokens: 100, output_tokens: 60 },
        },
      },
      {
        type: "user",
        ...base("assistant-glob-grep-001"),
        message: {
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: "toolu_glob_001",
              content: "src/index.ts\nsrc/utils.ts\nsrc/config.ts\nsrc/types.ts\ntests/index.test.ts",
            },
            {
              type: "tool_result",
              tool_use_id: "toolu_grep_001",
              content: "src/utils.ts:15: // TODO: Add error handling\nsrc/config.ts:8: // TODO: Load from env",
            },
          ],
        },
      },
    ] as SessionEntry[],
  },

  // 9. Multiple tools in sequence
  "tool-multiple": {
    name: "Multiple Tools",
    description: "Multiple tool calls in one assistant message",
    entries: [
      {
        type: "user",
        ...base(),
        message: { role: "user", content: "Check git status and run linting" },
      },
      {
        type: "assistant",
        ...baseWithId("assistant-multiple-001"),
        requestId: "req_001",
        message: {
          model: "claude-opus-4-5-20251101",
          id: "msg_001",
          type: "message",
          role: "assistant",
          content: [
            { type: "text", text: "I'll check git status and run the linter." },
            { type: "tool_use", id: "toolu_bash_001", name: "Bash", input: { command: "git status", description: "Check git status" } },
            { type: "tool_use", id: "toolu_bash_002", name: "Bash", input: { command: "npm run lint", description: "Run ESLint" } },
          ],
          stop_reason: "tool_use",
          stop_sequence: null,
          usage: { input_tokens: 100, output_tokens: 60 },
        },
      },
      {
        type: "user",
        ...base("assistant-multiple-001"),
        message: {
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: "toolu_bash_001",
              content: "On branch main\nYour branch is up to date with 'origin/main'.\n\nChanges not staged for commit:\n  modified:   src/index.ts",
            },
            {
              type: "tool_result",
              tool_use_id: "toolu_bash_002",
              content: "✔ No ESLint warnings or errors",
            },
          ],
        },
      },
    ] as SessionEntry[],
  },

  // 10. MCP tool
  "tool-mcp": {
    name: "MCP Tool",
    description: "MCP browser automation tool",
    entries: [
      {
        type: "user",
        ...base(),
        message: { role: "user", content: "Take a screenshot of the current page" },
      },
      {
        type: "assistant",
        ...baseWithId("assistant-mcp-001"),
        requestId: "req_001",
        message: {
          model: "claude-opus-4-5-20251101",
          id: "msg_001",
          type: "message",
          role: "assistant",
          content: [
            { type: "text", text: "I'll take a screenshot of the current page." },
            { type: "tool_use", id: "toolu_mcp_001", name: "mcp__claude-in-chrome__computer", input: { action: "screenshot", tabId: 123456 } },
          ],
          stop_reason: "tool_use",
          stop_sequence: null,
          usage: { input_tokens: 100, output_tokens: 40 },
        },
      },
      {
        type: "user",
        ...base("assistant-mcp-001"),
        message: {
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: "toolu_mcp_001",
              content: "Successfully captured screenshot (1920x1080)",
            },
          ],
        },
      },
    ] as SessionEntry[],
  },

  // 11. Task agent
  "tool-task": {
    name: "Task Agent",
    description: "Task tool spawning subagent",
    entries: [
      {
        type: "user",
        ...base(),
        message: { role: "user", content: "Explore the codebase structure" },
      },
      {
        type: "assistant",
        ...baseWithId("assistant-task-001"),
        requestId: "req_001",
        message: {
          model: "claude-opus-4-5-20251101",
          id: "msg_001",
          type: "message",
          role: "assistant",
          content: [
            { type: "text", text: "I'll use an exploration agent to understand the codebase structure." },
            {
              type: "tool_use",
              id: "toolu_task_001",
              name: "Task",
              input: {
                description: "Explore codebase structure",
                prompt: "Explore the directory structure and identify key files and patterns",
                subagent_type: "Explore",
              },
            },
          ],
          stop_reason: "tool_use",
          stop_sequence: null,
          usage: { input_tokens: 100, output_tokens: 50 },
        },
      },
      {
        type: "user",
        ...base("assistant-task-001"),
        message: {
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: "toolu_task_001",
              content: "Codebase Analysis:\n\n📁 src/\n  ├── components/ - React components\n  ├── utils/ - Utility functions\n  ├── hooks/ - Custom React hooks\n  └── types/ - TypeScript definitions\n\n📁 tests/ - Test files\n📄 package.json - Dependencies\n📄 tsconfig.json - TypeScript config",
            },
          ],
        },
      },
    ] as SessionEntry[],
  },

  // 12. TodoWrite
  "tool-todo": {
    name: "Todo List",
    description: "TodoWrite tool with task tracking",
    entries: [
      {
        type: "user",
        ...base(),
        message: { role: "user", content: "Help me implement user authentication" },
      },
      {
        type: "assistant",
        ...baseWithId("assistant-todo-001"),
        requestId: "req_001",
        message: {
          model: "claude-opus-4-5-20251101",
          id: "msg_001",
          type: "message",
          role: "assistant",
          content: [
            { type: "text", text: "I'll create a task list to implement user authentication." },
            {
              type: "tool_use",
              id: "toolu_todo_001",
              name: "TodoWrite",
              input: {
                todos: [
                  { content: "Create auth context and provider", status: "in_progress", activeForm: "Creating auth context" },
                  { content: "Implement login form component", status: "pending", activeForm: "Implementing login form" },
                  { content: "Add JWT token handling", status: "pending", activeForm: "Adding JWT handling" },
                  { content: "Create protected route wrapper", status: "pending", activeForm: "Creating protected routes" },
                  { content: "Add logout functionality", status: "pending", activeForm: "Adding logout" },
                ],
              },
            },
          ],
          stop_reason: "tool_use",
          stop_sequence: null,
          usage: { input_tokens: 100, output_tokens: 80 },
        },
      },
      {
        type: "user",
        ...base("assistant-todo-001"),
        message: {
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: "toolu_todo_001",
              content: "Todo list updated",
            },
          ],
        },
      },
    ] as SessionEntry[],
  },

  // 13. AskUserQuestion
  "tool-ask-question": {
    name: "Ask Question",
    description: "AskUserQuestion for clarification",
    entries: [
      {
        type: "user",
        ...base(),
        message: { role: "user", content: "Set up a database for my app" },
      },
      {
        type: "assistant",
        ...base(),
        requestId: "req_001",
        message: {
          model: "claude-opus-4-5-20251101",
          id: "msg_001",
          type: "message",
          role: "assistant",
          content: [
            { type: "text", text: "I have a few questions to help set up the right database for your needs." },
            {
              type: "tool_use",
              id: "toolu_ask_001",
              name: "AskUserQuestion",
              input: {
                questions: [
                  {
                    question: "What type of database would you prefer?",
                    header: "Database",
                    options: [
                      { label: "PostgreSQL (Recommended)", description: "Robust relational database with great TypeScript support" },
                      { label: "MongoDB", description: "Document database for flexible schemas" },
                      { label: "SQLite", description: "Lightweight file-based database" },
                    ],
                    multiSelect: false,
                  },
                  {
                    question: "Do you need an ORM?",
                    header: "ORM",
                    options: [
                      { label: "Prisma (Recommended)", description: "Type-safe ORM with great DX" },
                      { label: "Drizzle", description: "Lightweight TypeScript ORM" },
                      { label: "No ORM", description: "Use raw SQL queries" },
                    ],
                    multiSelect: false,
                  },
                ],
              },
            },
          ],
          stop_reason: "tool_use",
          stop_sequence: null,
          usage: { input_tokens: 100, output_tokens: 100 },
        },
      },
    ] as SessionEntry[],
  },

  // 14. User with image
  "user-with-image": {
    name: "User Image",
    description: "User message with attached image",
    entries: [
      {
        type: "user",
        ...base(),
        message: {
          role: "user",
          content: [
            { type: "text", text: "What's wrong with this error?" },
            {
              type: "image",
              source: {
                type: "base64",
                media_type: "image/png",
                // Small red square as test image
                data: "iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mP8z8BQzwAEjDAGNQ4AFCQB/zyS6EIAAAAASUVORK5CYII=",
              },
            },
          ],
        },
      },
      {
        type: "assistant",
        ...base(),
        requestId: "req_001",
        message: {
          model: "claude-opus-4-5-20251101",
          id: "msg_001",
          type: "message",
          role: "assistant",
          content: [
            { type: "text", text: "I can see the screenshot. It looks like a TypeScript type error. The issue is that you're passing a `string` where a `number` is expected. Try casting the value or fixing the type definition." },
          ],
          stop_reason: "end_turn",
          stop_sequence: null,
          usage: { input_tokens: 200, output_tokens: 50 },
        },
      },
    ] as SessionEntry[],
  },

  // 15. Summary/Compaction
  "summary-compaction": {
    name: "Summary",
    description: "Summary entry after conversation compaction",
    entries: [
      {
        type: "summary",
        summary: "Implemented user authentication with JWT tokens, created login/signup forms, and added protected routes. Fixed several TypeScript errors and added unit tests for auth utilities.",
        leafUuid: "mock-leaf-uuid",
      },
      {
        type: "user",
        ...base(),
        message: { role: "user", content: "Now let's add password reset functionality" },
      },
      {
        type: "assistant",
        ...base(),
        requestId: "req_001",
        message: {
          model: "claude-opus-4-5-20251101",
          id: "msg_001",
          type: "message",
          role: "assistant",
          content: [
            { type: "text", text: "I'll add password reset functionality building on the auth system we implemented. Let me create the necessary components and API endpoints." },
          ],
          stop_reason: "end_turn",
          stop_sequence: null,
          usage: { input_tokens: 500, output_tokens: 50 },
        },
      },
    ] as SessionEntry[],
  },

  // 16. Long output (collapsible)
  "tool-long-output": {
    name: "Long Output",
    description: "Tool with long output (should be collapsible)",
    entries: [
      {
        type: "user",
        ...base(),
        message: { role: "user", content: "Show me all the files in the project" },
      },
      {
        type: "assistant",
        ...baseWithId("assistant-long-output-001"),
        requestId: "req_001",
        message: {
          model: "claude-opus-4-5-20251101",
          id: "msg_001",
          type: "message",
          role: "assistant",
          content: [
            { type: "text", text: "I'll list all files in the project." },
            { type: "tool_use", id: "toolu_bash_001", name: "Bash", input: { command: "find . -type f -name '*.ts'", description: "List TypeScript files" } },
          ],
          stop_reason: "tool_use",
          stop_sequence: null,
          usage: { input_tokens: 50, output_tokens: 30 },
        },
      },
      {
        type: "user",
        ...base("assistant-long-output-001"),
        message: {
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: "toolu_bash_001",
              content: "./src/index.ts\n./src/app.ts\n./src/config.ts\n./src/types.ts\n./src/utils/index.ts\n./src/utils/format.ts\n./src/utils/validate.ts\n./src/components/Button.tsx\n./src/components/Input.tsx\n./src/components/Modal.tsx\n./src/components/Card.tsx\n./src/components/Layout.tsx\n./src/hooks/useAuth.ts\n./src/hooks/useForm.ts\n./src/hooks/useApi.ts\n./src/services/api.ts\n./src/services/auth.ts\n./src/services/storage.ts\n./tests/utils.test.ts\n./tests/components.test.ts\n./tests/hooks.test.ts",
            },
          ],
        },
      },
    ] as SessionEntry[],
  },

  // 17. WebSearch
  "tool-websearch": {
    name: "Web Search",
    description: "WebSearch tool for looking up information",
    entries: [
      {
        type: "user",
        ...base(),
        message: { role: "user", content: "What's the latest version of React?" },
      },
      {
        type: "assistant",
        ...baseWithId("assistant-websearch-001"),
        requestId: "req_001",
        message: {
          model: "claude-opus-4-5-20251101",
          id: "msg_001",
          type: "message",
          role: "assistant",
          content: [
            { type: "text", text: "Let me search for the latest React version." },
            { type: "tool_use", id: "toolu_search_001", name: "WebSearch", input: { query: "React latest version 2024" } },
          ],
          stop_reason: "tool_use",
          stop_sequence: null,
          usage: { input_tokens: 50, output_tokens: 30 },
        },
      },
      {
        type: "user",
        ...base("assistant-websearch-001"),
        message: {
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: "toolu_search_001",
              content: "React 19 is the latest major version, released in 2024. Key features include:\n- React Server Components\n- Improved Suspense\n- New hooks: useFormStatus, useOptimistic\n- Better error handling",
            },
          ],
        },
      },
    ] as SessionEntry[],
  },

  // 18. WebFetch
  "tool-webfetch": {
    name: "Web Fetch",
    description: "WebFetch tool for fetching URL content",
    entries: [
      {
        type: "user",
        ...base(),
        message: { role: "user", content: "Get the README from the React repo" },
      },
      {
        type: "assistant",
        ...baseWithId("assistant-webfetch-001"),
        requestId: "req_001",
        message: {
          model: "claude-opus-4-5-20251101",
          id: "msg_001",
          type: "message",
          role: "assistant",
          content: [
            { type: "text", text: "I'll fetch the React README." },
            {
              type: "tool_use",
              id: "toolu_fetch_001",
              name: "WebFetch",
              input: {
                url: "https://github.com/facebook/react",
                prompt: "Extract the main description and features from the README",
              },
            },
          ],
          stop_reason: "tool_use",
          stop_sequence: null,
          usage: { input_tokens: 50, output_tokens: 40 },
        },
      },
      {
        type: "user",
        ...base("assistant-webfetch-001"),
        message: {
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: "toolu_fetch_001",
              content: "React is a JavaScript library for building user interfaces.\n\nKey features:\n- Declarative: Design simple views for each state\n- Component-Based: Build encapsulated components\n- Learn Once, Write Anywhere: Works with existing code",
            },
          ],
        },
      },
    ] as SessionEntry[],
  },

  // 19. Write tool
  "tool-write": {
    name: "Write Tool",
    description: "Write file tool creating new file",
    entries: [
      {
        type: "user",
        ...base(),
        message: { role: "user", content: "Create a simple React component" },
      },
      {
        type: "assistant",
        ...baseWithId("assistant-write-001"),
        requestId: "req_001",
        message: {
          model: "claude-opus-4-5-20251101",
          id: "msg_001",
          type: "message",
          role: "assistant",
          content: [
            { type: "text", text: "I'll create a simple Button component for you." },
            {
              type: "tool_use",
              id: "toolu_write_001",
              name: "Write",
              input: {
                file_path: "/Users/demo/project/src/components/Button.tsx",
                content: `import React from 'react';\n\ninterface ButtonProps {\n  children: React.ReactNode;\n  onClick?: () => void;\n  variant?: 'primary' | 'secondary';\n}\n\nexport function Button({ children, onClick, variant = 'primary' }: ButtonProps) {\n  return (\n    <button\n      onClick={onClick}\n      className={\`btn btn-\${variant}\`}\n    >\n      {children}\n    </button>\n  );\n}`,
              },
            },
          ],
          stop_reason: "tool_use",
          stop_sequence: null,
          usage: { input_tokens: 50, output_tokens: 100 },
        },
      },
      {
        type: "user",
        ...base("assistant-write-001"),
        message: {
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: "toolu_write_001",
              content: "Successfully wrote 324 bytes to /Users/demo/project/src/components/Button.tsx",
            },
          ],
        },
      },
    ] as SessionEntry[],
  },

  // 20. Complex conversation
  "complex-conversation": {
    name: "Complex Flow",
    description: "Multi-turn conversation with various elements",
    entries: [
      {
        type: "user",
        ...base(),
        message: { role: "user", content: "Help me debug this failing test" },
      },
      {
        type: "assistant",
        ...baseWithId("assistant-complex-001"),
        requestId: "req_001",
        message: {
          model: "claude-opus-4-5-20251101",
          id: "msg_001",
          type: "message",
          role: "assistant",
          content: [
            {
              type: "thinking",
              thinking: "The user needs help debugging a test. I should:\n1. First read the test file\n2. Run the test to see the error\n3. Analyze the failure\n4. Suggest a fix",
              signature: "mock-sig",
            },
            { type: "text", text: "I'll help you debug the failing test. Let me first run it to see the error." },
            { type: "tool_use", id: "toolu_bash_001", name: "Bash", input: { command: "npm test -- --testNamePattern='user auth'", description: "Run auth tests" } },
          ],
          stop_reason: "tool_use",
          stop_sequence: null,
          usage: { input_tokens: 100, output_tokens: 80 },
        },
      },
      {
        type: "user",
        ...base("assistant-complex-001"),
        message: {
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: "toolu_bash_001",
              content: "FAIL  src/auth.test.ts\n  ● user auth › should validate token\n    expect(received).toBe(expected)\n    Expected: true\n    Received: false\n      at Object.<anonymous> (src/auth.test.ts:15:25)",
              is_error: true,
            },
          ],
        },
      },
      {
        type: "assistant",
        ...baseWithId("assistant-complex-002"),
        requestId: "req_002",
        message: {
          model: "claude-opus-4-5-20251101",
          id: "msg_002",
          type: "message",
          role: "assistant",
          content: [
            { type: "text", text: "I see the issue. The token validation is failing. Let me check the test file and the auth implementation." },
            { type: "tool_use", id: "toolu_read_001", name: "Read", input: { file_path: "/Users/demo/project/src/auth.test.ts" } },
            { type: "tool_use", id: "toolu_read_002", name: "Read", input: { file_path: "/Users/demo/project/src/auth.ts" } },
          ],
          stop_reason: "tool_use",
          stop_sequence: null,
          usage: { input_tokens: 200, output_tokens: 60 },
        },
      },
      {
        type: "user",
        ...base("assistant-complex-002"),
        message: {
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: "toolu_read_001",
              content: "import { validateToken } from './auth';\n\ndescribe('user auth', () => {\n  it('should validate token', () => {\n    const token = 'valid-token';\n    expect(validateToken(token)).toBe(true);\n  });\n});",
            },
            {
              type: "tool_result",
              tool_use_id: "toolu_read_002",
              content: "export function validateToken(token: string): boolean {\n  // Bug: missing null check\n  return token.length > 0;\n}",
            },
          ],
        },
      },
      {
        type: "assistant",
        ...baseWithId("assistant-complex-003"),
        requestId: "req_003",
        message: {
          model: "claude-opus-4-5-20251101",
          id: "msg_003",
          type: "message",
          role: "assistant",
          content: [
            { type: "text", text: "I found the issue. The `validateToken` function doesn't properly validate the token format. Let me fix it." },
            {
              type: "tool_use",
              id: "toolu_edit_001",
              name: "Edit",
              input: {
                file_path: "/Users/demo/project/src/auth.ts",
                old_string: "export function validateToken(token: string): boolean {\n  // Bug: missing null check\n  return token.length > 0;\n}",
                new_string: "export function validateToken(token: string): boolean {\n  if (!token || token.length === 0) return false;\n  // Validate token format (should be 'valid-' prefix)\n  return token.startsWith('valid-');\n}",
              },
            },
          ],
          stop_reason: "tool_use",
          stop_sequence: null,
          usage: { input_tokens: 300, output_tokens: 80 },
        },
      },
      {
        type: "user",
        ...base("assistant-complex-003"),
        message: {
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: "toolu_edit_001",
              content: "Successfully updated /Users/demo/project/src/auth.ts",
            },
          ],
        },
      },
    ] as SessionEntry[],
  },

  // 21. Sidechain message
  "sidechain": {
    name: "Sidechain",
    description: "Sidechain messages (parallel execution)",
    entries: [
      {
        type: "user",
        ...base(),
        message: { role: "user", content: "Run tests in background" },
      },
      {
        type: "assistant",
        ...baseWithId("assistant-sidechain-001"),
        requestId: "req_001",
        message: {
          model: "claude-opus-4-5-20251101",
          id: "msg_001",
          type: "message",
          role: "assistant",
          content: [
            { type: "text", text: "I'll run the tests in the background." },
            { type: "tool_use", id: "toolu_bash_001", name: "Bash", input: { command: "npm test", run_in_background: true } },
          ],
          stop_reason: "tool_use",
          stop_sequence: null,
          usage: { input_tokens: 50, output_tokens: 30 },
        },
      },
      {
        type: "user",
        uuid: "sidechain-user-001",
        parentUuid: "assistant-sidechain-001",
        sessionId: "mock-session",
        timestamp: new Date().toISOString(),
        version: "2.1.1",
        cwd: "/Users/demo/project",
        isSidechain: true,
        userType: "external",
        message: {
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: "toolu_bash_001",
              content: "Background task started with ID: bg_001",
            },
          ],
        },
      },
    ] as SessionEntry[],
  },

  // 22. NotebookEdit
  "tool-notebook": {
    name: "Notebook Edit",
    description: "Jupyter notebook cell editing",
    entries: [
      {
        type: "user",
        ...base(),
        message: { role: "user", content: "Add a cell to plot the data" },
      },
      {
        type: "assistant",
        ...baseWithId("assistant-notebook-001"),
        requestId: "req_001",
        message: {
          model: "claude-opus-4-5-20251101",
          id: "msg_001",
          type: "message",
          role: "assistant",
          content: [
            { type: "text", text: "I'll add a visualization cell to the notebook." },
            {
              type: "tool_use",
              id: "toolu_nb_001",
              name: "NotebookEdit",
              input: {
                notebook_path: "/Users/demo/project/analysis.ipynb",
                new_source: "import matplotlib.pyplot as plt\n\nplt.figure(figsize=(10, 6))\nplt.plot(df['date'], df['value'])\nplt.title('Data Over Time')\nplt.xlabel('Date')\nplt.ylabel('Value')\nplt.show()",
                cell_type: "code",
                edit_mode: "insert",
              },
            },
          ],
          stop_reason: "tool_use",
          stop_sequence: null,
          usage: { input_tokens: 50, output_tokens: 60 },
        },
      },
      {
        type: "user",
        ...base("assistant-notebook-001"),
        message: {
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: "toolu_nb_001",
              content: "Successfully inserted new code cell in analysis.ipynb",
            },
          ],
        },
      },
    ] as SessionEntry[],
  },

  // 23. Plan mode
  "plan-mode": {
    name: "Plan Mode",
    description: "EnterPlanMode and ExitPlanMode tools",
    entries: [
      {
        type: "user",
        ...base(),
        message: { role: "user", content: "Plan how to refactor the auth module" },
      },
      {
        type: "assistant",
        ...baseWithId("assistant-plan-001"),
        requestId: "req_001",
        message: {
          model: "claude-opus-4-5-20251101",
          id: "msg_001",
          type: "message",
          role: "assistant",
          content: [
            { type: "text", text: "I'll enter plan mode to design the refactoring approach." },
            { type: "tool_use", id: "toolu_plan_001", name: "EnterPlanMode", input: {} },
          ],
          stop_reason: "tool_use",
          stop_sequence: null,
          usage: { input_tokens: 50, output_tokens: 30 },
        },
      },
      {
        type: "user",
        ...base("assistant-plan-001"),
        message: {
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: "toolu_plan_001",
              content: "Entered plan mode. Please outline your implementation plan.",
            },
          ],
        },
      },
    ] as SessionEntry[],
  },

  // 24. Markdown Table
  "markdown-table": {
    name: "Markdown Table",
    description: "Assistant message with markdown table",
    entries: [
      {
        type: "user",
        ...base(),
        message: { role: "user", content: "Show me a comparison of frameworks" },
      },
      {
        type: "assistant",
        ...base(),
        requestId: "req_001",
        message: {
          model: "claude-opus-4-5-20251101",
          id: "msg_001",
          type: "message",
          role: "assistant",
          content: [
            {
              type: "text",
              text: `Here's a comparison of popular frontend frameworks:

| Framework | Language | Size | Learning Curve |
|-----------|----------|------|----------------|
| React | JavaScript/TypeScript | ~40KB | Moderate |
| Vue | JavaScript/TypeScript | ~33KB | Easy |
| Svelte | JavaScript/TypeScript | ~4KB | Easy |
| Angular | TypeScript | ~130KB | Steep |

**Key takeaways:**
- Svelte has the smallest bundle size
- Angular has the steepest learning curve but offers a complete solution
- React has the largest ecosystem`,
            },
          ],
          stop_reason: "end_turn",
          stop_sequence: null,
          usage: { input_tokens: 50, output_tokens: 150 },
        },
      },
    ] as SessionEntry[],
  },

  // 25. Skill invocation
  "tool-skill": {
    name: "Skill",
    description: "Skill tool for slash commands",
    entries: [
      {
        type: "user",
        ...base(),
        message: { role: "user", content: "/commit" },
      },
      {
        type: "assistant",
        ...baseWithId("assistant-skill-001"),
        requestId: "req_001",
        message: {
          model: "claude-opus-4-5-20251101",
          id: "msg_001",
          type: "message",
          role: "assistant",
          content: [
            { type: "tool_use", id: "toolu_skill_001", name: "Skill", input: { skill: "commit" } },
          ],
          stop_reason: "tool_use",
          stop_sequence: null,
          usage: { input_tokens: 30, output_tokens: 20 },
        },
      },
      {
        type: "user",
        ...base("assistant-skill-001"),
        message: {
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: "toolu_skill_001",
              content: "Skill 'commit' loaded. Ready to create a commit.",
            },
          ],
        },
      },
    ] as SessionEntry[],
  },
};

// Export case names for the selector
export const MOCK_CASE_IDS = Object.keys(MOCK_CASES);
