# CLAUDE_NEXT.md - Essential Project Guide

## Project Structure

```
tourvision-mobile/
├── agent-poc/          # Y.js collaborative document editor (main development)
│   ├── src/
│   │   ├── client/     # ProseMirror editor with Y.js sync
│   │   └── server/     # Cloudflare Durable Objects (WebSocket/Y.js)
│   ├── index.html      # Main entry point
│   ├── wrangler.toml   # Cloudflare Workers config
│   └── package.json
│
├── agent-system/       # AI agent orchestration
│   ├── agent-manager.ts   # Spawns/kills agent workers
│   ├── agent-worker.ts    # Period-triggered location detection
│   ├── Dockerfile         # For Docker deployment
│   └── start-agent-manager.sh
│
├── scripts/            # Standalone Node.js scripts
│   └── local-agent-yjs.js  # Single-document agent (for testing)
│
├── expo-app/           # Expo React Native app (separate system)
├── supabase/           # Database migrations and schema
├── docker-compose.yml  # Full stack deployment
└── CLAUDE_NEXT.md      # This file
```

## Core Architecture

### agent-poc (Primary Development Focus)

**Tech Stack:**
- **ProseMirror** - Rich text editor (HTML in WebView)
- **Y.js** - CRDT for real-time collaboration
- **Cloudflare Durable Objects** - Stateful WebSocket server (one per document)
- **Mapbox GL JS** - Map rendering with location markers

**Document Structure:**
- Geo-marks are **text marks** (not nodes) with attributes: `geoId`, `placeName`, `lat`, `lng`, `colorIndex`, etc.
- Maps are custom ProseMirror node types rendered with Mapbox
- Fullscreen map uses bounds from block map for proper alignment

**Key Files:**
- `index.html` - Entry point (loads client/index.js)
- `src/client/index.js` - Editor, Y.js provider, map rendering (large file ~2000+ lines)
- `src/server/index.ts` - Durable Object for WebSocket/Y.js sync

### agent-system (AI Agent Orchestration)

**Purpose:** Multi-document agent management with period-triggered location detection

**Components:**
1. **Agent Manager** (`agent-manager.ts`)
   - Subscribes to Supabase Realtime for document activity events
   - Spawns agent workers dynamically (child processes)
   - Enforces max concurrent limit (default: 10) with LRU eviction

2. **Agent Worker** (`agent-worker.ts`)
   - Connects to Y.js document via WebSocket
   - Detects period (`.`) character insertion
   - Runs LLM location extraction after 1-second debounce
   - Creates geo-marks in ProseMirror

**Database Tables:**
- `agent_connections` - Tracks active agents per document
- `document_activity` - Activity events from Durable Objects (active/idle)
- `agent_metrics` - Performance monitoring data

## Quick Start

### Development

```bash
# 1. Start Cloudflare Durable Object server (agent-poc)
cd agent-poc
npx wrangler dev --local --port 8787

# 2. Start Vite client (separate terminal)
npm run dev:client  # Port 5174

# 3. Start Agent Manager (separate terminal)
cd ../agent-system
bash start-agent-manager.sh

# 4. Open browser
open http://localhost:5174/?doc=test-doc
```

### Docker (Full Stack)

```bash
# Start Supabase + Agent System
docker compose up -d

# Or use Supabase CLI (lighter)
npx supabase start
```

### Environment Variables

**agent-poc** (`.env`):
```bash
WS_PORT=8787
WS_HOST=localhost
WS_PROTOCOL=ws
```

**agent-system** (`.env.manager`):
```bash
MANAGER_ID=manager-local-01
MAX_CONCURRENT_AGENTS=10
IDLE_TIMEOUT_MS=30000
WS_PORT=8787
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_ANON_KEY=<from npx supabase status>
SUPABASE_SERVICE_KEY=<from npx supabase status>
AI_GATEWAY_API_KEY=<your-key>
```

## Key Concepts

### Y.js Collaboration Flow

