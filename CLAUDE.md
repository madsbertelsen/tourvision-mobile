# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Structure

This is a monorepo with two main applications:
- **`/expo-app`** - Expo React Native frontend (iOS, Android, Web)
- **`/nextjs-api`** - Next.js backend API (currently unused, we use Supabase directly)
- **`/supabase`** - Database migrations and seed data

## Current Status

### ✅ Working Features
- Authentication (login, register, logout, password reset)
- Protected routes with automatic redirect
- Dashboard with user profile display
- Trip cards showing sample trips
- Database seeding with test data
- Web platform support
- **AI-Powered Chat** - Streaming responses with location extraction
- **Interactive Maps** - Mapbox with smooth animations and flying marker
- **Geo-Mark Navigation** - Click locations in chat to focus on map
- **LLM-Biased Geocoding** - Accurate location resolution using Google Places API
- **Enrichment Pipeline** - Automatic coordinate lookup for locations in chat

### 🚧 In Progress
- Trip detail views (`/trip/[id]`) - Mostly complete with document editor
- TipTap editor integration - Working with custom nodes and diff preview
- Collaboration features - Chat and AI proposals working
- Native iOS/Android support - Web platform fully functional

### 📝 Known Limitations
- DOM components (TipTap, Maps) only work on web currently
- No real-time collaboration yet
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
- **TipTap** - Rich text editor for trip itineraries (runs in DOM components)
- **react-map-gl + Mapbox GL** - Interactive maps with animations (runs in DOM components)
- **Supabase** - Backend, auth, and real-time database
- **Zustand** - State management with persistence
- **React Query** - Data fetching and caching
- **Vercel AI SDK** - Streaming AI responses from Next.js API
- **Google Places API** - Location geocoding and disambiguation

### Key Architectural Patterns

#### DOM Components
This app uses Expo DOM components to run web-only libraries (TipTap, react-map-gl) in React Native through WebViews:

1. DOM components are in `/components/dom/` and start with `'use dom';`
2. They're wrapped by native components (e.g., `TipTapEditorWrapper.tsx`)
3. Communication between native and DOM happens via message passing

#### Custom TipTap Nodes
The editor uses custom nodes for travel planning:
- **DestinationNode** - Places with coordinates, booking info, duration
- **DayNode** - Container for daily travel plans
- **TransportationNode** - Travel between destinations
- **GroupSplitNode** - Split group activities
- **TipNode** - Travel tips and recommendations

Each node has specific attributes stored in the TipTap document JSON structure.

#### Routing Structure
- `/expo-app/app/index.tsx` - Dashboard/home screen
- `/expo-app/app/(auth)/` - Authentication screens (login, register, forgot-password)
- `/expo-app/app/(mock)/index.tsx` - Mock chat interface with AI and maps
- `/expo-app/app/(mock)/location/[id].tsx` - Location detail screen
- `/expo-app/app/trip/[id]/` - Trip detail screens with tabs
- `/expo-app/app/_layout.tsx` - Root layout with auth protection

### Database Schema

Key tables in Supabase:
- `profiles` - User profiles extending auth.users
- `trips` - Trip records with itinerary documents (column: `itinerary_document`)
- `places` - Location data with coordinates
- `trip_places` - Junction table for places in trips
- `collaboration_sessions` - Real-time collaboration state
- `map_tiles` - PMTiles storage for offline maps

Row Level Security (RLS) is enabled on all tables.

### State Management

The app uses Zustand stores:
- `/stores/itinerary-store.ts` - Main trip/itinerary state with persistence

State includes:
- Current trip's itinerary document
- Destinations and split groups
- View preferences
- Collaboration state

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

### Prototype Reference
The `/expo-app/tourvision-prototype/pages/itinerary.html` contains detailed TipTap document schema specifications in HTML comments. This serves as the reference implementation for the itinerary document structure stored in the `trips.itinerary_document` column.

### Testing Approach
Currently no test framework is configured. When adding tests:
1. Check README for any testing documentation
2. Consider Jest with React Native Testing Library
3. Test both native and DOM components separately
4. Test auth flow with the seeded test users

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

## Diff Preview System

### Overview
The diff preview system shows proposed changes from AI suggestions before they're applied to the document. This allows users to visualize exactly what will be added, modified, or removed.

### How It Works

1. **AI Proposals**: When users discuss trip changes in chat, the AI creates proposals
2. **Preview Changes**: Click "Show Changes in Document" to see what will be added
3. **Visual Indicators**:
   - Green highlighting/background for additions
   - Strike-through for deletions
   - Yellow highlighting for modifications
4. **Accept/Reject**: Users can then accept or reject the proposed changes

### Implementation Details

#### Core Components

