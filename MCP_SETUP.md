# Supabase MCP Server Setup

This document explains how the Supabase Model Context Protocol (MCP) server is configured for this project.

## Configuration

The MCP server is configured in `.mcp.json` with the following setup:

```json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": ["@playwright/mcp"]
    },
    "supabase": {
      "command": "npx",
      "args": [
        "-y",
        "@supabase/mcp-server-postgrest",
        "--apiUrl", "http://127.0.0.1:54321",
        "--schema", "public",
        "--apiKey", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0"
      ]
    }
  }
}
```

## What This Enables

The Supabase MCP server allows Claude to:
- Query database tables through PostgREST API
- Inspect database schema and structure
- Perform read operations on your local Supabase instance
- Understand your data model and relationships

## Available Tables

The configuration provides access to the following tables:
- `profiles` - User profiles
- `trips` - Trip information and itineraries
- `places` - Location data
- `trip_places` - Places associated with trips
- `map_tiles` - Map tile storage
- `activity_notifications` - User notifications
- `thread_messages` - Chat messages
- `ai_agent_config` - AI configuration
- And more...

## Security Notes

- Uses the `anon` key which provides read-only access based on Row Level Security (RLS) policies
- Only connects to the local development instance (127.0.0.1:54321)
- The API key shown is the default local development key and is safe to include

## Prerequisites

1. **Local Supabase Running**: Make sure your local Supabase instance is running:
   ```bash
   npx supabase start
   ```

2. **Verify Connection**: Check that the API is accessible:
   ```bash
   npx supabase status
   ```

3. **Test API Access**: Verify the PostgREST API is working:
   ```bash
   curl -X GET "http://127.0.0.1:54321/rest/v1/profiles" \
     -H "apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0"
   ```

## Usage in Claude

Once configured, Claude can access your database through the MCP server. Examples of what you can ask:

- "Show me all the trips in the database"
- "What's the schema of the profiles table?"
- "How many users are in the system?"
- "What are the relationships between trips and places?"

## Updating Configuration

If your local Supabase instance changes (different port, new API key), update the values in `.mcp.json`:

1. Get current status: `npx supabase status`
2. Update `--apiUrl` with the API URL
3. Update `--apiKey` with the anon key
4. Restart Claude Code to pick up the changes

## Troubleshooting

### MCP Server Won't Start
- Ensure Supabase is running: `npx supabase status`
- Check if the API URL is accessible
- Verify the API key is correct

### No Data Returned
- Check Row Level Security policies on tables
- Ensure you're using the correct schema (`public`)
- Verify authentication is working

### Package Issues
- Clear npm cache: `npm cache clean --force`
- Try running the server manually to see error messages:
  ```bash
  npx -y @supabase/mcp-server-postgrest --apiUrl http://127.0.0.1:54321 --schema public --apiKey YOUR_KEY
  ```