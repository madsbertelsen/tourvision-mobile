# Y.js Migration Status

## Completed ✅

### Phase 1: Foundation (Completed)

1. **Dependencies Installed**
   - `yjs` - Core CRDT library
   - `y-prosemirror` - ProseMirror bindings
   - `y-indexeddb` - Local persistence
   - `lib0` - Y.js utilities
   - `y-protocols` - Awareness protocol

2. **YSupabaseProvider Created** (`/expo-app/lib/YSupabaseProvider.ts`)
   - Connects Y.Doc to Supabase Realtime broadcast channels
   - Handles binary update encoding/decoding
   - Implements awareness protocol for cursors/presence
   - Auto-saves to database every 30 seconds
   - Supports offline editing with queue
   - Event emitter for sync/persist status

3. **Database Schema Updated**
   - Removed `itinerary_document` (JSONB) column
   - Added `yjs_state` (BYTEA) for Y.js binary state
   - Added `yjs_clock` (INTEGER) for versioning
   - Created `yjs_updates` table for incremental sync
   - Added RLS policies for access control
   - Fixed `trip_sharing` migration to use `created_by`

4. **ProseMirror Bundle Updated**
   - Added Y.js imports to `prosemirror-bundle-src.js`
   - Exported Y.js APIs to `window.PM`:
     - `window.PM.Y` - Core Y.js
     - `window.PM.yProsemirror` - ySyncPlugin, yCursorPlugin, yUndoPlugin
     - `window.PM.Awareness` - Awareness class
     - `window.PM.awarenessProtocol` - Protocol functions
   - Bundle size: 862KB (added ~72KB)
   - Kept old collab plugin for gradual migration

## Remaining Work 🚧

### Phase 2: WebView Integration (In Progress)

#### A. Update HTML Template (`/expo-app/assets/prosemirror-editor-bundled.html`)

**Current state**: Uses old `CollabConnection` from Socket.IO

**Needed changes**:
```javascript
// 1. Replace startCollaboration function
function startCollaboration(serverUrl, documentId, userId, userName) {
  console.log('[WebView] Starting Y.js collaboration');

  // Create Y.Doc and fragment
  ydoc = new window.PM.Y.Doc();
  yXmlFragment = ydoc.getXmlFragment('prosemirror');
  awareness = new window.PM.Awareness(ydoc);

  // Set local awareness state
  awareness.setLocalStateField('user', {
    id: userId,
    name: userName,
    color: getRandomColor()
  });

  // Recreate editor with Y.js plugins
  const state = window.PM.state.EditorState.create({
    schema: window.PM.schema,
    plugins: [
      window.PM.yProsemirror.ySyncPlugin(yXmlFragment),
      window.PM.yProsemirror.yCursorPlugin(awareness),
      window.PM.yProsemirror.yUndoPlugin(),
      window.PM.keymap({ 'Mod-z': window.PM.history.undo, 'Mod-y': window.PM.history.redo }),
      // ... other plugins
    ]
  });

  editorView.updateState(state);

  // Set up listeners
  setupYjsListeners();

  // Notify React Native
  sendMessageToNative({
    type: 'collaborationStarted',
    success: true,
    clientId: ydoc.clientID
  });
}

// 2. Add Y.js listener setup
function setupYjsListeners() {
  // Forward Y.js updates to React Native
  ydoc.on('update', (update, origin) => {
    if (origin !== 'remote') {
      sendMessageToNative({
        type: 'yjsUpdate',
        update: Array.from(update)
      });
    }
  });

  // Forward awareness changes
  awareness.on('change', () => {
    const update = window.PM.awarenessProtocol.encodeAwarenessUpdate(
      awareness,
      [ydoc.clientID]
    );
    sendMessageToNative({
      type: 'awarenessUpdate',
      update: Array.from(update)
    });
  });
}

// 3. Handle incoming Y.js updates from React Native
window.addEventListener('message', (event) => {
  const { type, data } = event.data;

  if (type === 'yjsUpdate' && ydoc) {
    window.PM.Y.applyUpdate(ydoc, new Uint8Array(data.update), 'remote');
  }

  if (type === 'awarenessUpdate' && awareness) {
    window.PM.awarenessProtocol.applyAwarenessUpdate(
      awareness,
      new Uint8Array(data.update),
      'remote'
    );
  }
});
```

