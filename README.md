# TourVision Mobile

Universal travel planning app built with Expo, React Native, and Supabase.

## Features

- ✏️ Rich text itinerary editor using TipTap
- 🗺️ Interactive maps with react-map-gl
- 📱 Cross-platform (iOS, Android, Web)
- 🔄 Real-time collaboration via Supabase
- 📍 Custom destination and split group nodes
- 🔐 Authentication with Supabase Auth

## Tech Stack

- **Expo SDK 54** - React Native framework
- **Expo Router** - File-based routing
- **TipTap** - Rich text editor (via DOM components)
- **react-map-gl** - Cross-platform maps
- **Supabase** - Backend and real-time database
- **Zustand** - State management
- **React Query** - Data fetching

## Project Structure

```
tourvision-mobile/
├── app/                    # Expo Router pages
│   ├── (tabs)/            # Tab navigation
│   │   ├── index.tsx      # Home screen
│   │   ├── itinerary.tsx  # Itinerary editor
│   │   └── two.tsx        # Profile screen
│   └── _layout.tsx        # Root layout
├── components/            
│   ├── dom/               # DOM components (web)
│   │   ├── tiptap-editor.tsx
│   │   └── map-view.tsx
│   ├── TipTapEditorWrapper.tsx
│   └── MapViewWrapper.tsx
├── lib/
│   ├── supabase/          # Supabase configuration
│   └── tiptap/            # Custom TipTap nodes
├── stores/                # Zustand stores
└── types/                 # TypeScript types
```

## Setup

1. Install dependencies:
```bash
npm install
```

2. Configure environment variables:
Create `.env.local` with:
```
EXPO_PUBLIC_SUPABASE_URL=your_supabase_url
EXPO_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

3. Run the app:
```bash
# Web
npm run web

# iOS
npm run ios

# Android
npm run android
```

## Database Schema

The app uses Supabase with the following main tables:
- `profiles` - User profiles
- `itineraries` - Trip itineraries with TipTap documents
- `places` - Location data
- `collaboration_sessions` - Real-time collaboration

## DOM Components

This app uses Expo DOM components to run web libraries (TipTap, react-map-gl) in React Native:

```typescript
'use dom';  // Enable DOM mode

// Component runs in a WebView on native
export function TipTapEditor() {
  // Regular React component
}
```

## Development

- Node.js 20+ recommended
- Expo Go app for mobile testing
- Web browser for web development

## License

MIT