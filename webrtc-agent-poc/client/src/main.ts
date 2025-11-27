/**
 * WebRTC Agent POC - Main Entry Point
 *
 * This application supports two modes:
 * - User mode: Main document editor (auto-opens agent tab)
 * - Agent mode: Background tab that executes commands
 *
 */

import { baseKeymap } from 'prosemirror-commands';
import { history, redo, undo } from 'prosemirror-history';
import { keymap } from 'prosemirror-keymap';
import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { customSchema } from './prosemirror-schema';

// Y.js imports
import { yCursorPlugin, redo as yRedo, ySyncPlugin, undo as yUndo, yUndoPlugin } from 'y-prosemirror';
import { WebrtcProvider } from 'y-webrtc';
import * as Y from 'yjs';

// Mapbox GL JS

// Services
import { GeocodingService } from './services/GeocodingService';
import { LocationExtractor } from './services/LocationExtractor';
import { MarkerFactory } from './services/MarkerFactory';
import { RouteService } from './services/RouteService';
import { ViewSyncService } from './services/ViewSyncService';

// Conditionally import agent module
// In dev mode: Load based on URL parameter
// In production: Load only in agent build
let initializeAgent: ((yXmlFragment: any, ydoc: any, documentId: string, editorView: any, schema: any) => void) | null = null;

// Check if we should load agent: either in agent build OR in dev mode with ?agent=true
const params = new URL(window.location.href).searchParams;
const isAgentMode = params.get('agent') === 'true';
const isAnimateMode = params.get('animate') === 'true'; // Landing page demo mode
const shouldLoadAgent = import.meta.env.VITE_BUILD_MODE === 'agent' ||
                       (import.meta.env.DEV && isAgentMode);

// Store promise so main() can await it
let agentModulePromise: Promise<void> | null = null;

if (shouldLoadAgent) {
  console.log('[Main] Loading agent module...');
  agentModulePromise = import('./agent').then((module) => {
    initializeAgent = module.initializeAgent;
    console.log('[Main] Agent module loaded');
  }).catch((err) => {
    console.error('[Main] Failed to load agent module:', err);
  });
}

// Controllers
import { EditorController } from './controllers/EditorController';
import { WaypointController } from './controllers/WaypointController';
import { WebViewBridge } from './controllers/WebViewBridge';

// Views
import { AwarenessOverlayRenderer } from './views/AwarenessOverlayRenderer';
import { BlockMapView } from './views/BlockMapView';
import { FullscreenMapView } from './views/FullscreenMapView';

// Location Sheet
import { initializeLocationSheet, setLocationSheetDependencies, showLocationSheet } from './location-sheet';

// Get document ID from URL path (e.g., /doc/tv-session -> tv-session)
// Path format: /doc/{id}, fallback to query param for backwards compatibility
const pathSegments = window.location.pathname.split('/').filter(Boolean);
const documentId = (pathSegments[0] === 'doc' && pathSegments[1])
  ? pathSegments[1]
  : params.get('doc') || 'default-doc';
const isAgent = isAgentMode; // Reuse the isAgentMode variable from above

console.log('[Main] Starting application', { documentId, isAgent });

// Mapbox token - use environment variable or hardcode for testing
const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN || 'pk.eyJ1IjoibWFkc2JlcnRlbHNlbiIsImEiOiJja2tjeDgxZWYwNHU5MnhtaTVndWRmeHpzIn0.Zs-SFtuSE9I1XAG-TG2fsw';

// Initialize services
const routeService = new RouteService(MAPBOX_TOKEN);
const geocodingService = new GeocodingService();

// Initialize controllers
const editorController = new EditorController(geocodingService, {
  updateStatus: (message: string, state: string) => updateStatus(message, state)
});

const waypointController = new WaypointController({
  notifyChange: () => notifyGeoMarkChange()
});

// Use colors from MarkerFactory (maintains single source of truth)
const COLORS = MarkerFactory.COLORS;

// Initialize views (will be passed to createEditor)
// Note: Global variables like geoMarkChangeListeners, createMarkerElement, and showFullscreenMap
// are defined later in this file
let awarenessOverlayRenderer: AwarenessOverlayRenderer;
let blockMapView: BlockMapView;
let fullscreenMapView: FullscreenMapView;

