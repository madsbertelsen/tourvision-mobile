# TourVision Hocuspocus Server

WebSocket collaboration server for Y.js document synchronization with Supabase persistence.

## Architecture

- **Hocuspocus**: Handles Y.js CRDT synchronization over WebSocket
- **Supabase**:
  - Authentication (validates JWT tokens)
  - Persistence (stores Y.js state in `trips.yjs_state` column)
  - All other data (trips, places, chat, users, etc.)

## Setup

1. **Install dependencies**:
   ```bash
   cd hocuspocus-server
   npm install
   ```

2. **Configure environment**:
   ```bash
   cp .env.example .env
   ```

   Edit `.env` and set:
   - `SUPABASE_URL` - Your Supabase URL (same as main app)
   - `SUPABASE_SERVICE_ROLE_KEY` - Service role key (from `npx supabase status`)
   - `PORT` - Server port (default: 1234)

3. **Start the server**:
   ```bash
   npm run dev
   ```

   Server will start on `ws://127.0.0.1:1234/collaboration`

## How It Works

### Authentication
- Client sends Supabase JWT token in connection params
- Server validates token with `supabase.auth.getUser(token)`
- If valid, connection is established

### Document Loading
- When client connects, server loads Y.js state from `trips.yjs_state`
- If no state exists, creates new empty document
- Y.js state is stored as binary (bytea) in Postgres

### Document Saving
- Server automatically saves document changes (debounced)
- Saves every 2 seconds after changes
- Force saves after 10 seconds even if still changing
- Updates `trips.yjs_state`, `yjs_clock`, and `updated_at`

### Real-Time Sync
- Multiple clients connect to same document ID
- Hocuspocus broadcasts Y.js updates to all connected clients
- CRDT ensures conflict-free merging

## API

### Health Check
```bash
GET http://127.0.0.1:1234/
```

Returns server status and configuration.

### WebSocket Connection
```
ws://127.0.0.1:1234/collaboration
```

Client connects with:
- Document name (trip ID)
- Authentication token (Supabase JWT)

## Integration with Expo App

In the Expo app, replace the custom `YSupabaseProvider` with `HocuspocusProvider`:

```javascript
import { HocuspocusProvider } from '@hocuspocus/provider';

const provider = new HocuspocusProvider({
  url: 'ws://127.0.0.1:1234/collaboration',
  name: tripId, // Document ID
  document: ydoc,
  token: session.access_token // Supabase JWT
});
```

## Database Schema

Uses existing `trips` table columns:
- `yjs_state` (bytea) - Y.js document state as binary
- `yjs_clock` (integer) - Version/timestamp for tracking updates
- `updated_at` (timestamp) - Last update time

## Development

### Logs
Server logs all operations:
- Authentication attempts
- Document loads/saves
- Client connections/disconnections
- Errors

### Testing
```bash
# Start Supabase
npx supabase start

# Start Hocuspocus server
cd hocuspocus-server
npm run dev

# Start Expo app
cd expo-app
npx expo start --web
```

## Deployment

For production:
1. Deploy to a Node.js hosting service (Render, Railway, Fly.io, etc.)
2. Set environment variables
3. Update Expo app with production WebSocket URL
4. Ensure WebSocket connections are allowed (check firewall/proxy)

## Troubleshooting

**Connection refused**:
- Check server is running on correct port
- Verify WebSocket URL in client

**Authentication failed**:
- Verify Supabase URL and service role key
- Check token is valid (not expired)
- Ensure user exists in Supabase

**Document not loading**:
- Check trip ID exists in database
- Verify RLS policies allow access
- Check server logs for errors
