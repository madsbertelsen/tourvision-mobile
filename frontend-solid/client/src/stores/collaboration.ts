import { createSignal, createEffect, onCleanup } from 'solid-js';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';

// User colors
const USER_COLORS = ['#FFC0CB', '#FFD700', '#98FB98', '#87CEFA', '#FFA07A'];

// Generate random username
function generateUsername(): string {
  return `User-${Math.floor(Math.random() * 1000)}`;
}

// Pick random color
function getRandomColor(): string {
  return USER_COLORS[Math.floor(Math.random() * USER_COLORS.length)];
}

export interface CollaborationState {
  yDoc: Y.Doc | null;
  provider: WebsocketProvider | null;
  connected: boolean;
  synced: boolean;
  username: string;
  userColor: string;
}

// Create collaboration store
export function createCollaborationStore(wsUrl: string) {
  const [state, setState] = createSignal<CollaborationState>({
    yDoc: null,
    provider: null,
    connected: false,
    synced: false,
    username: generateUsername(),
    userColor: getRandomColor()
  });

  // Initialize Y.js document and provider
  function initDocument(docId: string) {
    console.log('[Collaboration] Initializing document:', docId);

    // Create Y.Doc
    const yDoc = new Y.Doc();

    // Create WebSocket provider
    // The WebsocketProvider automatically appends the docId to the URL path
    // Result: ws://localhost:8788/yjs/docId
    const provider = new WebsocketProvider(wsUrl, docId, yDoc, {
      connect: true
    });

    // Set user awareness
    const username = state().username;
    const userColor = state().userColor;

    provider.awareness.setLocalState({
      user: {
        name: username,
        color: userColor
      }
    });

    // Connection status listeners
    provider.on('status', ({ status }: { status: string }) => {
      console.log('[Collaboration] Status:', status);
      setState((prev) => ({
        ...prev,
        connected: status === 'connected'
      }));
    });

    provider.on('sync', (synced: boolean) => {
      console.log('[Collaboration] Synced:', synced);
      setState((prev) => ({
        ...prev,
        synced
      }));
    });

    // Update state
    setState((prev) => ({
      ...prev,
      yDoc,
      provider
    }));

    console.log('[Collaboration] Document initialized');
  }

  // Clean up connections
  function destroy() {
    console.log('[Collaboration] Destroying connections');

    const current = state();

    if (current.provider) {
      current.provider.destroy();
    }

    if (current.yDoc) {
      current.yDoc.destroy();
    }

    setState({
      yDoc: null,
      provider: null,
      connected: false,
      synced: false,
      username: current.username,
      userColor: current.userColor
    });
  }

  return {
    state,
    initDocument,
    destroy
  };
}

// Singleton instance
let collaborationStore: ReturnType<typeof createCollaborationStore> | null = null;

export function getCollaborationStore() {
  if (!collaborationStore) {
    const wsUrl = import.meta.env.VITE_WS_URL || 'ws://localhost:8788/yjs';
    collaborationStore = createCollaborationStore(wsUrl);
  }
  return collaborationStore;
}