// Generate user identity
// Check for username in querystring first, otherwise use random for testing with multiple tabs
const usernameParam = params.get('username');
const userNumber = Math.floor(Math.random() * 10) + 1; // 1-10
const userColor = COLORS[userNumber - 1]; // Use same index as user number
const userName = usernameParam || (isAgent ? 'Agent' : `User ${userNumber}`);
const userDisplayColor = isAgent ? '#10b981' : userColor;

console.log('[Main] User identity:', { userName, userDisplayColor });

// Update UI
const modeIndicator = document.getElementById('mode-indicator');
const docInfo = document.getElementById('doc-info');
const statusEl = document.getElementById('status');

if (modeIndicator) {
  const badge = document.createElement('span');
  badge.className = `mode-badge ${isAgent ? 'agent' : 'user'}`;
  badge.style.backgroundColor = userDisplayColor;
  badge.style.color = 'white';
  badge.textContent = userName;
  modeIndicator.appendChild(badge);
}

if (docInfo) {
  docInfo.textContent = `Document: ${documentId}`;
}

function updateStatus(message: string, type: 'connected' | 'connecting' | 'disconnected') {
  if (statusEl) {
    statusEl.textContent = message;
    statusEl.className = `status ${type}`;
  }
}

// Initialize Y.js document and WebRTC provider
async function setupYjs(documentId: string) {
  console.log('[Y.js] Setting up Y.js document:', documentId);

  // Create Y.js document
  const ydoc = new Y.Doc();

  // Get the shared ProseMirror type
  const yXmlFragment = ydoc.getXmlFragment('prosemirror');

  // Create WebRTC provider
  // Use WebSocket signaling server (configurable via env) + BroadcastChannel
  // Auto-detect WebSocket URL based on current location
  const getSignalingBaseUrl = () => {
    // Auto-detect based on current location
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const hostname = window.location.hostname;

    // Development: Use port 8787 for Express signaling server
    // (Vite client is on 5173, Express signaling is on 8787)
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname.startsWith('192.168.')) {
      return `${protocol}//${hostname}:8787/signaling`;
    }

    // Production: use same host with secure WebSocket (no explicit port)
    return `${protocol}//${hostname}/signaling`;
  };

  const signalingBaseUrl = getSignalingBaseUrl();
  const signalingUrl = `${signalingBaseUrl}/${documentId}`;

  console.log('[Y.js] Using signaling server:', signalingUrl);
  console.log('[Y.js] Protocol:', window.location.protocol, 'Hostname:', window.location.hostname);

  // Start with fallback STUN servers
  // TURN credentials will be received via WebSocket from signaling server
  console.log('[Y.js] Starting with fallback STUN servers (TURN credentials will be sent via WebSocket)');
  let iceServers: RTCIceServer[] = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ];

  const provider = new WebrtcProvider(documentId, ydoc, {
    // WebSocket signaling server for cross-machine sync
    // BroadcastChannel will also handle local tab communication
    signaling: [signalingUrl],
    // Enable password for room isolation (optional)
    password: null,
    // Configure WebRTC peer connection with STUN and TURN servers
    peerOpts: {
      config: {
        iceServers,
        iceCandidatePoolSize: 10,
        iceTransportPolicy: 'all', // 'all' allows all candidates, 'relay' forces TURN
      },
      // Enable trickle ICE for faster connections
      trickle: true,
      // Connection timeout
      connectionTimeout: 30000,
    },
    // Maximum number of WebRTC connections (0 = unlimited)
    maxConns: 20,
    // Filter connections - connect to all peers
    filterBcConns: false,
  });

  // Get awareness instance from provider (automatically created)
  const awareness = provider.awareness;
  globalAwareness = awareness; // Store globally for window functions

  // Set local user info with pre-generated identity
  awareness.setLocalStateField('user', {
    name: userName,
    color: userDisplayColor,
    mapBounds: null, // Will be set when user opens fullscreen map
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

  provider.on('synced', (synced: boolean) => {
    console.log('[WebRTC] Synced:', synced);
    if (synced) {
      updateStatus('Editor ready - Synced', 'connected');
    }
  });

  provider.on('peers', (event: any) => {
    console.log('[WebRTC] Connected peers:', {
      webrtcPeers: event.webrtcPeers?.length || 0,
      bcPeers: event.bcPeers?.length || 0
    });

    const totalPeers = (event.webrtcPeers?.length || 0) + (event.bcPeers?.length || 0);
    if (totalPeers > 0) {
      updateStatus(`Connected to ${totalPeers} peer(s)`, 'connected');
    }
  });

  // Track which avatar context menu is targeting
  let contextMenuTargetClientId: number | null = null;

  // Function to update avatar display in toolbar
  const updateAvatars = () => {
    const avatarsContainer = document.getElementById('avatars');
    if (!avatarsContainer) return;

    // Clear existing avatars
    avatarsContainer.innerHTML = '';

    // Get all awareness states
    const states = awareness.getStates();
    const myClientId = awareness.clientID;
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
      avatar.tabIndex = 0; // Make focusable for D-pad navigation
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
          showAvatarContextMenu(clientId, state.user.name, avatar, e);
        });
      }

      avatarsContainer.appendChild(avatar);
    });
  };

  // Show context menu for avatar
  const showAvatarContextMenu = (clientId: number, userName: string, avatarEl: HTMLElement, event: MouseEvent) => {
    const contextMenu = document.getElementById('avatar-context-menu');
    const followBtn = document.getElementById('follow-user-btn');
    if (!contextMenu || !followBtn) return;

    contextMenuTargetClientId = clientId;
    const followingUserId = viewSyncService?.getFollowingUserId() ?? null;

    // Update button text
    if (followingUserId === clientId) {
      followBtn.textContent = 'Stop Following';
    } else {
      followBtn.textContent = `Follow ${userName}`;
    }

    // Position menu below avatar
    const rect = avatarEl.getBoundingClientRect();
    contextMenu.style.top = `${rect.bottom + 8}px`;
    contextMenu.style.left = `${rect.left}px`;
    contextMenu.style.display = 'block';
  };

  // Hide context menu
  const hideAvatarContextMenu = () => {
    const contextMenu = document.getElementById('avatar-context-menu');
    if (contextMenu) {
      contextMenu.style.display = 'none';
    }
    contextMenuTargetClientId = null;
  };

  // Set up context menu follow button
  const followUserBtn = document.getElementById('follow-user-btn');
  if (followUserBtn) {
    followUserBtn.addEventListener('click', () => {
      if (contextMenuTargetClientId !== null && viewSyncService) {
        const followingUserId = viewSyncService.getFollowingUserId();

        if (followingUserId === contextMenuTargetClientId) {
          // Stop following
          viewSyncService.followUser(null);
          console.log('[Main] Stopped following');
        } else {
          // Start following
          viewSyncService.followUser(contextMenuTargetClientId);
          const state = awareness.getStates().get(contextMenuTargetClientId);
          console.log('[Main] Now following:', state?.user?.name);
        }

        // Update avatars to reflect following state
        updateAvatars();
      }
      hideAvatarContextMenu();
    });
  }

  // Close context menu when clicking outside
  document.addEventListener('click', (e) => {
    const contextMenu = document.getElementById('avatar-context-menu');
    if (contextMenu && !contextMenu.contains(e.target as Node)) {
      hideAvatarContextMenu();
    }
  });

  // Listen for awareness changes to show other users' map bounds
  awareness.on('change', ({ added, updated, removed }: any) => {
    console.log('[Awareness] Change event:', { added, updated, removed });

    // Update avatars on any change
    updateAvatars();

    // Handle added users
    added.forEach((clientId: number) => {
      if (clientId === awareness.clientID) return; // Skip own client

      const state = awareness.getStates().get(clientId);
      if (state?.user?.mapBounds) {
        console.log('[Awareness] User added with map bounds:', clientId, state.user);
        addBoundsOverlay(clientId, state.user.mapBounds, state.user.color);
      }
    });

    // Handle updated users
    updated.forEach((clientId: number) => {
      if (clientId === awareness.clientID) return; // Skip own client

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
      if (viewSyncService) {
        const followingUserId = viewSyncService.getFollowingUserId();

        // Only apply if we're following this specific user
        if (followingUserId === clientId) {
          // Check if fullscreen map is already open (for distinguishing open vs pan/zoom)
          const wasFullscreenOpen = document.getElementById('fullscreen-overlay')?.classList.contains('visible');

          // Apply view state (scroll position, fullscreen map state)
          // Pass map bounds so fullscreen map opens with correct bounds
          if (state?.user?.viewState) {
            console.log('[ViewSync] Applying view state from user:', clientId, state.user.viewState);
            viewSyncService.applyRemoteViewState(state.user.viewState, state.user.mapBounds);
          }

          // Apply map bounds ONLY if fullscreen was already open (pan/zoom sync)
          // Don't apply if we just opened fullscreen - bounds were already passed to show()
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
      if (viewSyncService) {
        viewSyncService.handleUserDisconnect(clientId);
        updateAvatars(); // Update UI to remove following indicator
      }
    });
  });

  // Initial avatar render
  updateAvatars();

  console.log('[Y.js] Y.js document and WebRTC provider created');

  return { ydoc, yXmlFragment, provider, awareness };
}

// Custom cursor builder for minimal, non-intrusive presence indicators
function customCursorBuilder(user: any): HTMLElement {
  const cursor = document.createElement('span');
  cursor.classList.add('ProseMirror-yjs-cursor');
  cursor.style.position = 'relative';
  cursor.style.marginLeft = '-1px';
  cursor.style.marginRight = '-1px';
  cursor.style.borderLeft = `2px solid ${user.color}`;
  cursor.style.borderRight = `2px solid ${user.color}`;
  cursor.style.height = '1.2em';
  cursor.style.display = 'inline-block';
  cursor.style.pointerEvents = 'none';

  // Create label that appears above the cursor
  const label = document.createElement('div');
  label.style.position = 'absolute';
  label.style.top = '-1.8em';
  label.style.left = '0';
  label.style.fontSize = '10px';
  label.style.fontWeight = '600';
  label.style.backgroundColor = user.color;
  label.style.color = 'white';
  label.style.padding = '2px 6px';
  label.style.borderRadius = '3px';
  label.style.whiteSpace = 'nowrap';
  label.style.boxShadow = '0 1px 3px rgba(0,0,0,0.2)';
  label.style.pointerEvents = 'none';
  label.textContent = user.name || 'Anonymous';

  cursor.appendChild(label);
  return cursor;
}

// Global geo-mark change listeners
const geoMarkChangeListeners: Set<() => void> = new Set();
const notifyGeoMarkChange = () => {
  geoMarkChangeListeners.forEach(listener => listener());
};

// Global transport edit mode state
let transportEditModeGeoId: string | null = null;

// Global awareness variable (for map bounds tracking)
let globalAwareness: any = null;

// Global ViewSyncService for collaborative view synchronization
let viewSyncService: ViewSyncService | null = null;

// Initialize AwarenessOverlayRenderer
awarenessOverlayRenderer = new AwarenessOverlayRenderer();

// Helper function to create marker elements
// Legacy function name kept for compatibility - delegates to MarkerFactory
function createMarkerElement(colorIndex: number) {
  return MarkerFactory.createLocationMarker(colorIndex);
}

// Initialize BlockMapView with dependencies
// Note: showFullscreenMap is defined below, but it's accessed dynamically via (window as any)
blockMapView = new BlockMapView({
  waypointController,
  colors: COLORS,
  mapboxToken: MAPBOX_TOKEN,
  geoMarkChangeListeners,
  createMarkerElement,
  showFullscreenMap: () => {
    if ((window as any).showFullscreenMap) {
      (window as any).showFullscreenMap();
    }
  }
});

// Declare global variable to store current editor view
let globalEditorView: EditorView | null = null;

// Extract locations from document (for fullscreen map)
// Delegates to LocationExtractor service
function extractLocationsForFullscreen() {
  return LocationExtractor.extractAll(globalEditorView);
}

// FullscreenMapView will be initialized in main() after awareness is available

// Show fullscreen map (using existing overlay from HTML)
// Delegates to FullscreenMapView class
// Optional targetBounds for follow mode (uses followed user's bounds instead of calculating)
(window as any).showFullscreenMap = (targetBounds?: { north: number; south: number; east: number; west: number }) => {
  if (fullscreenMapView) {
    fullscreenMapView.show(targetBounds);

    // Notify ViewSyncService if presenting (not when following)
    if (viewSyncService && !viewSyncService.isFollowing()) {
      viewSyncService.setFullscreenMapOpen(true);
    }
  }
};

// Hide fullscreen map
(window as any).hideFullscreenMap = () => {
  if (fullscreenMapView) {
    fullscreenMapView.hide();

    // Notify ViewSyncService if presenting
    if (viewSyncService) {
      viewSyncService.setFullscreenMapOpen(false);
    }
  }
};


// Helper function to update awareness with current map bounds
// Delegates to AwarenessOverlayRenderer
function updateMapBoundsAwareness(awareness: any, map: mapboxgl.Map) {
  awarenessOverlayRenderer.updateMapBoundsAwareness(awareness, map);
}

// Add bounds overlay to block maps
// Delegates to AwarenessOverlayRenderer
function addBoundsOverlay(clientId: number, bounds: any, color: string) {
  awarenessOverlayRenderer.addBoundsOverlay(clientId, bounds, color);
}

// Update existing bounds overlay (with animation)
// Delegates to AwarenessOverlayRenderer
function updateBoundsOverlay(clientId: number, bounds: any, color: string) {
  awarenessOverlayRenderer.updateBoundsOverlay(clientId, bounds, color);
}

// Remove bounds overlay from block maps
// Delegates to AwarenessOverlayRenderer
function removeBoundsOverlay(clientId: number) {
  awarenessOverlayRenderer.removeBoundsOverlay(clientId);
}

// Map Node View - renders Mapbox maps for map blocks
// Delegates to BlockMapView class
function createMapNodeView(node: any, editorView: EditorView) {
  return blockMapView.create(node, editorView);
}

// Initialize ProseMirror editor with Y.js sync
function createEditor(yXmlFragment: Y.XmlFragment, awareness: any) {
  const container = document.getElementById('editor-container');
  if (!container) {
    console.error('[Main] Editor container not found');
    return null;
  }

  const state = EditorState.create({
    schema: customSchema,
    plugins: [
      // Y.js sync plugins
      ySyncPlugin(yXmlFragment),
      yCursorPlugin(awareness, { cursorBuilder: customCursorBuilder }),
      yUndoPlugin(),

      // ProseMirror plugins
      keymap({ 'Mod-z': yUndo, 'Mod-y': yRedo }),
      keymap(baseKeymap),
    ],
  });

  const view = new EditorView(container, {
    state,
    attributes: {
      class: 'ProseMirror',
    },
    nodeViews: {
      map: createMapNodeView,
    },
    dispatchTransaction(tr) {
      // Apply transaction and update state
      const newState = this.state.apply(tr);
      this.updateState(newState);
    },
  });

  // Store editor view in controllers
  editorController.setView(view);
  waypointController.setView(view);

  // Keep global reference for backward compatibility
  globalEditorView = view;

  // Debug logging for Android TV keyboard issues
  console.log('[Debug] Adding focus/blur/touch event listeners to editor');
  view.dom.addEventListener('focus', () => {
    console.log('[Debug] Editor FOCUS gained');
  });
  view.dom.addEventListener('blur', (e: FocusEvent) => {
    console.log('[Debug] Editor BLUR - relatedTarget:', e.relatedTarget);
  });
  view.dom.addEventListener('touchstart', (e: TouchEvent) => {
    console.log('[Debug] Editor touchstart - target:', (e.target as HTMLElement)?.tagName, (e.target as HTMLElement)?.className);
  }, { passive: true });
  view.dom.addEventListener('touchend', (e: TouchEvent) => {
    console.log('[Debug] Editor touchend - target:', (e.target as HTMLElement)?.tagName, (e.target as HTMLElement)?.className);
  }, { passive: true });
  view.dom.addEventListener('click', (e: MouseEvent) => {
    console.log('[Debug] Editor click - target:', (e.target as HTMLElement)?.tagName, (e.target as HTMLElement)?.className);
  });

  // Also log on the container
  container.addEventListener('focus', () => console.log('[Debug] Container FOCUS'), true);
  container.addEventListener('blur', () => console.log('[Debug] Container BLUR'), true);

  // Set location sheet dependencies (with change notification callback)
  setLocationSheetDependencies(view, MAPBOX_TOKEN, notifyGeoMarkChange);

  // Initialize ViewSyncService for collaborative view synchronization
  viewSyncService = new ViewSyncService(awareness);
  viewSyncService.setEditorContainer(container);
  console.log('[Main] ViewSyncService initialized');

  console.log('[Main] ProseMirror editor initialized with Y.js sync');

  // Send ready message to parent (WebView/iframe)
  WebViewBridge.sendReady();
  console.log('[Main] Sent ready message to parent');

  // Listen for messages from parent (React Native WebView)
  window.addEventListener('message', (event) => {
    try {
      const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
      console.log('[Main] Received message from parent:', data);

      switch (data.type) {
        case 'createGeoMark':
          console.log('[Main] Creating geo-mark for selected text');
          createGeoMark(view);
          break;

        case 'insertMap':
          console.log('[Main] Inserting map block');
          insertMap(view);
          break;

        case 'updateGeoMark':
          console.log('[Main] Updating geo-mark:', data.geoId, data.updatedAttrs);
          // Find and update the geo-mark in the document
          const { geoId, updatedAttrs } = data;
          let found = false;

          view.state.doc.descendants((node, pos) => {
            if (found) return false; // Stop searching once found

            if (node.isText && node.marks.length > 0) {
              const geoMark = node.marks.find(m => m.type.name === 'geoMark');
              if (geoMark && geoMark.attrs.geoId === geoId) {
                console.log('[Main] Found geo-mark at position:', pos);
                console.log('[Main] Current attrs:', geoMark.attrs);

                // Create updated mark with new attributes
                const updatedMark = view.state.schema.marks.geoMark.create({
                  ...geoMark.attrs,
                  ...updatedAttrs
                });

                // Create transaction to update the mark
                const tr = view.state.tr.removeMark(
                  pos,
                  pos + node.nodeSize,
                  view.state.schema.marks.geoMark
                ).addMark(
                  pos,
                  pos + node.nodeSize,
                  updatedMark
                );

                view.dispatch(tr);
                console.log('[Main] Geo-mark updated successfully');
                console.log('[Main] New attrs:', updatedMark.attrs);

                // Notify listeners that geo-marks changed
                notifyGeoMarkChange();

                found = true;
                return false;
              }
            }
          });

          if (!found) {
            console.warn('[Main] Geo-mark not found:', geoId);
          }
          break;

        case 'enterTransportEditMode':
          console.log('[Main] Entering transport edit mode for:', data.geoId);
          transportEditModeGeoId = data.geoId;
          // Show info banner or visual feedback
          console.log('[Main] Transport edit mode enabled - routes are clickable');
          break;

        case 'exitTransportEditMode':
          console.log('[Main] Exiting transport edit mode');
          transportEditModeGeoId = null;
          break;

        case 'typewriter':
          // Insert character at end of document (for landing page demo)
          if (data.char) {
            const { state, dispatch } = view;
            const endPos = state.doc.content.size - 1; // Before closing tag
            const tr = state.tr.insertText(data.char, endPos);
            dispatch(tr);
          }
          break;

        default:
          console.log('[Main] Unknown command:', data.type);
      }
    } catch (error) {
      console.error('[Main] Error handling message from parent:', error);
    }
  });

  // Track selection changes and send to parent
  const sendSelectionUpdate = () => {
    const { from, to } = view.state.selection;
    const hasSelection = from !== to;

    const message = {
      type: 'selectionChange',
      hasSelection
    };

    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(JSON.stringify(message));
    } else if (window.parent !== window) {
      window.parent.postMessage(message, '*');
    }

    console.log('[Main] Selection changed:', { hasSelection, from, to });
  };

  // Send initial selection state
  sendSelectionUpdate();

  // Update on selection change
  view.dom.addEventListener('mouseup', sendSelectionUpdate);
  view.dom.addEventListener('keyup', sendSelectionUpdate);
  view.dom.addEventListener('touchend', sendSelectionUpdate);

  return view;
}

