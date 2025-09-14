# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with the TourVision project.

## Project Overview

AI-powered travel planning application built with Next.js, featuring personalized itinerary generation with interactive maps and smart recommendations.

### Core Technologies
- **Next.js 15** with App Router
- **Vercel AI SDK** for streaming AI responses
- **TypeScript** with strict configuration
- **Tailwind CSS** for styling
- **ProseMirror** for rich text editing
- **Mapbox** for interactive maps
- **React Map GL** for map components

## Itinerary Feature Architecture

The itinerary feature provides an interactive travel planning experience with synchronized text editor and map visualization.

### Key Components

#### 1. Text Editor (`/components/text-editor.tsx`)
- Base ProseMirror editor with suggestions support
- Used for general text artifacts
- Provides rich text editing capabilities

#### 2. Itinerary Editor (`/artifacts/itinerary/itinerary-editor.tsx`)
- Extends base editor with location decoration plugin
- Highlights location links with colored backgrounds
- Synchronizes colors with map markers
- **IMPORTANT**: Must include `prose dark:prose-invert` classes for text styling

#### 3. Location Decorations Plugin (`/lib/editor/location-decorations.tsx`)
- ProseMirror plugin for styling location links
- Finds Google Maps links in document
- Applies colored backgrounds via decorations
- Updates dynamically as content changes
- **Key Pattern**: Uses decorations instead of DOM manipulation to avoid conflicts

#### 4. Color Assignment System (`/artifacts/itinerary/location-color-assignment.ts`)
- Centralized color mapping for consistency
- Ensures map markers and text decorations use same colors
- Extracts location names from markdown content
- Assigns stable color indices to locations

#### 5. Enhanced Text View (`/artifacts/itinerary/enhanced-text-view.tsx`)
- Wrapper component for itinerary editing
- Manages visibility tracking for split view
- Handles location hover interactions
- Passes color map to editor

#### 6. Map View (`/artifacts/itinerary/map-view.tsx`)
- Interactive Mapbox-based map component
- Displays location markers with consistent colors
- Supports hover interactions
- Auto-fits bounds to show all locations
- Handles split view visibility updates

#### 7. Client Component (`/artifacts/itinerary/client.tsx`)
- Main artifact wrapper for itinerary
- Manages view modes (text/map/split)
- Creates and distributes color map
- Coordinates between text and map views

### Color System

The application uses a predefined palette of colors for location markers:

```typescript
const MARKER_COLORS = [
  '#3B82F6', // Blue
  '#10B981', // Emerald
  '#F59E0B', // Amber
  '#EF4444', // Red
  '#8B5CF6', // Violet
  '#EC4899', // Pink
  '#06B6D4', // Cyan
  '#84CC16', // Lime
  // ... more colors
];
```

### Data Flow

1. **Content Parsing**: Enriched itinerary content contains Google Maps links
2. **Color Assignment**: `createLocationColorMap()` assigns consistent colors
3. **Text Rendering**: ProseMirror decorations apply colored backgrounds
4. **Map Rendering**: Markers use same color assignments
5. **Interaction Sync**: Hover/visibility states shared between views

### View Modes

- **Text View**: Full-width text editor with colored location links
- **Map View**: Full-screen interactive map with markers
- **Split View**: Text editor above, map below, with synchronized interactions

## Common Issues & Solutions

### Issue: Text Styling Lost
**Symptom**: Font sizes, weights, headings appear unstyled
**Solution**: Ensure container has `prose dark:prose-invert` classes
```tsx
<div className="relative prose dark:prose-invert" ref={containerRef} />
```

### Issue: Infinite Loop / Page Hanging
**Symptom**: Browser freezes, console shows repeated logs
**Solution**: Use ProseMirror decorations instead of direct DOM manipulation
- ❌ Avoid: MutationObserver with DOM style changes
- ✅ Use: ProseMirror plugins with decoration system

### Issue: Color Mismatch
**Symptom**: Map markers and text have different colors for same location
**Solution**: Use centralized color mapping system
```typescript
const colorMap = createLocationColorMap(content);
// Pass same colorMap to both editor and map
```

### Issue: Decorations Not Updating
**Symptom**: Colors don't change when content updates
**Solution**: Dispatch transaction with color map metadata
```typescript
const tr = editorRef.current.state.tr.setMeta('locationColorMap', colorMap);
editorRef.current.dispatch(tr);
```

## Development Guidelines

### ProseMirror Best Practices

