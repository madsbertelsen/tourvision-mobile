# Tiptap Cloud Setup Guide

## Correct Configuration

### WebSocket URL Format
**CORRECT**: `https://APP_ID.collab.tiptap.cloud`
**WRONG**: `wss://cloud.tiptap.dev/APP_ID`

The HocuspocusProvider internally handles the WebSocket upgrade from HTTPS.

### JWT Token Format
The JWT must include these claims:
```json
{
  "iat": 1761227834,        // Issued at (required)
  "nbf": 1761227834,        // Not before (required)
  "exp": 1761314234,        // Expires (required)
  "iss": "https://cloud.tiptap.dev",  // Issuer (required)
  "aud": "yko82w79",        // Audience - your App ID (required)
  "sub": "user-id",         // Subject - user ID (optional but recommended)
  "allowedDocumentNames": ["document-name"]  // Optional
}
```

## Implementation Locations

### 1. Edge Functions
#### `generate-tiptap-token` (`/supabase/functions/generate-tiptap-token/index.ts`)
- Generates JWT tokens for frontend collaboration
- Used when users manually start collaboration

#### `generate-trip-stream` (`/supabase/functions/generate-trip-stream/index.ts`)
- Generates JWT tokens for AI-powered trip generation
- Connects directly to Tiptap Cloud during streaming
- Environment variable: `TIPTAP_APP_SECRET` in `/supabase/.env.local`

### 2. Frontend Context (`/expo-app/contexts/YjsCollaborationContext.tsx`)
- Line 114: `const tiptapUrl = \`https://\${tiptapAppId}.collab.tiptap.cloud\`;`
- Requests token from Edge Function
- Passes URL and token to WebView

### 3. Local AI Agent (`/local-ai-agent/index.ts`)
- Line 67: `const tiptapUrl = \`https://\${TIPTAP_APP_ID}.collab.tiptap.cloud\`;`
- Generates its own JWT for AI operations
- Connects directly to Tiptap Cloud for document updates

## Environment Variables

### Required in `/supabase/.env.local`:
```env
TIPTAP_APP_SECRET=f6d9a7d903b990ce6b707be28ae19bf6941dcdc29a0137cd6233cd015a64fffe
```

### Optional in `/expo-app/.env.local`:
```env
EXPO_PUBLIC_TIPTAP_APP_ID=yko82w79  # Defaults to 'yko82w79' if not set
```

## Testing

### Test Script
```javascript
const { HocuspocusProvider } = require('@hocuspocus/provider');
const Y = require('yjs');
const WebSocket = require('ws');

const provider = new HocuspocusProvider({
  url: 'https://yko82w79.collab.tiptap.cloud',
  name: 'test-document',
  token: 'YOUR_JWT_TOKEN',
  document: new Y.Doc(),
  WebSocketPolyfill: WebSocket
});
```

## Common Issues

### 1. WebSocket Connection Fails with 404
- **Cause**: Using wrong URL format (`wss://cloud.tiptap.dev/APP_ID`)
- **Solution**: Use `https://APP_ID.collab.tiptap.cloud`

### 2. Authentication Failed
- **Cause**: Missing required JWT claims (iat, nbf, exp, iss, aud)
- **Solution**: Ensure all required claims are present

### 3. Connection Stuck in "connecting" State
- **Cause**: Using `wss://` instead of `https://`
- **Solution**: Use `https://` and let HocuspocusProvider handle WebSocket upgrade

## Deployment

### Deploy Edge Function
```bash
npx supabase functions deploy generate-tiptap-token --no-verify-jwt
```

### Start Local AI Agent
```bash
cd local-ai-agent
npm run dev
```

## Verification

1. Check WebSocket connection in browser Network tab
2. Look for successful connection to `wss://yko82w79.collab.tiptap.cloud` (upgraded from HTTPS)
3. Verify documents appear in Tiptap Cloud dashboard: https://cloud.tiptap.dev