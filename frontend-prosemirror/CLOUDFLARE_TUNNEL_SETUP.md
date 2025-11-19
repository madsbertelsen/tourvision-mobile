# Cloudflare Tunnel Setup - Local Durable Objects

This setup allows you to run Durable Objects locally (unlimited usage) while exposing them via a public HTTPS URL using Cloudflare Tunnel.

## Architecture

```
Browser/Agents → Cloudflare Tunnel (HTTPS) → Local Wrangler Dev Server (localhost:8787) → Local Durable Objects
```

**Benefits:**
- ✅ No Cloudflare Durable Objects usage limits
- ✅ Public HTTPS URL for production use
- ✅ Same codebase as production
- ✅ Free (Cloudflare Tunnel is free)

## Prerequisites

- `cloudflared` installed (already done via Homebrew)
- Cloudflare account
- Local Wrangler dev server running

## Quick Start

### 1. Start Local Wrangler Server

```bash
cd agent-poc
npx wrangler dev --local --port 8787 --ip 0.0.0.0
```

This starts the local Durable Objects simulation on port 8787.

### 2. Start Cloudflare Tunnel (Quick Method)

In a separate terminal:

```bash
cloudflared tunnel --url http://localhost:8787
```

This will output a temporary public URL like:
```
https://random-name.trycloudflare.com
```

**Note:** This URL changes every time you restart the tunnel. For a permanent URL, see "Named Tunnel Setup" below.

### 3. Update Environment Variables

Update `.env.cloudflare` with the tunnel URL:

```bash
VITE_WS_PROTOCOL=wss
VITE_WS_HOST=random-name.trycloudflare.com
VITE_WS_PORT=
```

Update `.env.agent-manager` with the tunnel URL:

```bash
WS_PROTOCOL=wss
WS_HOST=random-name.trycloudflare.com
WS_PORT=
```

### 4. Rebuild and Deploy Frontend

```bash
npm run build
npm run deploy
```

### 5. Restart Agent Manager

```bash
./start-agent-manager.sh
```

## Named Tunnel Setup (Permanent URL)

For a permanent URL that doesn't change:

### 1. Login to Cloudflare

```bash
cloudflared tunnel login
```

### 2. Create a Named Tunnel

```bash
cloudflared tunnel create tourvision-local
```

This will output a tunnel ID. Save it.

### 3. Create Tunnel Configuration

Create `~/.cloudflared/config.yml`:

```yaml
tunnel: <YOUR_TUNNEL_ID>
credentials-file: /Users/mads/.cloudflared/<YOUR_TUNNEL_ID>.json

ingress:
  - hostname: tourvision.yourdomain.com
    service: http://localhost:8787
  - service: http_status:404
```

### 4. Create DNS Record

```bash
cloudflared tunnel route dns tourvision-local tourvision.yourdomain.com
```

### 5. Run Named Tunnel

```bash
cloudflared tunnel run tourvision-local
```

Now you'll have a permanent URL: `https://tourvision.yourdomain.com`

## Testing the Setup

1. **Check Wrangler is running:**
   ```bash
   curl http://localhost:8787
   ```

2. **Check Tunnel is working:**
   ```bash
   curl https://your-tunnel-url.trycloudflare.com
   ```

3. **Test WebSocket connection:**
   Open browser console on the deployed frontend and verify connection logs show the tunnel URL.

4. **Verify no Cloudflare usage:**
   - Go to Cloudflare Dashboard → Workers & Pages → Durable Objects
   - Usage should stay at 0% since you're using local simulation

## Running Everything

**Terminal 1 - Wrangler:**
```bash
cd agent-poc
npx wrangler dev --local --port 8787 --ip 0.0.0.0
```

**Terminal 2 - Cloudflare Tunnel:**
```bash
cloudflared tunnel --url http://localhost:8787
```

**Terminal 3 - Agent Manager:**
```bash
cd agent-poc
./start-agent-manager.sh
```

## Troubleshooting

### WebSocket Connection Fails

**Issue:** Agents can't connect to tunnel URL

**Solution:**
- Verify Wrangler is running on 0.0.0.0 (not just localhost)
- Check tunnel is forwarding to correct port
- Ensure firewall allows incoming connections

### Tunnel URL Changes

**Issue:** Tunnel URL changes every restart

**Solution:** Use Named Tunnel setup for permanent URL

### CORS Errors

**Issue:** Browser shows CORS errors

**Solution:** Cloudflare Tunnel automatically handles CORS. If issues persist, check Wrangler CORS configuration in `wrangler.toml`.

## Performance Considerations

- **Latency:** Slightly higher than pure Cloudflare edge deployment due to routing through tunnel
- **Bandwidth:** Unlimited (not subject to Cloudflare Worker limits)
- **Concurrent Connections:** Limited only by your local machine resources

## Migration Back to Production

To switch back to production Cloudflare Durable Objects:

1. Update environment variables to use production URLs
2. Rebuild frontend: `npm run build && npm run deploy`
3. Stop tunnel and local Wrangler
4. Deploy Durable Objects: `npx wrangler deploy`

## Cost Comparison

| Component | Local + Tunnel | Production Cloudflare |
|-----------|---------------|----------------------|
| Durable Objects | Free (unlimited) | Free tier: 2.1B duration/day |
| Cloudflare Tunnel | Free | N/A |
| Bandwidth | Free | Included |
| **Total** | **$0/month** | **$5/month** (Workers Paid plan) |
