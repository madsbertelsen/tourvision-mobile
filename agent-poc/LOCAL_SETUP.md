# Local Development Setup for Multi-Document Agent System

This guide walks you through setting up the complete agent management system on your local machine.

## Prerequisites

- **Docker Desktop** - For running local Supabase
- **Node.js 18+** - For running the agent manager and workers
- **npm** or **bun** - Package manager

## Step-by-Step Setup

### 1. Start Docker Desktop

Make sure Docker Desktop is running:

```bash
# Check if Docker is running
docker ps

# If not running, start Docker Desktop application
open -a Docker
```

Wait for Docker to fully start before proceeding.

### 2. Start Local Supabase

From the project root directory:

```bash
# Start local Supabase (includes PostgreSQL, Auth, Storage, etc.)
npx supabase start

# This will:
# - Pull Docker images if not already cached
# - Start PostgreSQL, PostgREST, GoTrue, Realtime, etc.
# - Apply existing migrations
# - Take 1-2 minutes on first run
```

Expected output:
```
Started supabase local development setup.

         API URL: http://127.0.0.1:54321
     GraphQL URL: http://127.0.0.1:54321/graphql/v1
  S3 Storage URL: http://127.0.0.1:54321/storage/v1/s3
          DB URL: postgresql://postgres:postgres@127.0.0.1:54322/postgres
      Studio URL: http://127.0.0.1:54323
    Inbucket URL: http://127.0.0.1:54324
      JWT secret: super-secret-jwt-token-with-at-least-32-characters-long
        anon key: eyJhbGc...
service_role key: eyJhbGc...
   S3 Access Key: ...
   S3 Secret Key: ...
```

**Save these credentials** - you'll need them for configuration.

### 3. Apply Agent Connections Migration

The migration should have been applied automatically when Supabase started, but you can verify:

```bash
# Check migration status
npx supabase migration list

# If migration not applied, run:
npx supabase db push --local
```

Verify tables were created:

```bash
# Connect to local database
npx supabase db psql

# Run in psql:
\dt

# You should see:
# - agent_connections
# - document_activity
# - agent_metrics

# Exit psql:
\q
```

### 4. Configure Environment Variables

Create/update `agent-poc/.env.local` for local development:

```bash
cd agent-poc

# Create .env.local (takes precedence over .env)
cat > .env.local <<'EOF'
# AI Gateway (from .env)
AI_GATEWAY_API_KEY=vck_82JI3qAye8mrCTtSWuAZVSpFuYfHM8rXME6txFTlcvQ2DXuoGf0YoJkV

# Local Supabase Configuration
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_SERVICE_KEY=<paste-service-role-key-from-supabase-start>

# Agent Manager Configuration
MANAGER_ID=manager-local-dev
MAX_CONCURRENT_AGENTS=5
IDLE_TIMEOUT_MS=30000

# WebSocket Configuration
WS_PORT=8787
PARTY_NAME=document
EOF
```

**Important**: Replace `<paste-service-role-key-from-supabase-start>` with the actual service_role key from step 2.

### 5. Configure Cloudflare Workers for Local Development

Update `agent-poc/.dev.vars` with local Supabase credentials:

```bash
# Create/update .dev.vars
cat > .dev.vars <<'EOF'
# Local Supabase service role key for Durable Objects
SUPABASE_SERVICE_KEY=<paste-service-role-key-from-supabase-start>
EOF
```

Update `wrangler.toml` to use local Supabase URL:

```bash
# Edit wrangler.toml and change SUPABASE_URL to local:
# [vars]
# SUPABASE_URL = "http://127.0.0.1:54321"
```

Or create a `wrangler.dev.toml` for local overrides:

```bash
cat > wrangler.dev.toml <<'EOF'
name = "partyserver-fixture-tiptap-yjs"
main = "src/server/index.ts"
compatibility_date = "2024-04-19"

# Local Supabase URL
[vars]
SUPABASE_URL = "http://127.0.0.1:54321"

[[durable_objects.bindings]]
name = "Document"
class_name = "Document"

[[migrations]]
tag = "v1"
new_sqlite_classes = ["Document"]
EOF
```

### 6. Install Dependencies

```bash
cd agent-poc

# Install all dependencies
npm install

# Or with bun:
bun install
```

New dependencies installed:
- `@supabase/supabase-js` - Supabase client
- `uuid` - For generating unique IDs
- `@types/uuid` - TypeScript types

### 7. Build TypeScript Files

```bash
# Compile TypeScript to JavaScript
npm run build:manager
npm run build:worker

# Or compile on-the-fly with tsx (development mode)
# No build needed, tsx compiles TypeScript at runtime
```

