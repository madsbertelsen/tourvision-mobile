# Network Access Setup Guide

This guide explains how to test the agent-poc web service on devices connected to your local WiFi or expose it to the internet via custom domains.

## Overview

The agent-poc system supports three access modes:

1. **Localhost Only** (default) - Development on the same machine
2. **Local WiFi** - Testing on phones/tablets on the same network
3. **Custom Domains** - Internet access via Caddy reverse proxy with HTTPS

## Prerequisites

- Mac's local IP: `192.168.1.223`
- Static public IP address
- Domain names available
- Caddy installed: `v2.10.2` (already installed via Homebrew)

---

## Option 1: Local WiFi Access

Test on devices connected to the same WiFi network (phones, tablets, other computers).

### Configuration

**File**: `agent-poc/.env.local` (already created)

```bash
# Local WiFi Testing Environment
VITE_WS_HOST=192.168.1.223
VITE_WS_PORT=8787
VITE_WS_PROTOCOL=ws

VITE_SUPABASE_URL=http://192.168.1.223:54321
VITE_SUPABASE_ANON_KEY=sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH

VITE_MAPBOX_TOKEN=pk.eyJ1IjoibWFkc2JlcnRlbHNlbiIsImEiOiJja2tjeDgxZWYwNHU5MnhtaTVndWRmeHpzIn0.Zs-SFtuSE9I1XAG-TG2fsw
```

### Firewall Configuration

Allow Vite, Wrangler, and Supabase through macOS firewall:

```bash
# Add Caddy to firewall (if using Caddy later)
sudo /usr/libexec/ApplicationFirewall/socketfilterfw --add /opt/homebrew/bin/caddy
sudo /usr/libexec/ApplicationFirewall/socketfilterfw --unblockapp /opt/homebrew/bin/caddy

# Verify firewall settings
sudo /usr/libexec/ApplicationFirewall/socketfilterfw --listapps
```

**Note**: You may need to manually allow Node.js/Vite in System Settings > Network > Firewall when first running.

### Start Services

```bash
# Terminal 1: Start Supabase (if not already running)
npx supabase start

# Terminal 2: Start Wrangler (Y.js WebSocket server)
cd agent-poc
npx wrangler dev --local --port 8787 --ip 0.0.0.0

# Terminal 3: Start Agent Manager
cd agent-poc
npm run agent-manager

# Terminal 4: Start Vite (frontend)
cd agent-poc
npm run dev:client -- --mode local
```

### Test from Another Device

1. Connect your phone/tablet to the same WiFi network
2. Open browser to: `http://192.168.1.223:5174`
3. Test editor: `http://192.168.1.223:5174/editor?doc=test-wifi`

### Troubleshooting Local WiFi

**Cannot access from phone:**
- Check firewall settings (System Settings > Network > Firewall)
- Verify Vite is listening on `0.0.0.0:5174` (not just `127.0.0.1`)
- Ensure phone is on the same WiFi network
- Try disabling firewall temporarily to isolate the issue

**WebSocket connection fails:**
- Verify Wrangler is running with `--ip 0.0.0.0` flag (not just localhost)
- Check Wrangler logs show `Ready on http://0.0.0.0:8787`
- Verify `VITE_WS_HOST=192.168.1.223` and `VITE_WS_PORT=8787` in `.env.local`
- Check browser console for WebSocket errors
- Test WebSocket from phone: `wscat -c ws://192.168.1.223:8787/parties/document/test`

---

## Option 2: Custom Domains with Caddy

Expose services to the internet with HTTPS via Caddy reverse proxy.

### Step 1: DNS Configuration

Add A records at your domain registrar pointing to your static public IP:

```
dev.yourdomain.com  → <your-static-ip>
yjs.yourdomain.com  → <your-static-ip>
db.yourdomain.com   → <your-static-ip>
```

**Wait for DNS propagation** (5-30 minutes). Verify with:

```bash
nslookup dev.yourdomain.com
# Should return your public IP
```

### Step 2: Router Port Forwarding

Configure your router to forward ports 80 and 443 to your Mac:

- Port **80** (HTTP) → `192.168.1.223:80`
- Port **443** (HTTPS) → `192.168.1.223:443`

**Also recommended**: Set DHCP reservation so your Mac always gets `192.168.1.223`.

### Step 3: Configure Caddyfile

Copy and customize the Caddyfile template:

```bash
cp ~/Caddyfile.example ~/Caddyfile
```

Edit `~/Caddyfile` and replace placeholders:

```caddy
{
    # Replace with your email for Let's Encrypt notifications
    email your-email@example.com
}

# Vite Dev Server (Main UI)
dev.yourdomain.com {
    reverse_proxy localhost:5174

    header {
        Access-Control-Allow-Origin *
        Access-Control-Allow-Methods "GET, POST, PUT, DELETE, OPTIONS"
        Access-Control-Allow-Headers "Content-Type, Authorization"
    }
}

# Y.js WebSocket Server (Cloudflare Durable Object)
yjs.yourdomain.com {
    reverse_proxy localhost:8787

    # Prevent WebSocket timeout
    timeouts {
        read_timeout 3600s
        write_timeout 3600s
    }
}

# Supabase Local Instance
db.yourdomain.com {
    reverse_proxy localhost:54321

    # WebSocket support for Realtime
    timeouts {
        read_timeout 3600s
        write_timeout 3600s
    }
}
```

### Step 4: Configure Production Environment

Edit `agent-poc/.env.production` and replace placeholders:

