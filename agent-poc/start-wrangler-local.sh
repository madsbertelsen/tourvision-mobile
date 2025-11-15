#!/bin/bash

# Start Wrangler dev server locally with network access
# This allows Cloudflare Tunnel to connect to it

echo "🚀 Starting Wrangler dev server (local mode with network access)..."
echo ""
echo "Server will be accessible at:"
echo "  - Local:   http://localhost:8787"
echo "  - Network: http://0.0.0.0:8787"
echo ""
echo "Press Ctrl+C to stop"
echo ""

npx wrangler dev --local --port 8787 --ip 0.0.0.0
