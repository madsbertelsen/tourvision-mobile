# WebRTC Agent Communication Architecture

## Overview

This document describes the architecture for implementing direct WebRTC peer-to-peer communication between user browsers and agent workers, while maintaining document synchronization through the existing y-partyserver/Durable Object infrastructure.

## Simplified Design (Current Implementation)

**Key Simplifications:**
- ✅ No separate "rooms" concept - uses `documentId` as the sole identifier
- ✅ Agent pre-generates WebRTC offer before user connects
- ✅ Signaling service returns complete connection package to user
- ✅ One-to-one mapping: one agent per document
- ✅ Durable Object uses `idFromName(documentId)` for consistent routing

**Connection Flow:**
```
1. User → POST /connect/{documentId}
2. Signaling Service → HTTP POST /agent/spawn { documentId }
3. Agent Manager → Spawns agent worker
4. Agent Worker → Generates WebRTC offer, sends to manager via IPC
5. Agent Manager → Returns { success, agentId, offer } to signaling service
6. Signaling Service → Returns { signalingUrl, offer, iceServers, agentId } to user
7. User → Creates answer, connects to WS /signal/{documentId}
8. User & Agent → Exchange ICE candidates via signaling WebSocket
9. WebRTC DataChannel established for direct communication
```

## Current vs. Proposed Architecture

### Current Architecture (Issue)
```
User Browser
    ↓
    └─→ Durable Object (Document Server)
           ↓
           └─→ Agent Worker (via same document)
```

**Problems:**
- Agent messages are routed through the Durable Object document server
- All communication is indirect via document changes
- DO becomes a bottleneck for agent interactions
- Increased latency for agent responses

### Proposed Architecture
```
┌─────────────────────────────────────────────────────────────┐
│                      User Browser                            │
│  ┌────────────────────┐     ┌──────────────────────┐       │
│  │ ProseMirror + Y.js │     │  Agent Communication │       │
│  │   (y-partyserver)  │     │    (WebRTC P2P)      │       │
│  └─────────┬──────────┘     └──────────┬───────────┘       │
└────────────│─────────────────────────────│──────────────────┘
             │                             │
             ↓                             ↓
    ┌────────────────┐          ┌─────────────────────┐
    │ Durable Object │          │  Lobby WebSocket    │
    │ (Document)     │          │  (Signaling Server) │
    └────────┬───────┘          └──────────┬──────────┘
             │                             │
             │                             ↓
             │                    ┌─────────────────┐
             │                    │ Agent Manager   │
             │                    └────────┬────────┘
             │                             │
             │                             ↓
             │              ┌──────────────────────────┐
             │              │ Agent Worker (dedicated) │
             │              │                          │
             └──────────────┤ Y.js Observer (context)  │
                            │ WebRTC DataChannel       │
                            │ LLM Processing           │
                            └──────────────────────────┘
```

## Key Design Principles

### 1. Separation of Concerns
- **Document Sync:** WebSocket via y-partyserver → Durable Object
  - Multi-user collaboration on ProseMirror document
  - Persistent document state
  - Real-time text editing synchronization

- **Agent Communication:** WebRTC DataChannel
  - Direct peer-to-peer connection between user and dedicated agent
  - Low-latency command/response messaging
  - Status updates and progress notifications

### 2. Agent Worker Dual Connectivity

Each agent worker maintains TWO simultaneous connections:

**Connection 1: Y.js WebSocket (to Durable Object)**
- Purpose: Read and modify the ProseMirror document
- Use cases:
  - Observe document changes for context
  - Create geo-marks in the document
  - Read document text for LLM processing
- Implementation: Existing y-partyserver provider

**Connection 2: WebRTC DataChannel (to User)**
- Purpose: Direct bidirectional communication
- Use cases:
  - Receive user commands and requests
  - Send LLM processing responses
  - Send status updates ("Processing...", "Complete")
  - Send location detection results
- Implementation: New WebRTC peer connection

### 3. One Agent Per User
- Each user session gets a dedicated agent worker
- Agent lifecycle tied to user session (spawned on connect, cleaned up on disconnect)
- Enables personalized agent behavior and context

## Message Flow Example

**Scenario: User requests location detection**

```
1. User → WebRTC DataChannel → Agent Worker:
   { type: "command", action: "detect_locations" }

2. Agent Worker → Y.js → observes document text

3. Agent Worker → LLM API → processes text

4. Agent Worker → WebRTC DataChannel → User:
   { type: "status", message: "Processing..." }

5. Agent Worker → Y.js → Durable Object:
   Creates geo-marks in document

6. Agent Worker → WebRTC DataChannel → User:
   { type: "complete", locations: [...] }
```