## Running the System

Now you're ready to start the complete system!

### Terminal 1: Start Cloudflare Workers (Durable Object Server)

```bash
cd agent-poc
npm run dev:server
```

Expected output:
```
⛅️ wrangler 3.x.x
-------------------
⎔ Starting local server...
[wrangler:inf] Ready on http://localhost:8787
```

This starts the Durable Object server that manages Y.js documents and WebSocket connections.

### Terminal 2: Start Agent Manager

```bash
cd agent-poc
npm run agent-manager
```

Expected output:
```
╔══════════════════════════════════════════════════════╗
║         Agent Manager - Multi-Document System       ║
╚══════════════════════════════════════════════════════╝

[Manager] ID: manager-local-dev
[Manager] Host: your-macbook.local
[Manager] Max Concurrent: 5
[Manager] Idle Timeout: 30000ms

[Manager] 🔍 Recovering agents from previous session...
[Manager] ℹ️  No existing agents to recover
[Manager] 📡 Subscribing to Supabase Realtime...
[Manager] 🚀 Ready to manage agents
[Manager] Listening for document activity events...
```

The manager is now waiting for document activity events from Supabase.

### Terminal 3: Test with tiptap-yjs-test Client

```bash
cd agent-poc
npm run dev:client
```

Or open the test client in your browser:
```
http://localhost:8787
```

Connect to a test document and type some text ending with a period (`.`).

## Testing the Complete Flow

### 1. Open a Document

In your browser, navigate to the tiptap-yjs-test client and connect to a document (e.g., `test-document-1`).

**Expected logs:**

**Durable Object (Terminal 1):**
```
[DO] User connected to test-document-1 (count: 1)
[DO] ✅ Document test-document-1 became ACTIVE
```

**Agent Manager (Terminal 2):**
```
[Manager] 📨 Activity: active for test-document-1 (users: 1)
[Manager] 🔄 Spawning agent agent-test-document-1-1731456789...
[Manager] ✅ Spawned agent for test-document-1 (PID: 12345)
```

**Agent Worker logs (in Terminal 2):**
```
[Agent Worker] Starting for document: test-document-1
[Agent Worker] Agent ID: agent-test-document-1-1731456789
[Agent Worker] Synced: true
[Agent Worker] 💡 Period-triggered LLM processing enabled
```

### 2. Type Text with Location

Type: "We're going to Copenhagen."

**Expected logs:**

**Agent Worker:**
```
[Agent] 🔴 Period detected! Triggering LLM processing...
[Agent Worker] 🤖 Calling LLM via AI Gateway...
[Agent] 📍 Found 1 locations
[Agent] Processing: "Copenhagen"
[Agent] 🔧 Geocoding "Copenhagen, Denmark"
[Agent Worker] ✅ Created geo-mark at 17-27
[Agent] ✅ All locations processed
```

**Agent Manager:**
```
[Manager] ✅ Agent agent-test-document-1-... connected and synced
# (Metrics updates every 30s)
```

### 3. Close the Document

Close the browser tab.

**Expected logs:**

**Durable Object (Terminal 1):**
```
[DO] User disconnected from test-document-1 (count: 0)
[DO] Starting 30s idle timeout for test-document-1
# (After 30 seconds)
[DO] ✅ Document test-document-1 became IDLE
```

**Agent Manager (Terminal 2):**
```
[Manager] 📨 Activity: idle for test-document-1 (users: 0)
[Manager] 🔄 Detaching agent from test-document-1 (Document became idle)
[Manager] 🛑 Agent agent-test-document-1-... exited (code: 0, signal: null)
```

### 4. Check Database State

Open Supabase Studio:
```
http://127.0.0.1:54323
```

Navigate to **Table Editor** and check:

**agent_connections:**
- Should show disconnected agent with `status: 'disconnected'`
- Check `llm_calls_count` and `locations_marked_count`

**document_activity:**
- Should show events: `active` and `idle` for your document
- Check timestamps

**agent_metrics:**
- Should show periodic metrics (every 30s)
- Check memory_mb and cpu_percent values

## Troubleshooting

### Docker not running

**Symptom:**
```
Cannot connect to the Docker daemon at unix:///Users/.../.docker/run/docker.sock
```

**Solution:**
```bash
# Start Docker Desktop
open -a Docker

# Wait for Docker to fully start
docker ps
```

### Supabase migration not applied

**Symptom:** Tables don't exist when checking with `\dt`

**Solution:**
```bash
# Reset database and apply all migrations
npx supabase db reset --local

# Or just push migrations
npx supabase db push --local
```

### Agent manager can't connect to Supabase