1. **Use Plugins for Custom Behavior**
   - Create plugins for decorations, not direct DOM manipulation
   - Store plugin state in editor state, not React state

2. **Transaction Metadata**
   - Use `tr.setMeta()` to pass data between plugins
   - Check metadata in `apply()` method to update decorations

3. **Decoration Performance**
   - Recreate decorations only when necessary
   - Use `decorations.map()` when document structure unchanged

### Testing with Playwright

When testing the itinerary feature:

1. **Start Dev Server**
   ```bash
   PORT=3001 npm run dev
   ```

2. **Test Location Styling**
   - Create itinerary with multiple locations
   - Verify colors appear in text
   - Check map markers match text colors

3. **Test View Modes**
   - Switch between text/map/split views
   - Verify content persists across switches
   - Check interactions work in split view

### File Structure

```
artifacts/itinerary/
├── client.tsx              # Main artifact component
├── enhanced-text-view.tsx  # Text editor wrapper
├── itinerary-editor.tsx    # ProseMirror editor with decorations
├── map-view.tsx            # Mapbox map component
├── location-parser.ts      # Parse locations from content
├── location-color-assignment.ts  # Color mapping system
└── marker-colors.ts        # Color palette definitions

lib/editor/
├── location-decorations.tsx  # ProseMirror decoration plugin
├── config.ts               # Editor configuration
├── functions.ts            # Editor utilities
└── suggestions.ts          # Suggestions plugin
```

## Important Patterns

### Dynamic Imports for Maps
Always use dynamic imports for map components to avoid SSR issues:
```typescript
const MapView = lazy(() => import('./map-view').then(mod => ({ default: mod.MapView })));
```

### Suspense Boundaries
Wrap dynamically imported components with Suspense:
```tsx
<Suspense fallback={<div>Loading map...</div>}>
  <MapView {...props} />
</Suspense>
```

### Color Map Memoization
Memoize color map calculation for performance:
```typescript
const colorMap = useMemo(() => {
  return createLocationColorMap(content);
}, [content]);
```

### Editor Cleanup
Always cleanup editor on unmount:
```typescript
useEffect(() => {
  // ... create editor
  return () => {
    if (editorRef.current) {
      editorRef.current.destroy();
      editorRef.current = null;
    }
  };
}, []);
```

## Environment Variables

Required for map functionality:
- `NEXT_PUBLIC_MAPBOX_TOKEN`: Mapbox public access token

## Quick Commands

```bash
# Development
npm run dev
PORT=3001 npm run dev  # Alternative port

# Type checking
npm run type-check

# Linting
npm run lint

# Build
npm run build

# Testing with Playwright
npx @playwright/mcp  # Start MCP server
```

## Database Development with Neon MCP

The project uses Neon (PostgreSQL) for data persistence. During development, you can use the Neon MCP tools to inspect and debug database state:

### Common Neon MCP Commands

```typescript
// Get the project ID (for TourVision dev environment)
mcp__neon__list_projects({ search: "tiny-morning" })
// Project ID: tiny-morning-35102689

// Check recent messages in the database
mcp__neon__run_sql({
  projectId: "tiny-morning-35102689",
  sql: "SELECT parts FROM \"Message_v2\" WHERE role = 'assistant' ORDER BY \"createdAt\" DESC LIMIT 1"
})

// View all tables
mcp__neon__get_database_tables({ projectId: "tiny-morning-35102689" })

// Inspect table schema
mcp__neon__describe_table_schema({ 
  projectId: "tiny-morning-35102689", 
  tableName: "Message_v2" 
})
```

### Database Schema Notes

- **Message_v2 Table**: Stores chat messages with `parts` column containing tool calls and responses
- **Chat Table**: Stores chat sessions
- **Document Table**: Stores artifacts/documents created in chats
- Tool call data is stored in the `parts` JSON column with structure like:
  ```json
  {
    "type": "tool-provideQuickReplies",
    "state": "output-available",
    "input": { "question": "...", "options": [...] },
    "output": "..."
  }
  ```

## Recent Improvements

### Location Styling System (Sept 2025)
- Implemented ProseMirror decoration plugin for location styling
- Created centralized color assignment system
- Fixed infinite loop issues with DOM manipulation
- Ensured consistent colors between map and text
- Maintained text typography styles with prose classes

## Known Working Configurations

- Node.js 20+
- Next.js 15.x
- ProseMirror 1.x
- React Map GL 7.x
- Mapbox GL 3.x
- we use pnpm