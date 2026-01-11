# Maru

A Claude Agent SDK example built with [Moru](https://moru.io/docs) sandboxes. Build your own AI agent that runs in isolated cloud environments.

https://github.com/user-attachments/assets/7e99b82d-9f9f-4664-97f8-eedd833ed5f4

## What is Maru?

Maru demonstrates how to build a web-based AI agent using the [Claude Agent SDK](https://docs.anthropic.com/en/docs/claude-code/sdk) and [Moru sandboxes](https://moru.io/dpcs). It showcases patterns for running autonomous agents in isolated environments with full workspace persistence.

With this example, you can build apps that:
- Run Claude agents in isolated cloud sandboxes
- Stream real-time agent messages to users
- Resume sessions across sandbox restarts
- Persist workspaces between sessions
- Display native Claude Code message formats

## Features

### 🤖 Multi-Agent Sessions
Run multiple Claude Agent SDK instances in parallel. Each agent gets its own dedicated Linux computer with a filesystem.

### 🔄 Session Resume
Agents maintain session history. Resume interrupted sessions seamlessly - the agent picks up exactly where it left off.

### ⚡ Real-time Streaming
Stream agent messages as they happen. See tool executions, thinking, and results in real-time through WebSocket connections.

### 💬 Native Message Format
Renders Claude Code's native message format using schemas from [moru-ai/agent-schemas](https://github.com/moru-ai/agent-schemas). Displays assistant messages, tool uses, thinking blocks, and system messages.

### 💾 Workspace Persistence
Workspaces are saved to cloud storage (GCS) and restored on session resume. Files, git history, and Claude session data persist across sessions.

### 📁 File Explorer & Editor
Browse and view files in the agent's workspace. Download files that the agent writes or edits.

## Upcoming

- 🛑 **Session Interrupt**: Stop agent execution mid-task
- 📋 **Input Queue**: Queue multiple messages while agent is working
- ⏱️ **Long-running Agents**: Support for agents running hours or longer

## Try It

**Cloud**: [maru.moru.io](https://maru.moru.io) - Maru is BYOK (Bring Your Own Key). Please use your own `ANTHROPIC_API_KEY`. Your API key is not saved on our server.

**Self-hosted**: Follow the setup instructions below.

## Getting Started

### Prerequisites

- Node.js 22+
- PostgreSQL
- [Moru API Key](https://moru.io) (for sandbox execution)
- GitHub OAuth App (for authentication)

### Installation

1. Clone and install dependencies:

```bash
git clone https://github.com/moru-ai/maru.git
cd maru
npm install
```

2. Set up environment files:

```bash
cp apps/server/.env.example apps/server/.env
cp apps/frontend/.env.example apps/frontend/.env
cp packages/db/.env.template packages/db/.env
```

3. Configure environment variables:

**`packages/db/.env`**
```bash
DATABASE_URL="postgresql://postgres:@127.0.0.1:5432/maru_dev"
DIRECT_URL="postgresql://postgres:@127.0.0.1:5432/maru_dev"
```

**`apps/server/.env`**
```bash
# Database
DATABASE_URL="postgresql://postgres:@127.0.0.1:5432/maru_dev"

# GitHub OAuth
GITHUB_CLIENT_ID=your_github_client_id
GITHUB_CLIENT_SECRET=your_github_client_secret

# Moru Sandbox (required)
MORU_API_KEY=your_moru_api_key
MORU_TEMPLATE_ID=maru-agent
MORU_SANDBOX_TIMEOUT_MS=3600000

# GCS Storage (optional, for workspace persistence)
GCS_BUCKET_NAME=your-bucket-name
GCS_KEY_FILE=./gcs-key.json
```

**`apps/frontend/.env`**
```bash
NEXT_PUBLIC_SERVER_URL="http://localhost:4000"
BETTER_AUTH_SECRET=your_secret_here
GITHUB_CLIENT_ID=your_github_client_id
GITHUB_CLIENT_SECRET=your_github_client_secret
DATABASE_URL="postgresql://postgres:@127.0.0.1:5432/maru_dev"
```

4. Set up the database:

```bash
# Create database
psql -U postgres -c "CREATE DATABASE maru_dev;"

# Generate Prisma client and push schema
npm run generate
npm run db:push
```

5. Build the agent template:

```bash
cd apps/agent
cp .env.example .env
# Add your MORU_API_KEY to .env

# Build and register the template
.venv/bin/python template.py
```

6. Start development servers:

```bash
npm run dev
```

- Frontend: http://localhost:3000
- Backend: http://localhost:4000

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Frontend                              │
│                     (Next.js 15)                            │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │ Chat UI     │  │ File        │  │ Claude Code         │ │
│  │             │  │ Explorer    │  │ Message Renderer    │ │
│  └─────────────┘  └─────────────┘  └─────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ WebSocket
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                        Backend                               │
│                      (Node.js)                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │ Socket.IO   │  │ Agent       │  │ Storage             │ │
│  │ Server      │  │ Session     │  │ (GCS)               │ │
│  └─────────────┘  └─────────────┘  └─────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ Moru SDK
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                     Moru Sandbox                             │
│                  (Isolated Micro-VM)                        │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                   Agent (Python)                     │   │
│  │  ┌─────────────┐  ┌────────────────────────────┐    │   │
│  │  │ Claude      │  │ Claude Code CLI            │    │   │
│  │  │ Agent SDK   │──│ (Tools: Read, Write, Bash) │    │   │
│  │  └─────────────┘  └────────────────────────────┘    │   │
│  └─────────────────────────────────────────────────────┘   │
│                        /workspace                            │
└─────────────────────────────────────────────────────────────┘
```

### Key Components

| Component | Description |
|-----------|-------------|
| `apps/frontend` | Next.js 15 app with real-time chat, file explorer, Claude Code message renderer |
| `apps/server` | Node.js backend handling WebSocket communication, agent sessions, workspace storage |
| `apps/agent` | Python agent running inside Moru sandbox, using Claude Agent SDK |
| `packages/db` | Prisma schema for tasks, sessions, and events |
| `packages/types` | Shared TypeScript types |

### How It Works

1. User sends a message through the frontend
2. Backend creates a Moru sandbox from the `maru-agent` template
3. If resuming, workspace and session history are restored to the sandbox
4. Agent receives the message via stdin and calls Claude Agent SDK's `query()` function
5. Backend polls the session JSONL file for new entries and streams them to frontend
6. On completion, workspace is saved to GCS for future sessions

## Development Commands

```bash
# Start dev servers (frontend + backend)
npm run dev

# Type checking
npm run check-types

# Linting
npm run lint

# Database operations
npm run db:push        # Push schema changes
npm run generate       # Generate Prisma client
npm run db:studio      # Open Prisma Studio
```

### Rebuilding the Agent Template

After modifying any files in `apps/agent/` (including `Dockerfile`, `src/`, or `INSTRUCTIONS.md`), you must rebuild the template:

```bash
cd apps/agent
.venv/bin/python template.py
```

This builds a new Docker image and registers it with Moru. The next sandbox will use the updated template.

## Project Structure

```
maru/
├── apps/
│   ├── agent/         # Python agent for Moru sandbox
│   │   ├── src/       # Agent source code
│   │   ├── Dockerfile # Sandbox container definition
│   │   └── template.py # Template build script
│   ├── frontend/      # Next.js 15 frontend
│   └── server/        # Node.js backend
└── packages/
    ├── db/            # Prisma schema
    └── types/         # Shared TypeScript types
```

## Acknowledgements

This repository is a fork of [shadow](https://github.com/ishaan1013/shadow) by [Ishaan Dey](https://ishaand.com), [Rajan Agarwal](https://www.rajan.sh/), and [Elijah Kurien](https://www.elijahkurien.com/).

## License

MIT License
