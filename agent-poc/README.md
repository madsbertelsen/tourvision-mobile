# Agent POC - Multi-Document AI Agent Management System

This is an advanced proof-of-concept demonstrating **dynamic multi-document agent management** with collaborative ProseMirror editing using Y.js and Cloudflare Durable Objects.

## 🎯 What's New: Multi-Document Architecture

The system now supports **unlimited documents** with automatic agent attachment/detachment based on user activity:

- **Event-Driven Coordination** - Durable Objects write activity signals to Supabase, Agent Manager subscribes via Realtime
- **Process Pooling** - Manager spawns isolated agent worker processes per active document
- **Resource Management** - LRU eviction when hitting max concurrent limit
- **Observability** - Metrics tracking for memory, CPU, LLM calls, and location marks
- **Fault Tolerance** - Crash recovery and health monitoring

## Features

### Collaborative Editing
- **ProseMirror Editor** - Rich text editing with Tiptap and Y.js CRDT sync
- **Cloudflare Durable Objects** - Serverless WebSocket backend with persistence
- **Real-time Presence** - See cursors and user names for all connected clients

### AI Agent System
- **Dynamic Agent Workers** - Isolated Node.js processes per active document
- **Agent Manager** - Orchestrates worker lifecycle via Supabase Realtime
- **LLM Processing** - Period-triggered document analysis using Vercel AI SDK
- **Tool Calling** - Geo-mark creation, text selection, geocoding
- **Client-Delegated Operations** - Agents delegate API calls to browser clients

### Database & Monitoring
- **Supabase PostgreSQL** - Tracks agent connections, activity, and metrics
- **Realtime Subscriptions** - Event-driven coordination (no polling!)
- **Performance Metrics** - Memory, CPU, WebSocket latency, LLM response times
- **System Statistics** - Aggregated stats via SQL functions

## 📚 Documentation

- **[QUICKSTART.md](./QUICKSTART.md)** - Get started in 5 minutes (recommended)
- **[LOCAL_SETUP.md](./LOCAL_SETUP.md)** - Detailed step-by-step setup guide
- **[AGENT_MANAGER_README.md](./AGENT_MANAGER_README.md)** - Full architecture documentation

## Quick Start

### Automated Setup (Recommended)

```bash
cd agent-poc
./setup-local.sh
```

This will:
1. Start local Supabase
2. Apply database migrations
3. Create configuration files (`.env.local`, `.dev.vars`)
4. Install dependencies
5. Verify setup

### Manual Setup (3 Steps)

**1. Start Supabase**
```bash
npx supabase start
```

**2. Install & Configure**
```bash
npm install

# Create .env.local with credentials from supabase status
cat > .env.local <<'EOF'
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_SERVICE_KEY=<from-npx-supabase-status>
MANAGER_ID=manager-local-dev
MAX_CONCURRENT_AGENTS=5
WS_PORT=8787
EOF
```

**3. Apply Migrations**
```bash
cd ..
npx supabase db push --local
cd agent-poc
```

### Running the System

**Terminal 1: Durable Object Server**
```bash
npm run dev:server
```

**Terminal 2: Agent Manager**
```bash
npm run agent-manager
```

**Terminal 3: Test Client (optional)**
```bash
npm run dev:client
# Open http://localhost:8787
```

### Test the System

1. Open a document in the client
2. Type text ending with `.` (e.g., "Trip to Paris.")
3. Watch the logs:
   - Durable Object: Document becomes active
   - Agent Manager: Spawns agent worker
   - Agent Worker: Detects location, creates geo-mark
4. Close document and wait 30s
   - Agent detaches automatically

See **[QUICKSTART.md](./QUICKSTART.md)** for detailed testing instructions.

## Configuration

