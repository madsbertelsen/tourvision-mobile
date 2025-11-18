# Agent POC - Y.js Collaboration with AI Agents

AI-powered collaborative document editing with automatic location detection.

## Quick Start

```bash
# 1. Start Durable Object server
npm run dev:server  # Port 8787

# 2. Start Vite client (separate terminal)
npm run dev:client  # Port 5174

# 3. Start Agent Manager (separate terminal)
npm run agent-manager

# 4. Open browser
open http://localhost:5174
```

## Architecture

### Core Components

1. **Durable Objects** (`src/server/index.ts`)
   - Y.js document sync via WebSocket
   - Broadcasts punctuation events to Supabase Realtime
   - Tracks user activity (active/idle)

2. **Agent Manager** (`agent-manager.ts`)
   - Subscribes to Supabase Realtime for punctuation events
   - Spawns/kills agent workers dynamically
   - Enforces max 10 concurrent agents (LRU eviction)

3. **Agent Worker** (`agent-worker.ts`)
   - Period-triggered LLM location detection
   - Geocodes via client delegation
   - Creates geo-marks in ProseMirror

4. **Client** (`src/client/index.js`)
   - ProseMirror editor with Y.js sync
   - Detects punctuation, sends to DO
   - Handles geocoding tasks from agents

### Event Flow

```
User types "." → Client detects → DO broadcasts → Manager spawns agent →
Agent analyzes → Requests geocode → Client geocodes → Returns result →
Agent creates geo-marks
```

## Environment Variables

Create `.env` with:
```bash
# Supabase (local)
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_ANON_KEY=<from npx supabase status>
SUPABASE_SERVICE_KEY=<from npx supabase status>

# AI Gateway
AI_GATEWAY_API_KEY=<your-key>

# WebSocket
WS_PORT=8787
WS_HOST=localhost
WS_PROTOCOL=ws
```

## Database Tables

- `agent_connections` - Active agent processes
- `document_activity` - Activity events (active/idle)
- `agent_metrics` - Performance metrics

## Utilities

**Cleanup stale agents:**
```bash
npx tsx cleanup-agents.ts
```

## Key Features

- ✅ Real-time Y.js collaboration
- ✅ Punctuation-triggered agent spawning
- ✅ LLM location detection (Mistral via AI Gateway)
- ✅ Client-side geocoding delegation
- ✅ Automatic geo-mark creation
- ✅ Multi-document agent management
- ✅ LRU eviction at max capacity

## Important Files

- `agent-manager.ts` - Orchestrates workers
- `agent-worker.ts` - Processes single document
- `src/server/index.ts` - Durable Object
- `src/client/index.js` - Editor + Y.js
- `shared/database.ts` - Supabase helpers
- `cleanup-agents.ts` - DB cleanup utility

## Common Issues

**Agents stuck in "connecting":**
- Check `WS_PORT=8787` in `.env`
- Verify DO server running on port 8787

**Punctuation not triggering:**
- Check Supabase Realtime connection
- Verify `SUPABASE_ANON_KEY` set

**Stale agents in DB:**
```bash
npx tsx cleanup-agents.ts
```