**Diff Visualization Extension** (`/components/dom/tiptap-diff-extension.tsx`):
- ProseMirror extension for rendering diff decorations
- Handles inline decorations for existing content
- Creates widget decorations for new content in empty documents

**Recalculation Utility** (`/utils/recalculate-diff-decorations.ts`):
- Dynamically recalculates decoration positions based on current document
- Handles document evolution between proposal creation and viewing
- Special handling for empty/minimal documents

**Proposal System**:
- Proposals store `diff_decorations` with positions and content
- `proposed_content` contains the full document after changes
- `current_content` snapshot at time of proposal creation

### Testing Diff Preview

#### Manual Testing Steps

1. **Setup**:
   ```bash
   npx supabase db reset --local
   npx expo start --web --port 8082
   ```

2. **Login**:
   - Email: `test@example.com`
   - Password: `TestPassword123!`

3. **Test with Existing Document**:
   - Open "Barcelona Adventure" trip
   - Go to Document tab
   - In chat, suggest: "Add visit to Sagrada Familia"
   - Click "Show Changes in Document" when AI responds
   - Verify green highlighting appears

4. **Test with Empty Document**:
   - Create new trip
   - Go to Document tab (should be empty)
   - Suggest: "Let's start with visiting Madrid"
   - Verify preview appears even in empty document

#### Automated Testing with Playwright

```javascript
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  // Navigate and login
  await page.goto('http://localhost:8082');
  await page.fill('input[type="email"]', 'test@example.com');
  await page.fill('input[type="password"]', 'TestPassword123!');
  await page.click('button:has-text("Sign in")');

  // Open trip document
  await page.waitForSelector('text=Barcelona Adventure');
  await page.click('text=Barcelona Adventure');
  await page.click('text=Document');

  // Trigger AI proposal
  await page.fill('input[placeholder*="message"]', 'Add Sagrada Familia visit');
  await page.press('input[placeholder*="message"]', 'Enter');

  // Test diff preview
  await page.waitForSelector('text=Show Changes in Document', { timeout: 10000 });
  await page.click('text=Show Changes in Document');

  // Verify diff appears
  const diffVisible = await page.locator('.diff-addition-preview').isVisible();
  console.log('Diff preview visible:', diffVisible);

  // Take screenshot
  await page.screenshot({ path: 'diff-preview.png' });

  await browser.close();
})();
```

### Troubleshooting

#### Preview Not Appearing

1. **Check Console Logs**:
   - Look for "DiffVisualization Plugin" messages
   - Verify decoration positions are within document bounds
   - Check if proposed content differs from current

2. **Verify Proposal Data**:
   ```sql
   -- Check if proposal has diff decorations
   SELECT id, title, diff_decorations
   FROM proposals
   WHERE trip_id = 'YOUR_TRIP_ID';
   ```

3. **Common Issues**:
   - Content already exists (duplicate proposal)
   - Document changed since proposal creation
   - Empty document special case not handled

## Edge Functions Development

### Starting Edge Functions
```bash
# Start Edge Functions with environment variables
npx supabase functions serve --env-file ./supabase/.env.local

# The function will be available at:
# http://127.0.0.1:54321/functions/v1/process-chat-message
```

### Monitoring Edge Functions
**Important Note:** Edge Functions are NOT visible in the local Supabase Studio dashboard. This is a known limitation of local development.

#### Option 1: Terminal Logs (Primary Method)
Edge Function logs appear directly in the terminal where `npx supabase functions serve` is running. This shows:
- Incoming requests
- Console.log outputs
- Error messages
- Function execution details

#### Option 2: Monitoring Script
```bash
# Run the monitoring script
./scripts/monitor-edge-function.sh

# This provides an interactive menu to:
# 1. Test the Edge Function directly
# 2. View recent chat messages from database
# 3. View recent AI suggestions
# 4. Check function health
```

#### Option 3: Direct API Testing
```bash
# Test the Edge Function manually
curl -X POST http://127.0.0.1:54321/functions/v1/process-chat-message \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU" \
  -H "Content-Type: application/json" \
  -d '{"message_id": "test-123", "trip_id": "77528bea-3f27-450b-9dce-11f1c18fce0e", "user_id": "test-user", "message": "Test message"}'
```

#### Option 4: Chrome DevTools Debugging
The Edge Function inspector is available on port 8083 (configured in config.toml). You can attach Chrome DevTools for advanced debugging.

### Environment Variables for Edge Functions
Edit `supabase/.env.local` to configure API keys:
```bash
# Mistral API key for AI processing
MISTRAL_API_KEY=your-actual-mistral-api-key

# Optional: other API keys if needed
OPENAI_API_KEY=sk-your-openai-key-here
ANTHROPIC_API_KEY=sk-ant-your-anthropic-key-here
```

