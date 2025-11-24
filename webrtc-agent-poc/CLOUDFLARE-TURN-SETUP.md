# Cloudflare TURN Setup Guide

## Overview

This guide explains how to set up Cloudflare TURN servers to fix WebRTC connections when devices are on the same network (same public IP).

**Problem:** When iPhone and laptop are both on WiFi (same public IP 78.31.252.157), WebRTC cannot establish P2P connection due to NAT hairpinning limitation.

**Solution:** Use Cloudflare TURN relay servers as a fallback when direct P2P fails.

## Architecture

```
Client Browser
    ↓
GET /api/turn-credentials (from Cloudflare Worker)
    ↓
Cloudflare Worker calls Cloudflare TURN API
    ↓
Returns temporary ICE servers config with credentials
    ↓
Client uses credentials in RTCPeerConnection
    ↓
Browser generates TURN relay candidates
    ↓
WebRTC connection succeeds via TURN relay
```

## Step 1: Create Cloudflare TURN Key

### Option A: Via Dashboard (Recommended)

1. Go to [Cloudflare Calls Dashboard](https://dash.cloudflare.com/?to=/:account/calls)
2. Navigate to **TURN Keys** section
3. Click **Create Key**
4. Give it a name (e.g., "webrtc-agent-poc-turn")
5. Copy the:
   - **uid** (this is your TURN_KEY_ID)
   - **key** (this is your TURN_KEY_API_TOKEN)

### Option B: Via API (Programmatic)

If you prefer to create the key via API:

```bash
# Get your Cloudflare account ID from dashboard
ACCOUNT_ID="your_account_id_here"
CLOUDFLARE_API_TOKEN="your_cloudflare_api_token"

# Create TURN key
curl -X POST "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/calls/turn_keys" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "webrtc-agent-poc-turn"}' | jq
```

**Response:**
```json
{
  "success": true,
  "result": {
    "uid": "2a95132c15732412d22c1476fa83f27a",
    "key": "66bcf64aa8907b9f9d90ac17746a77ce394c393b92b3916633dc02846e608ad4",
    "name": "webrtc-agent-poc-turn",
    "created": "2025-01-24T10:30:00Z",
    "modified": "2025-01-24T10:30:00Z"
  }
}
```

**Important:**
- `uid` → Use as `TURN_KEY_ID`
- `key` → Use as `TURN_KEY_API_TOKEN`

**IMPORTANT:** Keep these secret! Never expose them to browsers or commit to git.

## Step 2: Configure Environment Variables

### For Local Development

Create or edit `/Users/mads/workspace/tourvision-mobile/webrtc-agent-poc/worker/.dev.vars`:

```bash
TURN_KEY_ID=your_turn_key_id_here
TURN_KEY_API_TOKEN=your_turn_api_token_here
```

This file is git-ignored and used by `wrangler dev --local`.

### For Production Deployment

Set secrets using Wrangler CLI:

```bash
cd /Users/mads/workspace/tourvision-mobile/webrtc-agent-poc/worker

# Set TURN_KEY_ID secret
npx wrangler secret put TURN_KEY_ID
# Paste your key ID when prompted

# Set TURN_KEY_API_TOKEN secret
npx wrangler secret put TURN_KEY_API_TOKEN
# Paste your API token when prompted
```

## Step 3: Test the API Endpoint

### Start the server (if not already running):

```bash
cd /Users/mads/workspace/tourvision-mobile/webrtc-agent-poc/worker
npx wrangler dev --local --port 8788
```

### Test the TURN credentials endpoint:

```bash
curl http://localhost:8788/api/turn-credentials | jq
```

**Expected Response:**

```json
{
  "iceServers": [
    {
      "urls": "stun:stun.cloudflare.com:3478"
    },
    {
      "urls": [
        "turn:turn.cloudflare.com:3478?transport=udp",
        "turn:turn.cloudflare.com:3478?transport=tcp",
        "turns:turn.cloudflare.com:5349?transport=tcp",
        "turn:turn.cloudflare.com:80?transport=tcp",
        "turns:turn.cloudflare.com:443?transport=tcp"
      ],
      "username": "1234567890:ephemeralUsername",
      "credential": "someBase64EncodedPassword=="
    }
  ]
}
```

**If you see an error:**

```json
{
  "error": "TURN credentials not configured",
  "message": "Set TURN_KEY_ID and TURN_KEY_API_TOKEN environment variables"
}
```

Make sure you created the `.dev.vars` file with correct credentials.

## Step 4: Update Client to Use TURN Credentials

Now update the client code to fetch TURN credentials from the API:

### Option A: Update test-turn.html (for testing)

I've already added buttons to test Cloudflare TURN. Open http://localhost:8888/test-turn.html and click the Cloudflare buttons.

### Option B: Update main client (client/src/main.ts)

Replace the hardcoded iceServers with dynamic fetching:

```typescript
// Fetch TURN credentials from signaling server
async function fetchTurnCredentials() {
  try {
    const response = await fetch('http://localhost:8788/api/turn-credentials');
    if (!response.ok) {
      console.error('Failed to fetch TURN credentials:', response.status);
      return { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };
    }
    const data = await response.json();
    console.log('✅ Got Cloudflare TURN credentials:', data.iceServers.length, 'servers');
    return data;
  } catch (error) {
    console.error('Error fetching TURN credentials:', error);
    // Fallback to public STUN only
    return { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };
  }
}

// Then in your y-webrtc setup:
const turnConfig = await fetchTurnCredentials();

webrtcProvider = new WebrtcProvider('signaling-room', ydoc, {
  signaling: [`ws://localhost:8788/signaling/${documentId}`],
  peerOpts: {
    config: turnConfig, // Use Cloudflare TURN credentials
    trickle: true,
    connectionTimeout: 30000,
  },
  maxConns: 20 + (isAgent ? 0 : 1),
  filterBcConns: true,
  password: null,
  awareness: awareness,
});
```

## Step 5: Verify TURN Relay Candidates

After updating the client, open the browser console and look for:

```
✅ Got Cloudflare TURN credentials: 2 servers
```

Then watch for ICE candidates:

```javascript
// In client code, add logging:
webrtcProvider.room.webrtcConns.forEach((conn, peerId) => {
  conn.peer.on('icecandidate', (event) => {
    if (event.candidate) {
      const candidate = event.candidate.candidate;
      console.log('ICE Candidate:', candidate);

      // Check for relay candidates
      if (candidate.includes('typ relay')) {
        console.log('✅ RELAY CANDIDATE GENERATED!', candidate);
      }
    }
  });
});
```

**Success indicators:**

1. Console shows: `typ relay` candidates
2. Debug dashboard (`http://localhost:8787/debug`) shows relay candidates in message log
3. iPhone + Laptop on same WiFi can sync documents

