# Quick Start - Cloudflare Tunnel Setup

Your Cloudflare Tunnel is now running! Follow these steps to complete the setup.

## Current Tunnel URL

🌐 **https://yjs.tourvision.com**

**Note:** This is a permanent named tunnel configured with your Cloudflare account.

## Next Steps

### 1. Start Local Wrangler Server

In a **new terminal**:

```bash
cd agent-poc
./start-wrangler-local.sh
```

Wait for Wrangler to start (you'll see "Ready on http://0.0.0.0:8787").

### 2. Update Environment Variables

Update `.env.cloudflare`:

```bash
VITE_WS_PROTOCOL=wss
VITE_WS_HOST=yjs.tourvision.com
VITE_WS_PORT=
```

Update `.env.agent-manager`:

```bash
WS_PROTOCOL=wss
WS_HOST=yjs.tourvision.com
WS_PORT=
```

**Already configured in this branch!**

### 3. Build and Deploy Frontend

```bash
npm run build
npm run deploy
```

### 4. Start Agent Manager

In a **new terminal**:

```bash
cd agent-poc
./start-agent-manager.sh
```

### 5. Test the Setup

1. Open the deployed frontend: https://feat-multi-document-agent-ar.tourvision-agent-poc.pages.dev
2. Create a new document
3. Type some text with a location and add a period
4. Verify the agent processes it (check agent manager logs)

## Verify No Cloudflare Usage

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. Navigate to Workers & Pages → Durable Objects
3. Confirm usage stays at 0% (local Durable Objects don't count towards quota)

## Terminal Overview

You should have **3 terminals** running:

```
Terminal 1: ./start-named-tunnel.sh           # Cloudflare Named Tunnel
Terminal 2: ./start-wrangler-local.sh         # Local Wrangler Dev Server
Terminal 3: ./start-agent-manager.sh          # Agent Manager
```

## Troubleshooting

### Tunnel shows registered connections but agents can't connect

**Solution:** Ensure Wrangler is running with `--ip 0.0.0.0` flag (already included in `start-wrangler-local.sh`).

### "ERR Cannot determine default origin certificate path"

This is a warning and can be ignored. The tunnel is still working correctly.

### Agents timeout when connecting

**Solution:**
1. Check Wrangler is running: `curl http://localhost:8787`
2. Check tunnel is forwarding: `curl https://yjs.tourvision.com`
3. Verify environment variables match the tunnel URL

## Stopping Everything

```bash
# Press Ctrl+C in each terminal to stop:
# Terminal 1: Cloudflare Tunnel
# Terminal 2: Wrangler Dev Server
# Terminal 3: Agent Manager
```

## Cost Analysis

With this setup:
- ✅ Cloudflare Durable Objects: **$0/month** (local simulation, unlimited)
- ✅ Cloudflare Tunnel: **$0/month** (free)
- ✅ Cloudflare Pages: **$0/month** (free tier)
- ✅ Supabase: **$0/month** (free tier)

**Total: $0/month** vs $5/month for production Cloudflare Workers Paid plan.

## Setup Complete!

Your production system is now running with:
- ✅ Named Cloudflare Tunnel at `yjs.tourvision.com`
- ✅ Local Durable Objects (unlimited, no costs)
- ✅ Frontend deployed to Cloudflare Pages
- ✅ Agent Manager running in polling mode

For detailed tunnel configuration, see `CLOUDFLARE_TUNNEL_SETUP.md`.