#### B. Update WebView Wrapper (`/expo-app/components/ProseMirrorWebView.tsx`)

**Current state**: Passes through to old Socket.IO collaboration

**Needed changes**:
```typescript
import * as Y from 'yjs';
import { YSupabaseProvider } from '@/lib/YSupabaseProvider';
import { useSupabaseClient } from '@/lib/supabase/client';

// Add Y.js state refs
const ydocRef = useRef<Y.Doc | null>(null);
const providerRef = useRef<YSupabaseProvider | null>(null);

// Update startCollaboration implementation
startCollaboration: (serverUrl: string, documentId: string, userId: string, userName: string) => {
  console.log('[ProseMirrorWebView] Starting Y.js collaboration');

  // Create Y.Doc
  ydocRef.current = new Y.Doc();

  // Create Supabase provider
  const supabase = useSupabaseClient();
  providerRef.current = new YSupabaseProvider(ydocRef.current, {
    supabase,
    documentId,
    userId,
    userName,
    debug: true
  });

  // Listen for Y.js updates to forward to WebView
  ydocRef.current.on('update', (update, origin) => {
    if (origin === 'remote') {
      sendMessage({
        type: 'yjsUpdate',
        data: { update: Array.from(update) }
      });
    }
  });

  // Listen for awareness updates
  providerRef.current.awareness.on('change', () => {
    const states = Array.from(providerRef.current.awareness.getStates().entries());
    sendMessage({
      type: 'awarenessUpdate',
      data: { states }
    });
  });

  // Tell WebView to initialize Y.js
  sendMessage({
    type: 'startCollaboration',
    documentId,
    userId,
    userName
  });
},

// Handle Y.js updates FROM WebView
case 'yjsUpdate':
  if (ydocRef.current && data.update) {
    Y.applyUpdate(ydocRef.current, new Uint8Array(data.update));
  }
  break;

case 'awarenessUpdate':
  if (providerRef.current && data.update) {
    awarenessProtocol.applyAwarenessUpdate(
      providerRef.current.awareness,
      new Uint8Array(data.update),
      'webview'
    );
  }
  break;
```

### Phase 3: Context Updates

#### Replace CollaborationContext with YjsCollaborationContext

**New file**: `/expo-app/contexts/YjsCollaborationContext.tsx`