### Edge Function Configuration
The function is configured in `supabase/config.toml`:
```toml
[functions.process-chat-message]
verify_jwt = false  # Skip JWT verification for webhook calls
```

### AI-Powered Chat Processing
The `process-chat-message` Edge Function:
1. Triggered automatically when messages are inserted into `trip_chat_messages` table
2. Uses Mistral AI (mistral-small-latest model) to analyze conversations
3. Creates AI suggestions when consensus is detected in chat
4. Stores suggestions in `ai_suggestions` table for voting

### Database Webhook Flow
1. User sends message in chat → Inserted into `trip_chat_messages`
2. Database trigger fires → Calls Edge Function via pg_net
3. Edge Function processes → Analyzes with Mistral AI
4. If consensus detected → Creates suggestion in `ai_suggestions`
5. Real-time subscription → Updates UI with new suggestion

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

## AI Chat and Map Integration

### Overview
The mock chat interface (`/expo-app/app/(mock)/index.tsx`) demonstrates the AI-powered travel planning experience with integrated map visualization and location navigation.

### Architecture

#### Backend API (Next.js)
Located in `/nextjs-api/app/api/chat-simple/route.ts`:
- Uses Vercel AI SDK for streaming responses
- Mistral AI model (`mistral-small-latest`) for chat
- Enrichment pipeline for coordinate lookup
- Tool support for URL content extraction (Firecrawl)

#### Frontend Components

**1. Chat Screen** (`/expo-app/app/(mock)/index.tsx`):
- Uses `useChat` hook from AI SDK
- Displays messages with HTML parsing
- Shows map above chat interface
- Handles geo-mark clicks for navigation

**2. Map Wrapper** (`/expo-app/components/MapViewSimpleWrapper.tsx`):
- Bridge between React Native and DOM component
- Gets `focusedLocation` from MockContext
- Passes location data to map

**3. Map Component** (`/expo-app/components/dom/map-view-simple.tsx`):
- DOM component with Mapbox GL
- Animated camera movements with requestAnimationFrame
- Flying marker with trail effect
- Two-phase animation system

**4. Message Display** (`/expo-app/components/MessageElementWithFocus.tsx`):
- Parses HTML content and geo-marks
- Makes locations clickable
- Updates context on geo-mark click

### Geo-Mark System

#### What are Geo-Marks?
Geo-marks are special HTML spans that wrap location names in AI responses:
```html
<span class="geo-mark"
      data-geo="true"
      data-lat="48.8584"
      data-lng="2.2945"
      data-place-name="Eiffel Tower, Paris, France"
      data-coord-source="google"
      title="📍 Eiffel Tower">
  Eiffel Tower
</span>
```

#### How They Work
1. **AI Generation**: LLM wraps location names in geo-mark spans with approximate coordinates
2. **Enrichment**: Backend pipeline queries Google Places API for accurate coordinates
3. **Display**: Frontend parses and makes them clickable
4. **Navigation**: Click triggers map focus animation

#### Coordinate Sources
- `google` - Accurate coordinates from Google Places Text Search API
- `llm-fallback` - LLM-provided coordinates when API fails
- `cache` - Previously fetched coordinates (24-hour TTL)

### Map Animation System

#### Two-Phase Animation
The map uses a sophisticated two-phase animation to maintain spatial awareness:

**Forward Animation (Focusing on Location)**:
1. **Pan Phase (60%)**: Move camera to location, keeping zoom constant
2. **Zoom Phase (40%)**: Zoom in to detail view (zoom level 12)

**Reverse Animation (Unfocusing)**:
1. **Zoom Phase (40%)**: Zoom out to overview level
2. **Pan Phase (60%)**: Move camera back to original position

#### Implementation Details
- Duration: 2 seconds total
- Easing: `easeInOutCubic` for smooth motion
- Flying marker: Moves ahead of camera by 20%
- Trail effect: Last 20 marker positions rendered as line
- State restoration: Saves view state before focusing

#### Code Location
`/expo-app/components/dom/map-view-simple.tsx`:
- `animateToLocation()` function handles animation logic
- `useEffect` watches `focusedLocation` prop changes
- `prevFocusedLocationRef` prevents infinite loops

### Enrichment Pipeline

#### Purpose
Automatically enriches AI-generated content with accurate coordinates from Google Places API.

#### Flow
1. **LLM Response**: Includes geo-marks with approximate coordinates
2. **Stream Processing**: Transform stream intercepts text chunks
3. **Geo-Mark Detection**: RegEx finds complete `<span class="geo-mark">` tags
4. **Coordinate Lookup**: Queries Google Places API with location bias
5. **Replacement**: Updates data-lat/data-lng with accurate values
6. **Client Rendering**: Frontend receives enriched HTML

