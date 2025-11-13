# Multi-Document Agent Management System

This system enables dynamic agent attachment/detachment across multiple documents based on user activity. It uses Supabase Realtime for event-driven coordination between Cloudflare Durable Objects and local agent processes.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    Cloudflare Workers                        │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ Durable Object (per document)                        │   │
│  │ - Tracks user connections (userCount)                │   │
│  │ - Writes to Supabase on connect/disconnect           │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                            │
                            │ INSERT to document_activity
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                    Supabase PostgreSQL                       │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ Tables:                                              │   │
│  │ - agent_connections  (tracks active agents)          │   │
│  │ - document_activity  (activity event log)            │   │
│  │ - agent_metrics      (performance data)              │   │
│  └──────────────────────────────────────────────────────┘   │
│                    Realtime Subscription                     │
└─────────────────────────────────────────────────────────────┘
                            │
                            │ INSERT events
                            ▼
┌─────────────────────────────────────────────────────────────┐
│              Agent Manager (Local Server)                    │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ - Subscribes to document_activity changes            │   │
│  │ - Spawns agent workers (child processes)             │   │
│  │ - Enforces max concurrent limit with LRU eviction    │   │
│  │ - Health checks and crash recovery                   │   │
│  └──────────────────────────────────────────────────────┘   │
│                            │                                 │
│                            │ fork()                          │
│                            ▼                                 │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ Agent Worker (one per active document)               │   │
│  │ - Connects to Y.js document via WebSocket            │   │
│  │ - Runs LLM processing (period-triggered)             │   │
│  │ - Creates geo-marks via ProseMirror                  │   │
│  │ - Reports metrics to manager via IPC                 │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

## Components

### 1. Durable Object (`src/server/index.ts`)

**Responsibilities:**
- Track user connections per document
- Write activity events to Supabase when:
  - First user joins → `event_type: 'active'`
  - Last user leaves (after 30s grace period) → `event_type: 'idle'`

**Key Methods:**
- `onConnect()` - Increments userCount, writes 'active' event if first user
- `onDisconnect()` - Decrements userCount, schedules 'idle' event if last user

### 2. Agent Manager (`agent-manager.ts`)

**Responsibilities:**
- Subscribe to Supabase Realtime (`document_activity` table)
- Spawn agent workers when documents become active
- Kill agents when documents become idle
- Enforce max concurrent agent limit (default: 10)
- LRU eviction when limit reached
- Crash recovery on restart

**Key Features:**
- Process pooling with `child_process.fork()`
- IPC communication with workers via `process.send()`
- Health checks (ping/pong every 30s)
- Graceful shutdown handling

### 3. Agent Worker (`agent-worker.ts`)

**Responsibilities:**
- Connect to a specific document's Y.js instance
- Monitor document changes (period-triggered detection)
- Run LLM processing to extract locations
- Create geo-marks in ProseMirror
- Report metrics to manager (memory, CPU, LLM calls, locations marked)

**Key Features:**
- Accepts dynamic `DOCUMENT_ID` and `AGENT_ID` via CLI args or env vars
- Responds to shutdown and ping messages from manager
- Reports metrics every 30 seconds

### 4. Database Schema (`supabase/migrations/20251113000000_agent_connections.sql`)

**Tables:**

**`agent_connections`** - Tracks active agent processes
- `document_id` - Document the agent is attached to
- `agent_id` - Unique identifier for the agent process
- `agent_pid` - Process ID (for crash recovery)
- `status` - One of: `connecting`, `active`, `idle`, `detaching`, `disconnected`, `error`
- `manager_id` - Which manager spawned this agent
- `llm_calls_count`, `locations_marked_count` - Counters

**`document_activity`** - Activity event log from Durable Objects
- `document_id` - Document identifier
- `event_type` - One of: `active`, `idle`, `user_joined`, `user_left`
- `user_count` - Current number of connected users
- `timestamp` - When the event occurred

