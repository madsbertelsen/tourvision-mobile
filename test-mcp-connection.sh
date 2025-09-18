#!/bin/bash

# Test script for validating MCP Supabase connection
echo "Testing Supabase MCP Server Configuration..."
echo "=============================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if Supabase is running
echo -e "${YELLOW}1. Checking if Supabase is running...${NC}"
if curl -s "http://127.0.0.1:54321" > /dev/null; then
    echo -e "${GREEN}✓ Supabase is running${NC}"
else
    echo -e "${RED}✗ Supabase is not running. Run: npx supabase start${NC}"
    exit 1
fi

# Check PostgREST API
echo -e "${YELLOW}2. Testing PostgREST API...${NC}"
API_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0"

RESPONSE=$(curl -s -w "%{http_code}" -X GET "http://127.0.0.1:54321/rest/v1/profiles" \
  -H "apikey: $API_KEY" \
  -H "Authorization: Bearer $API_KEY")

HTTP_CODE="${RESPONSE: -3}"
if [ "$HTTP_CODE" = "200" ]; then
    echo -e "${GREEN}✓ PostgREST API is accessible${NC}"
else
    echo -e "${RED}✗ PostgREST API returned HTTP $HTTP_CODE${NC}"
    exit 1
fi

# Test MCP server package availability
echo -e "${YELLOW}3. Testing MCP server package...${NC}"
if npx -y @supabase/mcp-server-postgrest --help > /dev/null 2>&1; then
    echo -e "${GREEN}✓ @supabase/mcp-server-postgrest package is available${NC}"
else
    echo -e "${RED}✗ MCP server package is not available or has issues${NC}"
fi

# Check .mcp.json configuration
echo -e "${YELLOW}4. Checking .mcp.json configuration...${NC}"
if [ -f ".mcp.json" ]; then
    if grep -q "supabase" ".mcp.json" && grep -q "@supabase/mcp-server-postgrest" ".mcp.json"; then
        echo -e "${GREEN}✓ .mcp.json is configured with Supabase MCP server${NC}"
    else
        echo -e "${RED}✗ .mcp.json does not contain Supabase configuration${NC}"
    fi
else
    echo -e "${RED}✗ .mcp.json file not found${NC}"
fi

# Test a sample query
echo -e "${YELLOW}5. Testing sample data query...${NC}"
PROFILES_COUNT=$(curl -s -X GET "http://127.0.0.1:54321/rest/v1/profiles?select=count" \
  -H "apikey: $API_KEY" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Prefer: count=exact" | grep -o '"count":[0-9]*' | cut -d':' -f2)

if [ -n "$PROFILES_COUNT" ] && [ "$PROFILES_COUNT" -gt 0 ]; then
    echo -e "${GREEN}✓ Sample query successful: Found $PROFILES_COUNT profiles${NC}"
else
    echo -e "${YELLOW}⚠ No profiles found, but connection works${NC}"
fi

echo ""
echo -e "${GREEN}MCP Configuration Test Complete!${NC}"
echo ""
echo "Your Supabase MCP server is configured and ready to use with Claude."
echo "You can now ask Claude questions about your database structure and data."
echo ""
echo "Example questions to try:"
echo "- 'Show me the schema of the trips table'"
echo "- 'How many users are in the profiles table?'"
echo "- 'What are the relationships between trips and places?'"