**Symptom:**
```
[DB] Failed to register agent: connection refused
```

**Solution:**
1. Check Supabase is running: `npx supabase status`
2. Verify `SUPABASE_URL=http://127.0.0.1:54321` in `.env.local`
3. Verify `SUPABASE_SERVICE_KEY` matches output from `npx supabase status`

### Durable Object not writing to Supabase

**Symptom:** No activity events in `document_activity` table

**Solution:**
1. Check `.dev.vars` has correct `SUPABASE_SERVICE_KEY`
2. Verify `wrangler.toml` has `SUPABASE_URL = "http://127.0.0.1:54321"`
3. Check Durable Object logs for errors
4. Restart `npm run dev:server` after changing `.dev.vars`

### Agent worker not spawning

**Symptom:** Manager receives activity event but doesn't spawn agent

**Solution:**
1. Check max concurrent limit: `MAX_CONCURRENT_AGENTS=5` in `.env.local`
2. Check for orphaned agents: Query `agent_connections` table
3. Check manager logs for spawn errors
4. Verify `agent-worker.js` exists in `dist/` directory (run `npm run build:worker`)

### TypeScript compilation errors

**Symptom:**
```
Cannot find module 'uuid' or its corresponding type declarations
```

**Solution:**
```bash
# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install

# Or with bun:
rm -rf node_modules bun.lockb
bun install
```

### Port conflicts

**Symptom:**
```
Error: listen EADDRINUSE: address already in use :::8787
```

**Solution:**
```bash
# Find process using port 8787
lsof -ti:8787

# Kill the process
kill -9 $(lsof -ti:8787)

# Or change WS_PORT in .env.local
WS_PORT=8788
```

## Useful Commands

### Database Queries

```bash
# Connect to local database
npx supabase db psql

# Then run queries:
SELECT * FROM agent_connections;
SELECT * FROM document_activity ORDER BY timestamp DESC LIMIT 10;
SELECT * FROM agent_metrics ORDER BY recorded_at DESC LIMIT 20;
SELECT * FROM get_agent_system_stats();
```

### View Logs

```bash
# Supabase logs
npx supabase logs db

# Agent Manager logs (already visible in terminal)

# Durable Object logs (already visible in terminal)
```

### Reset Database

```bash
# Reset to clean state (applies migrations and seed.sql)
npx supabase db reset --local

# Apply migrations only
npx supabase db push --local
```

### Stop Services

```bash
# Stop Supabase
npx supabase stop

# Stop Agent Manager
# Ctrl+C in terminal (graceful shutdown)

# Stop Durable Object server
# Ctrl+C in terminal
```

## Development Workflow

### Making Changes to Agent Code

1. **Edit TypeScript files** (`agent-worker.ts`, `agent-manager.ts`)
2. **Restart processes** - tsx will recompile automatically, or run build scripts
3. **Test changes** by opening/closing documents

### Adding New Migrations

```bash
# Create new migration
npx supabase migration new add_new_feature

# Edit the migration file in supabase/migrations/

# Apply migration
npx supabase db push --local
```

### Viewing Realtime Events

```bash
# In Supabase Studio (http://127.0.0.1:54323)
# Go to Database > Realtime
# Enable realtime for document_activity table
# Monitor events in real-time
```

## Production vs Local Configuration

| Setting | Local | Production |
|---------|-------|------------|
| SUPABASE_URL | http://127.0.0.1:54321 | https://unocjfiipormnaujsuhk.supabase.co |
| SUPABASE_SERVICE_KEY | From `supabase status` | From Supabase dashboard |
| MANAGER_ID | manager-local-dev | manager-prod-01 |
| MAX_CONCURRENT_AGENTS | 5 (lower for dev) | 10+ (based on capacity) |
| WS_PORT | 8787 (wrangler dev) | 443 (production URL) |

## Next Steps

Once local setup is working:

1. **Test with multiple documents** - Open multiple browser tabs with different document IDs
2. **Test concurrent limit** - Open more than `MAX_CONCURRENT_AGENTS` documents
3. **Test crash recovery** - Kill agent manager and restart, verify orphaned agents are cleaned up
4. **Test metrics** - Check database for agent_metrics entries
5. **Deploy to production** - See AGENT_MANAGER_README.md for deployment instructions

## Resources

- [Supabase Local Development Docs](https://supabase.com/docs/guides/cli/local-development)
- [Cloudflare Wrangler Docs](https://developers.cloudflare.com/workers/wrangler/)
- [Y.js Documentation](https://docs.yjs.dev/)
- [ProseMirror Guide](https://prosemirror.net/docs/guide/)
