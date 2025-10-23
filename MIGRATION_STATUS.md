# Migration Status: Socket.IO to Y.js + Supabase

## ✅ Completed Migrations

### 1. Document Collaboration (Y.js Migration)
**Status:** ✅ Complete

- Migrated from Socket.IO collaborative editing to Y.js CRDT
- Created `YSupabaseProvider` for Supabase Realtime sync
- Updated database schema to store Y.js state as BYTEA
- Integrated Y.js into ProseMirror editor WebView
- Created `YjsCollaborationContext` to replace old Socket.IO context
- Updated all collaboration UI components

**Files Modified:**
- `/expo-app/lib/YSupabaseProvider.ts` (created)
- `/supabase/migrations/20251022_add_yjs_support.sql` (created)
- `/expo-app/assets/prosemirror-bundle-src.js` (updated)
- `/expo-app/assets/prosemirror-editor-bundled.html` (updated)
- `/expo-app/components/ProseMirrorWebView.tsx` (updated)
- `/expo-app/contexts/YjsCollaborationContext.tsx` (created)
- `/expo-app/app/(mock)/_layout.tsx` (updated)

### 2. AI Comment Replies (Edge Function Migration)
**Status:** ✅ Complete

- Migrated from Socket.IO to Supabase Edge Functions
- Created `ai-comment-reply` Edge Function using Mistral AI
- Uses Supabase Realtime for broadcasting AI replies
- Frontend updated to call Edge Function directly
- Tested and verified working

**Files Modified:**
- `/supabase/functions/ai-comment-reply/index.ts` (created)
- `/expo-app/lib/ai-comment-service.ts` (created)
- `/expo-app/app/(mock)/trip/[id]/index.tsx` (updated)

**Edge Function URL:** `http://127.0.0.1:54321/functions/v1/ai-comment-reply`

## ✅ All Migrations Complete!

All Socket.IO features have been successfully migrated to Supabase Edge Functions and Y.js.

### 3. AI Trip Generation (Edge Function Migration)
**Status:** ✅ Complete

- Migrated from Socket.IO to Supabase Edge Functions
- Created `generate-trip-stream` Edge Function using Mistral SDK (@mistralai/mistralai)
- Uses Supabase Realtime to broadcast streaming deltas (not HTTP streaming)
- Frontend subscribes to Realtime channel for incremental updates
- Updated `useStreamingTripGeneration` hook to use Realtime subscriptions
- Removed Socket.IO event listeners

**Architecture (Y.js-Based Collaboration):**
- Edge Function participates as a regular Y.js collaborator on the document
- Streams from Mistral AI, buffering HTML until completion
- Parses complete HTML into ProseMirror JSON structure
- Applies changes directly to Y.js document via transactions
- All changes sync automatically via existing Y.js/Supabase Realtime infrastructure
- Multiple clients see AI typing in real-time through CRDT sync
- Channel cleanup and database persistence on completion

**AI as Collaborator:**
1. Edge Function connects to same Y.js document as frontend clients
2. Uses `YServerProvider` to sync via Supabase Realtime channel
3. Streams AI response → Buffers HTML → Converts to ProseMirror JSON
4. Applies to Y.js XmlFragment as atomic transaction
5. Y.js broadcasts changes to all connected clients automatically
6. Frontend receives updates through existing collaboration infrastructure
7. No custom streaming logic needed - Y.js handles everything

**Files Modified:**
- `/supabase/functions/generate-trip-stream/index.ts` (rewritten to use Y.js)
- `/supabase/functions/_shared/yjs-server-provider.ts` (created - Y.js provider for Deno)
- `/supabase/functions/_shared/html-to-yjs.ts` (created - HTML to ProseMirror converter)
- `/expo-app/hooks/useStreamingTripGeneration.ts` (simplified - just calls Edge Function)
- `/expo-app/app/(mock)/trip/[id]/index.tsx` (removed typing simulation code)

**Key Changes:**
- **Removed custom streaming**: No more HTML buffering or typing instructions on frontend
- **Removed typing simulation**: No character-by-character animation needed
- **AI as Y.js peer**: Edge Function connects as regular collaborator
- **Automatic sync**: Changes appear via existing Y.js collaboration infrastructure
- **Simpler architecture**: Reuses collaboration code, no duplicate logic

**Edge Function URL:** `http://127.0.0.1:54321/functions/v1/generate-trip-stream`

**Testing:** ✅ Verified working - content appears in editor after generation

## 📊 Summary

