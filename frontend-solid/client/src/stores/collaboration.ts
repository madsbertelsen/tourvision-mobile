import { createSignal, createEffect, onCleanup } from 'solid-js';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { WebrtcProvider } from 'y-webrtc';
import * as encoding from 'lib0/encoding';

// User colors
const USER_COLORS = ['#FFC0CB', '#FFD700', '#98FB98', '#87CEFA', '#FFA07A'];

// Provider types
export type ProviderType = 'websocket' | 'webrtc';

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
  provider: WebsocketProvider | WebrtcProvider | null;
  providerType: ProviderType;
  connected: boolean;
  synced: boolean;
  username: string;
  userColor: string;
}

// Create collaboration store
export function createCollaborationStore(wsUrl: string, webrtcSignalingUrl: string) {
  const [state, setState] = createSignal<CollaborationState>({
    yDoc: null,
    provider: null,
    providerType: 'webrtc', // Default to WebRTC
    connected: false,
    synced: false,
    username: generateUsername(),
    userColor: getRandomColor()
  });

  // Initialize Y.js document and provider
  function initDocument(docId: string, type?: ProviderType) {
    const providerType = type || state().providerType;
    console.log('[Collaboration] Initializing document:', docId, 'with provider:', providerType);

    // Reuse existing Y.Doc if switching providers, otherwise create new
    const current = state();
    const yDoc = current.yDoc || new Y.Doc();

    // Create provider based on type
    let provider: WebsocketProvider | WebrtcProvider;

    if (providerType === 'websocket') {
      // WebSocket provider connects to central server
      provider = new WebsocketProvider(wsUrl, docId, yDoc, {
        connect: true
      });
    } else {
      // WebRTC provider uses peer-to-peer connections with signaling server
      provider = new WebrtcProvider(docId, yDoc, {
        signaling: [webrtcSignalingUrl],
        maxConns: 50,
        filterBcConns: true
      });
    }

    // Set user awareness
    const username = current.username;
    const userColor = current.userColor;

    provider.awareness.setLocalState({
      user: {
        name: username,
        color: userColor
      }
    });

    // Connection status listeners (both providers support these events)
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
      provider,
      providerType
    }));

    console.log('[Collaboration] Document initialized with', providerType, 'provider');
  }

  // Switch between WebSocket and WebRTC providers
  function switchProvider(docId: string, newType: ProviderType) {
    console.log('[Collaboration] Switching provider to:', newType);

    const current = state();

    // Destroy current provider but keep the document
    if (current.provider) {
      current.provider.destroy();
    }

    // Initialize new provider with the same document
    initDocument(docId, newType);
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

  // Send custom message to server (for agent spawn requests)
  // Uses a separate WebSocket connection since WebRTC is P2P
  function sendCustomMessage(message: any) {
    const current = state();
    const provider = current.provider;

    // For WebSocket provider, we can send directly
    if (provider && current.providerType === 'websocket') {
      const ws = (provider as WebsocketProvider).ws;
      if (ws && ws.readyState === WebSocket.OPEN) {
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, 100); // messageCustom = 100 (high number to avoid y-protocols conflicts)
        encoding.writeVarString(encoder, JSON.stringify(message));
        ws.send(encoding.toUint8Array(encoder));
        console.log('[Collaboration] Sent custom message:', message.type);
        return true;
      }
    }

    // For WebRTC, we need to send via a separate WebSocket to the server
    // Normalize the WebSocket URL - remove trailing /yjs if present to avoid duplication
    const baseWsUrl = (import.meta.env.VITE_WS_URL || 'ws://localhost:8788').replace(/\/yjs\/?$/, '');
    const docId = message.docId;
    if (!docId) {
      console.error('[Collaboration] Cannot send custom message without docId');
      return false;
    }

    // Create temporary WebSocket connection to send the message
    const tempWs = new WebSocket(`${baseWsUrl}/yjs/${docId}`);
    tempWs.binaryType = 'arraybuffer';

    tempWs.onopen = () => {
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, 100); // messageCustom = 100 (high number to avoid y-protocols conflicts)
      encoding.writeVarString(encoder, JSON.stringify(message));
      tempWs.send(encoding.toUint8Array(encoder));
      console.log('[Collaboration] Sent custom message via temp WebSocket:', message.type);

      // Close after a short delay
      setTimeout(() => tempWs.close(), 500);
    };

    tempWs.onerror = (err) => {
      console.error('[Collaboration] Error sending custom message:', err);
    };

    return true;
  }

  return {
    state,
    initDocument,
    switchProvider,
    destroy,
    sendCustomMessage
  };
}

// Singleton instance
let collaborationStore: ReturnType<typeof createCollaborationStore> | null = null;

export function getCollaborationStore() {
  if (!collaborationStore) {
    const wsUrl = import.meta.env.VITE_WS_URL || 'ws://localhost:8788/yjs';
    const webrtcSignalingUrl = import.meta.env.VITE_WEBRTC_SIGNALING || 'ws://localhost:4444';
    collaborationStore = createCollaborationStore(wsUrl, webrtcSignalingUrl);
  }
  return collaborationStore;
}