// Auto-open agent tab (user mode only)
function openAgentTab(awareness: any) {
  if (isAgent) {
    console.log('[Main] Already in agent mode, skipping agent tab creation');
    return;
  }

  // Track if we've already opened an agent tab in this session
  let agentWindow: Window | null = null;
  let hasCheckedForAgent = false;

  // Check if an agent is already connected
  const checkForExistingAgent = () => {
    const states = awareness.getStates();
    let agentCount = 0;
    let otherClients = 0;

    console.log('[Main] Checking awareness states:', states.size);
    states.forEach((state: any, clientId: number) => {
      // Skip our own client
      if (clientId === awareness.clientID) {
        console.log(`[Main] Skipping own client ${clientId}`);
        return;
      }

      otherClients++;
      console.log(`[Main] Client ${clientId}: user=${JSON.stringify(state.user)}`);

      // Check if this client is an agent
      if (state.user?.name === 'Agent') {
        agentCount++;
      }
    });

    console.log(`[Main] Found ${otherClients} other clients, ${agentCount} agents`);
    return agentCount > 0;
  };

  // Try to open agent tab after initial sync
  const tryOpenAgent = () => {
    if (hasCheckedForAgent) {
      return;
    }
    hasCheckedForAgent = true;

    // Check if there's already an agent connected
    if (checkForExistingAgent()) {
      console.log('[Main] Agent already connected to document, skipping agent tab creation');
      return;
    }

    const agentUrl = `${window.location.origin}/doc/${documentId}?agent=true`;
    console.log('[Main] No agent found, opening agent tab:', agentUrl);

    // Using named window target - if window with this name exists, it will be reused
    agentWindow = window.open(agentUrl, `agent-${documentId}`, 'width=800,height=600');

    if (!agentWindow) {
      console.error('[Main] Failed to open agent tab - popup blocked?');
      updateStatus('Failed to open agent tab (popup blocked)', 'disconnected');
    } else {
      console.log('[Main] Agent tab opened/focused successfully');
    }
  };

  // Wait for initial sync before checking for agents
  setTimeout(tryOpenAgent, 1500);

  // Close agent tab when user tab closes
  window.addEventListener('beforeunload', () => {
    if (agentWindow && !agentWindow.closed) {
      console.log('[Main] Closing agent tab');
      agentWindow.close();
    }
  });
}

