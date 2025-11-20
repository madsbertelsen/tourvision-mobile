# WebRTC Agent POC - Browser-to-Browser AI Agents

## Project Overview

This is a proof-of-concept for a **browser-to-browser agent system** where AI agents run as browser tabs that communicate with user tabs via WebRTC. This eliminates the need for Node.js agent processes and solves platform compatibility issues with WebRTC native modules.

### What Problem Does This Solve?

The current agent system uses:
- **Node.js agents** running in separate processes (Playwright headless browsers)
- **WebSocket-based Y.js** for document sync
- **WebRTC node modules** for potential future P2P communication

**Problems with this approach:**
1. WebRTC node modules have platform-specific native dependencies
2. Complex infrastructure (agent manager, process spawning, Playwright)
3. Difficult to debug (headless browsers)
4. Requires Node.js runtime for agents

### The WebRTC-Native Solution

This POC demonstrates:
- **Agents as browser tabs** - No Node.js processes needed
- **Native WebRTC APIs** - Browser-native, no platform issues
- **y-webrtc for Y.js sync** - Direct P2P document sync via WebRTC
- **Cloudflare Durable Objects** - Stateful signaling server
- **Visible agent tab** - Easy debugging and inspection

## Architecture

### High-Level Flow

```
User opens document (localhost:5173)
    ↓
Auto-opens agent tab (localhost:5173?agent=true)
    ↓
Both tabs connect via Cloudflare signaling server (localhost:8788)
    ↓
y-webrtc establishes P2P connection for document sync
    ↓
Separate WebRTC data channel for agent commands
    ↓
User tab sends LLM prompts → Agent tab executes → Returns results
    ↓
Agent tab closes when user tab closes
```

### Components

#### 1. Client (Vite + ProseMirror)
- **Single application** serves both user and agent modes
- Detects `?agent=true` query parameter
- User mode: Opens agent tab, initiates WebRTC
- Agent mode: Accepts WebRTC, executes commands

#### 2. Y.js Sync via y-webrtc
- **No WebSocket server needed**
- Direct P2P CRDT sync between tabs
- Built-in awareness for cursor positions
- Uses WebRTC data channels

#### 3. Agent Command Channel
- **Separate WebRTC connection** from y-webrtc
- User tab sends prompts: `{type: 'execute', prompt: '...'}`
- Agent tab processes and returns results
- Bidirectional communication

#### 4. Cloudflare Signaling Server
- **Durable Object per document**
- Stores offers/answers/ICE candidates
- Stateful signaling for WebRTC handshake
- HTTP REST API (not WebSocket)

### Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                     User Tab (Browser)                       │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ ProseMirror Editor                                   │   │
│  │ - Edit document                                      │   │
│  │ - Trigger agent actions                              │   │
│  └──────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ y-webrtc Provider                                    │   │
│  │ - P2P document sync                                  │   │
│  │ - Awareness (cursors)                                │   │
│  └──────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ WebRTC Agent Channel                                 │   │
│  │ - Send prompts to agent                              │   │
│  │ - Receive results                                    │   │
│  └──────────────────────────────────────────────────────┘   │
└───────────────────┬──────────────────────────────────────────┘
                    │ WebRTC Data Channels
                    │
┌───────────────────┴──────────────────────────────────────────┐
│                    Agent Tab (Browser)                        │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ ProseMirror Editor (read-only/hidden)                │   │
│  │ - Synced with user tab                               │   │
│  └──────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ y-webrtc Provider                                    │   │
│  │ - P2P document sync                                  │   │
│  │ - Observes document changes                          │   │
│  └──────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ Agent Executor                                       │   │
│  │ - Listen for commands                                │   │
│  │ - Execute LLM prompts                                │   │
│  │ - Create geo-marks                                   │   │
│  │ - Return results                                     │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘

                    ↕ (Signaling only)

┌─────────────────────────────────────────────────────────────┐
│          Cloudflare Durable Object (Signaling)               │
│  - Store WebRTC offers/answers/ICE candidates                │
│  - One DO instance per document                              │
│  - HTTP REST endpoints                                       │
└─────────────────────────────────────────────────────────────┘
```

## Comparison: Current System vs POC

### Current System (agent-system/)

**Architecture:**
```
User Browser → WebSocket → Y.js Server (Durable Object)
                              ↕
                     Node.js Agent Manager
                              ↓
              Playwright Headless Browser Agents
                  (WebRTC node modules)
