# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Structure

This is a monorepo with the following structure:
- **`/expo-app`** - Expo React Native frontend (iOS, Android, Web)
- **`/supabase`** - Database migrations and seed data
- **`/scripts`** - Node.js scripts for AI chat listener and utilities

## Current Status

### ✅ Working Features
- Authentication (login, register, logout, password reset)
- Protected routes with automatic redirect
- Dashboard with user profile display
- Database seeding with test data
- Web platform support
- **Document Chat System** - Real-time WebSocket chat with Cloudflare Workers AI
- **ProseMirror Editor** - Rich text editing with geo-marks for locations
- **Real-time Collaboration** - Tiptap Cloud (Hocuspocus) with Y.js CRDT

### 📝 Known Limitations
- Web platform primary focus (native iOS/Android support limited)
- Limited mobile responsiveness
- Test coverage needed

## Quick Start

```bash
# 1. Start Supabase locally (requires Docker)
npx supabase start

# 2. Reset database with seed data (optional, for fresh start)
npx supabase db reset --local

# 3. Navigate to frontend
cd expo-app

# 4. Install dependencies
npm install

# 5. Start the web app
npx expo start --web --port 8082
# Note: Use a specific port to avoid conflicts

# 6. Open browser to http://localhost:8082
# Login with test@example.com / TestPassword123!
```

## Test Credentials

After running `npx supabase db reset`, you can login with:
- **Email:** test@example.com
- **Password:** TestPassword123!

The seed data includes:
- 5 sample trips (Barcelona, Tokyo, Paris, NYC, Bali)
- Mix of public and private trips
- Various planning stages

## Commands

### Development
```bash
# IMPORTANT: Always run from expo-app directory
cd expo-app

# Start development server (web) - RECOMMENDED
npx expo start --web --port 8082

# Start for iOS
npx expo start --ios

# Start for Android  
npx expo start --android

# Start Expo with all platforms available
npx expo start
```

### Local Supabase Development
```bash
# Run from project root (not expo-app)

# Start local Supabase (requires Docker)
npx supabase start

# Check Supabase status and get credentials
npx supabase status

# Apply database migrations
npx supabase db push --local

# Stop local Supabase
npx supabase stop

# Reset database (applies migrations and seed.sql)
npx supabase db reset --local

# Create new migration
npx supabase migration new <name>

# Test authentication directly
curl -X POST "http://127.0.0.1:54321/auth/v1/token?grant_type=password" \
  -H "apikey: <anon_key_from_status>" \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com", "password": "TestPassword123!"}'
```

## Architecture Overview

### Tech Stack
- **Expo SDK 54** - React Native framework with web support
- **Expo Router** - File-based routing in `/app` directory
- **NativeWind v4** - Tailwind CSS for React Native styling
- **ProseMirror** - Rich text editor (HTML-based via WebView)
- **Supabase** - Backend, auth, and real-time database
- **Mistral AI** - Chat responses via document-chat-listener.js
- **Tiptap Cloud** - Real-time collaboration with Y.js CRDT

### Key Architectural Patterns

#### Routing Structure
- `/expo-app/app/(app)/index.tsx` - Main app screen
- `/expo-app/app/(auth)/` - Authentication screens
- `/expo-app/app/(app)/document/[id]/` - Document editor with chat
- `/expo-app/app/_layout.tsx` - Root layout with auth protection

#### Document Chat System
- **Node.js Listener** (`/scripts/document-chat-listener.js`) - Listens to `document_chats` table
- **Mistral AI** - Generates responses to user messages
- **Realtime Subscriptions** - Uses anon key for subscriptions, service key for operations
- **See**: DOCUMENT_CHAT_AI_SETUP.md for detailed setup instructions

### Database Schema

Key tables in Supabase:
- `profiles` - User profiles extending auth.users
- `documents` - Document records with ProseMirror JSON content
- `document_chats` - Chat messages for AI-powered document generation
- Row Level Security (RLS) is enabled on all tables

### Environment Configuration

Required environment variables in `expo-app/.env.local`:
```
EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon_key_from_supabase_status>
EXPO_PUBLIC_MAPBOX_TOKEN=<optional_mapbox_token>
```

For local development:
1. Run `npx supabase status` to get credentials
2. Copy the `anon key` to your `.env.local`
3. Use `http://127.0.0.1:54321` as the Supabase URL

## Development Notes

### TypeScript Configuration
- Strict mode enabled
- Path alias `@/` maps to expo-app root directory
- Extends Expo's base tsconfig

### Platform-Specific Code
- Use `Platform.OS` to check platform ('web', 'ios', 'android')
- SecureStore for auth tokens on native, localStorage on web
- DOM components only work on platforms with WebView support
- Logout uses `window.confirm()` on web, `Alert.alert()` on native

### Authentication Flow
1. Auth context (`/expo-app/lib/supabase/auth-context.tsx`) manages session
2. Protected routes in `_layout.tsx` redirect to login when not authenticated
3. Auth screens in `(auth)` folder handle login/register/password reset
4. Session persists using platform-specific storage adapters

### Common Issues & Solutions

#### "Database error querying schema" on login
- **Cause:** auth.flow_state table has RLS enabled in Postgres 17
- **Solution:** Fixed in seed.sql with proper user insertion format

#### Port conflicts when starting Expo
- **Solution:** Use specific port: `npx expo start --web --port 8082`

#### Logout button not responding on web
- **Solution:** Platform-specific handling implemented in index.tsx

#### Test users don't persist after DB reset
- **Solution:** Use the seed.sql format from working project (full column specification)

#### Diff Preview Not Showing
- **Cause:** Content already exists in document (duplicate proposal) or positions out of bounds
- **Solution:** System now dynamically recalculates positions and handles empty documents

