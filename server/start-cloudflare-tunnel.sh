#!/bin/bash

# Start Cloudflare Tunnel to expose local Wrangler server
# This creates a temporary public HTTPS URL

echo "🌐 Starting Cloudflare Tunnel..."
echo ""
echo "This will create a temporary public HTTPS URL for your local Durable Objects server."
echo "The URL will be displayed below - copy it to update your environment variables."
echo ""
echo "Press Ctrl+C to stop"
echo ""

cloudflared tunnel --url http://localhost:8787