**Key Benefits:**
- Fast status updates via WebRTC (no DO routing)
- Document integration via Y.js (geo-marks appear for all users)
- Clear separation between commands and document state

## Implementation Phases

### Phase 1: Signaling Service (WebRTC Signaling Server)

**New Component:** `/server/src/lobby/lobby.ts`

The Signaling service is responsible for:
- WebSocket server for WebRTC signaling (SDP answer/ICE candidates from user)
- Per-document signaling channel management (using documentId)
- Notifying agent-manager when users request connection
- Returning agent's pre-generated WebRTC offer to user
- Forwarding signaling messages between peers

**Durable Object Structure:**
```typescript
export class SignalingChannel extends DurableObject {
  // Track connections per document
  private userConnection: WebSocket | null = null;
  private agentConnection: WebSocket | null = null;
  private documentId: string; // Derived from Durable Object ID

  // Handle WebSocket connections
  async fetch(request: Request): Promise<Response> {
    // Upgrade to WebSocket
    // Handle signaling messages
    // Forward between user and agent
  }

  // Cleanup on disconnect
  webSocketClose(ws: WebSocket) {
    // Remove connection
    // Clean up when both disconnected
  }
}
```

**HTTP Endpoints:**
- `POST /connect/{documentId}` - User requests agent connection
  - Request body: (none, documentId in URL)
  - Response: `{ success, documentId, signalingUrl, offer, iceServers, agentId }`
  - Side effect: Spawns agent via agent-manager, returns agent's offer

**WebSocket Endpoints:**
- `WS /signal/{documentId}` - WebSocket for signaling exchange
  - User sends answer and ICE candidates
  - Agent sends ICE candidates
  - Forwards messages between peers

**WebSocket Protocol:**
```javascript
// User/Agent → Signaling Channel
{
  type: "join" | "answer" | "ice-candidate",
  from: "user" | "agent",
  data: {
    peerType?: "user" | "agent",  // On join
    /* SDP answer or ICE candidate */
  }
}

// Signaling Channel → User/Agent
{
  type: "ready" | "answer" | "ice-candidate",
  data: {
    message?: "Agent connected" | "User connected",  // On ready
    /* SDP or ICE candidate */
  }
}
```

### Phase 2: Agent Manager Integration

**Modified Component:** `/agent-system/agent-manager.ts`

**New Functionality:**
- HTTP server to receive spawn requests from signaling service
- Spawn agent worker for the document
- Wait for agent to generate WebRTC offer
- Return agent's offer to signaling service

**New HTTP Endpoint:**
```typescript
POST /agent/spawn
Body: {
  documentId: string
}
Response: {
  success: boolean,
  agentId: string,
  offer: {
    type: "offer",
    sdp: string
  }
}
```

**Agent Spawning Flow:**
```typescript
// 1. Spawn agent worker
private async spawnAgent(documentId: string) {
  const agentId = `agent-${documentId}-${Date.now()}`;

  const child = fork('./agent-worker.js', [documentId], {
    env: {
      ...process.env,
      DOCUMENT_ID: documentId,
      AGENT_ID: agentId
    }
  });

  // 2. Setup message handler to receive offer
  child.on('message', (msg) => {
    if (msg.type === 'webrtc_offer') {
      this.agentOffers.set(documentId, msg.offer);
    }
  });

  this.agents.set(documentId, child);
}

// 3. Wait for agent to send offer via IPC
private async waitForAgentOffer(documentId: string, timeoutMs: number) {
  // Poll until offer received or timeout
  // Returns offer or null
}
```

### Phase 3: Agent Worker WebRTC

**Modified Component:** `/agent-system/agent-worker.ts`

**New Dependencies:**
- `wrtc` or `simple-peer` for Node.js WebRTC support

**WebRTC Setup:**
```typescript
import { RTCPeerConnection, RTCSessionDescription } from 'wrtc';

class AgentWorker {
  private peerConnection: RTCPeerConnection;
  private dataChannel: RTCDataChannel;
  private lobbyWebSocket: WebSocket;

  async initialize() {
    // 1. Connect to Y.js document (existing code)
    this.connectToDocument();

    // 2. Connect to lobby for signaling
    this.connectToLobby();

    // 3. Set up WebRTC peer connection
    this.setupWebRTC();
  }

  private setupWebRTC() {
    this.peerConnection = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    });

    // Create data channel
    this.dataChannel = this.peerConnection.createDataChannel('agent');

    this.dataChannel.onmessage = (event) => {
      this.handleUserMessage(JSON.parse(event.data));
    };

    // Handle ICE candidates
    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        this.lobbyWebSocket.send(JSON.stringify({
          type: 'ice-candidate',
          data: event.candidate
        }));
      }
    };
  }

  private async handleUserMessage(message: any) {
    switch (message.type) {
      case 'command':
        // Process user command
        this.sendStatus('Processing...');
        await this.executeCommand(message.action);
        break;
    }
  }

  private sendToUser(message: any) {
    if (this.dataChannel.readyState === 'open') {
      this.dataChannel.send(JSON.stringify(message));
    }
  }
}
```

