/**
 * YjsSetupService - Initializes Y.js document and WebRTC provider
 *
 * Extracted from main.ts to reduce file size and improve modularity.
 */

import * as Y from 'yjs';
import { WebrtcProvider } from 'y-webrtc';
import { Awareness } from 'y-protocols/awareness';

/**
 * Options for Y.js setup
 */
export interface YjsSetupOptions {
  documentId: string;
  disableSync?: boolean;
  usePublicSignaling?: boolean;
}

/**
 * Map bounds type (matches ViewSyncService)
 */
export interface MapBoundsData {
  north: number;
  south: number;
  east: number;
  west: number;
  center?: { lng: number; lat: number };
  zoom?: number;
  pitch?: number;
  bearing?: number;
}

/**
 * User state for awareness
 */
export interface UserState {
  name: string;
  color: string;
  mapBounds: MapBoundsData | null;
  mapStyle?: string;
  viewState: {
    scrollTop: number;
    scrollLeft: number;
    fullscreenMapOpen: boolean;
    isPresenting: boolean;
    followingUserId: number | null;
  };
}

/**
 * Result of Y.js setup
 */
export interface YjsSetupResult {
  ydoc: Y.Doc;
  yXmlFragment: Y.XmlFragment;
  provider: WebrtcProvider | null;
  awareness: Awareness;
}

/**
 * ViewSyncService interface (minimal for dependency injection)
 */
export interface ViewSyncServiceInterface {
  getFollowingUserId(): number | null;
  followUser(clientId: number | null): void;
  applyRemoteViewState(viewState: UserState['viewState'], mapBounds?: MapBoundsData): void;
  applyRemoteMapBounds(bounds: MapBoundsData): void;
  applyRemoteMapStyle(style: string): void;
  handleUserDisconnect(clientId: number): void;
}

/**
 * Dependencies required by YjsSetupService
 */
export interface YjsSetupDependencies {
  // User identity
  userName: string;
  userDisplayColor: string;

  // Services
  getViewSyncService: () => ViewSyncServiceInterface | null;

  // Context menu state
  getContextMenuTargetClientId: () => number | null;

  // Demo client state (for autoplay demos)
  getDemoClientState: (clientId: number) => { user: UserState } | null;

  // UI callbacks
  updateStatus: (message: string, status: 'connected' | 'connecting' | 'disconnected') => void;
  showFullscreenMap: (bounds?: MapBoundsData) => void;
  showAvatarContextMenu: (clientId: number, userName: string, avatar: HTMLElement, event: MouseEvent) => void;
  hideAvatarContextMenu: () => void;

  // Map bounds overlay callbacks
  addBoundsOverlay: (clientId: number, bounds: any, color: string) => void;
  updateBoundsOverlay: (clientId: number, bounds: any, color: string) => void;
  removeBoundsOverlay: (clientId: number) => void;
}

/**
 * Initialize Y.js document and WebRTC provider
 */