| Feature | Old System | New System | Status |
|---------|-----------|------------|--------|
| Document Collaboration | Socket.IO + Custom OT | Y.js + Tiptap Cloud | ✅ Complete |
| AI Comment Replies | Socket.IO + collab-server | Supabase Edge Functions | ✅ Complete |
| AI Trip Generation | Socket.IO + collab-server | Edge Functions + AI Gateway | ✅ Complete |
| WebSocket Provider | Self-hosted Hocuspocus | Tiptap Cloud (https://) | ✅ Complete |
| AI Model Access | Direct OpenAI API | Vercel AI SDK + Gateway | ✅ Complete |

## 🎯 Collab-Server Status

**Archived!** ✅

- ✅ AI comment replies migrated to Edge Functions
- ✅ Document collaboration migrated to Y.js
- ✅ AI trip generation migrated to Edge Functions
- ✅ Socket.IO client removed from dependencies
- ✅ collab-server directory archived to `collab-server-archived/`

**Result:** The entire application now runs serverless using Supabase Edge Functions and Realtime!

## 🔍 Testing

### AI Trip Generation Testing
```bash
# Start Edge Functions
npx supabase functions serve --env-file ./supabase/.env.local

# Test via the Expo app (recommended)
npx expo start --web --port 8082
# Then trigger trip generation from the UI
```

**Note:** The Edge Function uses Supabase Realtime for streaming, so testing via curl will only show the final JSON response, not the streaming deltas. To see the streaming in action:

1. Subscribe to the Realtime channel from the frontend
2. Call the Edge Function with a unique `sessionId`
3. Watch deltas arrive via `generation-delta` events
4. Final content arrives via `generation-complete` event

**Alternative Testing with curl:**
```bash
curl -X POST http://127.0.0.1:54321/functions/v1/generate-trip-stream \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <anon_key>" \
  -d '{"prompt": "Plan a 2-day trip to Copenhagen", "sessionId": "test-123"}'
```

Expected response: JSON with `{success: true, sessionId, contentLength, chunkCount}`. Streaming deltas are broadcast via Realtime, not HTTP.

### AI Comment Reply Testing
```bash
# Start Edge Functions
npx supabase functions serve --env-file ./supabase/.env.local

# Test endpoint
curl -X POST http://127.0.0.1:54321/functions/v1/ai-comment-reply \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <anon_key>" \
  -d '{
    "documentId": "test-doc-123",
    "commentId": "test-comment-123",
    "from": 0,
    "to": 10,
    "instruction": "What are the best times to visit?",
    "selectedText": "Visit the Eiffel Tower",
    "userId": "test-user",
    "userName": "Test User"
  }'
```

Expected response:
```json
{
  "success": true,
  "commentId": "test-comment-123",
  "aiReply": "The best times to visit the Eiffel Tower are..."
}
```

### Y.js Collaboration Testing
1. Start Expo app: `npx expo start --web --port 8082`
2. Open trip document
3. Click "Enable Collaboration"
4. Open same trip in another browser tab
5. Verify real-time sync of edits

### 4. Tiptap Cloud Migration (Hocuspocus Provider)
**Status:** ✅ Complete

**Previous Architecture:**
- Self-hosted Hocuspocus server at `ws://127.0.0.1:1234/collaboration`
- Required manual server management and deployment
- Local development complexity

**New Architecture (UPDATED 2025-01-23):**
- **Tiptap Cloud** - Managed Hocuspocus cloud service
- Document server ID: `yko82w79`
- **WebSocket URL:** `https://yko82w79.collab.tiptap.cloud` (NOT wss://)
- JWT-based authentication using App Secret
- **IMPORTANT:** Use HTTPS URL - HocuspocusProvider handles WebSocket upgrade internally

**Implementation:**
1. **JWT Token Generation:**
   - Created `/supabase/functions/generate-tiptap-token/index.ts` Edge Function
   - Generates HS256-signed JWT with `allowedDocumentNames` claim
   - Uses Supabase authentication for user verification
   - Token expires after 24 hours

2. **Frontend Integration:**
   - Updated `YjsCollaborationContext` to call Edge Function for tokens
   - Passes Tiptap Cloud URL to ProseMirror WebView
   - `HocuspocusProvider` connects to `wss://cloud.tiptap.dev/{appId}`

3. **Environment Variables:**
   - `EXPO_PUBLIC_TIPTAP_APP_ID=yko82w79` (frontend)
   - `TIPTAP_APP_SECRET=...` (backend/Edge Functions)

**Files Modified:**
- `/supabase/functions/generate-tiptap-token/index.ts` (created)
- `/expo-app/contexts/YjsCollaborationContext.tsx` (updated)
- `/expo-app/assets/prosemirror-editor-bundled.html` (updated)
- `/expo-app/.env.local` (added Tiptap credentials)
- `/supabase/.env.local` (added Tiptap secret)

**Benefits:**
- ✅ **No server management** - Tiptap handles infrastructure
- ✅ **Automatic scaling** - Cloud service handles traffic
- ✅ **JWT authentication** - Secure document access
- ✅ **Production-ready** - Managed service with SLA
- ✅ **WebRTC + WebSocket** - Optimal peer-to-peer sync

**Deployment:**
```bash
# Deploy Edge Function
npx supabase functions deploy generate-tiptap-token --project-ref unocjfiipormnaujsuhk

# Set secret
npx supabase secrets set TIPTAP_APP_SECRET=<secret> --project-ref unocjfiipormnaujsuhk
```

**Testing:**
```bash
# Start Expo app
npx expo start --web --port 8082

# Open trip document and enable collaboration
# Open same trip in another browser tab
# Verify real-time sync through Tiptap Cloud
```

### 5. Vercel AI Gateway Integration
**Status:** ✅ Complete (2025-01-23)

**Problem:** OpenAI quota exceeded errors were blocking AI trip generation

**Solution:** Integrated Vercel AI Gateway with Vercel AI SDK v5+ to pool rate limits

**Implementation:**
1. **Replaced OpenAI Client with AI SDK:**
   - Removed direct `openai` package usage
   - Using `streamText` from `npm:ai@latest`
   - Model format: `openai/gpt-4o-mini` for AI Gateway
   - Automatic provider detection via `AI_GATEWAY_API_KEY` env var

2. **Simplified Streaming:**
   ```typescript
   // Old (OpenAI client)
   const stream = await openai.chat.completions.create({...});
   for await (const chunk of stream) {
     const delta = chunk.choices[0]?.delta?.content;
   }

   // New (AI SDK)
   const result = await streamText({
     model: 'openai/gpt-4o-mini',
     prompt: prompt,
     system: systemPrompt,
   });
   for await (const textPart of result.textStream) {
     // Process text
   }
   ```

3. **Environment Configuration:**
   - `AI_GATEWAY_API_KEY` - Vercel AI Gateway key (primary)
   - `OPENAI_API_KEY` - OpenAI key (fallback)
   - Edge Function automatically uses AI Gateway if key is set

**Files Modified:**
- `/supabase/functions/generate-trip-stream/index.ts` (major refactor)
  - Removed `createClient`, `createOpenAI` imports
  - Added `streamText` from AI SDK
  - Updated streaming loop
  - Simplified provider configuration

**Benefits:**
- ✅ **No quota limits:** Pooled rate limiting across requests
- ✅ **Automatic fallback:** Falls back to direct OpenAI if AI Gateway unavailable
- ✅ **Simpler code:** AI SDK handles complexity
- ✅ **Better errors:** Clear error messages for quota issues
- ✅ **Model flexibility:** Easy to switch between providers

**Environment Variables:**
```env
# In /supabase/.env.local
AI_GATEWAY_API_KEY=vck_32qO3GNUA1lx0kEtcOzHdC7coveBy1l9ePTRZANpyeqwkiZHM10E9XXN
OPENAI_API_KEY=sk-proj-...  # Fallback
TIPTAP_APP_SECRET=f6d9a7d903b990ce6b707be28ae19bf6941dcdc29a0137cd6233cd015a64fffe
```

**Deployment:**
```bash
# Set the AI Gateway API key as a secret (REQUIRED)
npx supabase secrets set AI_GATEWAY_API_KEY=your_ai_gateway_key

# Deploy the Edge Function
npx supabase functions deploy generate-trip-stream --no-verify-jwt
```

**Testing:**
```bash
# Start Edge Functions
npx supabase functions serve --env-file ./supabase/.env.local

# Trigger AI generation from app
# Check logs for: "[Generate Trip] Using: Vercel AI Gateway"
```

## 🎉 Migration Complete!

All features have been successfully migrated from Socket.IO + collab-server to Supabase Edge Functions and Y.js CRDT.

### Benefits of the New Architecture:
1. **Serverless**: No need to run a separate Node.js server
2. **Scalable**: Supabase handles scaling automatically
3. **Cost-effective**: Pay only for what you use
4. **Simpler deployment**: Deploy Edge Functions with `supabase functions deploy`
5. **Real-time sync**: Y.js provides conflict-free collaborative editing
6. **Streaming AI**: Edge Functions stream responses directly from Mistral AI

### Cleanup Summary:
- ✅ Removed `socket.io-client` dependency
- ✅ Deleted `collab-socket.ts` helper
- ✅ Archived `collab-server/` directory
- ✅ All AI features now use Edge Functions
- ✅ Document collaboration uses Y.js + Supabase Realtime