**`agent_metrics`** - Time-series performance data
- `agent_connection_id` - Foreign key to agent_connections
- `memory_mb`, `cpu_percent` - Resource usage
- `websocket_latency_ms`, `llm_response_time_ms` - Performance metrics

## Setup

### 1. Install Dependencies

```bash
cd agent-poc
npm install
```

New dependencies added:
- `@supabase/supabase-js` - Supabase client for Node.js
- `uuid` - For generating unique IDs

### 2. Apply Database Migration

```bash
# Navigate to parent project directory
cd ..

# Apply migration to Supabase
npx supabase db push --project-ref unocjfiipormnaujsuhk

# Or for local Supabase:
npx supabase db push --local
```

### 3. Configure Environment Variables

The `.env` file has been updated with:

```bash
# Supabase Configuration
SUPABASE_URL=https://unocjfiipormnaujsuhk.supabase.co
SUPABASE_SERVICE_KEY=<service_role_key>

# Agent Manager Configuration
MANAGER_ID=manager-local-01
MAX_CONCURRENT_AGENTS=10
IDLE_TIMEOUT_MS=30000

# WebSocket Configuration (for agent workers)
WS_PORT=8787
PARTY_NAME=document
```

For Cloudflare Workers local development, a `.dev.vars` file was created with the service key.

### 4. Set Cloudflare Secret (Production Only)

For production deployment, set the Supabase service key as a secret:

```bash
npx wrangler secret put SUPABASE_SERVICE_KEY
# Paste: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

## Running the System

### Start the Durable Object Server

```bash
cd agent-poc
npm run dev:server
```

This starts the Cloudflare Workers development server with Durable Objects.

### Start the Agent Manager

In a new terminal:

```bash
cd agent-poc
npm run agent-manager
```

Expected output:
```
╔══════════════════════════════════════════════════════╗
║         Agent Manager - Multi-Document System       ║
╚══════════════════════════════════════════════════════╝

[Manager] ID: manager-local-01
[Manager] Host: your-hostname
[Manager] Max Concurrent: 10
[Manager] Idle Timeout: 30000ms

[Manager] 📡 Subscribing to Supabase Realtime...
[Manager] 🚀 Ready to manage agents
[Manager] Listening for document activity events...
```

### Test with Multiple Documents

1. **Open a document in browser** (or via tiptap-yjs-test client)
2. **Agent Manager detects activity:**
   ```
   [Manager] 📨 Activity: active for test-document (users: 1)
   [Manager] 🔄 Spawning agent agent-test-document-1731456789...
   [Manager] ✅ Spawned agent for test-document (PID: 12345)
   ```
3. **Agent Worker connects:**
   ```
   [Agent Worker] Starting for document: test-document
   [Agent Worker] Agent ID: agent-test-document-1731456789
   [Agent Worker] Synced: true
   [Agent Worker] 💡 Period-triggered LLM processing enabled
   ```
4. **Close the document**
5. **After 30s idle timeout:**
   ```
   [Manager] 📨 Activity: idle for test-document (users: 0)
   [Manager] 🔄 Detaching agent from test-document (Document became idle)
   [Manager] 🛑 Agent exited (code: 0, signal: null)
   ```

## Agent Manager Commands

### View System Statistics

The manager prints stats every 60 seconds automatically:

```
╔══════════════════════════════════════════════════════╗
║                  System Statistics                   ║
╚══════════════════════════════════════════════════════╝
Total Agents:      25
Active Agents:     8
Connecting Agents: 2
Unique Documents:  10
Avg Memory:        45.32 MB
Total LLM Calls:   127
Total Locations:   342
```

### Graceful Shutdown

Press `Ctrl+C` to gracefully shutdown all agents:

```bash
^C
[Manager] 🛑 Shutting down...
[Manager] Shutting down 8 agent(s)
[Manager] 🔄 Detaching agent from doc-1 (Manager shutdown)
[Manager] 🔄 Detaching agent from doc-2 (Manager shutdown)
...
[Manager] ✅ Shutdown complete
```

## Testing

### Manual Testing

1. **Start services:**
   ```bash
   # Terminal 1: Durable Object server
   npm run dev:server

   # Terminal 2: Agent Manager
   npm run agent-manager
   ```

2. **Trigger activity:**
   - Open `http://localhost:8787` in browser
   - Connect to a document via tiptap-yjs-test client
   - Type text ending with a period (`.`)