Both the client and agent use port **8787** by default (Wrangler's default port).

### Change the WebSocket Port

**For the agent:**
```bash
WS_PORT=9999 node agent.js
```

**For the client:**
Create a `.env` file:
```
VITE_WS_PORT=9999
```

Then restart `npm start`.

## Architecture

### Multi-Document Flow

```
User opens document
    ↓
Durable Object tracks connection, writes to Supabase: event_type='active'
    ↓
Agent Manager subscribes via Realtime, receives event
    ↓
Manager spawns Agent Worker for that document
    ↓
Worker connects to Y.js document via WebSocket
    ↓
Worker monitors for periods, runs LLM, creates geo-marks
    ↓
User closes document
    ↓
After 30s idle: Durable Object writes event_type='idle'
    ↓
Manager detaches Agent Worker (graceful shutdown)
```

### System Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    Browser (Clients)                         │
│                 ProseMirror + Y.js                           │
└───────────────────────┬─────────────────────────────────────┘
                        │ WebSocket (Y.js CRDT sync)
                        ▼
┌─────────────────────────────────────────────────────────────┐
│              Cloudflare Workers (Edge)                       │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ Durable Object (per document)                        │   │
│  │ - Manages WebSocket connections                      │   │
│  │ - Y.js document persistence                          │   │
│  │ - Writes activity events to Supabase                 │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                        │
                        │ INSERT document_activity events
                        ▼
┌─────────────────────────────────────────────────────────────┐
│               Supabase PostgreSQL                            │
│  - agent_connections (tracks active agents)                 │
│  - document_activity (activity log)                         │
│  - agent_metrics (performance data)                         │
│                 Realtime Subscriptions                       │
└─────────────────────────────────────────────────────────────┘
                        │
                        │ Realtime INSERT events
                        ▼
┌─────────────────────────────────────────────────────────────┐
│            Agent Manager (Local Server)                      │
│  - Subscribes to document_activity                          │
│  - Spawns/kills agent workers                               │
│  - LRU eviction, health checks                              │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        │ fork() child processes
                        ▼
┌─────────────────────────────────────────────────────────────┐
│          Agent Workers (one per active document)             │
│  - Connect to Y.js document via WebSocket                   │
│  - Monitor for period-triggered changes                     │
│  - Run LLM processing (Vercel AI SDK)                       │
│  - Create geo-marks in ProseMirror                          │
│  - Report metrics via IPC                                   │
└─────────────────────────────────────────────────────────────┘
```

## Key Files

### Multi-Document System
- **`agent-manager.ts`** - Orchestrates agent workers, subscribes to Realtime
- **`agent-worker.ts`** - Individual agent process per document
- **`shared/database.ts`** - Supabase client wrapper
- **`shared/types.ts`** - TypeScript type definitions
- **`setup-local.sh`** - Automated local setup script

### Cloudflare Workers
- **`src/server/index.ts`** - Durable Object with activity tracking
- **`wrangler.toml`** - Cloudflare Workers configuration
- **`.dev.vars`** - Local development secrets

### Client
- **`src/client/index.tsx`** - React/ProseMirror client UI
- **`src/y-partyserver/`** - Custom Y.js provider with custom messages

### Database
- **`supabase/migrations/20251113000000_agent_connections.sql`** - Schema for agent management

### Configuration
- **`.env.local`** - Local development configuration
- **`package.json`** - Dependencies and scripts

## Testing the POC

1. **Start the backend** with `npm run dev:server` (wait for "Ready on http://localhost:8787")
2. **Start the frontend** with `npm run dev:client` in a second terminal
3. **Open the browser** to `http://localhost:5173`
4. **Type some text** in the editor (e.g., "I'm planning a trip to Copenhagen.")
5. **Run the agent** in a third terminal with `npm run agent`
6. **Type a period** (`.`) in the editor
7. **Watch the agent logs**:
   - `🤖 Calling mock LLM...`
   - `💭 LLM detected location: "Copenhagen"`
   - `📋 LLM returned 2 tool call(s)`
   - `🔧 Tool: selectText("Copenhagen", ...)`
   - `🔧 Tool: geocode("Copenhagen") - selecting target client`
   - `🎯 Selected client 123456789 (User-742) for geocoding`
   - `📤 Sent geocode task geocode-... to client 123456789`
8. **Watch the server logs** (in dev:server terminal):
   - `[Server] Geocode task from agent: copenhagen (task: geocode-...)`
   - `[Server] 🎯 Forwarding to target client: 123456789`
   - `[Server] ✅ Task sent to client 123456789 (User-742)`
9. **Watch the target client browser console**:
   - `[Client] 📍 Received geocode task: "copenhagen"`
   - `[Client] Geocoding "copenhagen"...`
   - `[Client] ✅ Sent geocode result for task geocode-...`
10. **If you have multiple browser tabs open**, other clients will log:
   - `[Client] ⏭️  Ignoring task geocode-... (targeted to client 123456789, I am 987654321)`
11. **Back in agent logs**:
   - `[Agent] ✅ Received geocode result for task geocode-...`
   - `✅ Tool result: {lat: 55.67, lng: 12.56, displayName: "Copenhagen, Denmark"}`
12. **See the agent's red cursor highlight "Copenhagen" in the editor**

You can also open multiple browser tabs to see real-time collaboration between multiple users.

## Troubleshooting

**Problem**: Agent shows "Status: connecting" repeatedly

**Solution**: Make sure the Wrangler dev server is running on port 8787. You should see "Ready on http://localhost:8787" in the dev:server terminal.

**Problem**: Too many connection requests in the frontend

**Solution**: This happens when the backend server isn't running. The client uses exponential backoff to retry connections (up to 2.5 seconds between attempts). Start the backend server first.

## LLM and Tool Calling Architecture

### Mock LLM (`callMockLLM`)

The agent uses a mock LLM that simulates language model behavior:

```javascript
async function callMockLLM(documentText) {
  // Simulates 500ms processing time
  await new Promise(resolve => setTimeout(resolve, 500));

  // Detects "Copenhagen" and returns tool calls
  return {
    toolCalls: [
      { tool: 'selectText', args: { text: 'Copenhagen', startOffset: 20, endOffset: 30 } },
      { tool: 'geocode', args: { locationName: 'Copenhagen' } }
    ]
  };
}
```

**Future**: Replace with real LLM API (OpenAI, Anthropic, etc.)

### Available Tools

Tools are defined in the `tools` registry:

1. **`selectText({ text, startOffset, endOffset })`**
   - Highlights text in the document by setting the agent's cursor
   - Uses Y.js relative positions for accurate selection across CRDT operations
   - Returns: `{ success: true, selected: "Copenhagen", positions: {...} }`

2. **`geocode({ locationName })`**
   - Delegates geocoding to the client via custom messages
   - Agent sends `geocode_task` message with unique task ID
   - Client executes Nominatim API request and returns results
   - Returns: `{ lat: 55.6761, lng: 12.5683, displayName: "Copenhagen, Denmark" }`
   - Includes 10-second timeout for task completion

### Tool Execution Flow

```
User types "Copenhagen."
    ↓
Period triggers LLM processing
    ↓
callMockLLM(documentText) → returns tool calls
    ↓
executeTool({tool: 'selectText', args: {...}})
    ↓
Agent cursor selects "Copenhagen" in editor
    ↓
executeTool({tool: 'geocode', args: {locationName: 'Copenhagen'}})
    ↓
Agent sends geocode_task via custom message
    ↓
Client receives task and calls Nominatim API
    ↓
Client sends geocode_result back to agent
    ↓
Agent receives coordinates and tool execution completes
```

### Adding New Tools

1. Add tool definition to `tools` object:
   ```javascript
   tools.newTool = async ({ arg1, arg2 }) => {
     // Tool implementation
     return { result: 'success' };
   };
   ```

2. Update mock LLM to return the new tool in tool calls

3. Tool will automatically be available for execution

## Custom Messages

The POC uses YProvider's custom message API to enable asynchronous task delegation between the agent and clients.

### Message Protocol

**Geocode Task (Agent → Client):**
```json
{
  "type": "geocode_task",
  "taskId": "geocode-1234567890-abc123def",
  "locationName": "Copenhagen",
  "targetClientId": 123456789
}
```

**Geocode Result (Client → Agent):**
```json
{
  "type": "geocode_result",
  "taskId": "geocode-1234567890-abc123def",
  "result": {
    "lat": 55.6761,
    "lng": 12.5683,
    "displayName": "Copenhagen, Denmark"
  }
}
```

**Ping/Pong Example:**
```json
{
  "action": "ping"
}
```

### How It Works

1. **Agent** detects a location via LLM and needs coordinates
2. **Agent** selects a target client from awareness (first non-agent client)
3. **Agent** generates unique task ID: `geocode-${Date.now()}-${randomId}`
4. **Agent** sends `geocode_task` message with `targetClientId` field
5. **Server** receives task and forwards only to the targeted client connection
6. **Target client** receives task, calls Nominatim API with User-Agent header
7. **Other clients** ignore the task (not targeted to them)
8. **Target client** sends back `geocode_result` with task ID and coordinates
9. **Server** broadcasts result to all connections (including agent)
10. **Agent** resolves pending Promise and continues tool execution
11. **Timeout** of 10 seconds applies if client doesn't respond

### Benefits

- **Avoids Rate Limits**: Only one client geocodes per task, preventing duplicate API calls
- **Targeted Execution**: Agent selects specific clients to execute tasks
- **Efficient**: No wasted API calls from multiple clients processing the same task
- **Browser APIs**: Clients can use browser-specific APIs if needed
- **Separation of Concerns**: Agent focuses on LLM reasoning, clients handle external API calls
- **Fallback**: If target client is offline, server broadcasts to all as fallback

### Testing Custom Messages

Click the "Send Ping" button in the UI to test basic custom message passing.

## Deployment

To deploy the Durable Object to Cloudflare:

```bash
npx wrangler deploy
```

This deploys the server to Cloudflare Workers. You'll need to update the client and agent URLs to point to your deployed worker.
