# Deployment Guide: Unified Next.js + Expo App

This guide explains how to deploy the TourVision mobile app (Expo) and API (Next.js) as a single unified application on Vercel.

## Architecture

The deployment combines two projects into one:

```
nextjs-api/
├── public/              # ← Expo static export goes here
│   ├── index.html       # Expo app entry point
│   ├── (auth)/          # Expo auth routes
│   ├── (mock)/          # Expo mock routes
│   ├── assets/          # Expo assets
│   └── _expo/           # Expo bundles
├── app/                 # Next.js app directory
│   ├── (auth)/          # Next.js auth pages
│   ├── admin/           # Next.js admin chat interface
│   ├── (chat)/          # Next.js chat routes (dynamic)
│   └── api/             # API routes
└── ...
```

**Routing Priority:**
1. Next.js API routes (`/api/*`) - highest priority
2. Next.js pages (`/admin`, `/login`, `/register`, `/chat/[id]`)
3. Static files from public (Expo app at `/`) - serves index.html at root

## Local Development

### Development Workflow
```bash
# Terminal 1: Expo development server
cd expo-app
npx expo start --web --port 8082

# Terminal 2: Next.js API server
cd nextjs-api
PORT=3001 pnpm dev
```

**Environment Variables for Development:**
- `expo-app/.env.local`:
  ```bash
  EXPO_PUBLIC_NEXTJS_API_URL=http://localhost:3001
  EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
  EXPO_PUBLIC_SUPABASE_ANON_KEY=your-local-anon-key
  EXPO_PUBLIC_MAPBOX_TOKEN=your-mapbox-token
  EXPO_PUBLIC_GOOGLE_PLACES_API_KEY=your-google-api-key
  ```

### Testing Production Build Locally
```bash
# Full build
cd nextjs-api
pnpm run build

# Or step by step:
pnpm run build:expo         # Export Expo
pnpm run build:copy-expo    # Copy to public
pnpm run build:next-only    # Build Next.js

# Start production server
pnpm start
```

## Deployment to Vercel

### 1. Initial Setup

Connect your GitHub repository to Vercel:
- Root Directory: `nextjs-api`
- Framework Preset: Next.js
- Build Command: `pnpm run build` (default)
- Output Directory: `.next` (default)

### 2. Environment Variables

Configure in Vercel Dashboard (NOT in .env files):

**Production Environment Variables:**
```bash
# Supabase (production instance)
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-production-anon-key

# API Keys
EXPO_PUBLIC_MAPBOX_TOKEN=your-mapbox-token
EXPO_PUBLIC_GOOGLE_PLACES_API_KEY=your-google-api-key
MISTRAL_API_KEY=your-mistral-api-key

# Database
POSTGRES_URL=postgres://...

# NextAuth (production)
AUTH_URL=https://your-domain.vercel.app
NEXTAUTH_URL=https://your-domain.vercel.app
AUTH_TRUST_HOST=true

# Important: Do NOT set EXPO_PUBLIC_NEXTJS_API_URL in production
# The app will use relative URLs automatically
```

**Local Development Environment Variables** (`nextjs-api/.env.local`):
```bash
# NextAuth (local)
AUTH_URL=http://localhost:3000
NEXTAUTH_URL=http://localhost:3000
AUTH_TRUST_HOST=true

# API Keys (same as production)
NEXT_PUBLIC_MAPBOX_TOKEN=your-mapbox-token
GOOGLE_PLACES_API_KEY=your-google-api-key
MISTRAL_API_KEY=your-mistral-api-key
```

### 3. Deploy

```bash
git add .
git commit -m "feat: Configure unified deployment"
git push origin main
```

Vercel will automatically:
1. Install dependencies in `nextjs-api`
2. Run `deploy_web.sh`:
   - Export Expo web app
   - Copy to Next.js public folder
   - Run database migrations
   - Build Next.js
3. Deploy to production

### 4. Verify Deployment

Test these URLs on your production domain:

- **Expo App (Root)**: `https://your-domain.vercel.app/` (should load Expo app)
- **Expo Routes**: `https://your-domain.vercel.app/(mock)/trip/123`
- **Next.js Admin**: `https://your-domain.vercel.app/admin` (Next.js chat interface)
- **Next.js Auth**: `https://your-domain.vercel.app/login`
- **API Routes**: `https://your-domain.vercel.app/api/chat-simple` (POST request)

## How It Works

### Build Process

