# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Development
```bash
# Start development server (web)
npm run web

# Start for iOS
npm run ios

# Start for Android  
npm run android

# Start Expo with all platforms available
npm start
```

### Local Supabase Development
```bash
# Start local Supabase (requires Docker)
npx supabase start

# Check Supabase status and get credentials
npx supabase status

# Apply database migrations
npx supabase db push

# Stop local Supabase
npx supabase stop

# Reset database
npx supabase db reset

# Create new migration
npx supabase migration new <name>
```

## Architecture Overview

### Tech Stack
- **Expo SDK 54** - React Native framework with web support
- **Expo Router** - File-based routing in `/app` directory
- **TipTap** - Rich text editor for itineraries (runs in DOM components)
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
- **DayNode** - Container for daily itineraries
- **TransportationNode** - Travel between destinations
- **GroupSplitNode** - Split group activities
- **TipNode** - Travel tips and recommendations

Each node has specific attributes stored in the TipTap document JSON structure.

#### Routing Structure
- `/app/index.tsx` - Entry point
- `/app/(tabs)/` - Main tab navigation (deprecated, see backup)
- `/app/trip/[id].tsx` - Individual trip view
- `/app/_layout.tsx` - Root layout with providers

### Database Schema

Key tables in Supabase:
- `profiles` - User profiles extending auth.users
- `itineraries` - Trip documents with TipTap JSON
- `places` - Location data with coordinates
- `itinerary_places` - Junction table for places in itineraries
- `collaboration_sessions` - Real-time collaboration state
- `map_tiles` - PMTiles storage for offline maps

Row Level Security (RLS) is enabled on all tables.

### State Management

The app uses Zustand stores:
- `/stores/itinerary-store.ts` - Main itinerary state with persistence

State includes:
- Current itinerary document
- Destinations and split groups
- View preferences
- Collaboration state

### Environment Configuration

Required environment variables in `.env.local`:
```
EXPO_PUBLIC_SUPABASE_URL=your_supabase_url
EXPO_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

For local development, use credentials from `npx supabase status`.

## Development Notes

### TypeScript Configuration
- Strict mode enabled
- Path alias `@/` maps to root directory
- Extends Expo's base tsconfig

### Platform-Specific Code
- Use `Platform.OS` to check platform ('web', 'ios', 'android')
- SecureStore for auth tokens on native, localStorage on web
- DOM components only work on platforms with WebView support

### Prototype Reference
The `/tourvision-prototype/pages/itinerary.html` contains detailed TipTap document schema specifications in HTML comments. This serves as the reference implementation for the data structure.

### Testing Approach
Currently no test framework is configured. When adding tests:
1. Check README for any testing documentation
2. Consider Jest with React Native Testing Library
3. Test both native and DOM components separately