#### Document Chat Listener Not Running
- **Symptom:** AI responses not appearing in chat
- **Solution:** Run `node scripts/document-chat-listener.js` - see DOCUMENT_CHAT_AI_SETUP.md

### Database Management

#### IMPORTANT: Never Directly Mutate Database
- **NEVER use INSERT, UPDATE, or DELETE statements directly** on the database
- The database should only be modified through:
  1. **Application code** (via Supabase client)
  2. **Edge Functions** (for AI processing)
  3. **Migrations** (for schema changes)
  4. **Seed data** (only for initial setup)

#### Querying Database (READ-ONLY)
For debugging and inspection only:
```bash
# SELECT queries only - never INSERT/UPDATE/DELETE
docker exec supabase_db_tourvision-mobile psql -U postgres -d postgres -c "SELECT * FROM table_name;"
```

#### Structural Changes
For schema or structural changes:
- **Create migrations** in `/supabase/migrations/` directory
- Use naming convention: `YYYYMMDD_description.sql`
- Example: `20250120_add_location_data.sql`
- Run migrations: `npx supabase db push --local`

#### Testing Features
To test features that require data:
1. Use the application UI to create data naturally
2. Trigger Edge Functions via the app's chat/AI features
3. Use the Supabase client in test scripts
4. NEVER directly INSERT/UPDATE test data into the database

#### Database Seeding

The `supabase/seed.sql` file creates:
- Test users with bcrypt-hashed passwords
- 5 sample trips with various statuses
- Sample places linked to trips
- Proper auth.users and auth.identities entries

**Important:** The seed uses a hardcoded bcrypt hash for "TestPassword123!" that works reliably.

### Querying Local Database

When Supabase is running locally via Docker, you can query the PostgreSQL database directly:

```bash
# Basic query syntax
docker exec supabase_db_tourvision-mobile psql -U postgres -d postgres -c "YOUR_SQL_QUERY"

# Examples:

# List all trips
docker exec supabase_db_tourvision-mobile psql -U postgres -d postgres -c "SELECT id, title FROM trips;"

# Check a specific trip's document
docker exec supabase_db_tourvision-mobile psql -U postgres -d postgres -c "SELECT itinerary_document FROM trips WHERE id = '28d7e539-4ed0-4f0f-9818-852b3474cfbc';"

# Pretty print JSON columns
docker exec supabase_db_tourvision-mobile psql -U postgres -d postgres -c "SELECT jsonb_pretty(itinerary_document) FROM trips WHERE title = 'sg';"

# Check proposals with diff decorations
docker exec supabase_db_tourvision-mobile psql -U postgres -d postgres -c "SELECT id, title, status, jsonb_array_length(diff_decorations) as num_decorations FROM proposals WHERE trip_id = '28d7e539-4ed0-4f0f-9818-852b3474cfbc';"

# Check AI suggestions
docker exec supabase_db_tourvision-mobile psql -U postgres -d postgres -c "SELECT * FROM ai_suggestions ORDER BY created_at DESC LIMIT 5;"

# List all tables
docker exec supabase_db_tourvision-mobile psql -U postgres -d postgres -c "\dt"

# Describe a table structure
docker exec supabase_db_tourvision-mobile psql -U postgres -d postgres -c "\d proposals"

# Update data (be careful!)
docker exec supabase_db_tourvision-mobile psql -U postgres -d postgres -c "UPDATE proposals SET diff_decorations = '[{\"from\": 1, \"to\": 1, \"type\": \"addition\", \"content\": \"Your content\"}]' WHERE id = 'some-uuid';"
```

**Note:** The container name `supabase_db_tourvision-mobile` is based on your project folder name. The database is always `postgres` and the user is `postgres` with no password needed when accessing via Docker exec.

### Starting Document Chat Listener

To enable AI responses in document chat, run the listener:

```bash
# From project root
node scripts/document-chat-listener.js
```

See DOCUMENT_CHAT_AI_SETUP.md for detailed setup instructions including:
- Configuring MISTRAL_API_KEY in .env.local
- How the listener works
- Troubleshooting realtime subscriptions

### Querying Remote Database

The document-chat-listener and production systems connect to the remote Supabase database at `https://unocjfiipormnaujsuhk.supabase.co`. Use curl to query the database via Supabase's REST API:

```bash
# Basic query format
curl -X GET "https://unocjfiipormnaujsuhk.supabase.co/rest/v1/TABLE_NAME?select=COLUMNS&limit=5" \
  -H "apikey: SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer SERVICE_ROLE_KEY" \
  2>/dev/null | jq

# Examples:
# List all documents
curl -X GET "https://unocjfiipormnaujsuhk.supabase.co/rest/v1/documents?select=id,title,created_by&limit=5" \
  -H "apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVub2NqZmlpcG9ybW5hdWpzdWhrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MTIxNTY5MCwiZXhwIjoyMDc2NzkxNjkwfQ.Nwx4TbcvbfwfinAMAmHV2PomT0fqtV_oylOUEREOCL0" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVub2NqZmlpcG9ybW5hdWpzdWhrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MTIxNTY5MCwiZXhwIjoyMDc2NzkxNjkwfQ.Nwx4TbcvbfwfinAMAmHV2PomT0fqtV_oylOUEREOCL0" \
  2>/dev/null | jq

# Check recent chat messages with ordering
curl -X GET "https://unocjfiipormnaujsuhk.supabase.co/rest/v1/document_chats?select=id,role,content,created_at&order=created_at.desc&limit=5" \
  -H "apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVub2NqZmlpcG9ybW5hdWpzdWhrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MTIxNTY5MCwiZXhwIjoyMDc2NzkxNjkwfQ.Nwx4TbcvbfwfinAMAmHV2PomT0fqtV_oylOUEREOCL0" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVub2NqZmlpcG9ybW5hdWpzdWhrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MTIxNTY5MCwiZXhwIjoyMDc2NzkxNjkwfQ.Nwx4TbcvbfwfinAMAmHV2PomT0fqtV_oylOUEREOCL0" \
  2>/dev/null | jq

# Filter by condition
curl -X GET "https://unocjfiipormnaujsuhk.supabase.co/rest/v1/document_chats?role=eq.assistant&select=*" \
  -H "apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVub2NqZmlpcG9ybW5hdWpzdWhrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MTIxNTY5MCwiZXhwIjoyMDc2NzkxNjkwfQ.Nwx4TbcvbfwfinAMAmHV2PomT0fqtV_oylOUEREOCL0" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVub2NqZmlpcG9ybW5hdWpzdWhrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MTIxNTY5MCwiZXhwIjoyMDc2NzkxNjkwfQ.Nwx4TbcvbfwfinAMAmHV2PomT0fqtV_oylOUEREOCL0" \
  2>/dev/null | jq
```

