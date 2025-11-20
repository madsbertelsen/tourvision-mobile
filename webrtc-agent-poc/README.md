# WebRTC Agent POC

Browser-to-browser AI agent system using native WebRTC and y-webrtc for document sync.

## Quick Start

```bash
# Install dependencies
npm install

# Terminal 1: Start Cloudflare Worker (signaling server)
npm run dev:worker

# Terminal 2: Start client
npm run dev:client

# Open browser to http://localhost:5173
```

## What is this?

A proof-of-concept for running AI agents as browser tabs that communicate via WebRTC, eliminating the need for Node.js processes and solving platform compatibility issues.

## Key Features

- ✅ Agents run as browser tabs (no Node.js)
- ✅ Native WebRTC APIs (no platform issues)
- ✅ y-webrtc for P2P document sync
- ✅ Cloudflare Durable Objects for signaling
- ✅ Visible agent tab for easy debugging

## Project Structure

```
webrtc-agent-poc/
├── client/          # Vite + ProseMirror frontend
├── worker/          # Cloudflare Worker signaling server
└── shared/          # Shared TypeScript types
```

## Architecture

```
User Tab ↔ WebRTC (via y-webrtc) ↔ Agent Tab
    ↓ (signaling only)
Cloudflare Durable Object
```

## Documentation

See [CLAUDE.md](./CLAUDE.md) for comprehensive documentation including:
- Architecture diagrams
- Comparison with current system
- Implementation plan
- Integration path

## Development Status

🚧 **POC in progress** - See CLAUDE.md for implementation phases

- [x] Project setup
- [ ] Cloudflare signaling server
- [ ] Basic client with ProseMirror
- [ ] y-webrtc integration
- [ ] Agent command channel
- [ ] Agent executor
- [ ] Auto-open agent tab

## Why This Approach?

The current system uses Playwright headless browsers with WebRTC node modules, which have platform-specific issues. This POC demonstrates that agents can run as regular browser tabs using native WebRTC APIs.

## Related Projects

- Current agent system: `../agent-system/`
- Current frontend: `../frontend-prosemirror/`
- Y.js server: `../server/`