1. **Expo Export** (`expo export -p web`):
   - Bundles React Native app for web
   - Generates static HTML/JS/CSS
   - Output: `expo-app/dist/`

2. **Copy to Next.js**:
   - `cp -a expo-app/dist/. nextjs-api/public/`
   - Expo app becomes static assets

3. **Next.js Build**:
   - Builds API routes
   - Builds Next.js pages
   - Includes static files from public

### API URL Resolution

The app automatically uses the correct API URL:

**Development (localhost:8082):**
```typescript
// Uses EXPO_PUBLIC_NEXTJS_API_URL
fetch('http://localhost:3001/api/chat-simple', ...)
```

**Production (your-domain.vercel.app):**
```typescript
// Uses relative URL (same domain)
fetch('/api/chat-simple', ...)
```

**Logic** (`expo-app/lib/ai-sdk-config.ts`):
```typescript
// Development: Use configured API URL
if (window.location.hostname === 'localhost' && process.env.EXPO_PUBLIC_NEXTJS_API_URL) {
  return `${process.env.EXPO_PUBLIC_NEXTJS_API_URL}${path}`;
}

// Production: Use relative URL (same domain)
return path;
```

## File Changes Summary

### New Files
- `nextjs-api/deploy_web.sh` - Build script for unified deployment
- `nextjs-api/vercel.json` - Vercel configuration

### Modified Files
- `expo-app/app/_layout.tsx` - Removed non-existent (tabs) route
- `expo-app/lib/ai-sdk-config.ts` - Smart API URL resolution
- `expo-app/utils/transportation-api.ts` - Environment-based API URLs
- `nextjs-api/next.config.ts` - Added Expo adapter and transpilation
- `nextjs-api/package.json` - Added build scripts
- `nextjs-api/app/(auth)/login/page.tsx` - Wrapped in Suspense for Next.js 15
- `nextjs-api/app/(auth)/register/page.tsx` - Added dynamic export

## Troubleshooting

### Root Path Shows 404 Instead of Expo App

**Symptom**: Accessing `http://localhost:3000/` shows Next.js 404 page instead of Expo app

**Cause**: Next.js middleware catches root path and tries to route it through app router. Simply returning `NextResponse.next()` doesn't serve static files from `public/`.

**Solution**: Use explicit rewrite in middleware:
```typescript
// Serve Expo app at root by rewriting to index.html
if (pathname === '/') {
  return NextResponse.rewrite(new URL('/index.html', request.url));
}
```

**Verify**: Check that `/index.html` returns 200 OK:
```bash
curl -I http://localhost:3000/index.html
```

### Build Fails with "useSearchParams() should be wrapped in a suspense boundary"

**Solution**: Wrap the component using `useSearchParams()` in a `<Suspense>` boundary:

```tsx
import { Suspense } from 'react';

function MyComponent() {
  const searchParams = useSearchParams();
  // ...
}

export default function Page() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <MyComponent />
    </Suspense>
  );
}
```

### Expo Export Fails

**Check for:** Invalid route references in `_layout.tsx`
```bash
cd expo-app
npx expo export -p web --output-dir test-dist
```

### API Calls Fail in Production

**Check:**
1. Environment variables are set in Vercel Dashboard
2. API routes are not returning CORS errors
3. Browser console shows correct API URLs (should be relative like `/api/chat`)

### Static Assets Not Loading

**Check:**
1. `deploy_web.sh` is executable: `chmod +x deploy_web.sh`
2. Expo dist was copied to `nextjs-api/public/`
3. Vercel build logs show Expo export step completed

## Benefits

✅ **Single Domain** - No CORS issues, unified SSL certificate
✅ **Simple Deployment** - One Vercel project instead of two
✅ **Shared Backend** - Expo app and Next.js pages use same API
✅ **Cost Effective** - Single hosting plan
✅ **Fast** - Static Expo app served from CDN

## Limitations

⚠️ **Web Only** - Expo native apps (iOS/Android) need separate builds via EAS
⚠️ **Rebuild Required** - Frontend changes need full rebuild
⚠️ **Route Coordination** - Must ensure Expo and Next.js routes don't conflict

## Next Steps

1. **Custom Domain**: Configure in Vercel Dashboard
2. **Environment Sync**: Keep development and production env vars in sync
3. **Monitoring**: Set up error tracking (Sentry, etc.)
4. **Analytics**: Add Vercel Analytics or similar
5. **Native Builds**: Set up EAS Build for iOS/Android apps separately
