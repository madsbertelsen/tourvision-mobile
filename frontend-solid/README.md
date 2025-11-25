# TourVision - SolidJS Collaborative Editor

A real-time collaborative document editor built with SolidJS, ProseMirror, and Y.js. Features geo-location marking, map visualization, and multi-user editing with cursor awareness.

## Features

✅ **Real-time Collaboration** - Multi-user editing with Y.js CRDT
✅ **Geo-Marks** - Location annotations with colored backgrounds
✅ **Map Integration** - Mapbox GL JS map preview with markers
✅ **Cursor Awareness** - See other users' cursors and selections
✅ **Offline Support** - IndexedDB persistence for instant loading
✅ **Type-Safe** - Full TypeScript support
✅ **SCSS Modules** - Scoped component styling

## Architecture

### Frontend (SolidJS)
- **Framework**: SolidJS with TypeScript
- **Editor**: ProseMirror with custom schema
- **Collaboration**: Y.js with WebSocket sync
- **Maps**: Mapbox GL JS
- **Styling**: SCSS modules
- **Build**: Vite

### Backend (Express.js)
- **Server**: Express.js with WebSocket
- **Y.js Sync**: y-websocket protocol
- **Persistence**: LevelDB for document storage
- **CORS**: Enabled for local development

## Project Structure

```
frontend-solid/
├── client/                  # SolidJS frontend
│   ├── src/
│   │   ├── components/
│   │   │   ├── Editor/      # ProseMirror editor wrapper
│   │   │   ├── Map/         # Map preview component
│   │   │   ├── Presence/    # User awareness avatars
│   │   │   └── UI/          # Header and controls
│   │   ├── stores/
│   │   │   ├── collaboration.ts   # Y.js provider
│   │   │   ├── locations.ts       # Geo-marks store
│   │   │   └── document.ts        # Document management
│   │   ├── lib/
│   │   │   ├── prosemirror-schema.ts  # Custom schema
│   │   │   ├── geocoding.ts           # Nominatim API
│   │   │   └── mapbox.ts              # Map utilities
│   │   ├── styles/          # Global & component styles
│   │   ├── App.tsx          # Root component
│   │   └── index.tsx        # Entry point
│   ├── index.html
│   ├── package.json
│   └── vite.config.ts
│
└── server/                  # Express.js backend
    ├── src/
    │   ├── index.ts         # Express app
    │   └── yjs-server.ts    # Y.js WebSocket handler
    ├── package.json
    └── tsconfig.json
```

## Quick Start

### Prerequisites
- Node.js 18+
- npm or bun

### 1. Install Dependencies

```bash
# Install server dependencies
cd frontend-solid/server
npm install

# Install client dependencies
cd ../client
npm install
```

### 2. Configure Environment Variables

**Server (.env):**
```bash
cd server
cp .env.example .env
# Edit .env if needed (defaults work for local dev)
```

**Client (.env):**
```bash
cd client
cp .env.example .env
# Add your Mapbox token:
VITE_MAPBOX_TOKEN=pk.your_token_here
```

### 3. Start the Backend

```bash
cd server
npm run dev
```

Server will start on `http://localhost:8788`
WebSocket endpoint: `ws://localhost:8788/yjs`

### 4. Start the Frontend

```bash
cd client
npm run dev
```

Frontend will start on `http://localhost:5175`

### 5. Test Collaboration

1. Open `http://localhost:5175` in multiple browser tabs
2. Create a new document
3. Copy the URL with `?doc=...` parameter
4. Open the same URL in another tab
5. Start typing - you should see real-time sync and user cursors!

## Usage

### Creating Documents
- Click "New Document" button
- Document ID is auto-generated and stored in localStorage
- Documents persist across browser refresh (IndexedDB)

### Adding Geo-Marks
Geo-marks are currently created programmatically. To add one via console:

```javascript
// In browser console:
const view = document.querySelector('.ProseMirror').pmViewDesc.view;
const { state, dispatch } = view;
const { tr, schema } = state;

const geoMark = schema.marks.geoMark.create({
  geoId: 'loc-' + Date.now(),
  displayText: 'Paris',
  placeName: 'Paris, France',
  lat: '48.8566',
  lng: '2.3522',
  colorIndex: 0
});

dispatch(tr.addMark(0, 5, geoMark)); // Marks first 5 characters
```

### Map Preview
- Map automatically shows all locations from geo-marks
- Colored markers match geo-mark backgrounds
- Click markers to see location name

## Development

### Building for Production

**Server:**
```bash
cd server
npm run build
npm start
```

**Client:**
```bash
cd client
npm run build
npm run preview
```

### File Watching
Both dev commands support hot reload:
- Server: `tsx watch` restarts on file changes
- Client: Vite HMR for instant updates

## Technology Stack

### Frontend Dependencies
- `solid-js` - Reactive UI framework
- `prosemirror-*` - Rich text editor
- `yjs` + `y-prosemirror` - CRDT collaboration
- `y-websocket` - WebSocket sync provider
- `y-indexeddb` - Offline persistence
- `mapbox-gl` - Map rendering
- `sass` - SCSS preprocessing

### Backend Dependencies
- `express` - HTTP server
- `ws` - WebSocket server
- `yjs` - CRDT document model
- `y-leveldb` - LevelDB persistence
- `lib0` - Y.js utilities
- `cors` - Cross-origin resource sharing

## Customization

### Changing Colors
Edit `COLORS` array in `src/lib/prosemirror-schema.ts`:

```typescript
export const COLORS = [
  '#3B82F6',  // Blue
  '#8B5CF6',  // Purple
  // Add more colors...
];
```

### Adding New Marks
Extend the schema in `src/lib/prosemirror-schema.ts`:

```typescript
.addToEnd('myMark', {
  attrs: { /* ... */ },
  parseDOM: [{ /* ... */ }],
  toDOM(mark) { /* ... */ }
})
```

### Changing Map Style
Update Mapbox style in map components:

```typescript
style: 'mapbox://styles/mapbox/streets-v12' // or dark-v11, satellite-v9, etc.
```

## Troubleshooting

**WebSocket connection fails:**
- Check server is running on port 8788
- Verify `VITE_WS_URL` in client/.env
- Check CORS settings in server/src/index.ts

**Map doesn't render:**
- Verify `VITE_MAPBOX_TOKEN` is set in client/.env
- Check browser console for Mapbox errors
- Ensure token has proper permissions

**Documents not persisting:**
- Check browser IndexedDB (DevTools > Application > IndexedDB)
- Verify localStorage is enabled
- Check for private browsing mode

**Multiple users not syncing:**
- Ensure both users have same document ID in URL
- Check WebSocket connection status in header
- Verify server logs show multiple connections

## Future Enhancements

- [ ] Embedded map blocks (ProseMirror NodeViews)
- [ ] Fullscreen map overlay
- [ ] Route visualization between locations
- [ ] AI agent integration for auto-location detection
- [ ] React Native WebView bridge
- [ ] Document export (JSON, Markdown)
- [ ] Real-time commenting
- [ ] Undo/redo history visualization

## License

Private - TourVision Project

## Credits

Built by converting the existing ProseMirror/Y.js editor to SolidJS architecture.

Original features:
- Geo-mark system
- Collaborative editing
- Map integration

New SolidJS implementation:
- Reactive component architecture
- Type-safe stores
- SCSS modules
- Improved separation of concerns
