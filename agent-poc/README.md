# Agent POC - AI Agent with Y.js Collaborative Editing

This is a proof-of-concept demonstrating an AI agent that connects to a collaborative ProseMirror editor using Y.js and Cloudflare Durable Objects.

## Features

- **Collaborative Editor** - ProseMirror with Tiptap and Y.js CRDT sync
- **Cloudflare Durable Objects** - Serverless backend with persistence
- **AI Agent with LLM** - Node.js script that analyzes documents using a mock LLM
- **Tool Calling System** - LLM can call tools like `selectText` and `geocode`
- **Client-Delegated Geocoding** - Agent delegates geocoding tasks to clients via custom messages
- **Period-triggered Analysis** - Agent processes document when users type a period (`.`)
- **Smart Text Selection** - Agent automatically selects detected locations
- **Real-time Presence** - See cursors and user names for all connected clients

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Start the Backend Server (Wrangler)

In one terminal:

```bash
npm run dev:server
```

This starts the **Wrangler dev server** (Durable Object) on `ws://localhost:8787`.

Wait for the message: `Ready on http://localhost:8787`

### 3. Start the Frontend Client (Vite)

In a **second terminal**:

```bash
npm run dev:client
```

This starts the **Vite dev server** (client UI) on `http://localhost:5173`.

Open your browser to `http://localhost:5173` and you'll see the collaborative editor.

### 4. Run the AI Agent (Optional)

In a separate terminal:

```bash
node agent.js
```

The agent will:
- Connect to the same Y.js document
- Show a red cursor labeled "AI Agent"
- Detect when you type a period (`.`)
- Send document text to a mock LLM for analysis
- Execute tool calls returned by the LLM:
  - `selectText` - Select and highlight text in the document
  - `geocode` - Delegate geocoding to clients via custom messages
- Display detailed logs of LLM reasoning and tool execution

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

```
┌─────────────────────┐
│  Browser (Client)   │
│  ProseMirror Editor │
└──────────┬──────────┘
           │ WebSocket
           │ (Y.js CRDT sync)
           ▼
┌─────────────────────┐
│ Cloudflare Worker   │
│  Durable Object     │
│  (Document Server)  │
└──────────┬──────────┘
           │ WebSocket
           │ (Y.js CRDT sync)
           ▼
┌─────────────────────┐
│   Node.js Agent     │
│  (AI Observer)      │
└─────────────────────┘
```

## Key Files

- `agent.js` - Node.js agent script
- `src/server/index.ts` - Cloudflare Durable Object with Y.js persistence
- `src/client/index.tsx` - React/ProseMirror client UI
- `src/y-partyserver/` - Custom Y.js PartyKit/PartyServer implementation
- `wrangler.toml` - Cloudflare Workers configuration
- `vite.config.ts` - Vite build configuration

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
