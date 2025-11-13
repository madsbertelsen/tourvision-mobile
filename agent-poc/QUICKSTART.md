# Quick Start Guide

Get the multi-document agent system running locally in 5 minutes.

## Prerequisites

- Docker Desktop running
- Node.js 18+ installed

## Automated Setup (Recommended)

```bash
cd agent-poc
./setup-local.sh
```

This script will:
- ✅ Start local Supabase
- ✅ Apply database migrations
- ✅ Create configuration files
- ✅ Install dependencies
- ✅ Verify setup

## Manual Setup

```bash
# 1. Start Supabase
npx supabase start

# 2. Install dependencies
npm install

# 3. Configure environment
# Copy .env.local.example or create manually:
cat > .env.local <<'EOF'
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_SERVICE_KEY=<from-supabase-status>
MANAGER_ID=manager-local-dev
MAX_CONCURRENT_AGENTS=5
WS_PORT=8787
EOF

# 4. Apply migrations
cd ..
npx supabase db push --local
cd agent-poc
```

## Running the System

### Terminal 1: Durable Object Server
```bash
npm run dev:server
```

### Terminal 2: Agent Manager
```bash
npm run agent-manager
```

### Terminal 3: Test Client (optional)
```bash
npm run dev:client
# Open: http://localhost:8787
```

## Testing

1. **Open a document** in the client
2. **Type text** ending with a period (e.g., "Trip to Paris.")
3. **Watch logs**:
   - Durable Object: Document becomes active
   - Agent Manager: Spawns agent worker
   - Agent Worker: Detects location, creates geo-mark
4. **Close document** and wait 30s
   - Agent detaches automatically

## Expected Logs

### When Opening Document

**Durable Object:**
```
[DO] User connected to test-doc (count: 1)
[DO] ✅ Document test-doc became ACTIVE
```

**Agent Manager:**
```
[Manager] 📨 Activity: active for test-doc (users: 1)
[Manager] 🔄 Spawning agent...
[Manager] ✅ Spawned agent for test-doc (PID: 12345)
```

**Agent Worker:**
```
[Agent Worker] Starting for document: test-doc
[Agent Worker] Synced: true
[Agent Worker] 💡 Period-triggered LLM processing enabled
```

### When Typing Location

```
[Agent] 🔴 Period detected! Triggering LLM processing...
[Agent Worker] 🤖 Calling LLM via AI Gateway...
[Agent] 📍 Found 1 locations
[Agent] Processing: "Paris"
[Agent Worker] ✅ Created geo-mark at 8-13
```

### When Closing Document

```
[DO] User disconnected from test-doc (count: 0)
[DO] Starting 30s idle timeout...
[DO] ✅ Document test-doc became IDLE
[Manager] 📨 Activity: idle for test-doc (users: 0)
[Manager] 🔄 Detaching agent...
```

## Useful Tools

### Supabase Studio
```
http://127.0.0.1:54323
```
View tables, run queries, monitor realtime events

### Check Database
```bash
# Quick status
npx supabase status

# Connect to database
npx supabase db psql

# View active agents
SELECT * FROM agent_connections WHERE status = 'active';

# View activity log
SELECT * FROM document_activity ORDER BY timestamp DESC LIMIT 10;

# System stats
SELECT * FROM get_agent_system_stats();
```

### View Logs
```bash
# Supabase logs
npx supabase logs db

# Agent manager logs
# Visible in Terminal 2

# Durable Object logs
# Visible in Terminal 1
```

## Troubleshooting

### "Docker daemon not running"
```bash
open -a Docker
# Wait for Docker to start
```

### "Tables not found"
```bash
cd ..
npx supabase db reset --local
cd agent-poc
```

### "Agent not spawning"
```bash
# Check .env.local has correct SUPABASE_SERVICE_KEY
npx supabase status
# Copy service_role key to .env.local
```

### "Port 8787 already in use"
```bash
kill -9 $(lsof -ti:8787)
# Or change WS_PORT in .env.local
```

## Common Commands

```bash
# Start services
npx supabase start
npm run dev:server
npm run agent-manager

# Stop services
npx supabase stop
# Ctrl+C in terminals

# Reset database
npx supabase db reset --local

# View status
npx supabase status

# Install dependencies
npm install
```

## Architecture Overview

```
User opens document
    ↓
Durable Object writes to Supabase: event_type='active'
    ↓
Agent Manager subscribes via Realtime, receives event
    ↓
Manager spawns Agent Worker for that document
    ↓
Worker connects to Y.js, monitors for periods
    ↓
On period: Worker runs LLM, creates geo-marks
    ↓
User closes document
    ↓
After 30s: Durable Object writes event_type='idle'
    ↓
Manager detaches Agent Worker
```

## Key Files

- `agent-manager.ts` - Orchestrates workers
- `agent-worker.ts` - Processes individual documents
- `src/server/index.ts` - Durable Object (tracks activity)
- `shared/database.ts` - Supabase client
- `.env.local` - Local configuration
- `.dev.vars` - Cloudflare Workers secrets

## Documentation

- **LOCAL_SETUP.md** - Detailed step-by-step setup guide
- **AGENT_MANAGER_README.md** - Full architecture documentation
- **QUICKSTART.md** - This file (quick reference)

## Next Steps

1. ✅ Run automated setup
2. ✅ Start all services
3. ✅ Test with a document
4. ✅ Check database in Supabase Studio
5. 📚 Read AGENT_MANAGER_README.md for advanced features
6. 🚀 Deploy to production (see deployment guide)

## Support

If you encounter issues:
1. Check troubleshooting section above
2. Read LOCAL_SETUP.md for detailed explanations
3. Check GitHub issues
4. Ask in team chat

---

**Pro Tips:**

- Use separate terminal tabs for each service
- Keep Supabase Studio open to monitor database
- Check logs first when debugging
- The 30s idle timeout prevents rapid agent churn
- Max 5 concurrent agents in local dev (adjust in .env.local)