**Message Types via DataChannel:**
```typescript
// User → Agent
type UserMessage =
  | { type: 'command', action: 'detect_locations' }
  | { type: 'geocode_request', location: string }
  | { type: 'stop' };

// Agent → User
type AgentMessage =
  | { type: 'status', message: string }
  | { type: 'location_result', locations: Location[] }
  | { type: 'geocode_result', coordinates: Coordinates }
  | { type: 'error', error: string };
```

### Phase 4: Client WebRTC Integration

**Modified Component:** `/server/src/client/index.js`

**New Functionality:**
- Request agent connection on page load
- Receive agent's pre-generated offer
- Create answer and connect to signaling WebSocket
- Establish WebRTC connection with agent
- Route agent communication via DataChannel

**Implementation:**
```javascript
class AgentConnection {
  constructor(documentId) {
    this.documentId = documentId;
    this.peerConnection = null;
    this.dataChannel = null;
    this.signalingWebSocket = null;
  }

  async connect() {
    // 1. Request agent connection (agent spawns and generates offer)
    const response = await fetch(`http://localhost:8787/connect/${this.documentId}`, {
      method: 'POST'
    });

    const { signalingUrl, offer, iceServers, agentId } = await response.json();

    console.log('[WebRTC] Received agent offer, creating peer connection');

    // 2. Create WebRTC peer connection
    this.peerConnection = new RTCPeerConnection({ iceServers });

    // 3. Handle data channel from agent (agent creates it)
    this.peerConnection.ondatachannel = (event) => {
      this.dataChannel = event.channel;
      this.dataChannel.onmessage = (e) => {
        this.handleAgentMessage(JSON.parse(e.data));
      };
      console.log('[WebRTC] DataChannel received from agent');
    };

    // 4. Handle ICE candidates
    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate && this.signalingWebSocket?.readyState === WebSocket.OPEN) {
        this.signalingWebSocket.send(JSON.stringify({
          type: 'ice-candidate',
          from: 'user',
          data: event.candidate
        }));
      }
    };

    // 5. Set agent's offer as remote description
    await this.peerConnection.setRemoteDescription(offer);

    // 6. Create answer
    const answer = await this.peerConnection.createAnswer();
    await this.peerConnection.setLocalDescription(answer);

    // 7. Connect to signaling WebSocket
    this.signalingWebSocket = new WebSocket(signalingUrl);

    this.signalingWebSocket.onopen = () => {
      // Join the signaling channel as user
      this.signalingWebSocket.send(JSON.stringify({
        type: 'join',
        from: 'user',
        data: { peerType: 'user' }
      }));

      // Send our answer
      this.signalingWebSocket.send(JSON.stringify({
        type: 'answer',
        from: 'user',
        data: answer
      }));
    };

    this.signalingWebSocket.onmessage = (event) => {
      this.handleSignalingMessage(JSON.parse(event.data));
    };
  }

  handleSignalingMessage(message) {
    if (message.type === 'ice-candidate') {
      this.peerConnection.addIceCandidate(new RTCIceCandidate(message.data));
    }
  }

  sendCommand(action) {
    if (this.dataChannel?.readyState === 'open') {
      this.dataChannel.send(JSON.stringify({
        type: 'command',
        action
      }));
    }
  }

  handleAgentMessage(message) {
    switch (message.type) {
      case 'status':
        console.log('[Agent]', message.message);
        break;
      case 'location_result':
        console.log('[Agent] Found locations:', message.locations);
        break;
    }
  }
}
```

**Integration with Document Editor:**
```javascript
class DocumentEditor {
  async initializeEditor(documentId) {
    // Existing Y.js initialization
    this.initializeYjs(documentId);

    // NEW: Initialize agent connection
    this.agentConnection = new AgentConnection(documentId);
    await this.agentConnection.connect();

    // Listen for agent messages
    this.agentConnection.on('message', (msg) => {
      this.handleAgentMessage(msg);
    });
  }
}
```

### Phase 5: Testing & Validation

**Test Scenarios:**

1. **Connection Establishment**
   - User joins → Lobby assigns room → Agent spawns → WebRTC connected
   - Verify: Console logs show "Agent connected via WebRTC"

2. **Message Round-Trip**
   - User sends command via DataChannel
   - Agent processes and responds
   - Verify: User receives response within 100ms

3. **Document Sync (Y.js)**
   - Agent creates geo-mark in document
   - Verify: Geo-mark appears in user's editor
   - Verify: Other users see the geo-mark

4. **Disconnect Handling**
   - User closes browser tab
   - Verify: Agent worker exits gracefully
   - Verify: Database records show disconnected status

5. **Multiple Users**
   - Two users join same document
   - Each gets their own agent
   - Verify: Two agent workers running
   - Verify: Both can communicate independently

**Testing Commands:**
```bash
# Terminal 1: Start Durable Object server
cd server && npm run dev:server