```

**Stack:**
- Node.js agent processes
- Playwright for browser agents
- y-websocket for Y.js sync
- WebSocket server (Durable Object)
- Agent manager for orchestration
- Supabase for agent coordination

**Pros:**
- Server-side agent execution
- Agents can use Node.js APIs
- Centralized management

**Cons:**
- WebRTC node modules have platform issues
- Complex infrastructure (many moving parts)
- Requires Node.js runtime
- Difficult to debug (headless)
- Process management overhead

### This POC (webrtc-agent-poc/)

**Architecture:**
```
User Browser Tab ↔ WebRTC ↔ Agent Browser Tab
        ↕ (signaling only)
  Cloudflare Durable Object
```

**Stack:**
- Browser tabs only (no Node.js processes)
- Native WebRTC APIs
- y-webrtc for Y.js sync
- Cloudflare Durable Object (signaling only)
- Vite for client bundling

**Pros:**
- No platform compatibility issues
- Simpler architecture (fewer components)
- Native browser WebRTC
- Easy to debug (visible tab)
- No process management
- Direct P2P sync

**Cons:**
- Agent logic must run in browser
- LLM API calls from browser (CORS, API keys)
- Agent tab visible (though good for debugging)
- Limited to browser APIs

## Technical Stack

### Frontend
- **Vite** - Fast dev server and bundler
- **ProseMirror** - Rich text editor
- **Y.js** - CRDT for collaborative editing
- **y-prosemirror** - ProseMirror bindings for Y.js
- **y-webrtc** - WebRTC provider for Y.js (replaces y-websocket)
- **AI SDK (Vercel)** - LLM integration (optional)

### Backend
- **Cloudflare Workers** - Edge compute platform
- **Durable Objects** - Stateful serverless objects
- **Wrangler** - Cloudflare dev/deploy tool

### Key Dependencies

```json
{
  "client": {
    "vite": "^6.0.0",
    "prosemirror-model": "^1.23.0",
    "prosemirror-state": "^1.4.3",
    "prosemirror-view": "^1.34.0",
    "yjs": "^13.6.0",
    "y-prosemirror": "^1.2.0",
    "y-webrtc": "^10.3.0"
  },
  "worker": {
    "@cloudflare/workers-types": "^4.0.0",
    "wrangler": "^3.0.0"
  }
}
```

## Implementation Plan

### Phase 1: Project Setup
- [x] Create folder structure
- [ ] Set up npm workspaces
- [ ] Create basic Vite app
- [ ] Set up Cloudflare Worker project

### Phase 2: Cloudflare Signaling Server
- [ ] Implement Durable Object for signaling
- [ ] Add REST endpoints (offer/answer/ICE)
- [ ] Deploy locally with Wrangler
- [ ] Test signaling flow

### Phase 3: Basic Client
- [ ] Set up Vite with ProseMirror
- [ ] Add basic editor UI
- [ ] Implement document routing (?doc=id)
- [ ] Add agent mode detection (?agent=true)

### Phase 4: y-webrtc Integration
- [ ] Add y-webrtc provider
- [ ] Configure signaling (use y-webrtc's default or ours)
- [ ] Test P2P document sync between tabs
- [ ] Verify cursor awareness

### Phase 5: Agent Command Channel
- [ ] Create separate RTCPeerConnection for commands
- [ ] Implement offer/answer via Cloudflare DO
- [ ] User tab: Send command messages
- [ ] Agent tab: Receive and acknowledge

### Phase 6: Agent Executor
- [ ] Listen for document changes (Y.js observeDeep)
- [ ] Period detection (trigger on ".")
- [ ] LLM integration (placeholder or real API)
- [ ] Create geo-marks via ProseMirror

### Phase 7: Auto-Open Agent Tab
- [ ] User tab: Open new window on load
- [ ] Agent tab: Connect and wait for commands
- [ ] Handle tab closure (beforeunload)
- [ ] Agent tab auto-closes with user tab

### Phase 8: Testing & Polish
- [ ] Test multi-tab sync
- [ ] Test agent command execution
- [ ] Add error handling
- [ ] Add loading states
- [ ] Document findings

## How This Fits in the Big Picture

### Current Project Structure

```
tourvision-mobile/
├── agent-system/           # Playwright-based agents (current)
├── agent-poc/              # Node.js agent manager (current)
├── frontend-prosemirror/   # Y.js with WebSocket (current)
├── server/                 # Cloudflare DO for Y.js (current)
└── webrtc-agent-poc/       # THIS POC (standalone)
```

### Future Integration Path

**If this POC succeeds:**

1. **Replace agent-system/** with browser-based agents
2. **Keep server/** Durable Object, add signaling endpoints
3. **Migrate frontend-prosemirror/** to y-webrtc
4. **Remove agent-poc/** (Node.js agent manager no longer needed)

**Migration would involve:**
- Copying ProseMirror schema from frontend-prosemirror
- Copying geo-mark logic
- Updating server Durable Object to add signaling routes
- Deprecating WebSocket Y.js in favor of y-webrtc

### What We Can Reuse

**From frontend-prosemirror/:**
- ProseMirror schema and plugins
- Geo-mark NodeView implementation
- Editor styling and UI components

**From server/:**
- Durable Object infrastructure (add signaling)
- WebSocket fallback (if y-webrtc fails)

**From agent-poc/:**
- LLM prompt engineering
- Location detection logic
- Geocoding utilities

## Development Setup

### Prerequisites

- Node.js 18+
- npm 9+
- Cloudflare account (for deployment, not required for local)

### Installation

```bash
# Install dependencies
cd webrtc-agent-poc
npm install