```typescript
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import * as Y from 'yjs';
import { YSupabaseProvider } from '@/lib/YSupabaseProvider';
import { useSupabaseClient } from '@/lib/supabase/client';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface YjsCollaborationContextType {
  isCollaborating: boolean;
  collaborationStatus: 'disconnected' | 'connecting' | 'connected';
  collaborationUsers: any[];
  startCollaboration: (tripId: string) => Promise<void>;
  stopCollaboration: () => void;
  setEditorRef: (ref: any) => void;
  ydoc: Y.Doc | null;
  provider: YSupabaseProvider | null;
}

const YjsCollaborationContext = createContext<YjsCollaborationContextType | undefined>(undefined);

export const useYjsCollaboration = () => {
  const context = useContext(YjsCollaborationContext);
  if (!context) {
    throw new Error('useYjsCollaboration must be used within YjsCollaborationProvider');
  }
  return context;
};

export const YjsCollaborationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isCollaborating, setIsCollaborating] = useState(false);
  const [collaborationStatus, setCollaborationStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
  const [collaborationUsers, setCollaborationUsers] = useState<any[]>([]);

  const supabase = useSupabaseClient();
  const ydocRef = useRef<Y.Doc | null>(null);
  const providerRef = useRef<YSupabaseProvider | null>(null);
  const editorRef = useRef<any>(null);

  const startCollaboration = useCallback(async (tripId: string) => {
    console.log('[YjsCollaboration] Starting collaboration for trip:', tripId);

    if (!editorRef.current) {
      console.error('[YjsCollaboration] Editor ref not available');
      return;
    }

    try {
      setCollaborationStatus('connecting');
      setIsCollaborating(true);

      // Generate user ID and name
      const userId = await AsyncStorage.getItem('collaboration_user_id') ||
        `user_${Math.random().toString(36).substr(2, 9)}`;
      const userName = await AsyncStorage.getItem('collaboration_user_name') ||
        `User ${Math.floor(Math.random() * 1000)}`;

      // Create Y.Doc
      ydocRef.current = new Y.Doc();

      // Create provider
      providerRef.current = new YSupabaseProvider(ydocRef.current, {
        supabase,
        documentId: tripId,
        userId,
        userName,
        debug: true
      });

      // Listen for sync status
      providerRef.current.on('synced', ({ synced }) => {
        setCollaborationStatus(synced ? 'connected' : 'connecting');
      });

      // Listen for awareness changes
      providerRef.current.awareness.on('change', () => {
        const users = providerRef.current?.getConnectedUsers() || [];
        setCollaborationUsers(users);
      });

      // Tell editor to use Y.js
      editorRef.current.startCollaboration('', tripId, userId, userName);

      console.log('[YjsCollaboration] Collaboration started');
    } catch (error) {
      console.error('[YjsCollaboration] Error:', error);
      setCollaborationStatus('disconnected');
      setIsCollaborating(false);
    }
  }, [supabase]);

  const stopCollaboration = useCallback(async () => {
    console.log('[YjsCollaboration] Stopping collaboration');

    if (providerRef.current) {
      await providerRef.current.destroy();
      providerRef.current = null;
    }

    if (ydocRef.current) {
      ydocRef.current.destroy();
      ydocRef.current = null;
    }

    setIsCollaborating(false);
    setCollaborationStatus('disconnected');
    setCollaborationUsers([]);
  }, []);

  const setEditorRef = useCallback((ref: any) => {
    editorRef.current = ref;
  }, []);

  return (
    <YjsCollaborationContext.Provider
      value={{
        isCollaborating,
        collaborationStatus,
        collaborationUsers,
        startCollaboration,
        stopCollaboration,
        setEditorRef,
        ydoc: ydocRef.current,
        provider: providerRef.current
      }}
    >
      {children}
    </YjsCollaborationContext.Provider>
  );
};
```

### Phase 4: Update Trip Document View

**File**: `/expo-app/app/(mock)/trip/[id]/index.tsx`

**Changes**:
- Replace `useCollaboration` with `useYjsCollaboration`
- Remove `collab-socket` imports
- Remove Socket.IO event listeners
- Simplified connection logic (no manual socket management)

### Phase 5: Testing

1. **Unit Tests**
   - Y.js provider connects
   - Updates sync between clients
   - Offline queue works
   - Awareness tracks users

2. **Integration Tests**
   - Two users edit simultaneously
   - Conflicts resolve correctly
   - AI edits apply and broadcast
   - Comments sync

3. **Manual Testing**
   - Create new trip
   - Enable collaboration
   - Edit from two browser windows
   - Verify real-time sync

## Key Benefits After Complete Migration

✅ **No custom server** - Eliminate collab-server
✅ **True offline** - Edit without connection
✅ **Automatic conflicts** - CRDT handles all cases
✅ **Simpler architecture** - Leverage Supabase
✅ **Built-in undo/redo** - Collaboration-aware
✅ **Lower costs** - No separate server

## Next Steps

1. Update HTML template with Y.js listeners
2. Update WebView wrapper to use YSupabaseProvider
3. Create YjsCollaborationContext
4. Update trip document view
5. Test with two users
6. Remove old Socket.IO code
7. Delete collab-server

## Estimated Time Remaining

- Phase 2: 4-6 hours
- Phase 3: 2 hours
- Phase 4: 1 hour
- Phase 5: 2-4 hours
- **Total: 9-13 hours**