## Pricing

- **Free:** First 1,000 GB/month when used with Cloudflare Calls
- **Paid:** $0.05/GB for egress traffic

For development, you'll stay well within the free tier.

## Troubleshooting

### Error: "TURN credentials not configured"

**Cause:** `.dev.vars` file missing or empty

**Fix:**
1. Create `worker/.dev.vars`
2. Add TURN_KEY_ID and TURN_KEY_API_TOKEN
3. Restart `wrangler dev`

### Error: 502 "Failed to generate TURN credentials"

**Cause:** Invalid TURN Key ID or API Token

**Fix:**
1. Go back to [Cloudflare Calls Dashboard](https://dash.cloudflare.com/?to=/:account/calls)
2. Regenerate TURN key
3. Update `.dev.vars` with new credentials

### No relay candidates generated

**Possible causes:**
1. Client not fetching credentials from API (check network tab)
2. Credentials expired (TTL: 24 hours)
3. Browser blocking TURN requests (check console for errors)

**Debug steps:**
1. Open browser DevTools → Network tab
2. Look for request to `/api/turn-credentials`
3. Verify response contains `iceServers` with `username` and `credential`
4. Check browser console for WebRTC errors

### Port 53 warnings

**Expected behavior:** Port 53 is automatically filtered out by the server because Chrome and Firefox block it.

You'll only see ports: 3478, 80, 443, 5349 in the response.

## Next Steps

1. Create Cloudflare TURN key (Step 1)
2. Configure `.dev.vars` (Step 2)
3. Test API endpoint (Step 3)
4. Update client to fetch credentials (Step 4)
5. Verify relay candidates (Step 5)
6. Test iPhone + Laptop on same WiFi

Once completed, your WebRTC connections will work reliably even when devices share the same public IP!
