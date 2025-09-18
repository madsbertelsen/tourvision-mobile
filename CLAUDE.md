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

### 🚧 In Progress
- Trip detail views (`/trip/[id]`)
- TipTap editor integration
- Map view with destinations
- Collaboration features
- Native iOS/Android support

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
- **react-map-gl** - Cross-platform maps (runs in DOM components)
- **Supabase** - Backend, auth, and real-time database
- **Zustand** - State management with persistence
- **React Query** - Data fetching and caching

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

### Database Seeding

The `supabase/seed.sql` file creates:
- Test users with bcrypt-hashed passwords
- 5 sample trips with various statuses
- Sample places linked to trips
- Proper auth.users and auth.identities entries

**Important:** The seed uses a hardcoded bcrypt hash for "TestPassword123!" that works reliably.

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