3. **Verify agent behavior:**
   - Check logs for LLM processing
   - Verify geo-marks are created
   - Check database for agent_connections records

### Database Queries

```bash
# Check active agents
psql <connection_string> -c "SELECT * FROM agent_connections WHERE status = 'active';"

# Check recent activity
psql <connection_string> -c "SELECT * FROM document_activity ORDER BY timestamp DESC LIMIT 10;"

# Check metrics
psql <connection_string> -c "SELECT * FROM agent_metrics ORDER BY recorded_at DESC LIMIT 20;"

# Get system stats
psql <connection_string> -c "SELECT * FROM get_agent_system_stats();"
```

## Troubleshooting

### Agent doesn't spawn when opening document

**Check:**
1. Is the Durable Object server running? (`npm run dev:server`)
2. Is the Agent Manager running? (`npm run agent-manager`)
3. Are Supabase credentials correct in `.env`?
4. Check Durable Object logs for "Document became ACTIVE" message
5. Check Supabase Realtime connection:
   ```
   [Manager] 📡 Subscribing to Supabase Realtime...
   ```

### Agent spawns but doesn't connect

**Check:**
1. Is `WS_PORT=8787` correct in `.env`?
2. Is the WebSocket URL accessible?
3. Check agent worker logs for connection errors
4. Verify `DOCUMENT_ID` is being passed correctly

### LRU eviction not working

**Check:**
1. Is `MAX_CONCURRENT_AGENTS` set correctly?
2. Are more than 10 documents active simultaneously?
3. Check `last_activity_at` timestamps in database
4. Look for "Evicting least active document" in logs

### Metrics not updating

**Check:**
1. Agent worker sends metrics every 30 seconds
2. Check IPC communication between worker and manager
3. Verify database credentials have INSERT permissions
4. Check for errors in manager logs when handling metrics

## Production Deployment

### Cloudflare Workers

```bash
# Deploy Durable Object to production
npx wrangler deploy

# Set secret
npx wrangler secret put SUPABASE_SERVICE_KEY
```

### Agent Manager (Local Server)

For production, run the agent manager on a persistent server:

```bash
# Use PM2 for process management
npm install -g pm2

# Start manager with PM2
pm2 start npm --name "agent-manager" -- run agent-manager

# View logs
pm2 logs agent-manager

# Monitor
pm2 monit
```

### Environment Variables (Production)

Update `.env` for production:
- Set `MANAGER_ID` to unique hostname/identifier
- Adjust `MAX_CONCURRENT_AGENTS` based on server capacity
- Use production `SUPABASE_URL` and `SUPABASE_SERVICE_KEY`

## Architecture Benefits

✅ **Scalability** - Manager can coordinate multiple agent workers across documents
✅ **Resource Efficiency** - Agents only run when documents are active
✅ **Fault Tolerance** - Crash recovery on manager restart
✅ **Observability** - Metrics tracking in database
✅ **Event-Driven** - Supabase Realtime eliminates polling
✅ **Process Isolation** - Each agent in separate process
✅ **Graceful Degradation** - LRU eviction when hitting limits

## Next Steps

- [ ] Add horizontal scaling (multiple manager instances)
- [ ] Implement agent health monitoring dashboard
- [ ] Add distributed locking for multi-manager coordination
- [ ] Implement agent warm-up pool for faster attachment
- [ ] Add metrics export to monitoring systems (Prometheus, etc.)
- [ ] Implement agent versioning and rolling updates
