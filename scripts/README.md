# TourVision Stack Management Scripts

This directory contains scripts to manage the entire TourVision development stack.

## Stack Components

The TourVision stack consists of:

1. **Supabase** (PostgreSQL, Realtime, Auth, Storage, etc.) - Docker Compose
2. **Y-server** (Cloudflare Durable Object for Y.js collaboration) - Wrangler
3. **Agent Manager** (Multi-document agent orchestration) - Docker Compose
4. **Expo App** (React Native web frontend) - Expo CLI

## Available Scripts

### `./scripts/start-stack.sh`
Starts the entire stack in the correct order:
1. Supabase services (database, realtime, auth, etc.)
2. Agent Manager (Docker container)
3. Y-server (Cloudflare Durable Object via Wrangler)
4. Expo web app (development server)

**Usage:**
```bash
./scripts/start-stack.sh
```

**What it does:**
- Checks prerequisites (Docker, Bun, Node.js)
- Starts Supabase via Docker Compose
- Builds and starts Agent Manager container
- Starts Y-server on port 8787
- Starts Expo app on port 8082
- Creates log files in `logs/` directory
- Saves PIDs for later cleanup

### `./scripts/stop-stack.sh`
Stops all services gracefully.

**Usage:**
```bash
./scripts/stop-stack.sh
```

**What it does:**
- Stops Expo app (port 8082)
- Stops Y-server (port 8787)
- Stops Agent Manager container
- Optionally stops Supabase stack (prompts user)

### `./scripts/status-stack.sh`
Shows the status of all services.

**Usage:**
```bash
./scripts/status-stack.sh
```

**What it shows:**
- Which services are running (✓) or stopped (✗)
- Process IDs for running services
- Recent log entries
- Quick action commands

## Prerequisites

Before using these scripts, ensure you have:

- **Docker Desktop** - For Supabase and Agent Manager
- **Bun** - JavaScript/TypeScript runtime (`curl -fsSL https://bun.sh/install | bash`)
- **Node.js & npm** - For Expo (`brew install node`)
- **Wrangler** - Installed via `bun install` in y-server directory

## Environment Variables

Ensure you have the following environment variables configured:

### `.env` (project root - for Docker Compose)
```bash
# Supabase
POSTGRES_PASSWORD=your_password
POSTGRES_DB=postgres
SUPABASE_URL=http://127.0.0.1:54321
ANON_KEY=your_anon_key
SERVICE_ROLE_KEY=your_service_role_key

# Agent Manager
MAX_CONCURRENT_AGENTS=10
IDLE_TIMEOUT_MS=30000
WS_PORT=8787
OPENAI_API_KEY=your_openai_api_key
```

### `expo-app/.env.local`
```bash
EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
EXPO_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
EXPO_PUBLIC_YJS_WS_URL=ws://localhost:8787
```

### `y-server/.env` (optional)
```bash
# Populated from wrangler.toml [env.local.vars]
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_SERVICE_KEY=your_service_role_key
```

## Logs

Logs are stored in the `logs/` directory:

- **`logs/y-server.log`** - Y.js Durable Object server logs
- **`logs/expo.log`** - Expo development server logs
- **Agent Manager logs** - Use `docker compose logs -f agent-manager`
- **Supabase logs** - Use `docker compose logs -f`

### Viewing Logs

```bash
# Y-server logs
tail -f logs/y-server.log

# Expo logs
tail -f logs/expo.log

# Agent Manager logs
docker compose logs -f agent-manager

# All Supabase services
docker compose logs -f

# Specific Supabase service
docker compose logs -f db
docker compose logs -f realtime
```

## Ports

The stack uses the following ports:

- **3000** - Supabase Studio (UI)
- **3001** - Agent Manager metrics
- **5432** - PostgreSQL database
- **8000** - Supabase API Gateway (Kong)
- **8082** - Expo web app
- **8787** - Y-server WebSocket (Durable Object)

## Troubleshooting

### Port already in use

If a port is already in use, the start script will attempt to kill the existing process. If this fails:

```bash
# Find process using port
lsof -ti:8082

# Kill process
kill $(lsof -ti:8082)
```

### Docker containers won't start

```bash
# Check Docker is running
docker ps

# Restart Docker Desktop
# macOS: Click Docker icon → Restart

# Remove old containers
docker compose down
docker compose up -d
```

### Agent Manager build fails

```bash
# Rebuild without cache
docker compose build --no-cache agent-manager

# Check Dockerfile
cat agent-manager/Dockerfile
```

### Y-server won't start

```bash
# Check Wrangler installation
cd y-server
bun install

# Check for errors
cat logs/y-server.log

# Run manually for debugging
bun run dev
```

### Database migrations not applied

```bash
# Apply migrations manually
npx supabase db reset --local

# Or specific migration
npx supabase migration up
```

## Development Workflow

### Starting development

```bash
# Start everything
./scripts/start-stack.sh

# Check status
./scripts/status-stack.sh

# Open app
open http://localhost:8082
```

### During development

```bash
# View logs
tail -f logs/expo.log
tail -f logs/y-server.log
docker compose logs -f agent-manager

# Restart specific service
docker compose restart agent-manager
kill $(lsof -ti:8787) && cd y-server && bun run dev
```

### Stopping development

```bash
# Stop everything (keeps Supabase running)
./scripts/stop-stack.sh

# Or stop everything including Supabase
./scripts/stop-stack.sh
# Answer 'y' when prompted
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     User's Browser                          │
│                   http://localhost:8082                      │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                      Expo App                                │
│                  (React Native Web)                          │
│                    Port: 8082                                │
└─────────────────────────────────────────────────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        ▼                   ▼                   ▼
┌──────────────┐  ┌──────────────────┐  ┌──────────────────┐
│  Supabase    │  │    Y-server      │  │  Agent Manager   │
│   (Docker)   │  │ (Durable Object) │  │    (Docker)      │
│  Port: 8000  │  │  Port: 8787      │  │   Port: 3001     │
└──────────────┘  └──────────────────┘  └──────────────────┘
       │                   │                      │
       └───────────────────┴──────────────────────┘
                           │
                           ▼
                  ┌──────────────────┐
                  │   PostgreSQL     │
                  │  (Supabase DB)   │
                  │   Port: 5432     │
                  └──────────────────┘
```

## Contributing

When adding new services:

1. Update `start-stack.sh` to start the service
2. Update `stop-stack.sh` to stop the service
3. Update `status-stack.sh` to check service status
4. Update this README with port and environment variable info
5. Add service to `docker-compose.yml` if containerized
