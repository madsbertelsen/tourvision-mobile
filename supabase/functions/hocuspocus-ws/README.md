# Hocuspocus WebSocket Edge Function (POC)

**Status**: Proof of Concept
**Purpose**: Demonstrate running Hocuspocus server inside Supabase Edge Functions

## Overview

This Edge Function hosts a Hocuspocus Y.js collaboration server using Deno's WebSocket support. Instead of running a separate Node.js server, everything runs within Supabase infrastructure.

## Architecture

```
Browser Client
    ↓ WebSocket (token in query param)
    ↓
Supabase Edge Function (Deno)
    ├─ Hocuspocus Server (Y.js sync)
    └─ Supabase Client (persistence)
        ↓
    Supabase Database (trips.yjs_state)
```

## Endpoints

### WebSocket Connection
```
ws://127.0.0.1:54321/functions/v1/hocuspocus-ws?token=<JWT_TOKEN>
```

### Health Check
```
http://127.0.0.1:54321/functions/v1/hocuspocus-ws
```

## Authentication

Since WebSocket clients can't send custom headers, authentication uses query parameters:

- **User tokens**: `?token=<supabase_jwt_token>`
- **AI/Service**: `?token=<service_role_key>`

The function validates tokens via `supabase.auth.getUser()` for regular users and accepts service role key for AI Assistant.

## Configuration

In `supabase/config.toml`:
```toml
[edge_runtime]
policy = "per_worker"  # Required for WebSocket persistence
```

**Note**: With `per_worker`, functions won't auto-reload on code changes. You must manually restart:
```bash
# Stop functions
Ctrl+C

# Restart
npx supabase functions serve --env-file ./supabase/.env.local
```

## Client Integration

### Browser (HocuspocusProvider)

**Before** (standalone server):
```javascript
const provider = new HocuspocusProvider({
  url: 'ws://127.0.0.1:1234/collaboration',
  name: tripId,
  document: ydoc,
  token: session.access_token
});
```

**After** (Edge Function):
```javascript
const provider = new HocuspocusProvider({
  url: 'ws://127.0.0.1:54321/functions/v1/hocuspocus-ws',
  name: tripId,
  document: ydoc,
  token: session.access_token,  // Will be sent as query param
});
```

### Edge Functions (AI Generation)

Update `generate-trip-stream` to connect to Edge Function instead of standalone server:

```typescript
const hocuspocusUrl = 'ws://127.0.0.1:54321/functions/v1/hocuspocus-ws';
```

## Testing

1. **Start Supabase**:
   ```bash
   npx supabase start
   ```

2. **Start Edge Functions**:
   ```bash
   npx supabase functions serve --env-file ./supabase/.env.local
   ```

3. **Check health**:
   ```bash
   curl http://127.0.0.1:54321/functions/v1/hocuspocus-ws
   ```

4. **Test WebSocket** (using wscat):
   ```bash
   npm install -g wscat
   wscat -c "ws://127.0.0.1:54321/functions/v1/hocuspocus-ws?token=YOUR_JWT"
   ```

5. **Browser test**:
   - Open trip in app
   - Start collaboration
   - Check Edge Function logs for WebSocket connection

## Advantages

✅ **Unified deployment** - Everything in Supabase
✅ **No separate server** - One less service to manage
✅ **Auto-scaling** - Supabase handles infrastructure
✅ **Built-in monitoring** - Supabase dashboard

## Challenges

⚠️ **Short-lived instances** - Functions timeout after wall-clock/CPU/memory limits
⚠️ **No auto-reload** - Must manually restart during development
⚠️ **Cold starts** - First connection slower than persistent server
⚠️ **State management** - Need to handle reconnections gracefully

## Current Status

### ✅ Implemented
- Hocuspocus instance creation
- WebSocket upgrade handling
- Token authentication (query param)
- Document load/save from Supabase
- Service role key support for AI

### 🚧 To Test
- Actual WebSocket connection from browser
- Y.js sync with multiple clients
- AI generation integration
- Reconnection handling
- Performance under load

### ⚠️ Known Issues
- Deno WebSocket API compatibility with Hocuspocus (needs testing)
- Token extraction from HocuspocusProvider (may need custom implementation)
- Long-running connection stability

## Next Steps

1. Test basic WebSocket connection
2. Verify Y.js sync works correctly
3. Measure cold start latency
4. Implement graceful reconnection in client
5. Load test with multiple concurrent users
6. Compare performance vs standalone server

## Rollback Plan

If Edge Function approach doesn't work well:
1. Keep standalone Hocuspocus server for development
2. Deploy standalone server to production (Railway, Fly.io, etc.)
3. Use environment variable to switch between Edge Function and standalone

## References

- [Supabase WebSocket Docs](https://supabase.com/docs/guides/functions/websockets)
- [Hocuspocus Documentation](https://tiptap.dev/docs/hocuspocus)
- [Edge Runtime Issue #300](https://github.com/supabase/edge-runtime/issues/300)
