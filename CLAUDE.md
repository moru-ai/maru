# Maru Development Guide

## Quick Start

```bash
# Start dev server (frontend + backend)
npm run dev
```

## Agent Template

The agent runs inside a Moru sandbox VM. The template is defined in `apps/agent/`.

### Build Template

```bash
cd apps/agent
.venv/bin/python template.py
```

This builds the Docker image and registers it as the `claude-agent` template.

### Template Files

- `apps/agent/Dockerfile` - Container definition
- `apps/agent/INSTRUCTIONS.md` - Claude Code instructions (copied to `/home/user/.claude/CLAUDE.md` in the container)
- `apps/agent/src/` - Agent source code
- `apps/agent/template.py` - Template build script

### Environment

Copy `.env.example` to `.env` in `apps/agent/`:

```bash
cp apps/agent/.env.example apps/agent/.env
```

Then set your `MORU_API_KEY`.

- Frontend: http://localhost:3000
- Backend: http://localhost:4000

## Common Issues & Fixes

### Port Already in Use

```bash
# Kill processes on ports
kill $(lsof -t -i:3000) 2>/dev/null
kill $(lsof -t -i:4000) 2>/dev/null

# Then restart
npm run dev
```

### Prisma Client Out of Sync

After schema changes, if you see validation errors like "Argument X is missing":

```bash
# Regenerate Prisma client and push schema
npm run db:push

# Restart dev server
```

### Next.js Cache Issues

If you see "Internal Server Error" or stale builds:

```bash
# Clear Next.js cache
rm -rf apps/frontend/.next

# Restart dev server
npm run dev
```

### Type Errors

```bash
# Check types across all packages
npm run check-types

# Check specific package
npm run check-types --filter=frontend
npm run check-types --filter=server
```

## Database

```bash
# Push schema changes (development)
npm run db:push

# Generate Prisma client
npm run generate

# Reset database (caution: deletes data)
npm run db:push:reset
```

## Project Structure

- `apps/frontend/` - Next.js 15 frontend
- `apps/server/` - Node.js backend with Socket.IO
- `packages/db/` - Prisma schema and client
- `packages/types/` - Shared TypeScript types
