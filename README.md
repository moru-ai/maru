# Maru

A research assistant built with [Moru](https://github.com/moru-ai/moru) sandboxes and [Claude Agent SDK](https://platform.claude.com/docs/en/agent-sdk/overview).

https://github.com/user-attachments/assets/7e99b82d-9f9f-4664-97f8-eedd833ed5f4

## Features

### 🤖 Multi-Agent Sessions
Run multiple Claude in parallel. Each agent gets its own dedicated Linux VM.

### 💬 Native Message Format
Renders Claude Code's native message format. Not restricted message subset of Claude Agent SDK.

### ⚡ Real-time Streaming
See tool executions, thinking, and results in real-time

### 🔄 Session Resume
Agents maintain session history. Resume sessions anytime

### 💾 Workspace Persistence
Workspaces are saved to storage and restored on session resume. Files and Claude session persist across sessions.

### 📁 File Explorer & Editor
Browse and view files in the agent's workspace. Download files that the agent writes or edits.

## How It Works

- Each agent runs in an isolated [Moru](https://github.com/moru-ai/moru) sandbox VM with its own workspace
- Messages are processed using the [Claude Agent SDK](https://platform.claude.com/docs/en/agent-sdk/overview) `query()` function
- Session state is stored as newline-delimited JSON, following the schema defined in [agent-schemas](https://github.com/moru-ai/agent-schemas)
- The backend streams JSONL records to the frontend in real-time
- Workspaces are synced to Google Cloud Storage (GCS) for persistence across sessions

## Try It

**Cloud**: [maru.moru.io](https://maru.moru.io) - Maru is BYOK (Bring Your Own Key), but your API key is not saved on our server.

**Self-hosted**: Follow the setup instructions below.

## Getting Started (Self-hosted)

### Prerequisites

- Node.js 22+
- PostgreSQL
- [Moru API Key](https://moru.io/docs/api-key) (for sandbox execution)
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

## License

MIT License