#### Code Location
- **Pipeline**: `/nextjs-api/lib/enrichment-pipeline.ts`
  - `EnrichmentPipeline` class handles buffering and processing
  - `createEnrichmentTransform()` creates TransformStream
- **Geocoding**: `/nextjs-api/lib/geocoding-service.ts`
  - `geocodeLocation()` queries Google Places API
  - Supports proximity bias for disambiguation
  - Includes caching with 24-hour TTL

### Google Places API Integration

#### Text Search API
Uses the new Google Places Text Search API (v1):
```typescript
POST https://places.googleapis.com/v1/places:searchText
Headers:
  X-Goog-Api-Key: YOUR_API_KEY
  X-Goog-FieldMask: places.displayName,places.formattedAddress,places.location
Body:
  {
    "textQuery": "Eiffel Tower, Paris",
    "locationBias": {
      "circle": {
        "center": { "latitude": 48.86, "longitude": 2.29 },
        "radius": 50000.0
      }
    }
  }
```

#### Location Disambiguation
The LLM-provided approximate coordinates help disambiguate locations:
- Multiple "Springfield" cities → Uses proximity to select correct one
- Common landmark names → Biases toward expected region
- Radius: 50km circle around LLM coordinates

#### Environment Variables
Required in `/nextjs-api/.env.local`:
```bash
GOOGLE_PLACES_API_KEY=your-api-key-here
# OR
GOOGLE_MAPS_API_KEY=your-api-key-here
```

### Mock Context

#### Purpose
Manages state for the mock chat interface, particularly focused location.

#### Location
`/expo-app/contexts/mock-context.tsx`

#### State
```typescript
interface MockContextType {
  focusedLocation: FocusedLocation | null;
  setFocusedLocation: (location: FocusedLocation | null) => void;
}

interface FocusedLocation {
  id: string;
  name: string;
  lat: number;
  lng: number;
}
```

#### Usage Pattern
1. **Setting Focus**: Click geo-mark → `setFocusedLocation({ id, name, lat, lng })`
2. **Map Response**: Map watches `focusedLocation` prop → Triggers animation
3. **Clearing Focus**: Navigate back → `setFocusedLocation(null)`
4. **State Restoration**: Map animates back to saved view state

### Common Patterns

#### Checking for HTML Content
```typescript
const hasHTMLContent = message.parts?.some((part: any) =>
  part.type === 'text' && (
    part.text?.includes('<itinerary>') ||
    part.text?.includes('<h1>') ||
    part.text?.includes('<ul>') ||
    part.text?.includes('geo-mark')
  )
);
```

#### Parsing Geo-Marks
```typescript
const geoMarkRegex = /<span class="geo-mark"[^>]*data-lat="([^"]*)"[^>]*data-lng="([^"]*)"[^>]*data-place-name="([^"]*)"[^>]*>([^<]*)<\/span>/g;
```

#### Preventing Animation Loops
```typescript
// Track previous value to detect actual changes
const prevFocusedLocationRef = useRef<FocusedLocation | null>(null);

useEffect(() => {
  const prevFocusedLocation = prevFocusedLocationRef.current;

  // Only animate if ID actually changed
  const focusedLocationChanged =
    (!prevFocusedLocation && focusedLocation) ||
    (prevFocusedLocation && !focusedLocation) ||
    (prevFocusedLocation && focusedLocation && prevFocusedLocation.id !== focusedLocation.id);

  if (!focusedLocationChanged) return;

  // ... animation logic

  prevFocusedLocationRef.current = focusedLocation;
}, [focusedLocation]);
```

### Testing the Integration

#### Manual Testing
1. Start Next.js API:
   ```bash
   cd nextjs-api
   PORT=3001 npm run dev
   ```

2. Start Expo app:
   ```bash
   cd expo-app
   npx expo start --web --port 8082
   ```

3. Navigate to mock chat interface
4. Ask AI: "Plan a 3-day trip to Paris"
5. Verify:
   - AI wraps locations in geo-marks
   - Coordinates are enriched by backend
   - Clicking location animates map
   - Back navigation restores view

#### Debugging Tips
- **Check enrichment logs**: Look for `[Geocoding]` and `[EnrichmentPipeline]` in API logs
- **Inspect HTML**: Use browser DevTools to verify geo-mark attributes
- **Monitor API calls**: Check Google Places API requests in Network tab
- **Test without API key**: Verify fallback to LLM coordinates
- **Watch animation**: Open console to see animation logs

### Future Enhancements
- Real-time collaboration on map
- Offline map tiles
- Custom marker clustering
- Route visualization between locations
- Distance/duration calculations
- Integration with TipTap document editor

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

In read mode, geo-marks are rendered by `ProseMirrorNativeRenderer.tsx`:
- Parses the document JSON
- Renders geo-mark nodes with background colors
- Makes them clickable to navigate to location details

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