**PostgREST Query Operators:**
- `select=col1,col2` - Select specific columns
- `order=col.desc` - Order by column descending
- `limit=N` - Limit results
- `col=eq.value` - Filter where col equals value
- `col=gt.value` - Greater than
- `col=lt.value` - Less than
- See [PostgREST docs](https://postgrest.org/en/stable/references/api/tables_views.html) for more

**Important Notes:**
- Use service_role key to bypass RLS policies
- `docker exec` is for LOCAL database only (supabase_db_tourvision-mobile container)
- Password and credentials should not be committed to git

### Testing Approach
Currently no test framework is configured. When adding tests:
1. Check README for any testing documentation
2. Consider Jest with React Native Testing Library
3. Test both native and DOM components separately
4. Test auth flow with the seeded test users

## Testing with Playwright MCP

### Overview
Playwright MCP (Model Context Protocol) provides browser automation tools for testing web features. It's particularly useful for testing complex UI interactions that involve iframes, text selection, and multi-step workflows.

### Prerequisites

1. **Playwright MCP server must be connected**:
   - Check connection status with `/mcp` command
   - If disconnected, reconnect using `/mcp` command
   - Verify "Reconnected to playwright" message appears

2. **App must be running**:
   ```bash
   cd expo-app
   npx expo start --web --port 8082
   ```

3. **Test data should be available**:
   - Document at `http://localhost:8082/document/test-id` should exist
   - Or create test data through the app UI first

### Available MCP Tools

#### Navigation and Page Management
- `browser_navigate` - Navigate to a URL
- `browser_navigate_back` - Go back to previous page
- `browser_tabs` - List, create, close, or select browser tabs
- `browser_close` - Close the browser

#### Content Inspection
- `browser_snapshot` - Capture accessibility snapshot of current page (better than screenshot)
- `browser_take_screenshot` - Take a PNG/JPEG screenshot
- `browser_console_messages` - Returns all console messages

#### User Interactions
- `browser_click` - Click on elements
- `browser_type` - Type text into editable elements
- `browser_press_key` - Press keyboard keys (ArrowLeft, Enter, etc.)
- `browser_fill_form` - Fill multiple form fields at once
- `browser_select_option` - Select dropdown options
- `browser_hover` - Hover over elements
- `browser_drag` - Drag and drop between elements

#### Advanced Operations
- `browser_evaluate` - Execute JavaScript in page context
- `browser_wait_for` - Wait for text to appear/disappear or time to pass
- `browser_network_requests` - View all network requests

### Common Testing Patterns

#### Pattern 1: Testing Location Addition with Geo-Marks

This pattern tests the complete flow of adding a location to a document, which involves:
1. Navigating to document
2. Typing text in ProseMirror iframe
3. Selecting specific text
4. Clicking location button
5. Verifying the location was added with correct color

**Full Example:**
```javascript
// 1. Navigate to test document
await browser_navigate({ url: 'http://localhost:8082/document/test-id' });

// 2. Wait for page to load
await browser_wait_for({ time: 3 });

// 3. Click in the iframe to focus it
const snapshot = await browser_snapshot();
// Find the iframe paragraph element from snapshot
await browser_click({ element: 'paragraph in iframe', ref: '<ref-from-snapshot>' });

// 4. Type text character by character (required for iframe)
const text = 'Trip to Paris and Brussels.';
for (const char of text) {
  if (char === ' ') {
    await browser_press_key({ key: 'Space' });
  } else if (char === '.') {
    await browser_press_key({ key: 'Period' });
  } else {
    await browser_press_key({ key: char });
  }
  await browser_wait_for({ time: 0.05 }); // Small delay between characters
}

// 5. Select "Paris" using JavaScript evaluation
await browser_evaluate({
  function: `() => {
    const iframe = document.querySelector('iframe');
    const iframeDoc = iframe.contentDocument;
    const paragraph = iframeDoc.querySelector('p');
    const text = paragraph.textContent;
    const parisIndex = text.indexOf('Paris');

    const selection = iframeDoc.getSelection();
    const range = iframeDoc.createRange();
    const textNode = paragraph.firstChild;

    range.setStart(textNode, parisIndex);
    range.setEnd(textNode, parisIndex + 5);
    selection.removeAllRanges();
    selection.addRange(range);
  }`
});

// 6. Click location button
await browser_click({ element: 'location button', ref: '<ref-for-location-btn>' });

// 7. Wait for location search modal
await browser_wait_for({ time: 2 });

// 8. Click Continue button
await browser_click({ element: 'Continue button', ref: '<ref-for-continue-btn>' });

// 9. Click Add to Document button
await browser_click({ element: 'Add to Document button', ref: '<ref-for-add-btn>' });

// 10. Verify in console
const messages = await browser_console_messages();
// Look for "Created geo-mark NodeView with color: #3B82F6"
```

#### Pattern 2: Testing Multi-Node Text Selection

When text contains geo-marks (colored location nodes), you need to traverse multiple text nodes:

```javascript
await browser_evaluate({
  function: `() => {
    const iframe = document.querySelector('iframe');
    const iframeDoc = iframe.contentDocument;
    const paragraph = iframeDoc.querySelector('p');

    // Get all text nodes (plain text + text inside geo-marks)
    function getAllTextNodes(node) {
      let textNodes = [];
      if (node.nodeType === Node.TEXT_NODE) {
        textNodes.push(node);
      } else {
        for (let child of node.childNodes) {
          textNodes = textNodes.concat(getAllTextNodes(child));
        }
      }
      return textNodes;
    }

    const textNodes = getAllTextNodes(paragraph);
    let allText = '';
    const nodeMap = [];

    // Build a map of text nodes with their positions
    for (const node of textNodes) {
      nodeMap.push({ node, start: allText.length, text: node.textContent });
      allText += node.textContent;
    }

    // Find "Brussels" in the combined text
    const brusselsIndex = allText.indexOf('Brussels');
    const startOffset = brusselsIndex;
    const endOffset = startOffset + 8;

    // Map offsets back to actual text nodes
    let startNode = null, endNode = null;
    let startNodeOffset = 0, endNodeOffset = 0;

    for (const item of nodeMap) {
      if (startOffset >= item.start && startOffset < item.start + item.text.length) {
        startNode = item.node;
        startNodeOffset = startOffset - item.start;
      }
      if (endOffset > item.start && endOffset <= item.start + item.text.length) {
        endNode = item.node;
        endNodeOffset = endOffset - item.start;
      }
    }

    // Create selection
    const selection = iframeDoc.getSelection();
    const range = iframeDoc.createRange();
    range.setStart(startNode, startNodeOffset);
    range.setEnd(endNode, endNodeOffset);
    selection.removeAllRanges();
    selection.addRange(range);
  }`
});
```

#### Pattern 3: Verifying Colors in Document

After adding locations, verify they have the correct colors:

```javascript
// Extract color information from document
const colorInfo = await browser_evaluate({
  function: `() => {
    const iframe = document.querySelector('iframe');
    const iframeDoc = iframe.contentDocument;

    const geoMarks = Array.from(iframeDoc.querySelectorAll('[data-geo-id]'));
    const docColors = geoMarks.map(gm => {
      const style = window.getComputedStyle(gm);
      return {
        name: gm.textContent,
        backgroundColor: style.backgroundColor,
        geoId: gm.getAttribute('data-geo-id')
      };
    });

    return { docColors };
  }`
});

console.log('Document colors:', colorInfo);
// Expected: Paris=rgb(59, 130, 246), Brussels=rgb(139, 92, 246)
```

### Common Issues and Solutions

#### Issue 1: Playwright MCP Disconnected
**Symptom**: Tools return "Not connected" errors

**Solution**:
1. Use `/mcp` command to reconnect
2. Wait for "Reconnected to playwright" message
3. Try the operation again

#### Issue 2: Text Not Typing in Iframe
**Symptom**: `browser_type` doesn't work in ProseMirror iframe

**Solution**:
1. Click in the iframe first to focus it
2. Use `browser_press_key` for individual characters instead of `browser_type`
3. Add small delays between keystrokes (50ms)

```javascript
// WRONG - browser_type doesn't work in iframe
await browser_type({ element: 'paragraph', ref: '<ref>', text: 'Paris' });

// RIGHT - click first, then press keys individually
await browser_click({ element: 'paragraph', ref: '<ref>' });
await browser_press_key({ key: 'P' });
await browser_wait_for({ time: 0.05 });
await browser_press_key({ key: 'a' });
// ... etc
```

#### Issue 3: Modal Not Opening on Second Interaction
**Symptom**: After successfully adding first location, clicking location button for second location doesn't open modal

**Possible Causes**:
1. Text selection was lost after previous operation
2. UI state not properly reset after first interaction
3. Event listeners not properly attached after DOM update

**Solutions**:
1. Re-select the text again
2. Add longer wait time after previous operation completes
3. Verify selection is stored by checking console logs
4. Click outside and back into iframe to reset focus

#### Issue 4: Elements Not Found in Snapshot
**Symptom**: `browser_snapshot` doesn't show expected elements

**Solution**:
1. Wait longer for page to load (`browser_wait_for`)
2. Check if content is inside an iframe (iframe content may not appear in main snapshot)
3. Use `browser_evaluate` to inspect iframe content separately
4. Take a screenshot to visually verify what's on page

### Best Practices

1. **Always snapshot first**: Use `browser_snapshot` before clicking to get element refs
2. **Add wait times**: Give UI time to update between actions (1-3 seconds typical)
3. **Verify with console**: Use `browser_console_messages` to check application logs
4. **Handle iframes specially**: Iframe content requires JavaScript evaluation, not direct MCP interaction
5. **Use character-by-character typing**: For ProseMirror iframes, press individual keys instead of using `browser_type`
6. **Check disconnections**: If tools fail, check MCP connection status first
7. **Take screenshots for debugging**: When tests fail, capture screenshot to see actual state

### Example Test Workflow

Here's a complete example testing the color bug fix (DocumentSplitMap.tsx COLORS array):

1. **Setup**: Navigate to test document
2. **Type content**: "Trip to Paris and Brussels."
3. **Add Paris**: Select "Paris", click location button, add it
4. **Verify Paris color**: Check console for "#3B82F6" (Blue)
5. **Add Brussels**: Select "Brussels", click location button, add it
6. **Verify Brussels color**: Check console for "#8B5CF6" (Purple)
7. **Take screenshot**: Capture final result
8. **Extract data**: Use JavaScript to get computed colors from DOM

This verifies that:
- Paris (colorIndex: 0) → Blue (#3B82F6) ✓
- Brussels (colorIndex: 1) → Purple (#8B5CF6) ✓

### Resources

- **Playwright MCP Documentation**: Check MCP server docs for full tool reference
- **Manual Testing Fallback**: If MCP testing is too complex, document manual test steps in a `.md` file (see `/Users/mads/workspace/tourvision-mobile/MANUAL_COLOR_TEST.md` for example)

### Code Quality

When completing tasks, always run:
```bash
cd expo-app
npm run lint      # If available
npm run typecheck # If available
```

If these commands aren't configured, consider adding them to package.json:
```json
{
  "scripts": {
    "lint": "eslint . --ext .ts,.tsx",
    "typecheck": "tsc --noEmit"
  }
}
```

### Git Workflow

```bash
# Check changes
git status
git diff

# Commit with descriptive message
git add -A
git commit -m "feat: Description of changes"

# Push to remote (if needed)
git push origin main
```

### Realtime Subscription Important Note
**Service role keys DO NOT work with Supabase realtime subscriptions.** When building listeners or background processes that need realtime updates:

1. Create **two separate Supabase clients**:
   - One with `SUPABASE_ANON_KEY` for realtime subscriptions
   - One with `SUPABASE_SERVICE_KEY` for admin operations (insert, update, delete)

2. Example pattern:
```javascript
const supabaseRealtime = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  realtime: { params: { eventsPerSecond: 10 } }
});

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// Use anon client for subscriptions
supabaseRealtime.channel('my-channel')
  .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'my_table' }, callback)
  .subscribe();

// Use admin client for operations
await supabaseAdmin.from('my_table').insert({ ... });
```

This is implemented in `/scripts/document-chat-listener.js`.

## Debugging with Supabase MCP

### Important: Use MCP Tools for Database Debugging
The Supabase MCP (Model Context Protocol) server is configured and available for debugging database-related issues. **Always use these tools when debugging** instead of guessing about database state:

- Query tables directly to verify data exists
- Check table schemas and column types
- Inspect foreign key relationships
- Review Row Level Security policies
- Understand trigger functions and their behavior
- Verify data before and after operations

### Available MCP Commands
The MCP tools allow direct database queries through natural language:
- "Show me the schema of the proposals table"
- "List all trips for user X"
- "Check if proposal_votes table has the comment column"
- "Show the relationship between trips and places"
- "What RLS policies exist for trip_chat_messages?"

### When to Use MCP Tools
- **Before debugging errors**: Check if expected data exists
- **Schema issues**: Verify column names and types match your code
- **Permission errors**: Review RLS policies for the table
- **Foreign key errors**: Inspect relationships between tables
- **Migration issues**: Confirm table structure after migrations
- **Data validation**: Ensure seed data loaded correctly

Using MCP tools provides accurate, real-time database information and significantly speeds up debugging compared to trial-and-error approaches.

## Cloudflare Workers Chat System

### Overview
The document chat uses **Cloudflare Workers** with **Durable Objects** for real-time WebSocket communication and **Workers AI** (Llama-3.1-8b-instruct) for streaming AI responses.

### Architecture

**Components:**
- **Cloudflare Worker** (`/workers/chat/src/index.ts`) - Main entry point with health check and WebSocket routing
- **Durable Object** (`ChatRoomV2` class) - Manages WebSocket connections per document
- **Workers AI Binding** - Provides LLM inference for chat responses
- **Frontend Hook** (`/expo-app/hooks/useChatWebSocket.ts`) - React hook for WebSocket management
- **UI Component** (`/expo-app/components/DocumentChat.tsx`) - Chat interface

**Flow:**
```
User opens document
    ↓
Frontend connects to wss://tourvision-chat.mads-9b9.workers.dev/chat/{documentId}
    ↓
Worker routes to Durable Object for that documentId
    ↓
Durable Object creates WebSocket pair and accepts connection
    ↓
User sends chat_message
    ↓
Durable Object broadcasts message to all connected clients
    ↓
Durable Object generates AI response using Workers AI (streaming)
    ↓
AI response chunks broadcast to clients in real-time
```

### Durable Object Implementation

The ChatRoomV2 class uses native Cloudflare Durable Objects API (not PartyKit):

```typescript
export class ChatRoomV2 {
  constructor(private state: DurableObjectState, private env: Env) {}

  async fetch(request: Request): Promise<Response> {
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    this.state.acceptWebSocket(server);

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    // Handle incoming messages
  }

  private broadcast(message: string) {
    for (const ws of this.state.getWebSockets()) {
      ws.send(message);
    }
  }
}
```

### Message Protocol

**Client → Server:**
```json
{
  "type": "chat_message",
  "content": "User message text",
  "user_id": "user-uuid",
  "metadata": {}
}
```

**Server → Client:**
```json
// History on connect
{"type": "history", "messages": []}

// User message broadcast
{"type": "message", "message": {ChatMessage}}

// AI streaming chunks
{"type": "ai_chunk", "message_id": "uuid", "chunk": "text", "done": false}

// AI completion
{"type": "ai_chunk", "message_id": "uuid", "chunk": "", "done": true, "message": {ChatMessage}}

// Tool execution request (NEW)
{"type": "tool_request", "tool_id": "uuid", "tool_name": "geocode", "args": {"location": "Paris, France"}}

// Errors
{"type": "error", "error": "Error message"}
```

**Client → Server (Tool Results):**
```json
// Tool result success
{
  "type": "tool_result",
  "tool_id": "uuid",
  "result": {
    "place_name": "Paris, France",
    "lat": 48.8566,
    "lng": 2.3522,
    "source": "nominatim"
  }
}

// Tool result error
{
  "type": "tool_result",
  "tool_id": "uuid",
  "error": "Location not found"
}
```

### Frontend Tool Delegation (NEW)

The chat system now supports **client-delegated tool execution**, allowing the LLM to request actions from the frontend. This avoids rate limits and leverages browser capabilities.

**Architecture:**
```
User: "We'll meet in Lejre and drive to Copenhagen"
    ↓
Worker: LLM detects locations
    ↓
Worker → Frontend: tool_request (geocode Lejre)
    ↓
Frontend: Executes Nominatim geocoding (with rate limiting & caching)
    ↓
Frontend → Worker: tool_result (coordinates)
    ↓
Worker: LLM continues with accurate coordinates
    ↓
Worker → Frontend: Streaming response with geo-marks
```

**Available Tools:**
- `geocode` - Get accurate coordinates for location names using Nominatim API

**Frontend Tool Registry:** `/expo-app/utils/tool-registry.ts`
**Worker Tool Schemas:** `/workers/chat/src/client-tools.ts`
**Rate Limiting:** `/expo-app/utils/rate-limiter.ts` (1 req/sec for Nominatim)
**Caching:** LRU cache (100 entries, 1 hour TTL)

**How It Works:**
1. LLM outputs tool call as HTML comment: `<!-- TOOL:geocode:{"location":"Paris, France"} -->`
2. Worker parses tool call, sends `tool_request` to frontend via WebSocket
3. Frontend executes tool using `tool-registry.ts`
4. Frontend sends `tool_result` back to worker
5. Worker removes tool comment and continues streaming

**Adding New Tools:**
1. Add schema to `/workers/chat/src/client-tools.ts`
2. Implement handler in `/expo-app/utils/tool-registry.ts`
3. Update system prompt in worker to describe tool usage

### Deployment

**Deploy to Cloudflare:**
```bash
cd workers/chat
npx wrangler deploy
```

**Monitor logs:**
```bash
npx wrangler tail --format pretty
```

**Test connection:**
```bash
node test-chat-connection.js
```

### Environment Variables

Frontend (`/expo-app/.env.local`):
```bash
EXPO_PUBLIC_CHAT_WS_URL=wss://tourvision-chat.mads-9b9.workers.dev
```

### Configuration

Worker configuration in `/workers/chat/wrangler.toml`:
```toml
name = "tourvision-chat"

[ai]
binding = "AI"

[[durable_objects.bindings]]
name = "CHAT_ROOM"
class_name = "ChatRoomV2"
script_name = "tourvision-chat"

[[migrations]]
tag = "v2"
renamed_classes = [{from = "ChatRoom", "to" = "ChatRoomV2"}]
```

### Troubleshooting

**Connection Issues:**
- Check worker logs with `npx wrangler tail`
- Verify WebSocket URL in `.env.local`
- Test with `node test-chat-connection.js`

**Empty AI Responses:**
- Cloudflare Workers AI models sometimes return empty responses for simple queries
- Try more detailed prompts
- Check worker logs for AI generation errors

**WebSocket Closes Immediately:**
- Normal browser behavior - connections are maintained while page is open
- Code 1005/1006 closures are expected on page unload

## Tiptap Cloud Collaboration

### Overview
The app uses **Tiptap Cloud** (managed Hocuspocus) for real-time document collaboration via Y.js CRDT. This replaces the previous self-hosted Hocuspocus server.

### Architecture

**Components:**
1. **Tiptap Cloud** - Managed WebSocket server at `wss://cloud.tiptap.dev/yko82w79`
2. **JWT Authentication** - Supabase Edge Function generates signed tokens
3. **HocuspocusProvider** - Y.js provider connecting to Tiptap Cloud
4. **ProseMirror WebView** - Editor with Y.js sync plugins

**Flow:**
```
User opens document
    ↓
Frontend requests token from Edge Function (/generate-tiptap-token)
    ↓
Edge Function signs JWT with TIPTAP_APP_SECRET
    ↓
Frontend passes token + wss://cloud.tiptap.dev/yko82w79 to WebView
    ↓
WebView creates HocuspocusProvider with token
    ↓
Provider connects to Tiptap Cloud
    ↓
Y.js syncs document state via WebSocket + WebRTC
```

### JWT Token Generation

**Edge Function:** `/supabase/functions/generate-tiptap-token/index.ts`

Generates JWT with:
- **Algorithm:** HS256
- **Claims:**
  - `iat` - Issued at timestamp
  - `exp` - Expiration (24 hours)
  - `allowedDocumentNames` - Array of document IDs this token can access
  - `userId` - Supabase user ID
  - `userName` - User's display name

**Token Request:**
```typescript
const { data: tokenData } = await supabase.functions.invoke('generate-tiptap-token', {
  body: { documentName: tripId }
});

const tiptapToken = tokenData.token;
```

### WebView Integration

**File:** `/expo-app/assets/prosemirror-editor-bundled.html`

```javascript
// Receives startCollaboration message with token
const { documentId, userId, userName, token, serverUrl } = data;

// Create HocuspocusProvider
yProvider = new HocuspocusProvider({
  url: serverUrl, // wss://cloud.tiptap.dev/yko82w79
  name: documentId,
  document: ydoc,
  token: token,
  awareness: awareness,
  onConnect: () => console.log('Connected to Tiptap Cloud'),
  onSynced: ({ state }) => console.log('Document synced')
});
```

### Environment Variables

**Frontend** (`/expo-app/.env.local`):
```bash
EXPO_PUBLIC_TIPTAP_APP_ID=yko82w79
```

**Backend** (`/supabase/.env.local`):
```bash
TIPTAP_APP_SECRET=f6d9a7d903b990ce6b707be28ae19bf6941dcdc29a0137cd6233cd015a64fffe
```

### Deployment

**Deploy Edge Function:**
```bash
npx supabase functions deploy generate-tiptap-token --project-ref unocjfiipormnaujsuhk
```

**Set Secret:**
```bash
npx supabase secrets set TIPTAP_APP_SECRET=<secret> --project-ref unocjfiipormnaujsuhk
```

## Cloudflare Pages Deployment

### Overview
The Expo web app is deployed to Cloudflare Pages. A critical fix is implemented to ensure @expo/vector-icons fonts load correctly.

### The Problem
Wrangler (Cloudflare's deployment tool) has default ignore patterns that skip `node_modules` directories, even in build output. Expo exports font files to deeply nested paths like:
```
dist/assets/node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/*.ttf
```

This caused only 42 of 82 files to upload, resulting in missing icons on the deployed site.

### The Solution
A post-build script (`scripts/fix-cloudflare-assets.js`) automatically:
1. Moves all font files from `assets/node_modules/.../Fonts/` to `assets/fonts/`
2. Removes the problematic `assets/node_modules` directory entirely
3. Updates font path references in the bundled JavaScript files

This ensures all 61+ files upload correctly to Cloudflare Pages.

### Build & Deploy Commands

**Build for web with Cloudflare fix:**
```bash
cd expo-app
npm run build:web
```

This runs:
1. `npx expo export -p web` - Exports static site to `dist/`
2. `node scripts/fix-cloudflare-assets.js` - Moves fonts and updates references
3. `node scripts/prepare-cloudflare-deploy.js` - Creates `_worker.js` and `_headers`

**Deploy to production:**
```bash
npm run deploy
```

**Deploy to preview:**
```bash
npm run deploy:preview
```

### Manual Deployment
```bash
# Build first
npm run build:web

# Then deploy
wrangler pages deploy dist --project-name tourvision
```

### Verifying the Fix
After building, verify fonts are in the correct location:
```bash
ls -la dist/assets/fonts/
# Should show 19 .ttf files (AntDesign, Ionicons, MaterialIcons, etc.)

find dist/assets -name "node_modules"
# Should return nothing (directory removed)

find dist -type f | wc -l
# Should show 61+ files (not just 42)
```

### Testing Collaboration

1. **Start Expo app:**
   ```bash
   npx expo start --web --port 8082
   ```

2. **Open a trip document** and click "Enable Collaboration"

3. **Open the same trip in another browser tab**

4. **Make edits** - Changes should sync instantly via Tiptap Cloud

5. **Check browser console** for connection logs:
   - `[WebView] Connected to Tiptap Cloud`
   - `[WebView] Document synced`

### Benefits

- ✅ **No server management** - Tiptap handles all infrastructure
- ✅ **Automatic scaling** - Handles any number of collaborators
- ✅ **JWT authentication** - Secure, document-level access control
- ✅ **WebRTC + WebSocket** - Optimal P2P sync with server fallback
- ✅ **Production-ready** - Managed service with SLA and monitoring
- ✅ **Global CDN** - Low-latency connections worldwide

### Troubleshooting

**Token generation fails:**
- Check that `TIPTAP_APP_SECRET` is set in Supabase secrets
- Verify user is authenticated (session available)
- Check Edge Function logs for errors

**WebSocket connection fails:**
- Verify `EXPO_PUBLIC_TIPTAP_APP_ID` is correct
- Check browser console for connection errors
- Ensure token is being passed correctly to WebView

**Document doesn't sync:**
- Check that Y.js state is being initialized correctly
- Verify `ySyncPlugin` is included in ProseMirror plugins
- Look for errors in WebView console logs

## ProseMirror Editor Architecture

### IMPORTANT: HTML-Based ProseMirror (Not React DOM Components!)

The trip document editor uses an **HTML-based ProseMirror implementation** loaded via WebView, **NOT** the React DOM component pattern used elsewhere in the app.

#### Key Files

**Schema Definition**: `/expo-app/assets/prosemirror-bundle-src.js`
- Defines the ProseMirror schema with nodes and marks
- This is the **actual schema** used by the editor
- **NOT** `/expo-app/utils/prosemirror-schema.ts` (that file is for a different editor)

**HTML Template**: `/expo-app/assets/prosemirror-editor-bundled.html`
- Contains the editor UI and message handlers
- Handles commands like `createGeoMark`, `setContent`, `toggleBold`, etc.
- Processes messages from React Native via `window.addEventListener('message')`

**Build Script**: `/expo-app/build-prosemirror.js`
- Bundles `prosemirror-bundle-src.js` with esbuild
- Inserts bundled JavaScript into HTML template
- Outputs to `/expo-app/assets/prosemirror-editor-bundled-final.js`

**WebView Wrapper**: `/expo-app/components/ProseMirrorWebView.tsx`
- Loads the bundled HTML file
- Sends messages to WebView via `postMessage`
- Receives document updates from WebView

#### Building the Bundle

After making changes to the schema or HTML template:

```bash
cd expo-app
npm run build:prosemirror
```

This command:
1. Bundles `prosemirror-bundle-src.js` into a single file
2. Inserts the bundle into `prosemirror-editor-bundled.html`
3. Exports as a JavaScript module: `prosemirror-editor-bundled-final.js`

**Metro Bundler Caching**: If changes don't appear after rebuilding:
- Touch the ProseMirrorWebView.tsx file to trigger Metro reload
- Clear Metro cache: `rm -rf .expo && rm -rf node_modules/.cache`
- Change the log message in ProseMirrorWebView.tsx to force a new bundle

### Geo-Mark Implementation

#### Structure: Inline Nodes (Not Marks!)

Geo-marks are **inline nodes** (like inline code or links), not text marks (like bold/italic). This is critical for proper rendering with background colors.

**Correct Structure** (inline node):
```json
{
  "type": "geoMark",
  "attrs": {
    "geoId": "loc-123",
    "placeName": "Copenhagen, Denmark",
    "lat": 55.6867,
    "lng": 12.5700,
    "colorIndex": 0,
    "coordSource": "manual",
    "description": "Optional short text",
    "visitDocument": {
      "type": "doc",
      "content": [
        {"type": "paragraph", "content": [{"type": "text", "text": "Rich text notes"}]}
      ]
    },
    "transportFrom": null,
    "transportProfile": "walking",
    "waypoints": null,
    "photoName": null
  },
  "content": [
    {"type": "text", "text": "Copenhagen"}
  ]
}
```

**Old Structure** (mark - WRONG!):
```json
{
  "type": "text",
  "marks": [
    {"type": "geoMark", "attrs": {...}}
  ],
  "text": "Copenhagen"
}
```

#### Why Inline Nodes?

1. **Background Colors**: NodeViews can apply background colors properly
2. **Click Handling**: Nodes can be clicked independently
3. **Attributes**: Nodes can store complex data like `visitDocument`
4. **Rendering**: Read mode can render with proper styling

#### Visit Document Structure

The `visitDocument` attribute stores **rich text notes** about a location as a complete ProseMirror document:

```typescript
visitDocument: {
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [
        {type: 'text', text: 'Wonderful place to visit!'}
      ]
    },
    {
      type: 'heading',
      attrs: {level: 2},
      content: [
        {type: 'text', text: 'What to do'}
      ]
    },
    {
      type: 'paragraph',
      content: [
        {type: 'text', text: 'Visit the harbor, see Nyhavn, etc.'}
      ]
    }
  ]
}
```

This allows users to:
- Add formatted notes (headings, lists, bold, italic)
- Write detailed visit descriptions
- Keep notes separate from the main trip document

#### Creating Geo-Marks

When a location is saved from the create-location screen:

1. **Plain text description** is converted to a `visitDocument`:
   ```typescript
   const visitDocument = description.trim() ? {
     type: 'doc',
     content: [{
       type: 'paragraph',
       content: [{type: 'text', text: description.trim()}]
     }]
   } : null;
   ```

2. **Geo-mark data** is passed to the editor:
   ```typescript
   const geoMarkData = {
     geoId: 'loc-...',
     placeName: 'Copenhagen, Denmark',
     lat: 55.6867,
     lng: 12.5700,
     visitDocument: visitDocument,
     // ... other fields
   };
   ```

3. **WebView receives** the data via `createGeoMark` message

4. **HTML template creates** the inline node:
   ```javascript
   const geoMarkNode = schema.nodes.geoMark.create(
     {
       geoId: data.geoMarkData.geoId,
       visitDocument: data.geoMarkData.visitDocument,
       // ... other attrs
     },
     schema.text(selectedText)  // Text content
   );
   ```

#### Editing Visit Notes

The edit-visit screen (`/expo-app/app/(mock)/trip/[id]/location/[locationId]/edit-visit.tsx`) allows editing the `visitDocument`:

1. **Find the geo-mark node** by geoId:
   ```typescript
   if (node.type === 'geoMark' && node.attrs?.geoId === locationId) {
     return {
       ...node,
       attrs: {
         ...node.attrs,
         visitDocument: currentDoc  // Updated document
       }
     };
   }
   ```

2. **Update is recursive** - traverses the entire document tree

3. **Saves back** to the trip document in local storage

#### Read Mode Rendering

In read mode, geo-marks are rendered with:
- Parsed document JSON
- Background colors for visual distinction
- Clickable navigation to location details

**Background color formula**:
```typescript
const colors = [
  '#3B82F6', '#8B5CF6', '#10B981', '#F59E0B', '#EF4444',
  '#EC4899', '#06B6D4', '#84CC16', '#F97316', '#6366F1'
];
const bgColor = `${colors[colorIndex % colors.length]}33`; // 33 = 20% opacity
```

### Common Issues

#### Geo-Marks Not Rendering with Background Colors

**Symptom**: Geo-marks appear as plain text without highlighting in read mode

**Cause**: Geo-marks are stored as marks instead of nodes

**Solution**: Check the document structure - geo-marks must be nodes:
```bash
# Query to check structure
docker exec supabase_db_tourvision-mobile psql -U postgres -d postgres -c \
  "SELECT jsonb_pretty(document) FROM trips WHERE id = 'YOUR_TRIP_ID' LIMIT 1;"
```

#### Bundle Changes Not Appearing

**Symptom**: After running `npm run build:prosemirror`, changes don't appear in the app

**Cause**: Metro bundler has cached the old bundle

**Solution**:
1. Make a small change to `ProseMirrorWebView.tsx` (e.g., update a log message)
2. Or clear Metro cache: `rm -rf .expo && watchman watch-del-all`
3. Or restart Expo with `--clear` flag

#### Visit Notes Not Saving

**Symptom**: After editing visit notes, they disappear or don't persist

**Causes**:
1. Edit-visit screen is looking for geo-mark as a mark instead of node
2. Saving to wrong attribute (`contextDocument` instead of `visitDocument`)

**Solution**: Ensure `edit-visit.tsx` searches for `node.type === 'geoMark'` and updates `visitDocument`

#### Schema Mismatch Errors

**Symptom**: `geoMark node type not found in schema` error in WebView

**Cause**: The HTML template's message handler is trying to access the wrong schema type (e.g., `schema.marks.geoMark` instead of `schema.nodes.geoMark`)

**Solution**: Check `prosemirror-editor-bundled.html` in the `createGeoMark` handler - it should use `schema.nodes.geoMark`

### Development Workflow

1. **Make schema changes** in `assets/prosemirror-bundle-src.js`
2. **Update HTML handlers** in `assets/prosemirror-editor-bundled.html` if needed
3. **Rebuild bundle**: `npm run build:prosemirror`
4. **Trigger Metro reload**: Touch `ProseMirrorWebView.tsx` or change a log message
5. **Test in app**: Create/edit locations and verify structure in logs or database