// Main initialization
async function main() {
  updateStatus('Initializing Y.js...', 'connecting');

  // Set up Y.js and WebRTC provider (now async to fetch TURN credentials)
  const { ydoc, yXmlFragment, provider, awareness } = await setupYjs(documentId);

  updateStatus('Initializing editor...', 'connecting');

  // Create editor with Y.js sync
  const editor = createEditor(yXmlFragment, awareness);
  if (!editor) {
    updateStatus('Failed to initialize editor', 'disconnected');
    return;
  }

  // Initialize agent AFTER editor is created (agent needs editorView and schema)
  // Wait for agent module to load if we're in agent mode
  if (isAgent && agentModulePromise) {
    await agentModulePromise;
    if (initializeAgent) {
      console.log('[Main] Initializing agent with Y.js document observation');
      initializeAgent(yXmlFragment, ydoc, documentId, editor, customSchema);
    } else {
      console.error('[Main] Agent module failed to load');
    }
  }

  // Initialize FullscreenMapView now that awareness is available
  fullscreenMapView = new FullscreenMapView({
    waypointController,
    awarenessOverlayRenderer,
    mapboxToken: MAPBOX_TOKEN,
    geoMarkChangeListeners,
    createMarkerElement,
    extractLocationsForFullscreen,
    showLocationSheet,
    globalAwareness,
    // Don't broadcast bounds when following someone (to avoid conflicts)
    shouldBroadcastBounds: () => {
      if (!viewSyncService) return true;
      const isFollowing = viewSyncService.isFollowing();
      const isUpdating = viewSyncService.isUpdating();
      return !isFollowing && !isUpdating;
    }
  });
  console.log('[Main] FullscreenMapView initialized with awareness');

  // Wire up ViewSyncService with FullscreenMapView for follow mode map sync
  if (viewSyncService) {
    viewSyncService.setFullscreenMapView(fullscreenMapView);
    console.log('[Main] ViewSyncService connected to FullscreenMapView');
  }

  // Open agent tab (user mode only, and only if enableAgent=true, not in animate mode)
  const enableAgent = params.get('enableAgent') === 'true';
  if (!isAgent && enableAgent && !isAnimateMode) {
    console.log('[Main] enableAgent=true, opening agent tab');
    openAgentTab(awareness);
  } else if (isAnimateMode) {
    console.log('[Main] Animate mode - skipping agent tab');
  } else if (!isAgent) {
    console.log('[Main] Agent tab disabled (enableAgent not set to true)');
  }

  // Set up toolbar button handlers
  setupToolbarButtons(editor);

  // Watch for remote Y.js changes to trigger block map updates
  // This ensures that when other clients add/modify geo-marks, local block maps update
  yXmlFragment.observeDeep((events, transaction) => {
    // Only trigger for remote changes (not local changes - those already call notifyGeoMarkChange)
    if (!transaction.local) {
      console.log('[Y.js] Remote document change detected, notifying listeners');
      notifyGeoMarkChange();
    }
  });

  updateStatus('Connecting to peers...', 'connecting');
  console.log('[Main] Application initialized successfully');

}