# Start Cloudflare Worker (signaling server)
npm run dev:worker  # Port 8787

# Start client (separate terminal)
npm run dev:client  # Port 5173
```

### Project Structure (To Be Created)

```
webrtc-agent-poc/
├── package.json                    # Root workspace
├── CLAUDE.md                       # This file
├── README.md                       # Quick start guide
├── .gitignore
├── client/                         # Frontend
│   ├── package.json
│   ├── vite.config.js
│   ├── index.html
│   └── src/
│       ├── main.js                 # Entry point
│       ├── editor.js               # ProseMirror setup
│       ├── y-webrtc-setup.js       # Y.js WebRTC provider
│       ├── agent-channel.js        # Separate WebRTC for commands
│       └── agent-executor.js       # Agent logic
├── worker/                         # Cloudflare Worker
│   ├── package.json
│   ├── wrangler.toml
│   └── src/
│       ├── index.ts                # Worker entry
│       └── SignalingDO.ts          # Durable Object
└── shared/                         # Shared code
    ├── package.json
    └── types.ts                    # TypeScript types
```

## Key Decisions & Trade-offs

### Decision 1: y-webrtc vs y-websocket

**Chosen:** y-webrtc

**Reasoning:**
- Native WebRTC in browser (no compatibility issues)
- Direct P2P sync (no server intermediary)
- Eliminates WebSocket server for document sync
- Built-in signaling support

**Trade-off:**
- Requires signaling server for initial connection
- P2P may have firewall/NAT issues (can fallback to WebSocket)

### Decision 2: Separate WebRTC Channel for Agent Commands

**Chosen:** Separate RTCPeerConnection for commands

**Reasoning:**
- y-webrtc handles Y.js sync internally
- Agent commands are separate concern
- Cleaner separation of concerns
- Easier debugging

**Trade-off:**
- Two WebRTC connections per tab
- Slightly more complex setup

### Decision 3: Cloudflare Durable Object for Signaling

**Chosen:** Durable Object with REST API

**Reasoning:**
- Stateful (stores offers/answers/ICE)
- Scalable (Cloudflare edge network)
- Familiar stack (already using Durable Objects)
- Simple HTTP endpoints (no WebSocket needed)

**Trade-off:**
- Requires Cloudflare account for deployment
- Polling for answers (could use WebSocket for real-time)

### Decision 4: Visible Agent Tab

**Chosen:** Visible tab (not hidden)

**Reasoning:**
- Easy debugging (can inspect agent state)
- Can see document sync in real-time
- User can verify agent is working
- Simpler implementation (no hidden window tricks)

**Trade-off:**
- Agent tab visible in browser
- Could distract user (but useful for development)

## Success Criteria

This POC is considered successful if:

1. ✅ Two browser tabs can sync a ProseMirror document via y-webrtc
2. ✅ User tab can send commands to agent tab via WebRTC
3. ✅ Agent tab can detect periods and trigger processing
4. ✅ Agent tab can create geo-marks in the shared document
5. ✅ No Node.js processes required (pure browser)
6. ✅ No platform-specific WebRTC issues

## Next Steps

1. **Implement Phase 1-4** to validate y-webrtc sync
2. **Test across browsers** (Chrome, Firefox, Safari)
3. **Measure performance** (sync latency, WebRTC overhead)
4. **Compare with current system** (pros/cons)
5. **Decision point:** Proceed with full implementation or iterate

## References

- [y-webrtc Documentation](https://github.com/yjs/y-webrtc)
- [WebRTC API (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API)
- [Cloudflare Durable Objects](https://developers.cloudflare.com/durable-objects/)
- [ProseMirror Guide](https://prosemirror.net/docs/guide/)
- Current agent-system implementation: `/agent-system`
- Current frontend: `/frontend-prosemirror`