```
User edits document
    ↓
ProseMirror change
    ↓
Y.js sync plugin applies change to yXmlFragment
    ↓
WebsocketProvider sends update to Durable Object
    ↓
Durable Object broadcasts to all connected clients
    ↓
Other clients receive and apply update
```

### Agent Trigger Flow

```
User types "."
    ↓
Client detects via Y.js observeDeep()
    ↓
Agent worker detects period after 1s debounce
    ↓
LLM extracts locations from surrounding text
    ↓
Geocoding (Nominatim API)
    ↓
Create geo-marks in ProseMirror
```

### Fullscreen Map Transition

```
User clicks map block
    ↓
showFullscreenMap() retrieves block map instance
    ↓
Copy geographic bounds from block map
    ↓
Calculate container padding for alignment
    ↓
Create fullscreen map with same bounds
    ↓
Markers appear at same screen position
```

## Common Commands

### Agent-POC

```bash
cd agent-poc

# Development
npm run dev:client        # Vite dev server (5174)
npx wrangler dev --local  # Durable Objects (8787)

# Build
npm run build

# Deploy
npx wrangler deploy
```

### Agent-System

```bash
cd agent-system

# Development
bash start-agent-manager.sh

# Docker
docker compose up -d agent-manager

# Cleanup stale agents
npx tsx cleanup-agents.ts
```

### Database

```bash
# Start Supabase CLI
npx supabase start

# Stop and clean
npx supabase stop
docker compose down -v

# Apply migrations
npx supabase db push --local

# Reset database with seed data
npx supabase db reset --local
```

## Git Workflow

Current branch: `chore/cleanup`

```bash
# Check status
git status

# Commit
git add -A
git commit -m "chore: Description"

# Switch branches
git checkout main
git checkout -b feat/new-feature
```

## Deprecated / Removed

The following were removed during cleanup:

- ❌ **agent-manager/** - Old agent implementation (use agent-system/)
- ❌ **workers/** - Old Cloudflare Workers (chat, collab)
- ❌ **Eruda debug console** - Removed from index.html

## Important Notes

### Code Organization

- **agent-poc/src/client/index.js** is VERY large (~2000+ lines)
  - Contains: Editor setup, Y.js sync, map rendering, geo-mark creation
  - Fullscreen map logic starts around line 2000
  - Consider refactoring into modules

- **Geo-marks are marks, not nodes**
  - Structure: `{type: "text", marks: [{type: "geoMark", attrs: {...}}]}`
  - NOT: `{type: "geoMark", content: [...]}`

### Docker Compose

- Uses agent-system (not agent-manager)
- Service name still "agent-manager" for backward compatibility
- Builds from `agent-system/Dockerfile`

### Development Focus

Primary development happens in:
1. `agent-poc/` - Document editor features
2. `agent-system/` - Agent orchestration

The `expo-app/` is a separate React Native frontend (not currently active development focus).

## Troubleshooting

**Agent not connecting:**
- Check `WS_PORT=8787` matches Durable Object server
- Verify Durable Object server is running: `npx wrangler dev --local --port 8787`

**Period not triggering agent:**
- Check Supabase Realtime connection in agent-manager logs
- Verify `SUPABASE_ANON_KEY` is set (service key doesn't work for realtime)

**Map not showing:**
- Check Mapbox token in environment
- Verify map style loaded: Look for "Style loaded" in console

**Fullscreen map misaligned:**
- Ensure map instance stored on DOM: `dom._mapInstance = currentMap`
- Verify bounds copied from block map, not recalculated

## Next Steps / TODO

- [ ] Refactor agent-poc/src/client/index.js into modules
- [ ] Add comprehensive error handling in agent workers
- [ ] Implement agent health monitoring dashboard
- [ ] Add tests for geo-mark creation
- [ ] Document map rendering architecture
- [ ] Consider TypeScript migration for agent-poc client

---

**Last Updated:** November 19, 2025
**Primary Focus:** agent-poc collaborative document editor with Y.js
**Active Branch:** chore/cleanup
