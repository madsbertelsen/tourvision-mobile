# Summary of Changes: Expo App at Root

## Overview
Configured the deployment so the Expo mobile app is served at root (`/`) with Next.js pages accessible at specific routes like `/admin`, `/login`, etc.

## Changes Made

### 1. Moved Next.js Chat to `/admin`
**Files Modified:**
- Moved `app/(chat)/page.tsx` → `app/admin/page.tsx`
- Updated import: `import { auth } from '@/app/(auth)/auth';`

**Rationale:** The Next.js chat interface was at root (`/`), conflicting with the Expo app. Moved it to `/admin` to free up the root path.

### 2. Updated Middleware
**File:** `nextjs-api/middleware.ts`

**Changes:**
```typescript
// Serve Expo app at root by rewriting to index.html
if (pathname === '/') {
  return NextResponse.rewrite(new URL('/index.html', request.url));
}

// Allow Expo app routes to pass through (public access)
if (pathname.startsWith('/(') ||  // Expo route groups
    pathname.startsWith('/location/') ||
    pathname.startsWith('/trip/') ||
    pathname.endsWith('.html')) {
  return NextResponse.next();
}

// Updated redirect from /login to go to /admin instead of /
if (token && !isGuest && ['/login', '/register'].includes(pathname)) {
  return NextResponse.redirect(new URL('/admin', request.url));
}

// Updated matcher config
matcher: [
  '/admin',  // Changed from '/'
  '/chat/:id',
  '/api/:path*',
  '/login',
  '/register',
  // Updated exclusions in wildcard matcher
  '/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|_expo|assets|.*\\.html).*)',
]
```

**Rationale:**
- Explicit rewrite to `/index.html` required because Next.js middleware intercepts root path
- Simply returning `NextResponse.next()` results in 404 (Next.js tries to route through app)
- Rewrite ensures static file from `public/` folder is served
- Allow public access to Expo app routes
- Protect Next.js admin routes
- Prevent redirect loops

### 3. Updated Documentation
**File:** `DEPLOYMENT.md`

**Changes:**
- Updated routing priority documentation
- Updated verification URLs to include `/admin`
- Clarified that Expo app is at root

## URL Structure

### Production URLs
- **`/`** - Expo mobile app (public)
- **`/(mock)/*`** - Expo mock routes (public)
- **`/(auth)/*`** - Expo auth routes (public)
- **`/trip/[id]`** - Expo trip details (public)
- **`/location/[id]`** - Expo location details (public)
- **`/admin`** - Next.js chat interface (requires auth)
- **`/login`** - Next.js login page
- **`/register`** - Next.js register page
- **`/chat/[id]`** - Next.js individual chats (requires auth)
- **`/api/*`** - API routes

## Testing

### Build Test
```bash
cd nextjs-api
pnpm run build
```
✅ **Result:** Build successful, all 23 routes generated

### File Verification
```bash
ls nextjs-api/public/
```
✅ **Result:** Expo files present:
- `index.html` (Expo entry point)
- `(auth)/`, `(mock)/`, `(public)/` (Expo route groups)
- `trip/`, `location/` (Expo routes)
- `assets/`, `_expo/` (Expo bundles)

## Migration Notes

### For Existing Deployments
If you have an existing deployment with users accessing the Next.js chat at `/`:

1. **Add redirect** in `middleware.ts` for backward compatibility:
   ```typescript
   // Optional: redirect old chat root to new admin route
   if (pathname === '/' && token) {
     // Check if this is a Next.js navigation (not a static file request)
     const accept = request.headers.get('accept') || '';
     if (accept.includes('text/html') && !accept.includes('text/html,')) {
       return NextResponse.redirect(new URL('/admin', request.url));
     }
   }
   ```

2. **Update bookmarks/links** to point to `/admin` instead of `/`

### Environment Variables
No changes required to environment variables. Same configuration works for both development and production.

## Benefits

✅ **Expo app is the primary experience** - Users see the mobile app at root
✅ **Clean URL structure** - `/` for app, `/admin` for admin interface
✅ **No conflicts** - Next.js and Expo routes coexist peacefully
✅ **Public access** - Expo app doesn't require authentication
✅ **Flexible deployment** - Can still deploy to Vercel with same config

## Rollback Instructions

If you need to revert these changes:

1. Move `/admin/page.tsx` back to `/(chat)/page.tsx`
2. Revert middleware.ts changes
3. Update redirect to go back to `/`
4. Rebuild and deploy
