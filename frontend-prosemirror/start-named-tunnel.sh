#!/bin/bash

# Start Named Cloudflare Tunnel
# Run this after setup-named-tunnel.sh

echo "🌐 Starting Named Cloudflare Tunnel..."
echo ""
echo "Make sure you have:"
echo "  1. Run ./setup-named-tunnel.sh"
echo "  2. Configured DNS record in Cloudflare"
echo "  3. Started local Wrangler server"
echo ""
echo "Press Ctrl+C to stop"
echo ""

cloudflared tunnel run tourvision-local