```bash
# Production Environment (Caddy/Ngrok)
VITE_WS_HOST=yjs.yourdomain.com
VITE_WS_PROTOCOL=wss

VITE_SUPABASE_URL=https://db.yourdomain.com
VITE_SUPABASE_ANON_KEY=sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH

VITE_MAPBOX_TOKEN=pk.eyJ1IjoibWFkc2JlcnRlbHNlbiIsImEiOiJja2tjeDgxZWYwNHU5MnhtaTVndWRmeHpzIn0.Zs-SFtuSE9I1XAG-TG2fsw
```

### Step 5: Start Services with Caddy

```bash
# Terminal 1: Start Caddy
caddy run --config ~/Caddyfile
# First time will request Let's Encrypt certificates (takes 1-2 minutes)

# Terminal 2: Start Supabase
npx supabase start

# Terminal 3: Start Wrangler (Y.js WebSocket server)
cd agent-poc
npx wrangler dev --local --port 8787

# Terminal 4: Start Agent Manager
cd agent-poc
npm run agent-manager

# Terminal 5: Start Vite (production mode)
cd agent-poc
npm run dev:client -- --mode production
```

### Step 6: Test from Anywhere

Open browser to:
- **Main UI**: `https://dev.yourdomain.com`
- **Editor**: `https://dev.yourdomain.com/editor?doc=test-public`

Caddy automatically handles:
- HTTPS certificates (Let's Encrypt)
- Certificate renewal (automatic)
- HTTP → HTTPS redirect
- WebSocket proxying with proper timeouts

### Troubleshooting Caddy

**Certificate acquisition fails:**
- Verify DNS A records are correct (`nslookup dev.yourdomain.com`)
- Check ports 80 and 443 are forwarded in router
- Ensure no other service is using ports 80/443 (Apache, Nginx, etc.)
- Check Caddy logs for detailed error messages

**Cannot access from internet:**
- Verify public IP hasn't changed (if not truly static)
- Check router port forwarding is active
- Test with `curl https://dev.yourdomain.com` from external network

**WebSocket connections fail:**
- Check Caddy timeout configuration (should be 3600s)
- Verify Wrangler is running on port 8787
- Check browser console for CORS errors

---

## Environment Variable Reference

| Variable | Local WiFi | Custom Domains | Description |
|----------|-----------|----------------|-------------|
| `VITE_WS_PROTOCOL` | `ws` | `wss` | WebSocket protocol |
| `VITE_WS_HOST` | `192.168.1.223` | `yjs.yourdomain.com` | WebSocket host |
| `VITE_WS_PORT` | `8787` | (omitted) | WebSocket port (only for local) |
| `VITE_SUPABASE_URL` | `http://192.168.1.223:54321` | `https://db.yourdomain.com` | Supabase API URL |

**Note**: For custom domains, the port is omitted because Caddy handles standard HTTPS port 443.

---

## How It Works

### Client Code (Dynamic URLs)

The client (`src/client/index.js`) intelligently builds URLs:

```javascript
// Environment variables
const WS_PROTOCOL = import.meta.env.VITE_WS_PROTOCOL || "ws";
const WS_HOST = import.meta.env.VITE_WS_HOST || "localhost";
const WS_PORT = import.meta.env.VITE_WS_PORT || "8787";

// Build WebSocket URL
// For custom domains: wss://yjs.yourdomain.com
// For localhost: ws://localhost:8787
// For local WiFi: ws://192.168.1.223:8787
const WS_URL = import.meta.env.VITE_WS_HOST && !import.meta.env.VITE_WS_HOST.includes('localhost')
  ? `${WS_PROTOCOL}://${WS_HOST}`
  : `ws://${WS_HOST}:${WS_PORT}`;

console.log('[Client] WebSocket URL:', WS_URL);
```

### Network Flow with Caddy

```
Internet/WiFi Device
    ↓
https://dev.yourdomain.com
    ↓
Router (port 443 → 192.168.1.223:443)
    ↓
Caddy Reverse Proxy (192.168.1.223:443)
    ↓
Vite Dev Server (localhost:5174)


WebSocket Connection:
wss://yjs.yourdomain.com
    ↓
Router (port 443 → 192.168.1.223:443)
    ↓
Caddy Reverse Proxy (192.168.1.223:443)
    ↓
Wrangler/Durable Object (localhost:8787)
```

---

## Security Considerations

### Local WiFi Mode
- **No encryption** - Traffic is plain HTTP/WebSocket
- **Network isolation** - Only accessible from same WiFi
- **Development only** - Do not use for sensitive data

### Custom Domains with Caddy
- **HTTPS enforced** - Caddy automatically redirects HTTP to HTTPS
- **Let's Encrypt certificates** - Automatic issuance and renewal
- **WebSocket Security** - WSS (WebSocket Secure) for encrypted connections
- **Supabase over HTTPS** - Database connections encrypted

**Important**: Even with HTTPS, this setup exposes your local Supabase instance to the internet. Consider:
- Strong Supabase service role key (already configured)
- Rate limiting (can be added to Caddyfile)
- IP whitelisting if needed (Caddy supports this)

---

## Next Steps

1. **Choose your access mode** (local WiFi or custom domains)
2. **Complete manual configuration** (DNS, router, Caddyfile if using Caddy)
3. **Run firewall commands** with sudo password
4. **Start services** as documented above
5. **Test from target device/location**

For local WiFi testing, you're ready to go now - just run the firewall commands and start the services.

For custom domains with Caddy, complete steps 1-4 in "Option 2" above.