// Function to geocode a place name using Nominatim
async function geocodePlace(placeName: string) {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(placeName)}&format=json&limit=1`;

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'WebRTC-Agent-POC/1.0'
      }
    });

    if (!response.ok) {
      throw new Error(`Nominatim API error: ${response.status}`);
    }

    const data = await response.json();

    if (data.length === 0) {
      return null;
    }

    return {
      placeName: data[0].display_name,
      lat: data[0].lat,
      lng: data[0].lon
    };
  } catch (error) {
    console.error('[Main] Geocoding error:', error);
    return null;
  }
}

// Function to create a geo mark on selected text
async function createGeoMark(view: EditorView) {
  const { state } = view;
  const { from, to } = state.selection;

  if (from === to) {
    alert('Please select some text to create a geo mark');
    return;
  }

  // Get the selected text
  const selectedText = state.doc.textBetween(from, to);

  // Show loading state
  updateStatus('Geocoding location...', 'connecting');

  // Geocode the selected text
  const geocodeResult = await geocodePlace(selectedText);

  if (!geocodeResult) {
    updateStatus('Could not find location', 'disconnected');
    alert(`Could not find coordinates for "${selectedText}". Please try a different location name.`);
    return;
  }

  // Generate a unique ID
  const geoId = `geo-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  // Create the geo mark
  const geoMarkType = customSchema.marks.geoMark;
  const mark = geoMarkType.create({
    geoId,
    displayText: selectedText,
    placeName: geocodeResult.placeName,
    lat: geocodeResult.lat,
    lng: geocodeResult.lng,
    colorIndex: Math.floor(Math.random() * 10),
    coordSource: 'nominatim'
  });

  // Apply the mark to the selection
  const tr = state.tr.addMark(from, to, mark);
  view.dispatch(tr);

  updateStatus('Geo mark created', 'connected');
  console.log('[Main] Created geo mark:', {
    geoId,
    selectedText,
    placeName: geocodeResult.placeName,
    lat: geocodeResult.lat,
    lng: geocodeResult.lng
  });

  // Notify listeners that a new geo-mark was created
  notifyGeoMarkChange();
}

