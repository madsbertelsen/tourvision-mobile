# Agent POC - AI Agent with Y.js Collaborative Editing

This is a proof-of-concept demonstrating an AI agent that connects to a collaborative ProseMirror editor using Y.js and Cloudflare Durable Objects.

## Features

- **Collaborative Editor** - ProseMirror with Tiptap and Y.js CRDT sync
- **Cloudflare Durable Objects** - Serverless backend with persistence
- **AI Agent** - Node.js script that observes and interacts with the document
- **Period-triggered Actions** - Agent responds when users type a period (`.`)
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
- Move its cursor to a random position after 1 second

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
4. **Type some text** in the editor
5. **Run the agent** in a third terminal with `npm run agent`
6. **Type a period** (`.`) in the editor
7. **Watch the agent's cursor move** to a random position

You can also open multiple browser tabs to see real-time collaboration between multiple users.

## Troubleshooting

**Problem**: Agent shows "Status: connecting" repeatedly

**Solution**: Make sure the Wrangler dev server is running on port 8787. You should see "Ready on http://localhost:8787" in the dev:server terminal.

**Problem**: Too many connection requests in the frontend

**Solution**: This happens when the backend server isn't running. The client uses exponential backoff to retry connections (up to 2.5 seconds between attempts). Start the backend server first.

## Custom Messages

The POC includes an example of custom message passing (ping/pong) between clients and the server. Click the "Send Ping" button in the UI to test it.

## Deployment

To deploy the Durable Object to Cloudflare:

```bash
npx wrangler deploy
```

This deploys the server to Cloudflare Workers. You'll need to update the client and agent URLs to point to your deployed worker.