export async function setupYjs(
  options: YjsSetupOptions,
  deps: YjsSetupDependencies
): Promise<YjsSetupResult> {
  const { documentId, disableSync, usePublicSignaling } = options;
  const {
    userName,
    userDisplayColor,
    getViewSyncService,
    getContextMenuTargetClientId,
    getDemoClientState,
    updateStatus,
    showFullscreenMap,
    showAvatarContextMenu,
    hideAvatarContextMenu,
    addBoundsOverlay,
    updateBoundsOverlay,
    removeBoundsOverlay,
  } = deps;

  console.log('[Y.js] Setting up Y.js document:', documentId, { disableSync, usePublicSignaling });

  // Create Y.js document
  const ydoc = new Y.Doc();

  // Get the shared ProseMirror type
  const yXmlFragment = ydoc.getXmlFragment('prosemirror');

  // If sync is disabled (e.g., for single-phone autoplay demos), skip WebRTC provider
  if (disableSync && !usePublicSignaling) {
    console.log('[Y.js] Sync disabled - running in local-only mode');

    // Create a minimal local-only awareness for cursor plugin compatibility
    const awareness = new Awareness(ydoc);

    // Set local user info
    awareness.setLocalStateField('user', {
      name: userName,
      color: userDisplayColor,
      mapBounds: null,
      viewState: {
        scrollTop: 0,
        scrollLeft: 0,
        fullscreenMapOpen: false,
        isPresenting: false,
        followingUserId: null,
      },
    });

    console.log('[Y.js] Local-only awareness created');

    // Set up follow button handler for demo mode (simplified, no updateAvatars needed)
    setupFollowButton(
      awareness,
      getViewSyncService,
      getContextMenuTargetClientId,
      getDemoClientState,
      showFullscreenMap,
      hideAvatarContextMenu,
      () => {} // No updateAvatars in local-only mode
    );

    // Close context menu when clicking outside (for local-only mode)
    setupContextMenuClose(hideAvatarContextMenu);

    return { ydoc, yXmlFragment, provider: null, awareness };
  }

  // Create WebRTC provider
  const signalingUrl = getSignalingUrl(documentId);
  const signalingServers = usePublicSignaling ? [] : [signalingUrl];

  if (usePublicSignaling) {
    console.log('[Y.js] Using BroadcastChannel only (no signaling server) - offline mode');
  } else {
    console.log('[Y.js] Using signaling server:', signalingUrl);
  }
  console.log('[Y.js] Protocol:', window.location.protocol, 'Hostname:', window.location.hostname);

  // Start with fallback STUN servers
  console.log('[Y.js] Starting with fallback STUN servers (TURN credentials will be sent via WebSocket)');
  const iceServers: RTCIceServer[] = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ];

  const provider = new WebrtcProvider(documentId, ydoc, {
    signaling: signalingServers,
    password: undefined,
    peerOpts: {
      config: {
        iceServers,
        iceCandidatePoolSize: 10,
        iceTransportPolicy: 'all',
      },
      trickle: true,
      connectionTimeout: 30000,
    },
    maxConns: 20,
    filterBcConns: false,
  });

  // Get awareness instance from provider
  const awareness = provider.awareness;

  // Set local user info with pre-generated identity
  awareness.setLocalStateField('user', {
    name: userName,
    color: userDisplayColor,
    mapBounds: null,
    viewState: {
      scrollTop: 0,
      scrollLeft: 0,
      fullscreenMapOpen: false,
      isPresenting: false,
      followingUserId: null,
    },
  });

  console.log('[Awareness] Local user set:', { name: userName, color: userDisplayColor });

  // Log provider events
  provider.on('status', (event: any) => {
    console.log('[WebRTC] Status:', event.status);
    updateStatus(`WebRTC: ${event.status}`, event.status === 'connected' ? 'connected' : 'connecting');
  });

  provider.on('synced', (event: { synced: boolean }) => {
    console.log('[WebRTC] Synced:', event.synced);
    if (event.synced) {
      updateStatus('Editor ready - Synced', 'connected');
    }
  });

  provider.on('peers', (event: any) => {
    console.log('[WebRTC] Connected peers:', {
      webrtcPeers: event.webrtcPeers?.length || 0,
      bcPeers: event.bcPeers?.length || 0,
    });

    const totalPeers = (event.webrtcPeers?.length || 0) + (event.bcPeers?.length || 0);
    if (totalPeers > 0) {
      updateStatus(`Connected to ${totalPeers} peer(s)`, 'connected');
    }
  });

  // Function to update avatar display in toolbar
  const updateAvatars = createAvatarUpdater(
    awareness,
    getViewSyncService,
    showAvatarContextMenu
  );

  // Set up context menu follow button
  setupFollowButton(
    awareness,
    getViewSyncService,
    getContextMenuTargetClientId,
    getDemoClientState,
    showFullscreenMap,
    hideAvatarContextMenu,
    updateAvatars
  );

  // Close context menu when clicking outside
  setupContextMenuClose(hideAvatarContextMenu);

  // Listen for awareness changes to show other users' map bounds
  setupAwarenessChangeHandler(
    awareness,
    getViewSyncService,
    updateAvatars,
    addBoundsOverlay,
    updateBoundsOverlay,
    removeBoundsOverlay
  );

  // Initial avatar render
  updateAvatars();

  console.log('[Y.js] Y.js document and WebRTC provider created');

  return { ydoc, yXmlFragment, provider, awareness };
}

/**
 * Get signaling server URL based on current location
 */
function getSignalingUrl(documentId: string): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const hostname = window.location.hostname;

  // Development: Use port 8787 for Express signaling server
  let baseUrl: string;
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname.startsWith('192.168.')) {
    baseUrl = `${protocol}//${hostname}:8787/signaling`;
  } else {
    // Production: use same host with secure WebSocket
    baseUrl = `${protocol}//${hostname}/signaling`;
  }

  return `${baseUrl}/${documentId}`;
}

/**
 * Create the avatar updater function
 */