// Function to insert a map block
function insertMap(view: EditorView) {
  const { state } = view;
  const { $from } = state.selection;

  // Create the map node
  const mapNode = customSchema.nodes.map.create({ height: 400 });

  // Insert at the current position
  const tr = state.tr.insert($from.pos, mapNode);
  view.dispatch(tr);

  console.log('[Main] Inserted map block');
}

// Set up toolbar button event listeners
function setupToolbarButtons(view: EditorView) {
  const newDocBtn = document.getElementById('new-doc-btn');
  const createGeoMarkBtn = document.getElementById('create-geomark-btn') as HTMLButtonElement;
  const insertMapBtn = document.getElementById('insert-map-btn');

  // Function to update button state based on selection
  const updateButtonState = () => {
    if (!createGeoMarkBtn) return;

    const { state } = view;
    const { from, to } = state.selection;
    const hasSelection = from !== to;

    createGeoMarkBtn.disabled = !hasSelection;
    createGeoMarkBtn.style.opacity = hasSelection ? '1' : '0.5';
    createGeoMarkBtn.style.cursor = hasSelection ? 'pointer' : 'not-allowed';
  };

  // Initial button state
  updateButtonState();

  // Update button state on selection change
  view.dom.addEventListener('mouseup', updateButtonState);
  view.dom.addEventListener('keyup', updateButtonState);

  // Button click handlers
  if (newDocBtn) {
    newDocBtn.addEventListener('click', () => {
      // Generate a new random document ID
      const newDocId = 'doc-' + Math.random().toString(36).substring(2, 15);
      console.log('[Main] Creating new document:', newDocId);

      // Redirect to new document (using path-based URL)
      window.location.href = `${window.location.origin}/doc/${newDocId}`;
    });
  }

  if (createGeoMarkBtn) {
    createGeoMarkBtn.addEventListener('click', () => createGeoMark(view));
  }

  if (insertMapBtn) {
    insertMapBtn.addEventListener('click', () => insertMap(view));
  }

  console.log('[Main] Toolbar buttons set up');
}

// Set up close button handler for fullscreen overlay
document.addEventListener('DOMContentLoaded', () => {
  const closeBtn = document.querySelector('.close-btn');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      if ((window as any).hideFullscreenMap) {
        (window as any).hideFullscreenMap();
      }
    });
  }

  // Initialize location sheet
  initializeLocationSheet();
});

// Start the application
main().catch((error) => {
  console.error('[Main] Initialization error:', error);
  updateStatus(`Error: ${error.message}`, 'disconnected');
});