# Terminal 2: Start agent manager
cd agent-system && npm run agent-manager

# Terminal 3: Open browser
open http://localhost:5174?doc=test-doc
```

## Dependencies

### Server (`/server/package.json`)
```json
{
  "dependencies": {
    "y-webrtc": "^10.3.0",
    "simple-peer": "^9.11.1"
  }
}
```

### Agent System (`/agent-system/package.json`)
```json
{
  "dependencies": {
    "wrtc": "^0.4.7",
    "express": "^4.18.2"
  }
}
```

## Configuration

### Environment Variables

**Lobby Service (`.dev.vars`):**
```bash
AGENT_MANAGER_URL=http://localhost:3000
```

**Agent Manager (`.env`):**
```bash
LOBBY_URL=ws://localhost:8787/lobby
WS_PORT=8787
```

### Wrangler Configuration

**`/server/wrangler.toml`:**
```toml
[[durable_objects.bindings]]
name = "LOBBY"
class_name = "LobbyRoom"
script_name = "tourvision-server"

[[routes]]
pattern = "*/lobby/*"
custom_domain = true
```

## Security Considerations

1. **Room ID Generation:** Use UUIDs to prevent room ID guessing
2. **Room Lifecycle:** Implement TTL for unused rooms (30 minutes)
3. **Rate Limiting:** Limit room creation requests per IP
4. **STUN/TURN Servers:** Use secure STUN/TURN servers for WebRTC
5. **Message Validation:** Validate all DataChannel messages on agent side

## Performance Considerations

1. **WebRTC Latency:** Typically 20-50ms for DataChannel messages (vs 100-200ms for WebSocket)
2. **Agent Scaling:** One agent per user session, plan for 100+ concurrent agents
3. **Memory Usage:** Agent workers consume ~50MB each, monitor total memory
4. **Connection Pool:** Reuse agent workers when possible (future optimization)

## Future Enhancements

1. **Agent Pooling:** Reuse idle agent workers for new connections
2. **Fallback Mode:** If WebRTC fails, fall back to DO-based messaging
3. **Agent Clustering:** Distribute agent workers across multiple servers
4. **WebRTC Stats:** Monitor connection quality and latency
5. **Reconnection Logic:** Handle temporary disconnections gracefully

## Troubleshooting

### Common Issues

**Issue: WebRTC connection fails**
- Check STUN server accessibility
- Verify firewall rules allow WebRTC traffic
- Check browser console for ICE candidate errors

**Issue: Agent doesn't spawn**
- Verify agent-manager HTTP endpoint is reachable
- Check agent-manager logs for spawn errors
- Verify environment variables are set correctly

**Issue: Messages not received**
- Check DataChannel `readyState` (should be 'open')
- Verify JSON serialization/deserialization
- Check for message size limits (16KB typical limit)

### Debug Logging

Enable verbose logging:
```javascript
// Client
localStorage.setItem('debug', 'agent:*');

// Agent Worker
process.env.DEBUG = 'agent:*';

// Lobby
console.log('[Lobby]', ...);
```

## Migration Strategy

1. **Week 1:** Implement lobby service, test signaling only
2. **Week 2:** Integrate with agent-manager, test agent spawning
3. **Week 3:** Add WebRTC to agent-worker, test end-to-end
4. **Week 4:** Update client, test with real users
5. **Week 5:** Monitor and optimize, remove old DO-based agent messaging

## Success Metrics

- **Latency:** Agent response time < 100ms (vs 200ms+ via DO)
- **Reliability:** 99.9% successful WebRTC connections
- **Scalability:** Support 100+ concurrent agent sessions
- **Resource Usage:** Agent workers < 50MB memory each