function createAvatarUpdater(
  awareness: Awareness,
  getViewSyncService: () => ViewSyncServiceInterface | null,
  showAvatarContextMenu: (clientId: number, userName: string, avatar: HTMLElement, event: MouseEvent) => void
): () => void {
  return () => {
    const avatarsContainer = document.getElementById('avatars');
    if (!avatarsContainer) return;

    // Clear existing avatars
    avatarsContainer.innerHTML = '';

    // Get all awareness states
    const states = awareness.getStates();
    const myClientId = awareness.clientID;
    const viewSyncService = getViewSyncService();
    const followingUserId = viewSyncService?.getFollowingUserId() ?? null;

    // Sort: self first, then others
    const sortedEntries = Array.from(states.entries()).sort(([idA], [idB]) => {
      if (idA === myClientId) return -1;
      if (idB === myClientId) return 1;
      return 0;
    });

    sortedEntries.forEach(([clientId, state]) => {
      if (!state?.user?.name) return;

      const avatar = document.createElement('div');
      let className = 'avatar';
      if (clientId === myClientId) className += ' self';
      if (followingUserId === clientId) className += ' following';
      avatar.className = className;
      avatar.style.backgroundColor = state.user.color || '#666';
      avatar.title = state.user.name;
      avatar.tabIndex = 0;
      avatar.setAttribute('role', 'button');
      avatar.setAttribute('aria-label', state.user.name);
      avatar.setAttribute('data-client-id', String(clientId));

      // Get initials (first letter of each word, max 2)
      const initials = state.user.name
        .split(' ')
        .map((word: string) => word[0])
        .slice(0, 2)
        .join('');
      avatar.textContent = initials;

      // Add click handler for non-self avatars to show context menu
      if (clientId !== myClientId) {
        avatar.addEventListener('click', (e) => {
          e.stopPropagation();
          showAvatarContextMenu(clientId, state.user.name, avatar, e as MouseEvent);
        });
      }

      avatarsContainer.appendChild(avatar);
    });
  };
}

/**
 * Set up follow button click handler
 */
function setupFollowButton(
  awareness: Awareness,
  getViewSyncService: () => ViewSyncServiceInterface | null,
  getContextMenuTargetClientId: () => number | null,
  getDemoClientState: (clientId: number) => { user: UserState } | null,
  showFullscreenMap: (bounds?: MapBoundsData) => void,
  hideAvatarContextMenu: () => void,
  updateAvatars: () => void
): void {
  const followUserBtn = document.getElementById('follow-user-btn');
  if (!followUserBtn) return;

  followUserBtn.addEventListener('click', () => {
    const contextMenuTargetClientId = getContextMenuTargetClientId();
    const viewSyncService = getViewSyncService();

    if (contextMenuTargetClientId !== null && viewSyncService) {
      const followingUserId = viewSyncService.getFollowingUserId();

      if (followingUserId === contextMenuTargetClientId) {
        // Stop following
        viewSyncService.followUser(null);
        console.log('[Main] Stopped following');
      } else {
        // Start following
        viewSyncService.followUser(contextMenuTargetClientId);

        // Check for demo client first (for autoplay demos)
        const demoState = getDemoClientState(contextMenuTargetClientId);
        if (demoState) {
          console.log('[Main] Now following demo client:', demoState.user.name);

          // If demo client has fullscreen map open, sync to their view
          if (demoState.user.viewState?.fullscreenMapOpen && demoState.user.mapBounds) {
            console.log('[Main] Demo client has fullscreen open, opening with their bounds');
            showFullscreenMap(demoState.user.mapBounds);
          }
        } else {
          // Real awareness client
          const state = awareness.getStates().get(contextMenuTargetClientId);
          console.log('[Main] Now following:', state?.user?.name);
        }
      }

      // Update avatars to reflect following state
      updateAvatars();
    }
    hideAvatarContextMenu();
  });
}

/**
 * Set up context menu close on outside click
 */
function setupContextMenuClose(hideAvatarContextMenu: () => void): void {
  document.addEventListener('click', (e) => {
    const contextMenu = document.getElementById('avatar-context-menu');
    if (contextMenu && !contextMenu.contains(e.target as Node)) {
      hideAvatarContextMenu();
    }
  });
}

/**
 * Set up awareness change handler for map bounds sync
 */
