#!/bin/bash

# Setup Named Cloudflare Tunnel
# This creates a permanent tunnel with your Cloudflare account

set -e

echo "╔══════════════════════════════════════════════════════╗"
echo "║      Cloudflare Named Tunnel Setup                  ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""

# Step 1: Login to Cloudflare
echo "📝 Step 1: Login to Cloudflare"
echo "This will open a browser window for authentication..."
echo ""
cloudflared tunnel login

echo ""
echo "✅ Login successful!"
echo ""

# Step 2: Create named tunnel
TUNNEL_NAME="tourvision-local"
echo "🔧 Step 2: Creating named tunnel: $TUNNEL_NAME"
echo ""

# Check if tunnel already exists
if cloudflared tunnel list | grep -q "$TUNNEL_NAME"; then
    echo "⚠️  Tunnel '$TUNNEL_NAME' already exists. Using existing tunnel."
    TUNNEL_ID=$(cloudflared tunnel list | grep "$TUNNEL_NAME" | awk '{print $1}')
else
    echo "Creating new tunnel..."
    cloudflared tunnel create "$TUNNEL_NAME"
    TUNNEL_ID=$(cloudflared tunnel list | grep "$TUNNEL_NAME" | awk '{print $1}')
fi

echo ""
echo "Tunnel ID: $TUNNEL_ID"
echo ""

# Step 3: Configure tunnel
echo "🔧 Step 3: Creating tunnel configuration..."
echo ""

mkdir -p ~/.cloudflared

cat > ~/.cloudflared/config.yml <<EOF
tunnel: $TUNNEL_ID
credentials-file: $HOME/.cloudflared/$TUNNEL_ID.json

ingress:
  # Route all traffic to local Wrangler server
  - service: http://localhost:8787
EOF

echo "✅ Configuration created at: ~/.cloudflared/config.yml"
echo ""

# Step 4: Instructions for DNS
echo "╔══════════════════════════════════════════════════════╗"
echo "║      DNS Setup Required                              ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""
echo "You need to create a DNS record to route traffic to your tunnel."
echo ""
echo "Option 1 - Automatic (requires domain):"
echo "  cloudflared tunnel route dns $TUNNEL_NAME yourdomain.com"
echo ""
echo "Option 2 - Manual (Cloudflare Dashboard):"
echo "  1. Go to Cloudflare Dashboard → DNS → Records"
echo "  2. Add a CNAME record:"
echo "     Name: yjs (or any subdomain)"
echo "     Content: $TUNNEL_ID.cfargotunnel.com"
echo "     Proxy: Enabled (orange cloud)"
echo ""
echo "Example final URL: https://yjs.yourdomain.com"
echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║      Next Steps                                       ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""
echo "1. Set up DNS record (see above)"
echo "2. Run: ./start-named-tunnel.sh"
echo "3. Update .env files with your tunnel URL"
echo "4. Build and deploy frontend"
echo ""
