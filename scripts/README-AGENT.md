# Local Agent POC - Y.js Document Sync

This is a proof-of-concept for a local Node.js agent that connects to Cloudflare Workers (PartyKit/Durable Objects) and synchronizes documents using Y.js and WebSocket.

## Architecture

```
┌─────────────────┐         ┌──────────────────────┐         ┌─────────────────┐
│   Expo App      │◄───────►│  Cloudflare Worker   │◄───────►│  Local Agent    │
│  (ProseMirror)  │         │  (Durable Objects)   │         │  (Node.js)      │
└─────────────────┘         └──────────────────────┘         └─────────────────┘
        │                              │                              │
        └──────────────────────────────┴──────────────────────────────┘
                          Y.js CRDT Synchronization
                          (y-partyserver protocol)
```

## Features

- ✅ Connects to Cloudflare Workers using WebSocket
- ✅ Uses PartyKit protocol (y-partyserver)
- ✅ Syncs document state using Y.js CRDT
- ✅ Logs all document changes in real-time
- ✅ Graceful shutdown on Ctrl+C

## Installation

```bash
cd scripts
npm install
```

## Usage

### Basic Usage

```bash
node local-agent-yjs.js <documentId>
```

Example:
```bash
node local-agent-yjs.js test-doc-123
```

### Testing the POC

1. **Start the agent** in a terminal:
   ```bash
   cd scripts
   node local-agent-yjs.js my-test-document
   ```

2. **Open the Expo app** and navigate to the same document ID

3. **Make changes** in the ProseMirror editor

4. **Observe the agent logs** - You should see document changes logged in real-time

## Environment Variables

The agent uses these environment variables (with defaults):

- `COLLAB_HOST` - Cloudflare Worker host (default: `tourvision-collab.mads-9b9.workers.dev`)

## How It Works

1. **Y.js Document**: Creates a Y.js document with a `prosemirror` XML fragment (standard structure for ProseMirror)

2. **Y-PartyServer Provider**: Connects to Cloudflare Worker using the y-partyserver protocol with:
   - WebSocket URL: `wss://tourvision-collab.mads-9b9.workers.dev`
   - Party name: `yjs-room` (Durable Object binding)
   - Room name: `<documentId>`

3. **Change Observation**: Uses `observeDeep()` to listen for all changes in the document tree

4. **Logging**: Logs detailed information about each change including:
   - Number of changes
   - Type of change (insert, delete, update)
   - Path in document tree
   - Added/deleted items count
   - Current document structure (truncated)

## Output Example

```
[Agent] Starting local agent for document: test-doc-123
[Agent] Connecting to Cloudflare Worker: wss://tourvision-collab.mads-9b9.workers.dev
[Agent] Party: yjs-room, Room: test-doc-123
[Agent] 📡 WebSocket status: connecting
[Agent] ✅ WebSocket connected successfully
[Agent] 📡 WebSocket status: connected
[Agent] 🔄 Syncing with server...
[Agent] ✅ Document synced with server
[Agent] Initial sync completed, document state loaded

[Agent] 👂 Listening for document changes...
[Agent] Press Ctrl+C to stop

[Agent] 📝 Document changed!
[Agent] Number of changes: 1

[Agent] Change 1:
  Type: YXmlEvent
  Path: prosemirror > paragraph:0
  Added: 5 items
  Deleted: 0 items

[Agent] Current document structure:
{
  "type": "doc",
  "content": [
    {
      "type": "paragraph",
      "content": [
        {
          "type": "text",
          "text": "Hello"
        }
      ]
    }
  ]
}...
```

## Next Steps

This POC demonstrates the foundation for more advanced features:

1. **AI Processing**: Agent could analyze document changes and generate suggestions
2. **Content Enhancement**: Automatically enrich content (e.g., geocoding locations)
3. **Background Tasks**: Process long-running operations without blocking the UI
4. **Multiple Agents**: Run different agents for different document types
5. **Event Streaming**: Forward document events to other systems

## Troubleshooting

### Agent can't connect

- Check that Cloudflare Worker is accessible: `wss://tourvision-collab.mads-9b9.workers.dev`
- Verify the worker is deployed: `npx wrangler deploy`
- Check worker logs: `npx wrangler tail`

### No changes logged

- Ensure you're using the same document ID in both agent and Expo app
- Check that collaboration is enabled in the Expo app
- Verify the agent shows "Document synced with server"
- Check Cloudflare Worker logs for connection attempts

## Technical Details

### Y.js CRDT

Y.js uses Conflict-free Replicated Data Types (CRDTs) to enable real-time collaboration:

- Changes are automatically merged without conflicts
- Works offline and syncs when connection restored
- Efficient delta updates over WebSocket

### Y-PartyServer Protocol

The agent uses y-partyserver which implements the PartyKit protocol:

- Compatible with Cloudflare Durable Objects
- Standard WebSocket connection
- Room-based document isolation
- Automatic state synchronization

### Cloudflare Durable Objects

The collaboration server runs on Cloudflare Workers with Durable Objects:

- Each document gets its own isolated Durable Object instance
- State persists in memory across connections
- Automatic hibernation when no clients connected
- Global edge network for low latency

## License

MIT