function setupAwarenessChangeHandler(
  awareness: Awareness,
  getViewSyncService: () => ViewSyncServiceInterface | null,
  updateAvatars: () => void,
  addBoundsOverlay: (clientId: number, bounds: any, color: string) => void,
  updateBoundsOverlay: (clientId: number, bounds: any, color: string) => void,
  removeBoundsOverlay: (clientId: number) => void
): void {
  awareness.on('change', ({ added, updated, removed }: any) => {
    console.log('[Awareness] Change event:', { added, updated, removed });

    // Update avatars on any change
    updateAvatars();

    // Handle added users
    added.forEach((clientId: number) => {
      if (clientId === awareness.clientID) return;

      const state = awareness.getStates().get(clientId);
      if (state?.user?.mapBounds) {
        console.log('[Awareness] User added with map bounds:', clientId, state.user);
        addBoundsOverlay(clientId, state.user.mapBounds, state.user.color);
      }
    });

    // Handle updated users
    updated.forEach((clientId: number) => {
      if (clientId === awareness.clientID) return;

      const state = awareness.getStates().get(clientId);

      // Handle map bounds updates
      if (state?.user?.mapBounds) {
        console.log('[Awareness] User updated map bounds:', clientId);
        updateBoundsOverlay(clientId, state.user.mapBounds, state.user.color);
      } else {
        console.log('[Awareness] User closed fullscreen map:', clientId);
        removeBoundsOverlay(clientId);
      }

      // Handle view state and map bounds updates (for follow mode)
      const viewSyncService = getViewSyncService();
      if (viewSyncService) {
        const followingUserId = viewSyncService.getFollowingUserId();

        // Only apply if we're following this specific user
        if (followingUserId === clientId) {
          // Check if fullscreen map is already open
          const wasFullscreenOpen = document.getElementById('fullscreen-overlay')?.classList.contains('visible');

          // Apply view state (scroll position, fullscreen map state)
          if (state?.user?.viewState) {
            console.log('[ViewSync] Applying view state from user:', clientId, state.user.viewState);
            viewSyncService.applyRemoteViewState(state.user.viewState, state.user.mapBounds);
          }

          // Apply map bounds ONLY if fullscreen was already open (pan/zoom sync)
          if (wasFullscreenOpen && state?.user?.mapBounds && state?.user?.viewState?.fullscreenMapOpen) {
            console.log('[ViewSync] Applying map bounds from user:', clientId, state.user.mapBounds);
            viewSyncService.applyRemoteMapBounds(state.user.mapBounds);
          }

          // Apply map style if changed
          if (wasFullscreenOpen && state?.user?.mapStyle) {
            console.log('[ViewSync] Applying map style from user:', clientId, state.user.mapStyle);
            viewSyncService.applyRemoteMapStyle(state.user.mapStyle);
          }
        }
      }
    });

    // Handle removed users (disconnected)
    removed.forEach((clientId: number) => {
      console.log('[Awareness] User removed:', clientId);
      removeBoundsOverlay(clientId);

      // If we were following this user, stop following
      const viewSyncService = getViewSyncService();
      if (viewSyncService) {
        viewSyncService.handleUserDisconnect(clientId);
        updateAvatars();
      }
    });
  });
}

/**
 * Custom cursor builder for prominent presence indicators
 * Made extra visible for small phone demos (240px phones in DemoPlayer)
 */
export function customCursorBuilder(user: any): HTMLElement {
  const cursor = document.createElement('span');
  cursor.classList.add('ProseMirror-yjs-cursor');
  cursor.style.position = 'relative';
  cursor.style.marginLeft = '-2px';
  cursor.style.marginRight = '-2px';
  cursor.style.borderLeft = `3px solid ${user.color}`;
  cursor.style.borderRight = 'none';
  cursor.style.height = '1.4em';
  cursor.style.display = 'inline-block';
  cursor.style.pointerEvents = 'none';
  cursor.style.animation = 'cursor-blink 1s ease-in-out infinite';

  // Create label that appears above the cursor
  const label = document.createElement('div');
  label.style.position = 'absolute';
  label.style.top = '-2em';
  label.style.left = '-2px';
  label.style.fontSize = '11px';
  label.style.fontWeight = '700';
  label.style.backgroundColor = user.color;
  label.style.color = 'white';
  label.style.padding = '3px 8px';
  label.style.borderRadius = '4px';
  label.style.whiteSpace = 'nowrap';
  label.style.boxShadow = '0 2px 4px rgba(0,0,0,0.3)';
  label.style.pointerEvents = 'none';
  label.style.zIndex = '1000';
  label.textContent = user.name || 'Anonymous';

  cursor.appendChild(label);

  return cursor;
}
