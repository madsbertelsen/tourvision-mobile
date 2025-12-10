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
import { EditorState, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { customSchema } from './prosemirror-schema';

// Y.js imports
import { yCursorPlugin, redo as yRedo, ySyncPlugin, undo as yUndo, yUndoPlugin } from 'y-prosemirror';
import { WebrtcProvider } from 'y-webrtc';
import * as Y from 'yjs';

// Mapbox GL JS

// Services
import { AnimateAgent, AnimatePlayback } from './services/AnimatePlayback';
import { AutoplayDemo, ComposedDemoPlayer } from './services/AutoplayDemo';
import { GeocodingService } from './services/GeocodingService';
import { GeoMarkingService } from './services/GeoMarkingService';
import { LocationExtractor } from './services/LocationExtractor';
import { MapInteractionService } from './services/MapInteractionService';
import { MarkerFactory } from './services/MarkerFactory';
import { RouteService } from './services/RouteService';
import { VideoChatService } from './services/VideoChatService';
import { ViewSyncService } from './services/ViewSyncService';
import { voiceInputService } from './services/VoiceInputService';
import { setupYjs, customCursorBuilder, type YjsSetupDependencies } from './services/YjsSetupService';
import { initializeAgentDataChannelService } from './services/AgentDataChannelService';

// Conditionally import agent module
// In dev mode: Load based on URL parameter
// In production: Load only in agent build
let initializeAgent: ((yXmlFragment: any, ydoc: any, documentId: string, editorView: any, schema: any) => void) | null = null;

// Check if we should load agent: either in agent build OR in dev mode with ?agent=true
const params = new URL(window.location.href).searchParams;
const isAgentMode = params.get('agent') === 'true';
const isAnimateMode = params.get('animate') === 'true'; // Landing page demo mode
const isAutoplayMode = params.get('autoplay') === 'true'; // Self-playing demo for landing page
const isRemoteControlMode = params.get('remoteControl') === 'true'; // Controlled by parent DemoPlayer
const enableSync = params.get('enableSync') === 'true'; // Force sync even in autoplay mode (for dual phone demos)
const isObserveOnly = params.get('observeOnly') === 'true'; // Don't run demo, just observe synced content
const isOfflineMode = params.get('offline') === 'true'; // No network connections (for landing page demo without server)
const followUserId = params.get('follow'); // Auto-follow a specific user by clientId (for "View my screen" links)
const autoplayScript = params.get('demo') || 'collab'; // Which demo script to play
const composedDemo = params.get('composed'); // Composed demo name (e.g., 'fullDemo')

// Add body class for autoplay/demo mode (used to hide UI elements like style picker)
if (isAutoplayMode || isRemoteControlMode) {
  document.body.classList.add('autoplay-mode');
}

// Flag to temporarily disable format button state updates during finger tap animations
let formatButtonUpdateDisabled = false;
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
import { ToolbarController, setupToolbarButtons as initToolbar } from './controllers/ToolbarController';
import { WaypointController } from './controllers/WaypointController';
import { WebViewBridge } from './controllers/WebViewBridge';

// Views
import { AwarenessOverlayRenderer } from './views/AwarenessOverlayRenderer';
import { BlockMapView } from './views/BlockMapView';
import { FullscreenMapView } from './views/FullscreenMapView';

// Location Sheet
import { initializeLocationSheet, setLocationSheetDependencies, showLocationSheet, hideLocationSheet } from './location-sheet';

// Voice Draft Sheet
import { initializeVoiceDraftSheet, setVoiceDraftSheetDependencies } from './voice-draft-sheet';

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

// Predefined locations for deterministic demo mode (no Nominatim API calls)
// These are the locations used in demo scripts
const DEMO_LOCATIONS: Record<string, { placeName: string; lat: string; lng: string }> = {
  'Copenhagen': { placeName: 'Copenhagen, Capital Region of Denmark, Denmark', lat: '55.6761', lng: '12.5683' },
  'Tivoli Gardens': { placeName: 'Tivoli Gardens, Copenhagen, Capital Region of Denmark, Denmark', lat: '55.6736', lng: '12.5681' },
  'Aarhus': { placeName: 'Aarhus, Central Denmark Region, Denmark', lat: '56.1629', lng: '10.2039' },
  'Denmark': { placeName: 'Denmark', lat: '56.2639', lng: '9.5018' },
  // Italy demo locations
  'Rome': { placeName: 'Rome, Lazio, Italy', lat: '41.9028', lng: '12.4964' },
  'Florence': { placeName: 'Florence, Tuscany, Italy', lat: '43.7696', lng: '11.2558' },
  'Venice': { placeName: 'Venice, Veneto, Italy', lat: '45.4408', lng: '12.3155' },
  // Japan demo locations
  'Tokyo': { placeName: 'Tokyo, Japan', lat: '35.6762', lng: '139.6503' },
  'Kyoto': { placeName: 'Kyoto, Kyoto Prefecture, Japan', lat: '35.0116', lng: '135.7681' },
  'Narita': { placeName: 'Narita, Chiba Prefecture, Japan', lat: '35.7764', lng: '140.3183' },
  'Shinjuku': { placeName: 'Shinjuku, Tokyo, Japan', lat: '35.6938', lng: '139.7034' },
};

// Counter for deterministic geo-mark colors during demo mode
let demoColorIndex = 0;

// Initialize views (will be passed to createEditor)
// Note: Global variables like geoMarkChangeListeners, createMarkerElement, and showFullscreenMap
// are defined later in this file
let awarenessOverlayRenderer: AwarenessOverlayRenderer;
let blockMapView: BlockMapView;
let fullscreenMapView: FullscreenMapView;
let fullscreenMapRefreshListener: (() => void) | null = null; // Listener for waypoint changes

// Demo clients map for simulating remote users with awareness-like state
// This allows follow mode to work with simulated users like Marc in autoplay demos
// Defined at module scope so it can be accessed from both the follow button handler and autoplay setup
interface DemoClientState {
  name: string;
  color: string;
  mapBounds: any | null;
  viewState: {
    scrollTop: number;
    scrollLeft: number;
    fullscreenMapOpen: boolean;
    isPresenting: boolean;
    followingUserId: number | null;
  };
}
const demoClients = new Map<number, DemoClientState>();

// Helper to get demo client state (for follow mode integration)
function getDemoClientState(clientId: number) {
  const client = demoClients.get(clientId);
  if (!client) return null;
  return {
    user: {
      name: client.name,
      color: client.color,
      mapBounds: client.mapBounds,
      viewState: client.viewState,
    }
  };
}

// Generate user identity
// Check for username in querystring first, otherwise use random for testing with multiple tabs
// demoUser is used for dual phone demos with deterministic identities (1=Alice, 2=Bob)
const usernameParam = params.get('username');
const demoUserParam = params.get('demoUser');
const DEMO_USERS = [
  { name: 'Alice', color: '#3b82f6' },  // Blue
  { name: 'Bob', color: '#10b981' },    // Green
];

let userNumber: number;
let userName: string;
let userColor: string;

if (demoUserParam) {
  // Dual phone demo mode - use deterministic identity
  const demoUserIndex = parseInt(demoUserParam, 10) - 1;
  const demoUser = DEMO_USERS[demoUserIndex] || DEMO_USERS[0];
  userNumber = demoUserIndex + 1;
  userName = demoUser.name;
  userColor = demoUser.color;
  console.log('[Main] Demo user mode:', { demoUser: demoUserParam, userName, userColor });
} else {
  // Normal mode - random identity
  userNumber = Math.floor(Math.random() * 10) + 1; // 1-10
  userColor = COLORS[userNumber - 1]; // Use same index as user number
  userName = usernameParam || (isAgent ? 'Agent' : `User ${userNumber}`);
}
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

// Track which avatar context menu is targeting (module scope for accessibility)
let contextMenuTargetClientId: number | null = null;

// Show context menu for avatar (module scope for autoplay demo compatibility)
function showAvatarContextMenu(clientId: number, userName: string, avatarEl: HTMLElement, event: MouseEvent) {
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
}

// Hide context menu (module scope)
function hideAvatarContextMenu() {
  const contextMenu = document.getElementById('avatar-context-menu');
  if (contextMenu) {
    contextMenu.style.display = 'none';
  }
  contextMenuTargetClientId = null;
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

// Global MapInteractionService for collaborative finger tracking on fullscreen map
let mapInteractionService: MapInteractionService | null = null;

// Global AnimatePlayback/AnimateAgent for landing page demo mode
let animatePlayback: AnimatePlayback | null = null;
let animateAgent: AnimateAgent | null = null;

// Global VideoChatService for video calls
let videoChatService: VideoChatService | null = null;
let videoSignalingWs: WebSocket | null = null;

// Global AgentDataChannelService for agent communication via WebRTC data channels
let agentDataChannelService: AgentDataChannelService | null = null;

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
  // Dismiss keyboard on mobile by blurring the active element
  if (document.activeElement && document.activeElement instanceof HTMLElement) {
    document.activeElement.blur();
    console.log('[Main] Blurred active element to dismiss keyboard');
  }

  if (fullscreenMapView) {
    fullscreenMapView.show(targetBounds);

    // Opening fullscreen map is an interaction - take control if not following
    if (!targetBounds && (window as any).takeControl) {
      console.log('[Main] Opening fullscreen map - taking control');
      (window as any).takeControl('openFullscreenMap');
    } else if (targetBounds) {
      console.log('[Main] Opening fullscreen map with targetBounds - not taking control (following mode)');
    }

    // Show video thumbnail with the OTHER user's avatar
    // This shows the collaborator's presence during map exploration
    if (userName === 'Alice') {
      fullscreenMapView.showVideoThumbnail('Bob', '#10b981');
    } else if (userName === 'Bob') {
      fullscreenMapView.showVideoThumbnail('Alice', '#3b82f6');
    }

    // Register listener for waypoint changes
    // When waypoints are added via Y.js sync, this triggers a refresh of the fullscreen map
    if (!fullscreenMapRefreshListener) {
      fullscreenMapRefreshListener = () => {
        console.log('[Main] Waypoint change detected, refreshing fullscreen map');
        fullscreenMapView.refresh();
      };
      geoMarkChangeListeners.add(fullscreenMapRefreshListener);
      console.log('[Main] Registered fullscreen map refresh listener');
    }

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

    // Unregister listener for waypoint changes
    if (fullscreenMapRefreshListener) {
      geoMarkChangeListeners.delete(fullscreenMapRefreshListener);
      fullscreenMapRefreshListener = null;
      console.log('[Main] Unregistered fullscreen map refresh listener');
    }

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
function createMapNodeView(node: any, editorView: EditorView, getPos: () => number | undefined) {
  return blockMapView.create(node, editorView, getPos);
}

// Initialize ProseMirror editor with Y.js sync
function createEditor(yXmlFragment: Y.XmlFragment, awareness: any) {
  const container = document.getElementById('editor-container');
  if (!container) {
    console.error('[Main] Editor container not found');
    return null;
  }

  // Initialize new documents with a default map block
  if (yXmlFragment.length === 0) {
    console.log('[Main] Initializing new document with default map block');

    // Create initial content: empty paragraph + map block
    const paragraph = new Y.XmlElement('paragraph');
    const map = new Y.XmlElement('map');
    map.setAttribute('height', '400');

    yXmlFragment.push([paragraph, map]);
    console.log('[Main] Default map block added to new document');
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

      // Track selection for toolbar context-sensitivity
      const { from, to } = newState.selection;
      const hasSelection = from !== to;
      if (hasSelection) {
        document.body.classList.add('has-selection');
      } else {
        document.body.classList.remove('has-selection');
      }

      // Auto-scroll to keep cursor in view when document changes
      if (tr.docChanged) {
        const editorContainer = document.getElementById('editor-container');
        if (editorContainer) {
          // Use requestAnimationFrame to ensure DOM is updated before scrolling
          requestAnimationFrame(() => {
            try {
              const selection = newState.selection;
              const coords = this.coordsAtPos(selection.head);
              if (coords) {
                const containerRect = editorContainer.getBoundingClientRect();
                const cursorTop = coords.top;
                const cursorBottom = coords.bottom;

                // Check if cursor is below visible area
                if (cursorBottom > containerRect.bottom - 20) {
                  const scrollAmount = cursorBottom - containerRect.bottom + 60; // 60px padding
                  editorContainer.scrollTo({
                    top: editorContainer.scrollTop + scrollAmount,
                    behavior: 'auto' // Instant scroll to avoid conflicts
                  });
                }
                // Check if cursor is above visible area
                else if (cursorTop < containerRect.top + 20) {
                  const scrollAmount = containerRect.top - cursorTop + 60;
                  editorContainer.scrollTo({
                    top: editorContainer.scrollTop - scrollAmount,
                    behavior: 'auto' // Instant scroll to avoid conflicts
                  });
                }
              }
            } catch (e) {
              // Ignore scroll errors
            }
          });
        }
      }
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

  // Location sheet awareness callback - tracks which location sheet is open
  const onLocationSheetChange = (location: any | null) => {
    console.log('[Main] Location sheet changed:', location);

    // Update awareness with active location sheet
    const currentState = awareness.getLocalState();
    awareness.setLocalStateField('user', {
      ...currentState?.user,
      activeLocationSheet: location ? {
        geoId: location.geoId,
        displayText: location.displayText,
        placeName: location.placeName,
        lat: location.lat,
        lng: location.lng,
        colorIndex: location.colorIndex,
        color: location.color,
        transportFrom: location.transportFrom,
        transportProfile: location.transportProfile,
        waypoints: location.waypoints
      } : null
    });
  };

  // Set location sheet dependencies (with change notification callback)
  setLocationSheetDependencies(view, MAPBOX_TOKEN, notifyGeoMarkChange, onLocationSheetChange);

  // Initialize ViewSyncService for collaborative view synchronization
  viewSyncService = new ViewSyncService(awareness);
  viewSyncService.setEditorContainer(container);
  console.log('[Main] ViewSyncService initialized');

  // Initialize MapInteractionService for collaborative finger tracking on fullscreen map
  mapInteractionService = new MapInteractionService(awareness);
  console.log('[Main] MapInteractionService initialized');

  // Bidirectional screen following with control token
  // Whoever last interacted gets control, the other user follows them
  let isActiveController = false;
  let currentFollowedUser: number | null = null;
  let controlReleaseTimeout: ReturnType<typeof setTimeout> | null = null;

  // Create visual indicator for when being controlled
  const followingBanner = document.createElement('div');
  followingBanner.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    padding: 12px 20px;
    display: none;
    align-items: center;
    justify-content: space-between;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 14px;
    font-weight: 500;
    box-shadow: 0 2px 8px rgba(0,0,0,0.15);
    z-index: 10000;
    animation: slideDown 0.3s ease-out;
  `;

  // Create container for video/avatar (will hold either video element or mock avatar)
  const videoContainer = document.createElement('div');
  videoContainer.style.cssText = `
    width: 40px;
    height: 40px;
    border-radius: 50%;
    overflow: hidden;
    border: 2px solid rgba(255,255,255,0.3);
    flex-shrink: 0;
  `;

  // Create mock avatar div (used as fallback when no video available)
  const mockAvatar = document.createElement('div');
  mockAvatar.style.cssText = `
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 16px;
    font-weight: 600;
    color: white;
  `;

  // Track current video element and stream to avoid recreating
  let currentBannerVideoElement: HTMLVideoElement | null = null;
  let currentBannerStream: MediaStream | null = null;

  const bannerText = document.createElement('span');
  bannerText.style.cssText = `
    display: flex;
    align-items: center;
    gap: 12px;
  `;

  const takeControlBtn = document.createElement('button');
  takeControlBtn.textContent = 'Take control';
  takeControlBtn.style.cssText = `
    background: rgba(255,255,255,0.2);
    border: 1px solid rgba(255,255,255,0.3);
    color: white;
    padding: 6px 16px;
    border-radius: 6px;
    cursor: pointer;
    font-size: 13px;
    font-weight: 600;
    transition: all 0.2s;
  `;
  takeControlBtn.onmouseover = () => {
    takeControlBtn.style.background = 'rgba(255,255,255,0.3)';
  };
  takeControlBtn.onmouseout = () => {
    takeControlBtn.style.background = 'rgba(255,255,255,0.2)';
  };

  followingBanner.appendChild(bannerText);
  followingBanner.appendChild(takeControlBtn);
  document.body.appendChild(followingBanner);

  // Add keyframe animation
  const bannerStyle = document.createElement('style');
  bannerStyle.textContent = `
    @keyframes slideDown {
      from {
        transform: translateY(-100%);
        opacity: 0;
      }
      to {
        transform: translateY(0);
        opacity: 1;
      }
    }
  `;
  document.head.appendChild(bannerStyle);

  // Function to update the following banner
  const updateFollowingBanner = () => {
    if (currentFollowedUser !== null) {
      const states = awareness.getStates();
      const userState = states.get(currentFollowedUser);

      // Defensive check: Only show banner if the followed user actually has control
      if (userState?.isActiveController !== true) {
        console.warn('[Main] Following user who doesn\'t have control, stopping follow');
        currentFollowedUser = null;
        viewSyncService?.followUser(null);
        followingBanner.style.display = 'none';
        return;
      }

      const userName = userState?.user?.name || `User ${currentFollowedUser}`;
      const userColor = userState?.user?.color || '#667eea';
      const userInitial = userName.charAt(0).toUpperCase();

      // Try to get video stream from VideoChatService
      const peerId = String(currentFollowedUser);
      const hasVideoService = videoChatService && videoChatService.isInCall();

      console.log('[Banner] Updating following banner:', {
        currentFollowedUser,
        peerId,
        hasVideoService,
        videoChatServiceExists: !!videoChatService
      });

      // Check if we have a remote video stream for this user
      if (hasVideoService) {
        // Access the private remoteStreams map via a type assertion
        // This is safe because we control both the service and this code
        const remoteStreams = (videoChatService as any).remoteStreams as Map<string, MediaStream>;

        console.log('[Banner] Remote streams available:', {
          remoteStreamsSize: remoteStreams?.size || 0,
          availablePeerIds: remoteStreams ? Array.from(remoteStreams.keys()) : [],
          lookingForPeerId: peerId
        });

        const stream = remoteStreams?.get(peerId);

        if (stream) {
          console.log('[Banner] Found video stream for followed user:', peerId);

          // Reuse existing video element if stream hasn't changed
          if (currentBannerVideoElement && currentBannerStream === stream) {
            console.log('[Banner] Reusing existing video element (stream unchanged)');
            // Video already set up, no need to recreate
          } else {
            console.log('[Banner] Creating new video element (stream changed or first time)');
            // Clear container
            videoContainer.innerHTML = '';

            // Create new video element
            const videoElement = document.createElement('video');
            videoElement.srcObject = stream;
            videoElement.autoplay = true;
            videoElement.muted = true; // Mute to avoid audio feedback
            videoElement.playsInline = true;
            videoElement.style.cssText = `
              width: 100%;
              height: 100%;
              object-fit: cover;
            `;

            videoContainer.appendChild(videoElement);

            // Track current video element and stream
            currentBannerVideoElement = videoElement;
            currentBannerStream = stream;
          }
        } else {
          console.log('[Banner] No video stream found for followed user:', peerId, '- using mock avatar');

          // Clear video tracking if switching to avatar
          if (currentBannerVideoElement) {
            videoContainer.innerHTML = '';
            currentBannerVideoElement = null;
            currentBannerStream = null;
          }

          // Fall back to mock avatar
          mockAvatar.style.background = userColor;
          mockAvatar.textContent = userInitial;
          if (videoContainer.firstChild !== mockAvatar) {
            videoContainer.innerHTML = '';
            videoContainer.appendChild(mockAvatar);
          }
        }
      } else {
        console.log('[Banner] Video chat service not available - using mock avatar');

        // Clear video tracking if switching to avatar
        if (currentBannerVideoElement) {
          videoContainer.innerHTML = '';
          currentBannerVideoElement = null;
          currentBannerStream = null;
        }

        // Fall back to mock avatar
        mockAvatar.style.background = userColor;
        mockAvatar.textContent = userInitial;
        if (videoContainer.firstChild !== mockAvatar) {
          videoContainer.innerHTML = '';
          videoContainer.appendChild(mockAvatar);
        }
      }

      // Update text content
      const textSpan = document.createElement('span');
      textSpan.innerHTML = `Following <strong style="text-decoration: underline; text-decoration-color: ${userColor};">${userName}</strong>'s view`;

      // Clear and rebuild banner text
      bannerText.innerHTML = '';
      bannerText.appendChild(videoContainer);
      bannerText.appendChild(textSpan);

      followingBanner.style.display = 'flex';
    } else {
      followingBanner.style.display = 'none';
    }
  };

  // Wire up the button to takeControl (will be defined below)
  takeControlBtn.onclick = () => {
    takeControl('manual');
  };

  // Function to release control after inactivity
  const releaseControl = () => {
    if (!isActiveController) return; // Not in control anyway

    console.log('[Main] Releasing control due to inactivity');
    isActiveController = false;

    // Broadcast that we're no longer the active controller
    awareness.setLocalStateField('isActiveController', false);
  };

  // Function to take control when local user interacts
  const takeControl = (eventType?: string) => {
    console.log('[Main] takeControl called', { eventType, isActiveController, currentFollowedUser });

    // Clear any existing release timeout
    if (controlReleaseTimeout) {
      clearTimeout(controlReleaseTimeout);
      console.log('[Main] Cleared existing timeout');
    }

    if (!isActiveController) {
      console.log('[Main] Taking control of shared view');
      isActiveController = true;

      // Stop following others
      if (currentFollowedUser !== null) {
        console.log('[Main] Stopping follow of user:', currentFollowedUser);
        viewSyncService?.followUser(null);
        currentFollowedUser = null;
        // Update visual indicator - hide banner
        updateFollowingBanner();
      }

      // Broadcast that we're the active controller
      awareness.setLocalStateField('isActiveController', true);
      awareness.setLocalStateField('lastInteractionTime', Date.now());
    }

    // Set timeout to release control after 2 seconds of inactivity
    console.log('[Main] Setting 2s release timeout');
    controlReleaseTimeout = setTimeout(releaseControl, 2000);
  };

  // Store takeControl function for use in other parts of the code
  (window as any).takeControl = takeControl;

  // Function to release control and follow another user
  const followOtherUser = (clientId: number) => {
    if (currentFollowedUser === clientId) return; // Already following this user

    console.log('[Main] Releasing control, following user', clientId);
    isActiveController = false;
    currentFollowedUser = clientId;

    // Mark ourselves as not active
    awareness.setLocalStateField('isActiveController', false);

    // Follow the active user
    viewSyncService?.followUser(clientId);

    // Update visual indicator
    updateFollowingBanner();
  };

  // Listen for awareness changes to detect when someone else takes control
  awareness.on('change', () => {
    const states = awareness.getStates();

    // Find if someone else is the active controller
    let otherActiveController: number | null = null;
    for (const [clientId, state] of states) {
      if (clientId !== awareness.clientID && state?.isActiveController === true) {
        otherActiveController = clientId;
        break;
      }
    }

    // If someone else has control and we don't, follow them
    if (otherActiveController !== null && !isActiveController && currentFollowedUser !== otherActiveController) {
      console.log('[Main] Someone else took control, following user:', otherActiveController);
      followOtherUser(otherActiveController);
    }

    // Update banner to ensure it's in sync with actual awareness state
    updateFollowingBanner();

    // Sync location sheet with followed user
    if (currentFollowedUser !== null) {
      const followedState = states.get(currentFollowedUser);
      const followedLocationSheet = followedState?.user?.activeLocationSheet;

      console.log('[Main] Followed user location sheet:', followedLocationSheet);

      // Show location sheet if followed user has one open
      if (followedLocationSheet) {
        // Get all locations to pass to showLocationSheet
        const allLocations = LocationExtractor.extractAll(view);

        // Only show if it's a different location than currently shown
        // (to avoid re-showing the same sheet repeatedly)
        const backdrop = document.getElementById('location-sheet-backdrop');
        const isSheetCurrentlyOpen = backdrop?.classList.contains('visible');

        if (!isSheetCurrentlyOpen) {
          console.log('[Main] Following user opened location sheet, showing:', followedLocationSheet.placeName);
          showLocationSheet(followedLocationSheet, allLocations);
        }
      } else {
        // Followed user closed their sheet, hide ours
        const backdrop = document.getElementById('location-sheet-backdrop');
        const isSheetCurrentlyOpen = backdrop?.classList.contains('visible');

        if (isSheetCurrentlyOpen) {
          console.log('[Main] Followed user closed location sheet, hiding ours');
          hideLocationSheet();
        }
      }
    }
  });

  // Listen for local interactions to take control
  // Use capture phase to intercept before ViewSyncService sees the events
  // Note: Excluding 'scroll' as it fires passively and would prevent timeout from expiring
  const interactionEvents = ['mousedown', 'touchstart', 'wheel', 'keydown'];
  interactionEvents.forEach(eventType => {
    const handler = (e: Event) => {
      console.log(`[Main] Event captured: ${eventType}`, e.target);
      takeControl(eventType);
    };
    container.addEventListener(eventType, handler, { capture: true });
    console.log(`[Main] Registered ${eventType} listener on container`);
  });

  // Nobody has control initially - whoever interacts first will take control
  console.log('[Main] Bidirectional following ready - no initial control, first interaction wins');

  // Handle ?follow=<clientId> URL parameter for "View my screen" links
  if (followUserId) {
    const targetClientId = parseInt(followUserId, 10);
    if (!isNaN(targetClientId)) {
      console.log('[Main] Auto-follow mode - will follow user:', targetClientId);

      // Function to start following the target user
      const startFollowingUser = () => {
        const states = awareness.getStates();
        if (states.has(targetClientId)) {
          console.log('[Main] Target user found, starting to follow:', targetClientId);
          viewSyncService?.followUser(targetClientId);
          return true;
        }
        return false;
      };

      // Try to follow immediately
      if (!startFollowingUser()) {
        // Target user not yet connected, listen for awareness changes
        const awarenessHandler = () => {
          if (startFollowingUser()) {
            // Found target user, remove the listener
            awareness.off('change', awarenessHandler);
          }
        };
        awareness.on('change', awarenessHandler);
        console.log('[Main] Waiting for user', targetClientId, 'to connect...');
      }
    } else {
      console.warn('[Main] Invalid follow parameter:', followUserId);
    }
  }

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
            // Find the last position inside the last text block
            const lastPos = state.doc.content.size;
            // Resolve the position to find a valid text insertion point
            const $pos = state.doc.resolve(lastPos - 1);
            // Get the position at the end of the deepest node (inside paragraph)
            const insertPos = $pos.end($pos.depth);
            const tr = state.tr.insertText(data.char, insertPos);
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

// Video notification banner (shown when someone else is sharing video)
let videoNotificationBanner: HTMLDivElement | null = null;

// Define hide function first so it's available for the button onclick
const hideVideoNotification = () => {
  if (videoNotificationBanner) {
    videoNotificationBanner.style.display = 'none';
  }
};

const showVideoNotification = (sharingUserName: string) => {
  // Create banner if it doesn't exist
  if (!videoNotificationBanner) {
    videoNotificationBanner = document.createElement('div');
    videoNotificationBanner.style.cssText = `
      position: fixed;
      top: 60px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(59, 130, 246, 0.95);
      color: white;
      padding: 12px 24px;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
      font-size: 14px;
      font-weight: 500;
      z-index: 10001;
      display: flex;
      align-items: center;
      gap: 16px;
    `;

    const textSpan = document.createElement('span');
    textSpan.id = 'video-notification-text';
    videoNotificationBanner.appendChild(textSpan);

    const joinButton = document.createElement('button');
    joinButton.textContent = 'Join Call';
    joinButton.style.cssText = `
      background: white;
      color: rgb(59, 130, 246);
      border: none;
      padding: 6px 16px;
      border-radius: 6px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
    `;
    joinButton.onmouseover = () => {
      joinButton.style.background = 'rgba(255, 255, 255, 0.9)';
      joinButton.style.transform = 'scale(1.05)';
    };
    joinButton.onmouseout = () => {
      joinButton.style.background = 'white';
      joinButton.style.transform = 'scale(1)';
    };
    joinButton.onclick = async () => {
      if (videoChatService && !videoChatService.isInCall()) {
        console.log('[VideoNotification] User clicked Join Call');
        try {
          await videoChatService.join(false);
          hideVideoNotification();
        } catch (error) {
          console.error('[VideoNotification] Failed to join call:', error);
        }
      }
    };
    videoNotificationBanner.appendChild(joinButton);

    document.body.appendChild(videoNotificationBanner);
  }

  // Update text
  const textSpan = document.getElementById('video-notification-text');
  if (textSpan) {
    textSpan.innerHTML = `<strong>${sharingUserName}</strong> is sharing video`;
  }

  videoNotificationBanner.style.display = 'flex';
};

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

// Set up video chat WebSocket and service
function setupVideoChat(awareness: any, iceServers: RTCIceServer[]) {
  // Create parallel WebSocket for video signaling
  const getSignalingBaseUrl = () => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const hostname = window.location.hostname;
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname.startsWith('192.168.')) {
      return `${protocol}//${hostname}:8787/signaling`;
    }
    return `${protocol}//${hostname}/signaling`;
  };

  const signalingBaseUrl = getSignalingBaseUrl();
  const videoWsUrl = `${signalingBaseUrl}/${documentId}`;

  console.log('[VideoChat] Connecting to signaling server:', videoWsUrl);

  videoSignalingWs = new WebSocket(videoWsUrl);

  videoSignalingWs.onopen = () => {
    console.log('[VideoChat] WebSocket connected, subscribing to video topic');
    videoSignalingWs!.send(JSON.stringify({
      type: 'subscribe',
      topics: ['video']
    }));
  };

  videoSignalingWs.onmessage = (event) => {
    try {
      const message = JSON.parse(event.data);
      if (message.type === 'publish' && message.topic === 'video') {
        videoChatService?.handleSignalingMessage(message.data);
      }
    } catch (error) {
      console.error('[VideoChat] Error parsing message:', error);
    }
  };

  videoSignalingWs.onerror = (error) => {
    console.error('[VideoChat] WebSocket error:', error);
  };

  videoSignalingWs.onclose = () => {
    console.log('[VideoChat] WebSocket closed');
  };

  // Create VideoChatService
  const clientId = String(awareness.clientID);
  videoChatService = new VideoChatService(clientId, userName, awareness, iceServers);

  // Set up publish function
  videoChatService.publishToTopic = (topic: string, data: any) => {
    if (videoSignalingWs && videoSignalingWs.readyState === WebSocket.OPEN) {
      videoSignalingWs.send(JSON.stringify({
        type: 'publish',
        topic,
        data
      }));
    }
  };

  // Set up event handlers
  videoChatService.onLocalStream = (stream: MediaStream) => {
    console.log('[VideoChat] Local stream received');
    const localVideo = document.getElementById('local-video') as HTMLVideoElement;
    if (localVideo) {
      localVideo.srcObject = stream;
    }
    showVideoContainer();
  };

  videoChatService.onRemoteStream = (peerId: string, stream: MediaStream, peerName: string) => {
    console.log('[VideoChat] Remote stream from:', peerId, peerName);
    addRemoteVideo(peerId, stream, peerName);
    // Show video container when receiving remote stream (even if not sharing own video)
    showVideoContainer();
    // Update following banner in case we're following this user - show their video
    updateFollowingBanner();
  };

  videoChatService.onPeerDisconnect = (peerId: string) => {
    console.log('[VideoChat] Peer disconnected:', peerId);
    removeRemoteVideo(peerId);
    // Update following banner in case we were following this user - fall back to avatar
    updateFollowingBanner();
  };

  videoChatService.onParticipantsChange = (count: number) => {
    console.log('[VideoChat] Participant count:', count + 1); // +1 for self
    updateVideoGridLayout(count + 1);
  };

  videoChatService.onError = (error: Error) => {
    console.error('[VideoChat] Error:', error);
    alert(`Video chat error: ${error.message}`);
  };

  console.log('[VideoChat] VideoChatService initialized');
}

// Video UI helpers
function showVideoContainer() {
  const container = document.getElementById('video-chat-container');
  const joinBtn = document.getElementById('join-video-btn');
  if (container) container.classList.add('visible');
  if (joinBtn) joinBtn.classList.add('active');
}

function hideVideoContainer() {
  const container = document.getElementById('video-chat-container');
  const joinBtn = document.getElementById('join-video-btn');
  if (container) container.classList.remove('visible');
  if (joinBtn) joinBtn.classList.remove('active');
}

function addRemoteVideo(peerId: string, stream: MediaStream, peerName: string) {
  const grid = document.getElementById('video-grid');
  if (!grid) return;

  // Check if video wrapper already exists
  let wrapper = document.getElementById(`video-wrapper-${peerId}`);
  if (wrapper) {
    const video = wrapper.querySelector('video');
    if (video) video.srcObject = stream;
    return;
  }

  // Create new video wrapper
  wrapper = document.createElement('div');
  wrapper.id = `video-wrapper-${peerId}`;
  wrapper.className = 'video-wrapper';

  const video = document.createElement('video');
  video.autoplay = true;
  video.playsInline = true;
  video.srcObject = stream;

  const label = document.createElement('span');
  label.className = 'video-label';
  label.textContent = peerName;

  wrapper.appendChild(video);
  wrapper.appendChild(label);
  grid.appendChild(wrapper);

  updateVideoGridLayout(grid.children.length);
}

function removeRemoteVideo(peerId: string) {
  const wrapper = document.getElementById(`video-wrapper-${peerId}`);
  if (wrapper) {
    wrapper.remove();
  }

  const grid = document.getElementById('video-grid');
  if (grid) {
    updateVideoGridLayout(grid.children.length);
  }
}

function updateVideoGridLayout(count: number) {
  const grid = document.getElementById('video-grid');
  if (!grid) return;

  // Remove all participant classes
  grid.classList.remove('participants-1', 'participants-2', 'participants-3', 'participants-4');

  // Add appropriate class
  if (count <= 1) {
    grid.classList.add('participants-1');
  } else if (count === 2) {
    grid.classList.add('participants-2');
  } else if (count === 3) {
    grid.classList.add('participants-3');
  } else {
    grid.classList.add('participants-4');
  }
}

function showJoinVideoModal() {
  const modal = document.getElementById('join-video-modal');
  if (modal) modal.classList.add('visible');
}

function hideJoinVideoModal() {
  const modal = document.getElementById('join-video-modal');
  if (modal) modal.classList.remove('visible');
}

// Main initialization
async function main() {
  updateStatus('Initializing Y.js...', 'connecting');

  // Set up Y.js and WebRTC provider (now async to fetch TURN credentials)
  // Disable sync for autoplay mode to prevent conflicts between multiple viewers
  // UNLESS enableSync=true is set (for dual phone demos that need to sync)
  // For offline mode: use BroadcastChannel only (no signaling server) - works for same-origin iframes
  const yjsDeps: YjsSetupDependencies = {
    userName,
    userDisplayColor,
    getViewSyncService: () => viewSyncService,
    getContextMenuTargetClientId: () => contextMenuTargetClientId,
    getDemoClientState,
    updateStatus,
    showFullscreenMap: (bounds) => (window as any).showFullscreenMap?.(bounds),
    showAvatarContextMenu,
    hideAvatarContextMenu,
    addBoundsOverlay,
    updateBoundsOverlay,
    removeBoundsOverlay,
  };
  const { ydoc, yXmlFragment, provider, awareness } = await setupYjs(
    {
      documentId,
      disableSync: isAutoplayMode && !enableSync && !isOfflineMode,
      usePublicSignaling: isOfflineMode,  // BroadcastChannel only, no server connection
    },
    yjsDeps
  );
  globalAwareness = awareness; // Store globally for window functions

  // Initialize AgentDataChannelService if we have a provider (not in offline mode)
  if (provider) {
    agentDataChannelService = initializeAgentDataChannelService(provider, awareness, isAgentMode);
    console.log('[Main] AgentDataChannelService initialized');
  }

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
      initializeAgent(yXmlFragment, ydoc, documentId, editor, customSchema, notifyGeoMarkChange);
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
    },
    // MapInteractionService for collaborative finger tracking
    mapInteractionService: mapInteractionService ?? undefined,
    // Callback for when user interacts with fullscreen map
    onInteraction: takeControl
  });
  console.log('[Main] FullscreenMapView initialized with awareness');

  // Expose fullscreenMapView to window for tool execution (focusMap)
  (window as any).fullscreenMapView = fullscreenMapView;

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

  // Set up video chat (parallel WebSocket for video signaling)
  // Skip in offline mode to avoid network errors
  if (!isOfflineMode) {
    // Use the same ICE servers as y-webrtc
    const iceServers: RTCIceServer[] = [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
    ];
    setupVideoChat(awareness, iceServers);

    // Set up awareness listener to notify when others are sharing video
    awareness.on('change', () => {
      if (!videoChatService) return;

      // Check if we're already in a call - no need to notify
      if (videoChatService.isInCall()) return;

      // Check if any other user is in a video call
      const states = awareness.getStates();
      let someoneSharingVideo = false;
      let sharingUserName = '';

      for (const [clientId, state] of states.entries()) {
        const peerId = String(clientId);

        // Skip ourselves
        if (peerId === awareness.clientID.toString()) continue;

        // Check if this user is in a video call
        const videoState = state?.user?.videoState;
        if (videoState && videoState.inCall) {
          someoneSharingVideo = true;
          sharingUserName = state?.user?.name || `User ${clientId}`;
          break;
        }
      }

      // Show or hide video notification banner
      if (someoneSharingVideo) {
        showVideoNotification(sharingUserName);
      } else {
        hideVideoNotification();
      }
    });
  } else {
    console.log('[Main] Offline mode - skipping video chat setup');
  }

  // Initialize Animate mode for landing page demo
  // User tab: Creates scroll overlay and broadcasts position via awareness
  // Agent tab: Observes scroll position and types content via Y.js sync
  if (isAnimateMode) {
    if (isAgent) {
      // Agent tab - types content based on scroll position from user tab
      console.log('[Main] Initializing AnimateAgent for demo mode (agent tab)');
      animateAgent = new AnimateAgent(editor, awareness);
      animateAgent.initialize();
    } else {
      // User tab - scroll overlay that broadcasts position
      console.log('[Main] Initializing AnimatePlayback for demo mode (user tab)');
      animatePlayback = new AnimatePlayback(awareness, documentId);
      animatePlayback.initialize();
    }
  }

  // Initialize Autoplay mode for landing page demos (self-playing, no user interaction)
  // Supports both single-script mode (?autoplay=true&demo=maps) and composed mode (?autoplay=true&composed=fullDemo)
  // Skip if observeOnly is true (second phone in dual mode just observes synced content)
  if (isAutoplayMode && !isObserveOnly) {
    // Create player - either ComposedDemoPlayer or AutoplayDemo
    const player: AutoplayDemo | ComposedDemoPlayer = composedDemo
      ? new ComposedDemoPlayer(editor, composedDemo, awareness)
      : new AutoplayDemo(editor, autoplayScript, awareness);

    if (composedDemo) {
      console.log(`[Main] Initializing ComposedDemoPlayer with demo: ${composedDemo}`);
    } else {
      console.log(`[Main] Initializing AutoplayDemo with script: ${autoplayScript}`);
    }

    // Wire up heading insertion for autoplay (legacy - inserts heading with text immediately)
    player.onHeading = (level: 1 | 2 | 3, text: string) => {
      const { state } = editor;

      // Create heading node
      const headingNode = customSchema.nodes.heading.create(
        { level },
        customSchema.text(text)
      );

      // Find where to insert the heading
      // If document only contains empty paragraphs, replace all content with heading
      // Otherwise, append heading at the end
      let tr = state.tr;
      const childCount = state.doc.childCount;

      // Check if ALL children are empty paragraphs
      let allEmptyParagraphs = true;
      for (let i = 0; i < childCount; i++) {
        const child = state.doc.child(i);
        if (child.type.name !== 'paragraph' || child.content.size > 0) {
          allEmptyParagraphs = false;
          break;
        }
      }

      if (allEmptyParagraphs && childCount > 0) {
        // Document only has empty paragraphs - replace all with heading
        tr = tr.replaceWith(0, state.doc.content.size, headingNode);
      } else {
        // Append heading at the end of document
        tr = tr.insert(state.doc.content.size, headingNode);
      }

      editor.dispatch(tr);
      console.log(`[AutoplayDemo] Inserted heading ${level}: ${text}`);
    };

    // Wire up heading level setting (for typewriter animation)
    // This changes the current/last block to a heading without inserting text
    player.onSetHeadingLevel = (level: 1 | 2 | 3) => {
      const { state } = editor;

      // Find the last block in the document
      const lastChild = state.doc.lastChild;
      if (!lastChild) {
        console.log(`[AutoplayDemo] No last child found`);
        return;
      }

      // Get the position of the last block
      const lastBlockPos = state.doc.content.size - lastChild.nodeSize;

      console.log(`[AutoplayDemo] Converting block at pos ${lastBlockPos}, type: ${lastChild.type.name}, size: ${lastChild.nodeSize}`);

      const headingType = customSchema.nodes.heading;
      let tr = state.tr;

      // Delete the last block and insert a new heading in its place
      tr = tr.delete(lastBlockPos, lastBlockPos + lastChild.nodeSize);
      const newHeading = headingType.create({ level });
      tr = tr.insert(lastBlockPos, newHeading);

      // Set selection inside the new heading (position after the opening tag)
      tr = tr.setSelection(TextSelection.create(tr.doc, lastBlockPos + 1));

      editor.dispatch(tr);

      // Verify the change
      const newLastChild = editor.state.doc.lastChild;
      console.log(`[AutoplayDemo] Set heading level ${level} for typewriter, new type: ${newLastChild?.type.name}`);

      // Dispatch event to update format button states (listened to by createEditor)
      document.dispatchEvent(new CustomEvent('format-changed'));
    };

    // Wire up newline (paragraph creation) for autoplay
    player.onNewline = () => {
      const { state } = editor;
      // Always insert at the end of document
      const insertPos = state.doc.content.size;

      // Create empty paragraph
      const paragraphNode = customSchema.nodes.paragraph.create();

      // Insert paragraph at end
      const tr = state.tr.insert(insertPos, paragraphNode);
      editor.dispatch(tr);
      console.log('[AutoplayDemo] Inserted new paragraph at end');
    };

    // Wire up character typing for autoplay
    player.onType = (char: string) => {
      const { state } = editor;

      // Find the last text-containing block (paragraph or heading) in the document
      let insertPos = state.doc.content.size - 1;
      let lastTextBlockEnd = -1;
      let offset = 0;

      for (let i = 0; i < state.doc.childCount; i++) {
        const node = state.doc.child(i);
        // Support both paragraphs and headings as text containers
        if (node.type.name === 'paragraph' || node.type.name === 'heading') {
          // Position at end of block content (before closing tag)
          lastTextBlockEnd = offset + node.nodeSize - 1;
        }
        offset += node.nodeSize;
      }

      // Use last text block position
      if (lastTextBlockEnd > 0) {
        insertPos = lastTextBlockEnd;
      }

      // Insert text and set selection to the new cursor position
      // Focus the editor so yCursorPlugin broadcasts cursor to other users via awareness
      editor.focus();
      const tr = state.tr.insertText(char, insertPos);
      const newCursorPos = insertPos + char.length;
      tr.setSelection(TextSelection.create(tr.doc, newCursorPos));
      editor.dispatch(tr);
    };

    // Wire up geo-mark creation for autoplay
    player.onGeoMark = (placeName: string, lat: number, lng: number, colorIndex: number) => {
      const { state } = editor;

      // Find the last occurrence of the placeName in the document
      let markStart = -1;
      let markEnd = -1;

      state.doc.descendants((node, pos) => {
        if (node.isText) {
          const text = node.text || '';
          const idx = text.lastIndexOf(placeName);
          if (idx !== -1) {
            markStart = pos + idx;
            markEnd = pos + idx + placeName.length;
          }
        }
      });

      if (markStart === -1) {
        console.warn(`[AutoplayDemo] Could not find text "${placeName}" to mark`);
        return;
      }

      // Create geoMark attributes
      const geoMarkAttrs = {
        geoId: `geo-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        placeName,
        lat,
        lng,
        coordSource: 'demo',
        colorIndex,
      };

      const geoMarkMark = customSchema.marks.geoMark.create(geoMarkAttrs);
      const tr = state.tr.addMark(markStart, markEnd, geoMarkMark);
      editor.dispatch(tr);
      console.log(`[AutoplayDemo] Created geo-mark: ${placeName} at positions ${markStart}-${markEnd}`);

      // Trigger map update
      notifyGeoMarkChange();
    };

    // Wire up map insertion for autoplay (simple insertion, no auto geo-marking)
    // Demo uses explicit select/geomark actions, so just insert the map
    player.onInsertMap = () => {
      const { state } = editor;
      const endPos = state.doc.content.size;
      const mapNode = customSchema.nodes.map.create({ height: 300 });
      const tr = state.tr.insert(endPos - 1, mapNode);
      editor.dispatch(tr);
      notifyGeoMarkChange();
      console.log('[AutoplayDemo] Inserted map block');
    };

    // Wire up fullscreen map for autoplay
    player.onOpenFullscreenMap = () => {
      console.log('[Main] onOpenFullscreenMap called');
      console.log('[Main] window.showFullscreenMap exists?', typeof (window as any).showFullscreenMap);
      console.log('[Main] fullscreenMapView exists?', !!fullscreenMapView);
      if ((window as any).showFullscreenMap) {
        (window as any).showFullscreenMap();
        console.log('[Main] showFullscreenMap() called');
      } else {
        console.warn('[Main] showFullscreenMap function not found on window!');
      }
    };

    player.onCloseFullscreenMap = () => {
      (window as any).hideFullscreenMap();
      console.log('[AutoplayDemo] Closed fullscreen map');
    };

    player.onClickMapMarker = (markerIndex: number) => {
      // Find markers in the fullscreen map overlay
      const fullscreenOverlay = document.getElementById('fullscreen-overlay');
      const finger = document.getElementById('demo-finger');

      if (fullscreenOverlay) {
        const markers = fullscreenOverlay.querySelectorAll('.mapboxgl-marker');
        if (markers.length > markerIndex) {
          const marker = markers[markerIndex] as HTMLElement;

          // Show finger animation moving to and tapping the marker
          if (finger) {
            const rect = marker.getBoundingClientRect();
            const targetX = rect.left + rect.width / 2;
            const targetY = rect.top + rect.height / 2;

            // Check if finger is already visible (persisted from previous action)
            if (finger.classList.contains('visible')) {
              // Animate to marker position
              finger.style.transition = 'left 0.4s ease-out, top 0.4s ease-out';
              finger.style.left = `${targetX}px`;
              finger.style.top = `${targetY}px`;

              // After reaching marker, do tap animation and click
              setTimeout(() => {
                finger.classList.add('tapping');
                setTimeout(() => {
                  marker.click();
                  finger.classList.remove('tapping');
                  console.log(`[AutoplayDemo] Clicked marker ${markerIndex} of ${markers.length} with finger`);
                }, 300);
              }, 400);
            } else {
              // Entry animation from bottom
              finger.style.left = `${targetX}px`;
              finger.style.top = `${window.innerHeight + 60}px`;
              finger.style.transition = 'none';
              finger.classList.add('visible');
              finger.offsetHeight; // Force reflow

              // Animate to marker
              finger.style.transition = 'left 0.6s ease-out, top 0.6s ease-out';
              finger.style.top = `${targetY}px`;

              // After reaching marker, do tap animation and click
              setTimeout(() => {
                finger.classList.add('tapping');
                setTimeout(() => {
                  marker.click();
                  finger.classList.remove('tapping');
                  // Keep finger visible (persisted) after marker click
                  console.log(`[AutoplayDemo] Clicked marker ${markerIndex} of ${markers.length} with finger`);
                }, 300);
              }, 600);
            }
          } else {
            // No finger element, just click
            marker.click();
            console.log(`[AutoplayDemo] Clicked marker ${markerIndex} of ${markers.length}`);
          }
        } else {
          console.warn(`[AutoplayDemo] Marker ${markerIndex} not found (${markers.length} markers)`);
        }
      } else {
        console.warn('[AutoplayDemo] Fullscreen map overlay not found');
      }
    };

    // Wire up addWaypoint for autoplay
    player.onAddWaypoint = (destGeoId: string, lat: number, lng: number) => {
      waypointController.addWaypoint(destGeoId, lat, lng);
      console.log(`[AutoplayDemo] Added waypoint to ${destGeoId} at ${lat}, ${lng}`);
    };

    // Wire up scroll for autoplay
    player.onScroll = (to: 'top' | 'bottom' | 'firstMap' | 'secondMap') => {
      const editorContainer = document.querySelector('.editor-container') as HTMLElement;
      if (!editorContainer) {
        console.warn('[AutoplayDemo] Editor container not found');
        return;
      }

      switch (to) {
        case 'top':
          editorContainer.scrollTo({ top: 0, behavior: 'smooth' });
          break;
        case 'bottom':
          editorContainer.scrollTo({ top: editorContainer.scrollHeight, behavior: 'smooth' });
          break;
        case 'firstMap':
        case 'secondMap': {
          const maps = editorContainer.querySelectorAll('.prosemirror-map');
          const mapIndex = to === 'firstMap' ? 0 : 1;
          if (maps.length > mapIndex) {
            const map = maps[mapIndex] as HTMLElement;
            map.scrollIntoView({ behavior: 'smooth', block: 'center' });
          } else {
            console.warn(`[AutoplayDemo] Map ${to} not found (${maps.length} maps)`);
          }
          break;
        }
      }
      console.log(`[AutoplayDemo] Scrolled to ${to}`);
    };

    // Wire up pan map for autoplay
    player.onPanMap = (direction: 'up' | 'down' | 'left' | 'right', distance: number) => {
      const map = fullscreenMapView?.getMap();
      if (!map) {
        console.warn('[AutoplayDemo] Fullscreen map not available for pan');
        return;
      }

      const center = map.getCenter();
      const zoom = map.getZoom();
      // Convert pixel distance to degrees based on zoom level
      const degreesPerPixel = 360 / (Math.pow(2, zoom) * 256);
      const delta = distance * degreesPerPixel;

      let newLng = center.lng;
      let newLat = center.lat;

      switch (direction) {
        case 'left':
          newLng -= delta;
          break;
        case 'right':
          newLng += delta;
          break;
        case 'up':
          newLat += delta;
          break;
        case 'down':
          newLat -= delta;
          break;
      }

      map.panTo([newLng, newLat], { duration: 500 });
      console.log(`[AutoplayDemo] Panned map ${direction} by ${distance}px`);
    };

    // Wire up zoom map for autoplay
    player.onZoomMap = (direction: 'in' | 'out', amount: number) => {
      const map = fullscreenMapView?.getMap();
      if (!map) {
        console.warn('[AutoplayDemo] Fullscreen map not available for zoom');
        return;
      }

      const currentZoom = map.getZoom();
      const newZoom = direction === 'in' ? currentZoom + amount : currentZoom - amount;
      map.zoomTo(newZoom, { duration: 500 });
      console.log(`[AutoplayDemo] Zoomed map ${direction} to ${newZoom.toFixed(1)}`);
    };

    // Fast click callback for fast-forward mode (no animation)
    // Polls for element existence with timeout, then clicks
    player.onFastClick = (selector: string) => {
      const startTime = Date.now();
      const maxWait = 2000; // Max 2 seconds to wait for element
      const pollInterval = 50; // Check every 50ms

      const tryClick = () => {
        const target = document.querySelector(selector) as HTMLElement;
        if (target) {
          target.click();
          console.log(`[AutoplayDemo] Fast-clicked ${selector} (found after ${Date.now() - startTime}ms)`);
          return;
        }

        // Element not found yet - keep polling if within timeout
        if (Date.now() - startTime < maxWait) {
          setTimeout(tryClick, pollInterval);
        } else {
          console.warn(`[AutoplayDemo] Fast-click target not found after ${maxWait}ms: ${selector}`);
        }
      };

      tryClick();
    };

    // Wire up finger tap animation for autoplay
    // Track if finger is currently persisted (visible from previous tap)
    let fingerPersisted = false;
    let lastFingerFromSide: 'left' | 'right' | 'bottom' = 'right';

    player.onShowFingerTap = (selector: string, fromSide: 'left' | 'right' | 'bottom', persist?: boolean) => {
      return new Promise<void>((resolve) => {
        const finger = document.getElementById('demo-finger');
        const target = document.querySelector(selector) as HTMLElement;

        if (!finger || !target) {
          console.warn(`[AutoplayDemo] Finger tap failed - finger: ${!!finger}, target: ${!!target} (${selector})`);
          resolve();
          return;
        }

        const rect = target.getBoundingClientRect();
        const targetX = rect.left + rect.width / 2;
        const targetY = rect.top + rect.height / 2;

        // Calculate start position based on fromSide (for entry animation)
        let startX: number, startY: number;
        switch (fromSide) {
          case 'left':
            startX = -60;
            startY = targetY;
            break;
          case 'bottom':
            startX = targetX;
            startY = window.innerHeight + 60;
            break;
          case 'right':
          default:
            startX = window.innerWidth + 60;
            startY = targetY;
            break;
        }

        lastFingerFromSide = fromSide;

        // If finger is already visible (persisted), just animate to new target
        if (fingerPersisted && finger.classList.contains('visible')) {
          // Animate directly to new target
          finger.style.transition = 'left 0.4s ease-out, top 0.4s ease-out';
          finger.style.left = `${targetX}px`;
          finger.style.top = `${targetY}px`;

          // After reaching target, do tap animation
          setTimeout(() => {
            finger.classList.add('tapping');
            target.classList.add('active'); // Show button as pressed
            console.log(`[FingerTap] Added active class to ${selector}, classes: ${target.className}`);

            // Actually click the target to trigger its handler
            target.click();
            console.log(`[FingerTap] Triggered click on ${selector}`);

            setTimeout(() => {
              finger.classList.remove('tapping');
              // Don't remove active class - let updateFormatButtonStates handle it based on actual state
              console.log(`[FingerTap] Tap animation complete for ${selector}`);
              fingerPersisted = !!persist;
              resolve();
            }, 500); // Increased from 300ms for more visible press
          }, 400);
        } else {
          // Full entry animation from off-screen
          finger.style.left = `${startX}px`;
          finger.style.top = `${startY}px`;
          finger.style.transition = 'none';
          finger.classList.add('visible');

          // Force reflow
          finger.offsetHeight;

          // Animate to target
          finger.style.transition = 'left 0.6s ease-out, top 0.6s ease-out';
          finger.style.left = `${targetX}px`;
          finger.style.top = `${targetY}px`;

          // After reaching target, do tap animation
          setTimeout(() => {
            finger.classList.add('tapping');
            target.classList.add('active'); // Show button as pressed
            console.log(`[FingerTap] Added active class to ${selector}, classes: ${target.className}`);

            // Actually click the target to trigger its handler
            target.click();
            console.log(`[FingerTap] Triggered click on ${selector}`);

            setTimeout(() => {
              finger.classList.remove('tapping');
              // Don't remove active class - let updateFormatButtonStates handle it based on actual state
              console.log(`[FingerTap] Tap animation complete for ${selector}`);

              if (persist) {
                // Keep finger visible at target position
                fingerPersisted = true;
                resolve();
              } else {
                // Animate out
                fingerPersisted = false;
                finger.style.transition = 'left 0.4s ease-in, top 0.4s ease-in, opacity 0.3s ease';
                finger.style.left = `${startX}px`;
                finger.style.top = `${startY}px`;

                // Hide after animation
                setTimeout(() => {
                  finger.classList.remove('visible');
                  resolve();
                }, 400);
              }
            }, 500);
          }, 600);
        }
      });
    };

    // Wire up hide finger for ending persisted sequences
    player.onHideFinger = () => {
      const finger = document.getElementById('demo-finger');
      if (finger && finger.classList.contains('visible')) {
        // Calculate exit position based on last entry side
        let exitX: number, exitY: number;
        const currentX = parseFloat(finger.style.left) || 0;
        const currentY = parseFloat(finger.style.top) || 0;

        switch (lastFingerFromSide) {
          case 'left':
            exitX = -60;
            exitY = currentY;
            break;
          case 'bottom':
            exitX = currentX;
            exitY = window.innerHeight + 60;
            break;
          case 'right':
          default:
            exitX = window.innerWidth + 60;
            exitY = currentY;
            break;
        }

        finger.style.transition = 'left 0.4s ease-in, top 0.4s ease-in, opacity 0.3s ease';
        finger.style.left = `${exitX}px`;
        finger.style.top = `${exitY}px`;

        setTimeout(() => {
          finger.classList.remove('visible');
          fingerPersisted = false;
        }, 400);
      }

      // Also hide selection handles when finger is hidden
      const startHandle = document.getElementById('selection-handle-start');
      const endHandle = document.getElementById('selection-handle-end');
      startHandle?.classList.remove('visible');
      endHandle?.classList.remove('visible');

      // Remove any selection overlay
      document.querySelectorAll('.demo-selection-overlay').forEach(el => el.remove());
    };

    // Wire up finger tap on map at specific coordinates (lat/lng)
    player.onFingerTapMapCoords = (lat: number, lng: number, fromSide: 'left' | 'right' | 'bottom', persist?: boolean) => {
      return new Promise<void>((resolve) => {
        const finger = document.getElementById('demo-finger');
        const fullscreenMap = fullscreenMapView?.getMap?.();

        if (!finger) {
          console.warn(`[FingerTapMapCoords] Finger element not found`);
          resolve();
          return;
        }

        if (!fullscreenMap) {
          console.warn(`[FingerTapMapCoords] Fullscreen map not available`);
          resolve();
          return;
        }

        // Convert lat/lng to screen coordinates
        const point = fullscreenMap.project([lng, lat]);
        const targetX = point.x;
        const targetY = point.y;

        console.log(`[FingerTapMapCoords] Tapping at (${lat}, ${lng}) -> screen (${targetX}, ${targetY})`);

        // Calculate start position based on fromSide (for entry animation)
        let startX: number, startY: number;
        switch (fromSide) {
          case 'left':
            startX = -60;
            startY = targetY;
            break;
          case 'bottom':
            startX = targetX;
            startY = window.innerHeight + 60;
            break;
          case 'right':
          default:
            startX = window.innerWidth + 60;
            startY = targetY;
            break;
        }

        lastFingerFromSide = fromSide;

        // If finger is already visible (persisted), just animate to new target
        if (fingerPersisted && finger.classList.contains('visible')) {
          // Animate directly to new target
          finger.style.transition = 'left 0.4s ease-out, top 0.4s ease-out';
          finger.style.left = `${targetX}px`;
          finger.style.top = `${targetY}px`;

          // After reaching target, do tap animation and fire map click
          setTimeout(() => {
            finger.classList.add('tapping');

            // Add waypoint at the tapped coordinates
            // This queries for route layers and adds a waypoint if found
            const waypointAdded = fullscreenMapView?.addWaypointAtCoords?.(lat, lng);
            console.log(`[FingerTapMapCoords] Waypoint at (${lat}, ${lng}): ${waypointAdded ? 'added' : 'not added (no route found)'}`);


            setTimeout(() => {
              finger.classList.remove('tapping');
              fingerPersisted = !!persist;
              resolve();
            }, 500);
          }, 400);
        } else {
          // Full entry animation from off-screen
          finger.style.left = `${startX}px`;
          finger.style.top = `${startY}px`;
          finger.style.transition = 'none';
          finger.classList.add('visible');

          // Force reflow
          finger.offsetHeight;

          // Animate to target
          finger.style.transition = 'left 0.6s ease-out, top 0.6s ease-out';
          finger.style.left = `${targetX}px`;
          finger.style.top = `${targetY}px`;

          // After reaching target, do tap animation and add waypoint
          setTimeout(() => {
            finger.classList.add('tapping');

            // Add waypoint at the tapped coordinates
            // This queries for route layers and adds a waypoint if found
            const waypointAdded = fullscreenMapView?.addWaypointAtCoords?.(lat, lng);
            console.log(`[FingerTapMapCoords] Waypoint at (${lat}, ${lng}): ${waypointAdded ? 'added' : 'not added (no route found)'}`);

            setTimeout(() => {
              finger.classList.remove('tapping');

              if (persist) {
                fingerPersisted = true;
                resolve();
              } else {
                fingerPersisted = false;
                finger.style.transition = 'left 0.4s ease-in, top 0.4s ease-in, opacity 0.3s ease';
                finger.style.left = `${startX}px`;
                finger.style.top = `${startY}px`;

                setTimeout(() => {
                  finger.classList.remove('visible');
                  resolve();
                }, 400);
              }
            }, 500);
          }, 600);
        }
      });
    };

    // Wire up finger tap on route - gets coordinates dynamically from route geometry
    player.onFingerTapRoute = (fraction: number, fromSide: 'left' | 'right' | 'bottom', persist?: boolean) => {
      return new Promise<void>((resolve) => {
        const finger = document.getElementById('demo-finger');
        const fullscreenMap = fullscreenMapView?.getMap?.();

        if (!finger) {
          console.warn(`[FingerTapRoute] Finger element not found`);
          resolve();
          return;
        }

        if (!fullscreenMap) {
          console.warn(`[FingerTapRoute] Fullscreen map not available`);
          resolve();
          return;
        }

        // Get actual coordinates from route geometry
        const routePoint = fullscreenMapView?.getPointOnRoute?.(fraction);
        if (!routePoint) {
          console.warn(`[FingerTapRoute] Could not get point on route at fraction ${fraction}`);
          resolve();
          return;
        }

        const { lat, lng } = routePoint;

        // Get map container dimensions
        const mapContainer = fullscreenMap.getContainer();
        const mapRect = mapContainer.getBoundingClientRect();
        const mapWidth = mapRect.width;
        const mapHeight = mapRect.height;
        const margin = 50; // Keep margin from edges
        const centerX = mapWidth / 2;
        const centerY = mapHeight / 2;

        // Convert lat/lng to screen coordinates
        let point = fullscreenMap.project([lng, lat]);
        let targetX = point.x;
        let targetY = point.y;

        console.log(`[FingerTapRoute] Point at fraction ${fraction} -> (${lat.toFixed(5)}, ${lng.toFixed(5)}) -> screen (${targetX.toFixed(0)}, ${targetY.toFixed(0)}), map size: ${mapWidth}x${mapHeight}`);

        // Check if the point is visible (within map viewport with margin)
        const isVisible = targetX >= margin && targetX <= mapWidth - margin &&
                         targetY >= margin && targetY <= mapHeight - margin;

        // Helper function to perform the tap animation
        const performTap = (tapX: number, tapY: number) => {
          // Calculate start position based on fromSide
          let startX: number, startY: number;
          switch (fromSide) {
            case 'left':
              startX = -60;
              startY = tapY;
              break;
            case 'bottom':
              startX = tapX;
              startY = mapHeight + 60;
              break;
            case 'right':
            default:
              startX = mapWidth + 60;
              startY = tapY;
              break;
          }

          lastFingerFromSide = fromSide;

          // If finger is already visible (persisted), animate to new target
          if (fingerPersisted && finger.classList.contains('visible')) {
            finger.style.transition = 'left 0.4s ease-out, top 0.4s ease-out';
            finger.style.left = `${tapX}px`;
            finger.style.top = `${tapY}px`;

            setTimeout(() => {
              finger.classList.add('tapping');
              const waypointResult = fullscreenMapView?.addWaypointOnRoute?.(fraction);
              console.log(`[FingerTapRoute] Waypoint at fraction ${fraction}: ${waypointResult?.success ? 'added' : 'not added'}`);

              setTimeout(() => {
                finger.classList.remove('tapping');
                fingerPersisted = !!persist;
                resolve();
              }, 500);
            }, 400);
          } else {
            // Full entry animation
            finger.style.left = `${startX}px`;
            finger.style.top = `${startY}px`;
            finger.style.transition = 'none';
            finger.classList.add('visible');
            finger.offsetHeight; // Force reflow

            finger.style.transition = 'left 0.6s ease-out, top 0.6s ease-out';
            finger.style.left = `${tapX}px`;
            finger.style.top = `${tapY}px`;

            setTimeout(() => {
              finger.classList.add('tapping');
              const waypointResult = fullscreenMapView?.addWaypointOnRoute?.(fraction);
              console.log(`[FingerTapRoute] Waypoint at fraction ${fraction}: ${waypointResult?.success ? 'added' : 'not added'}`);

              setTimeout(() => {
                finger.classList.remove('tapping');

                if (persist) {
                  fingerPersisted = true;
                  resolve();
                } else {
                  fingerPersisted = false;
                  finger.style.transition = 'left 0.4s ease-in, top 0.4s ease-in, opacity 0.3s ease';
                  finger.style.left = `${startX}px`;
                  finger.style.top = `${startY}px`;

                  setTimeout(() => {
                    finger.classList.remove('visible');
                    resolve();
                  }, 400);
                }
              }, 500);
            }, 600);
          }
        };

        // Always show finger panning animation for visual feedback
        // If point is visible, pan the map to bring it into view using finger drag
        console.log(`[FingerTapRoute] Panning map to show finger animation (point ${isVisible ? 'is visible' : 'is OFF-SCREEN'})`);

          // Calculate how much to pan to bring the point near center
          const panX = targetX - centerX;
          const panY = targetY - centerY;

          // Position finger at start (center of map)
          finger.style.transition = 'none';
          finger.style.left = `${centerX}px`;
          finger.style.top = `${centerY}px`;
          finger.classList.add('visible');
          finger.offsetHeight; // Force reflow

          // Get the geographic point under the finger's starting position
          // This is the point the finger will "track" during the drag
          const referenceGeoPoint = fullscreenMap.unproject([centerX, centerY]);
          console.log(`[FingerTapRoute] Reference geo point: [${referenceGeoPoint.lng.toFixed(6)}, ${referenceGeoPoint.lat.toFixed(6)}]`);

          // Show pressing state
          finger.classList.add('tapping');

          // Start the pan animation
          const startTime = Date.now();
          const duration = 600;
          let animationFrame: number;

          // Function to update finger position based on where the reference point now is on screen
          const updateFingerPosition = () => {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(elapsed / duration, 1);

            // Project the reference geographic point to get its current screen position
            const screenPoint = fullscreenMap.project(referenceGeoPoint);

            // Clamp to stay within map bounds with margin
            const clampedX = Math.max(30, Math.min(mapWidth - 30, screenPoint.x));
            const clampedY = Math.max(30, Math.min(mapHeight - 30, screenPoint.y));

            // Update finger position to track the geographic point
            finger.style.left = `${clampedX}px`;
            finger.style.top = `${clampedY}px`;

            // Continue animation if not complete
            if (progress < 1) {
              animationFrame = requestAnimationFrame(updateFingerPosition);
            }
          };

          // Start tracking the reference point
          animationFrame = requestAnimationFrame(updateFingerPosition);

          // Pan the map to center on the target point
          fullscreenMap.panBy([panX, panY], { duration, easing: (t: number) => t * (2 - t) });
          console.log(`[FingerTapRoute] Panning map by [${panX.toFixed(0)}, ${panY.toFixed(0)}], finger tracking geo point`);

          // After pan completes, clean up and tap
          setTimeout(() => {
            // Cancel animation frame if still running
            if (animationFrame) {
              cancelAnimationFrame(animationFrame);
            }

            finger.classList.remove('tapping');

            // Re-project the target point after pan
            const newPoint = fullscreenMap.project([lng, lat]);
            const newTargetX = newPoint.x;
            const newTargetY = newPoint.y;
            console.log(`[FingerTapRoute] After pan, target point is now at (${newTargetX.toFixed(0)}, ${newTargetY.toFixed(0)})`);

            // Small pause before tapping
            setTimeout(() => {
              performTap(newTargetX, newTargetY);
            }, 200);
          }, duration + 100);
      });
    };

    // Wire up finger drag waypoint for autoplay (for dragging waypoints along routes)
    player.onFingerDragWaypoint = (waypointIndex: number, toFraction: number, fromSide: 'left' | 'right' | 'bottom') => {
      return new Promise<void>((resolve) => {
        const fullscreenMap = fullscreenMapView?.getMap();
        const finger = document.getElementById('demo-finger');

        if (!fullscreenMap || !finger) {
          console.warn(`[FingerDragWaypoint] Fullscreen map or finger not available`);
          resolve();
          return;
        }

        console.log(`[FingerDragWaypoint] Dragging waypoint ${waypointIndex} to fraction ${toFraction} from ${fromSide}`);

        // Get current waypoint position
        const waypointCoords = fullscreenMapView?.getWaypointCoords?.(waypointIndex);
        if (!waypointCoords) {
          console.warn(`[FingerDragWaypoint] Could not get waypoint ${waypointIndex} coordinates`);
          resolve();
          return;
        }

        // Get new position on route at toFraction
        const newRoutePoint = fullscreenMapView?.getPointOnRoute?.(toFraction);
        if (!newRoutePoint) {
          console.warn(`[FingerDragWaypoint] Could not get point on route at fraction ${toFraction}`);
          resolve();
          return;
        }

        // Convert current waypoint position to screen coordinates
        const startPoint = fullscreenMap.project([waypointCoords.lng, waypointCoords.lat]);
        const startX = startPoint.x;
        const startY = startPoint.y;

        // Convert new waypoint position to screen coordinates
        const endPoint = fullscreenMap.project([newRoutePoint.lng, newRoutePoint.lat]);
        const endX = endPoint.x;
        const endY = endPoint.y;

        console.log(`[FingerDragWaypoint] Animating from (${startX.toFixed(0)}, ${startY.toFixed(0)}) to (${endX.toFixed(0)}, ${endY.toFixed(0)})`);

        // Position finger at start position (or move to it if already visible)
        if (!finger.classList.contains('visible')) {
          // Finger not visible, position at start
          finger.style.transition = 'none';
          finger.style.left = `${startX}px`;
          finger.style.top = `${startY}px`;
          finger.classList.add('visible');
          finger.offsetHeight; // Force reflow
        } else {
          // Finger already visible, animate to start position first
          finger.style.transition = 'left 0.3s ease-out, top 0.3s ease-out';
          finger.style.left = `${startX}px`;
          finger.style.top = `${startY}px`;
        }

        // After positioning at start, animate drag to end position
        setTimeout(() => {
          finger.classList.add('tapping');

          // Animate finger to end position
          finger.style.transition = 'left 0.6s ease-out, top 0.6s ease-out';
          finger.style.left = `${endX}px`;
          finger.style.top = `${endY}px`;

          // After drag animation completes, update waypoint position
          setTimeout(() => {
            // Update waypoint position in document
            const updateResult = fullscreenMapView?.updateWaypointPosition?.(waypointIndex, toFraction);
            console.log(`[FingerDragWaypoint] Waypoint update result:`, updateResult);

            setTimeout(() => {
              finger.classList.remove('tapping');
              fingerPersisted = true; // Keep finger visible
              resolve();
            }, 300);
          }, 600);
        }, finger.classList.contains('visible') ? 300 : 100);
      });
    };

    // Wire up finger drag for autoplay (for panning maps)
    player.onFingerDrag = (selector: string, direction: 'up' | 'down' | 'left' | 'right', distance: number) => {
      return new Promise<void>((resolve) => {
        const finger = document.getElementById('demo-finger');
        const target = document.querySelector(selector) as HTMLElement;

        if (!finger || !target) {
          console.warn(`[AutoplayDemo] Finger drag failed - finger: ${!!finger}, target: ${!!target} (${selector})`);
          resolve();
          return;
        }

        // Get target's center as starting point for drag
        const rect = target.getBoundingClientRect();
        const startX = rect.left + rect.width / 2;
        const startY = rect.top + rect.height / 2;

        // Calculate end position and pan offset based on direction
        // Note: Drag direction is opposite to pan direction
        // Drag UP = pan DOWN (move finger up, map content goes up, so panBy negative Y)
        let endX = startX;
        let endY = startY;
        let panX = 0;
        let panY = 0;
        switch (direction) {
          case 'up':
            endY = startY - distance;
            panY = distance; // Pan down (positive Y moves map content up)
            break;
          case 'down':
            endY = startY + distance;
            panY = -distance;
            break;
          case 'left':
            endX = startX - distance;
            panX = distance;
            break;
          case 'right':
            endX = startX + distance;
            panX = -distance;
            break;
        }

        // Position finger at start (instant if already visible)
        if (!finger.classList.contains('visible')) {
          finger.style.transition = 'none';
          finger.style.left = `${startX}px`;
          finger.style.top = `${startY}px`;
          finger.classList.add('visible');
          finger.offsetHeight; // Force reflow
        } else {
          // Move to start position first
          finger.style.transition = 'left 0.3s ease-out, top 0.3s ease-out';
          finger.style.left = `${startX}px`;
          finger.style.top = `${startY}px`;
        }

        // Start the drag after finger is in position
        setTimeout(() => {
          // Show pressing state
          finger.classList.add('tapping');

          // Animate finger drag with smooth transition
          finger.style.transition = 'left 0.6s ease-out, top 0.6s ease-out';
          finger.style.left = `${endX}px`;
          finger.style.top = `${endY}px`;

          // Use Mapbox's panBy for smooth map panning (if this is the fullscreen map)
          const map = fullscreenMapView?.getMap();
          if (map) {
            // Pan the map with the same duration and easing
            map.panBy([panX, panY], { duration: 600, easing: (t: number) => t * (2 - t) });
            console.log(`[AutoplayDemo] Panning map by [${panX}, ${panY}]`);

            // Broadcast finger position during drag for remote users to see
            if (mapInteractionService) {
              const mapContainer = map.getContainer();
              const mapRect = mapContainer.getBoundingClientRect();

              // Broadcast finger position periodically during the 600ms animation
              let frameCount = 0;
              const totalFrames = 12; // ~50ms intervals over 600ms
              const broadcastInterval = setInterval(() => {
                frameCount++;
                if (frameCount > totalFrames) {
                  clearInterval(broadcastInterval);
                  mapInteractionService?.broadcastGestureEnd();
                  return;
                }

                // Get current finger position from CSS (interpolated by browser)
                const fingerRect = finger.getBoundingClientRect();
                const fingerCenterX = fingerRect.left + fingerRect.width / 2;
                const fingerCenterY = fingerRect.top + fingerRect.height / 2;

                // Convert to map-relative coordinates
                const mapX = fingerCenterX - mapRect.left;
                const mapY = fingerCenterY - mapRect.top;

                // Unproject to get geographic coordinates
                const lngLat = map.unproject([mapX, mapY]);
                mapInteractionService?.broadcastFingerPosition(
                  { lng: lngLat.lng, lat: lngLat.lat },
                  'pan'
                );
              }, 50);
            }
          }

          // After animation completes
          setTimeout(() => {
            finger.classList.remove('tapping');
            fingerPersisted = true; // Keep finger visible after drag
            resolve();
          }, 650);
        }, fingerPersisted ? 100 : 300);
      });
    };

    // Wire up finger scroll for autoplay (for scrolling editor content)
    player.onFingerScroll = (direction: 'up' | 'down', distance: number, fromSide: 'left' | 'right' | 'bottom') => {
      return new Promise<void>((resolve) => {
        const finger = document.getElementById('demo-finger');
        const editorContainer = document.getElementById('editor-container');

        if (!finger || !editorContainer) {
          console.warn(`[AutoplayDemo] Finger scroll failed - finger: ${!!finger}, editorContainer: ${!!editorContainer}`);
          resolve();
          return;
        }

        // Get editor container's bounds
        const rect = editorContainer.getBoundingClientRect();

        // Calculate starting position based on fromSide
        let startX: number, startY: number;
        const offsetFromEdge = 60; // How far from the edge to start

        switch (fromSide) {
          case 'left':
            startX = rect.left + offsetFromEdge;
            startY = rect.top + rect.height / 2;
            break;
          case 'bottom':
            startX = rect.left + rect.width / 2;
            startY = rect.bottom - offsetFromEdge;
            break;
          case 'right':
          default:
            startX = rect.right - offsetFromEdge;
            startY = rect.top + rect.height / 2;
            break;
        }

        // Calculate end position based on scroll direction
        // Swipe UP to scroll DOWN (reveal more content below)
        // Swipe DOWN to scroll UP (reveal more content above)
        let endX = startX;
        let endY = startY;
        let scrollAmount = 0;

        if (direction === 'up') {
          // Swipe finger up = scroll content up (scrollTop increases)
          endY = startY - distance;
          scrollAmount = distance;
        } else {
          // Swipe finger down = scroll content down (scrollTop decreases)
          endY = startY + distance;
          scrollAmount = -distance;
        }

        // Position finger at start
        finger.style.transition = 'none';
        finger.style.left = `${startX}px`;
        finger.style.top = `${startY}px`;
        finger.classList.add('visible');
        finger.offsetHeight; // Force reflow

        // Start the scroll animation
        setTimeout(() => {
          // Show pressing state
          finger.classList.add('tapping');

          // Animate finger movement
          finger.style.transition = 'left 0.5s ease-out, top 0.5s ease-out';
          finger.style.left = `${endX}px`;
          finger.style.top = `${endY}px`;

          // Smooth scroll the window (not the container, since it doesn't have overflow)
          window.scrollBy({
            top: scrollAmount,
            behavior: 'smooth'
          });

          console.log(`[AutoplayDemo] Scrolling window by ${scrollAmount}px (direction: ${direction})`);

          // After animation completes
          setTimeout(() => {
            finger.classList.remove('tapping');
            finger.classList.remove('visible');
            fingerPersisted = false;
            resolve();
          }, 550);
        }, 200);
      });
    };

    // Wire up drawTestLines for autoplay (visualize screen vs geo coordinates)
    player.onDrawTestLines = (startX: number, startY: number, endX: number, endY: number, duration?: number) => {
      return new Promise<void>((resolve) => {
        const map = fullscreenMapView?.getMap();
        if (!map) {
          console.warn('[AutoplayDemo] drawTestLines failed - no fullscreen map');
          resolve();
          return;
        }

        const animDuration = duration || 2000;
        console.log(`[AutoplayDemo] Drawing test lines from (${startX},${startY}) to (${endX},${endY})`);

        // Get map container for screen coordinates
        const mapContainer = map.getContainer();
        const rect = mapContainer.getBoundingClientRect();

        // Convert screen positions to map-relative coordinates
        const mapStartX = startX - rect.left;
        const mapStartY = startY - rect.top;
        const mapEndX = endX - rect.left;
        const mapEndY = endY - rect.top;

        // Unproject to get geographic coordinates
        const startLngLat = map.unproject([mapStartX, mapStartY]);
        const endLngLat = map.unproject([mapEndX, mapEndY]);

        console.log(`[AutoplayDemo] Screen line: (${startX},${startY}) -> (${endX},${endY})`);
        console.log(`[AutoplayDemo] Geo line: (${startLngLat.lng.toFixed(4)},${startLngLat.lat.toFixed(4)}) -> (${endLngLat.lng.toFixed(4)},${endLngLat.lat.toFixed(4)})`);

        // Create SVG overlay for screen-space red line
        let svg = mapContainer.querySelector('.test-lines-overlay') as SVGElement;
        if (!svg) {
          svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
          svg.classList.add('test-lines-overlay');
          svg.style.position = 'absolute';
          svg.style.top = '0';
          svg.style.left = '0';
          svg.style.width = '100%';
          svg.style.height = '100%';
          svg.style.pointerEvents = 'none';
          svg.style.zIndex = '1000';
          mapContainer.appendChild(svg);
        } else {
          // Clear previous lines
          svg.innerHTML = '';
        }

        // Draw red line in screen coordinates
        const redLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        redLine.setAttribute('x1', mapStartX.toString());
        redLine.setAttribute('y1', mapStartY.toString());
        redLine.setAttribute('x2', mapEndX.toString());
        redLine.setAttribute('y2', mapEndY.toString());
        redLine.setAttribute('stroke', '#ff0000');
        redLine.setAttribute('stroke-width', '3');
        redLine.setAttribute('stroke-linecap', 'round');
        svg.appendChild(redLine);

        // Add blue line as GeoJSON source on the map (moves with map)
        const lineId = 'test-line-geo';
        const sourceId = `${lineId}-source`;

        // Remove existing line if any
        if (map.getLayer(lineId)) {
          map.removeLayer(lineId);
        }
        if (map.getSource(sourceId)) {
          map.removeSource(sourceId);
        }

        // Add GeoJSON source with the line
        map.addSource(sourceId, {
          type: 'geojson',
          data: {
            type: 'Feature',
            geometry: {
              type: 'LineString',
              coordinates: [
                [startLngLat.lng, startLngLat.lat],
                [endLngLat.lng, endLngLat.lat]
              ]
            },
            properties: {}
          }
        });

        // Add layer to render the line
        map.addLayer({
          id: lineId,
          type: 'line',
          source: sourceId,
          paint: {
            'line-color': '#0000ff',
            'line-width': 3
          }
        });

        // Clean up after duration
        setTimeout(() => {
          console.log('[AutoplayDemo] Removing test lines');
          if (map.getLayer(lineId)) {
            map.removeLayer(lineId);
          }
          if (map.getSource(sourceId)) {
            map.removeSource(sourceId);
          }
          if (svg) {
            svg.remove();
          }
          resolve();
        }, animDuration);
      });
    };

    // Helper: Find text in document and return positions
    const findTextInDocument = (text: string): { from: number; to: number } | null => {
      const { state } = editor;
      let markStart = -1;
      let markEnd = -1;

      state.doc.descendants((node, pos) => {
        if (node.isText) {
          const nodeText = node.text || '';
          const idx = nodeText.lastIndexOf(text);
          if (idx !== -1) {
            markStart = pos + idx;
            markEnd = pos + idx + text.length;
          }
        }
      });

      if (markStart === -1) return null;
      return { from: markStart, to: markEnd };
    };

    // Helper: Update selection handle positions
    const updateSelectionHandles = (from: number, to: number) => {
      const startHandle = document.getElementById('selection-handle-start');
      const endHandle = document.getElementById('selection-handle-end');

      const startCoords = editor.coordsAtPos(from);
      const endCoords = editor.coordsAtPos(to);

      if (startHandle && startCoords) {
        startHandle.style.left = `${startCoords.left}px`;
        startHandle.style.top = `${startCoords.top - 20}px`; // Above text, accounting for stem
        startHandle.classList.add('visible');
      }

      if (endHandle && endCoords) {
        endHandle.style.left = `${endCoords.right}px`;
        endHandle.style.top = `${endCoords.bottom}px`; // Below text
        endHandle.classList.add('visible');
      }
    };

    // Helper: Hide selection handles
    const hideSelectionHandles = () => {
      const startHandle = document.getElementById('selection-handle-start');
      const endHandle = document.getElementById('selection-handle-end');
      startHandle?.classList.remove('visible');
      endHandle?.classList.remove('visible');
    };

    // Track current selection for handle dragging
    let currentSelectionFrom = 0;
    let currentSelectionTo = 0;

    // Wire up finger text selection (double-tap to select word, show handles)
    player.onFingerSelect = (text: string, fromSide: 'left' | 'right' | 'bottom') => {
      return new Promise<void>((resolve) => {
        const finger = document.getElementById('demo-finger');
        const positions = findTextInDocument(text);

        if (!finger || !positions) {
          console.warn(`[AutoplayDemo] Finger select failed - finger: ${!!finger}, text found: ${!!positions} ("${text}")`);
          resolve();
          return;
        }

        // Get coordinates for the middle of the text
        const startCoords = editor.coordsAtPos(positions.from);
        const endCoords = editor.coordsAtPos(positions.to);
        if (!startCoords || !endCoords) {
          console.warn(`[AutoplayDemo] Could not get coordinates for "${text}"`);
          resolve();
          return;
        }

        const targetX = (startCoords.left + endCoords.right) / 2;
        const targetY = (startCoords.top + startCoords.bottom) / 2;

        // Calculate start position based on fromSide
        let startX: number, startY: number;
        switch (fromSide) {
          case 'left':
            startX = -60;
            startY = targetY;
            break;
          case 'bottom':
            startX = targetX;
            startY = window.innerHeight + 60;
            break;
          case 'right':
          default:
            startX = window.innerWidth + 60;
            startY = targetY;
            break;
        }

        lastFingerFromSide = fromSide;

        // If finger is already visible (persisted), just animate to new target
        const doDoubleTapAndSelect = () => {
          // Double-tap animation
          finger.classList.add('double-tapping');

          // Wait for double-tap animation to complete
          setTimeout(() => {
            finger.classList.remove('double-tapping');

            // Create the text selection
            const { state } = editor;
            const tr = state.tr.setSelection(TextSelection.create(state.doc, positions.from, positions.to));
            editor.dispatch(tr);
            editor.focus();

            // Store current selection for handle dragging
            currentSelectionFrom = positions.from;
            currentSelectionTo = positions.to;

            // Create highlight overlay
            try {
              document.querySelectorAll('.demo-selection-overlay').forEach(el => el.remove());
              const overlay = document.createElement('div');
              overlay.className = 'demo-selection-overlay';
              overlay.style.cssText = `
                position: absolute;
                left: ${startCoords.left}px;
                top: ${startCoords.top}px;
                width: ${endCoords.right - startCoords.left}px;
                height: ${startCoords.bottom - startCoords.top}px;
                background: rgba(59, 130, 246, 0.35);
                pointer-events: none;
                z-index: 100;
                border-radius: 2px;
              `;
              document.body.appendChild(overlay);
            } catch (err) {
              console.warn('[AutoplayDemo] Could not add highlight overlay:', err);
            }

            // Show selection handles
            updateSelectionHandles(positions.from, positions.to);

            console.log(`[AutoplayDemo] Finger selected "${text}" at ${positions.from}-${positions.to}`);
            fingerPersisted = true; // Keep finger visible
            resolve();
          }, 500); // Wait for double-tap animation (0.5s)
        };

        if (fingerPersisted && finger.classList.contains('visible')) {
          // Animate directly to text target
          finger.style.transition = 'left 0.4s ease-out, top 0.4s ease-out';
          finger.style.left = `${targetX}px`;
          finger.style.top = `${targetY}px`;

          setTimeout(doDoubleTapAndSelect, 400);
        } else {
          // Full entry animation from off-screen
          finger.style.left = `${startX}px`;
          finger.style.top = `${startY}px`;
          finger.style.transition = 'none';
          finger.classList.add('visible');

          // Force reflow
          finger.offsetHeight;

          // Animate to target
          finger.style.transition = 'left 0.6s ease-out, top 0.6s ease-out';
          finger.style.left = `${targetX}px`;
          finger.style.top = `${targetY}px`;

          setTimeout(doDoubleTapAndSelect, 600);
        }
      });
    };

    // Wire up selection handle drag (drag handle to expand/shrink selection)
    player.onDragSelectionHandle = (handle: 'start' | 'end', toText: string) => {
      return new Promise<void>((resolve) => {
        const finger = document.getElementById('demo-finger');
        const handleEl = document.getElementById(`selection-handle-${handle}`);
        const targetPositions = findTextInDocument(toText);

        if (!finger || !handleEl || !targetPositions) {
          console.warn(`[AutoplayDemo] Drag handle failed - finger: ${!!finger}, handle: ${!!handleEl}, target: ${!!targetPositions} ("${toText}")`);
          resolve();
          return;
        }

        // Get current handle position
        const handleRect = handleEl.getBoundingClientRect();
        const handleX = handleRect.left + handleRect.width / 2;
        const handleY = handleRect.top + handleRect.height / 2;

        // Get target position (end of text for 'end' handle, start for 'start' handle)
        const targetCoords = handle === 'end'
          ? editor.coordsAtPos(targetPositions.to)
          : editor.coordsAtPos(targetPositions.from);

        if (!targetCoords) {
          console.warn(`[AutoplayDemo] Could not get target coordinates for "${toText}"`);
          resolve();
          return;
        }

        const targetX = handle === 'end' ? targetCoords.right : targetCoords.left;
        const targetY = handle === 'end' ? targetCoords.bottom + 8 : targetCoords.top - 28;

        // Move finger to handle position first
        finger.style.transition = 'left 0.3s ease-out, top 0.3s ease-out';
        finger.style.left = `${handleX}px`;
        finger.style.top = `${handleY}px`;

        setTimeout(() => {
          // Press down on handle
          finger.classList.add('tapping');

          // Calculate new selection bounds
          const newFrom = handle === 'start' ? targetPositions.from : currentSelectionFrom;
          const newTo = handle === 'end' ? targetPositions.to : currentSelectionTo;

          // Animate finger and handle together to new position
          finger.style.transition = 'left 0.6s ease-out, top 0.6s ease-out';
          finger.style.left = `${targetX}px`;
          finger.style.top = `${targetY}px`;

          // Animate handle
          handleEl.style.transition = 'left 0.6s ease-out, top 0.6s ease-out';
          handleEl.style.left = `${targetX}px`;
          handleEl.style.top = `${handle === 'end' ? targetCoords.bottom : targetCoords.top - 20}px`;

          // Update selection progressively during drag
          const animateSelection = () => {
            // Update the text selection
            const { state } = editor;
            const tr = state.tr.setSelection(TextSelection.create(state.doc, newFrom, newTo));
            editor.dispatch(tr);

            // Update highlight overlay
            try {
              const existingOverlay = document.querySelector('.demo-selection-overlay');
              const newStartCoords = editor.coordsAtPos(newFrom);
              const newEndCoords = editor.coordsAtPos(newTo);
              if (existingOverlay && newStartCoords && newEndCoords) {
                (existingOverlay as HTMLElement).style.left = `${newStartCoords.left}px`;
                (existingOverlay as HTMLElement).style.top = `${newStartCoords.top}px`;
                (existingOverlay as HTMLElement).style.width = `${newEndCoords.right - newStartCoords.left}px`;
              }
            } catch (err) {
              // Ignore overlay update errors
            }

            // Update both handles
            updateSelectionHandles(newFrom, newTo);
          };

          // Animate selection over the drag duration
          setTimeout(() => {
            animateSelection();
            currentSelectionFrom = newFrom;
            currentSelectionTo = newTo;

            // Release press
            finger.classList.remove('tapping');

            // Reset handle transitions
            handleEl.style.transition = 'opacity 0.2s ease';

            console.log(`[AutoplayDemo] Dragged ${handle} handle to "${toText}", selection: ${newFrom}-${newTo}`);
            fingerPersisted = true;
            resolve();
          }, 600);
        }, 300);
      });
    };

    // Wire up context menu show (show toolbar buttons when text is selected)
    player.onShowContextMenu = (_position: 'above' | 'below') => {
      return new Promise<void>((resolve) => {
        const { state } = editor;
        const { from, to } = state.selection;
        const hasSelection = from !== to;

        // Add has-selection class to show toolbar buttons
        if (hasSelection) {
          document.body.classList.add('has-selection');
          console.log('[AutoplayDemo] Showed toolbar buttons (has-selection class added)');
        }

        // Brief pause for visual effect
        setTimeout(resolve, 200);
      });
    };

    // Wire up toolbar item tap (finger animation + execute action)
    player.onTapContextMenuItem = (item: 'geomark' | 'map' | 'h1' | 'h2' | 'paragraph') => {
      return new Promise<void>(async (resolve) => {
        const finger = document.getElementById('demo-finger');

        // Map item to new toolbar button IDs
        const buttonIdMap: Record<string, string> = {
          'geomark': 'format-geomark-btn',
          'map': 'format-map-btn',
          'h1': 'heading1-btn',
          'h2': 'heading2-btn',
          'share': 'share-btn'
        };
        const buttonId = buttonIdMap[item];
        const button = buttonId ? document.getElementById(buttonId) : null;

        if (!finger || !button) {
          console.warn(`[AutoplayDemo] Toolbar tap failed - finger: ${!!finger}, button: ${!!button}, item: ${item}`);
          resolve();
          return;
        }

        // Get button position
        const buttonRect = button.getBoundingClientRect();
        const targetX = buttonRect.left + buttonRect.width / 2;
        const targetY = buttonRect.top + buttonRect.height / 2;

        // Move finger to button
        finger.style.transition = 'left 0.3s ease-out, top 0.3s ease-out';
        finger.style.left = `${targetX}px`;
        finger.style.top = `${targetY}px`;

        await new Promise(r => setTimeout(r, 300));

        // Tap animation
        finger.classList.add('tapping');

        await new Promise(r => setTimeout(r, 150));

        // Highlight button
        button.style.background = '#e5e7eb';

        await new Promise(r => setTimeout(r, 100));

        // Release tap
        finger.classList.remove('tapping');

        // Clean up selection UI
        hideSelectionHandles();
        document.querySelectorAll('.demo-selection-overlay').forEach(el => el.remove());

        // Reset button background
        button.style.background = '';

        // Execute the actual action by clicking the button
        button.click();

        console.log(`[AutoplayDemo] Tapped toolbar button: ${item}`);

        // Brief pause before continuing
        setTimeout(resolve, 300);
      });
    };

    // Wire up finger double-tap at cursor position (for empty lines)
    player.onFingerDoubleTap = (target: 'cursor' | 'endOfDoc', fromSide: 'left' | 'right' | 'bottom') => {
      return new Promise<void>((resolve) => {
        const finger = document.getElementById('demo-finger');
        if (!finger) {
          console.warn('[AutoplayDemo] Finger element not found');
          resolve();
          return;
        }

        // Get target position
        const { state } = editor;
        let targetPos: number;

        if (target === 'endOfDoc') {
          targetPos = state.doc.content.size - 1;
        } else {
          targetPos = state.selection.from;
        }

        const coords = editor.coordsAtPos(targetPos);
        if (!coords) {
          console.warn('[AutoplayDemo] Could not get coordinates for position');
          resolve();
          return;
        }

        const targetX = coords.left;
        const targetY = (coords.top + coords.bottom) / 2;

        // Calculate start position based on fromSide
        let startX: number, startY: number;
        switch (fromSide) {
          case 'left':
            startX = -60;
            startY = targetY;
            break;
          case 'bottom':
            startX = targetX;
            startY = window.innerHeight + 60;
            break;
          case 'right':
          default:
            startX = window.innerWidth + 60;
            startY = targetY;
            break;
        }

        const doDoubleTap = () => {
          // Double-tap animation
          finger.classList.add('double-tapping');

          setTimeout(() => {
            finger.classList.remove('double-tapping');

            // Move cursor to position
            const tr = state.tr.setSelection(TextSelection.create(state.doc, targetPos, targetPos));
            editor.dispatch(tr);
            editor.focus();

            console.log(`[AutoplayDemo] Finger double-tapped at position ${targetPos}`);
            fingerPersisted = true;
            resolve();
          }, 500);
        };

        if (fingerPersisted && finger.classList.contains('visible')) {
          // Animate directly to target
          finger.style.transition = 'left 0.4s ease-out, top 0.4s ease-out';
          finger.style.left = `${targetX}px`;
          finger.style.top = `${targetY}px`;
          setTimeout(doDoubleTap, 400);
        } else {
          // Full entry animation
          finger.style.left = `${startX}px`;
          finger.style.top = `${startY}px`;
          finger.style.transition = 'none';
          finger.classList.add('visible');
          finger.offsetHeight;

          finger.style.transition = 'left 0.6s ease-out, top 0.6s ease-out';
          finger.style.left = `${targetX}px`;
          finger.style.top = `${targetY}px`;
          setTimeout(doDoubleTap, 600);
        }
      });
    };

    // Wire up element click for autoplay
    player.onClickElement = (selector: string) => {
      const element = document.querySelector(selector) as HTMLElement;
      if (element) {
        element.click();
        console.log(`[AutoplayDemo] Clicked element: ${selector}`);
      } else {
        console.warn(`[AutoplayDemo] Element not found: ${selector}`);
      }
    };

    // Wire up text selection for autoplay (find and select text)
    player.onSelect = (text: string) => {
      const { state } = editor;
      let markStart = -1;
      let markEnd = -1;

      // Find the last occurrence of the text in the document
      state.doc.descendants((node, pos) => {
        if (node.isText) {
          const nodeText = node.text || '';
          const idx = nodeText.lastIndexOf(text);
          if (idx !== -1) {
            markStart = pos + idx;
            markEnd = pos + idx + text.length;
          }
        }
      });

      if (markStart === -1) {
        console.warn(`[AutoplayDemo] Could not find text "${text}" to select`);
        return null;
      }

      // Create a text selection using imported TextSelection
      const tr = state.tr.setSelection(TextSelection.create(state.doc, markStart, markEnd));
      editor.dispatch(tr);

      // Focus the editor so the selection is visually rendered
      editor.focus();

      // Create an absolutely positioned highlight overlay (doesn't modify DOM structure)
      // This is needed because ::selection CSS doesn't work reliably in unfocused iframes
      try {
        // Remove any existing highlight overlay
        document.querySelectorAll('.demo-selection-overlay').forEach(el => el.remove());

        // Get the bounding rect of the selection
        const startCoords = editor.coordsAtPos(markStart);
        const endCoords = editor.coordsAtPos(markEnd);

        if (startCoords && endCoords) {
          const overlay = document.createElement('div');
          overlay.className = 'demo-selection-overlay';
          overlay.style.cssText = `
            position: absolute;
            left: ${startCoords.left}px;
            top: ${startCoords.top}px;
            width: ${endCoords.right - startCoords.left}px;
            height: ${startCoords.bottom - startCoords.top}px;
            background: rgba(59, 130, 246, 0.35);
            pointer-events: none;
            z-index: 100;
            border-radius: 2px;
          `;
          document.body.appendChild(overlay);
          console.log(`[AutoplayDemo] Added highlight overlay for "${text}"`);
        }
      } catch (err) {
        console.warn('[AutoplayDemo] Could not add highlight overlay:', err);
      }

      console.log(`[AutoplayDemo] Selected "${text}" at positions ${markStart}-${markEnd}`);
      return { from: markStart, to: markEnd };
    };

    // Wire up toolbar click simulation for autoplay
    player.onClickToolbar = (button: 'geomark' | 'map', lat?: number, lng?: number) => {
      // Remove any demo highlight overlay before processing
      document.querySelectorAll('.demo-selection-overlay').forEach(el => el.remove());

      if (button === 'geomark') {
        // Get current selection
        const { state } = editor;
        const { from, to } = state.selection;

        if (from === to) {
          console.warn('[AutoplayDemo] No selection for geo-mark');
          return;
        }

        // Get selected text
        const selectedText = state.doc.textBetween(from, to);

        // Create geoMark with provided coordinates (deterministic colorIndex in demo mode)
        const geoMarkAttrs = {
          geoId: `geo-demo-${demoColorIndex}`,
          placeName: selectedText,
          lat: lat || 0,
          lng: lng || 0,
          coordSource: 'demo',
          colorIndex: demoColorIndex++ % 10,
        };

        const geoMarkMark = customSchema.marks.geoMark.create(geoMarkAttrs);
        let tr = state.tr.addMark(from, to, geoMarkMark);
        // Collapse selection to end (deselect the text)
        tr = tr.setSelection(TextSelection.create(tr.doc, to));
        editor.dispatch(tr);
        console.log(`[AutoplayDemo] Toolbar click: Created geo-mark for "${selectedText}"`);

        // Trigger map update
        notifyGeoMarkChange();

        // Show visual feedback on toolbar button
        const btn = document.getElementById('format-geomark-btn');
        if (btn) {
          btn.classList.add('demo-click');
          setTimeout(() => btn.classList.remove('demo-click'), 300);
        }
      } else if (button === 'map') {
        // Insert map at cursor
        const { state } = editor;
        const mapNode = customSchema.nodes.map.create({ height: 300 });
        const tr = state.tr.insert(state.selection.from, mapNode);
        editor.dispatch(tr);
        console.log('[AutoplayDemo] Toolbar click: Inserted map');

        // Show visual feedback on toolbar button
        const btn = document.getElementById('format-map-btn');
        if (btn) {
          btn.classList.add('demo-click');
          setTimeout(() => btn.classList.remove('demo-click'), 300);
        }
      }
    };

    // Wire up avatar display for autoplay demos
    // Note: demoClients map and getDemoClientState function are defined at module scope
    player.onShowAvatar = (name: string, color: string) => {
      const avatarsContainer = document.getElementById('avatars');
      if (!avatarsContainer) return;

      // Generate a fake client ID for this demo user (use a high number to avoid collision)
      const fakeClientId = 9999 + demoClients.size;

      // Register in demoClients map
      demoClients.set(fakeClientId, {
        name,
        color,
        mapBounds: null,
        viewState: {
          scrollTop: 0,
          scrollLeft: 0,
          fullscreenMapOpen: false,
          isPresenting: false,
          followingUserId: null,
        }
      });

      // Create avatar element
      const avatar = document.createElement('div');
      avatar.className = 'avatar demo-avatar';
      avatar.style.backgroundColor = color;
      avatar.title = name;
      avatar.setAttribute('data-name', name);
      avatar.setAttribute('data-client-id', String(fakeClientId));
      avatar.tabIndex = 0;
      avatar.setAttribute('role', 'button');
      avatar.setAttribute('aria-label', name);

      // Get initials (first letter of each word, max 2)
      const initials = name
        .split(' ')
        .map((word: string) => word[0])
        .slice(0, 2)
        .join('');
      avatar.textContent = initials;

      // Add click handler to show context menu (for follow functionality)
      avatar.addEventListener('click', (e) => {
        e.stopPropagation();
        showAvatarContextMenu(fakeClientId, name, avatar, e as MouseEvent);
      });

      // Add with animation
      avatar.style.transform = 'scale(0)';
      avatar.style.opacity = '0';
      avatarsContainer.appendChild(avatar);

      // Trigger animation
      requestAnimationFrame(() => {
        avatar.style.transition = 'transform 0.3s ease-out, opacity 0.3s ease-out';
        avatar.style.transform = 'scale(1)';
        avatar.style.opacity = '1';
      });

      console.log(`[AutoplayDemo] Added avatar: ${name} (clientId: ${fakeClientId})`);
    };

    player.onClearAvatars = () => {
      const avatarsContainer = document.getElementById('avatars');
      if (!avatarsContainer) return;

      // Remove only demo avatars
      const demoAvatars = avatarsContainer.querySelectorAll('.demo-avatar');
      demoAvatars.forEach(avatar => avatar.remove());

      // Clear the demoClients map
      demoClients.clear();

      console.log('[AutoplayDemo] Cleared demo avatars');
    };

    // Wire up remote cursor display for collaboration demo
    let remoteCursorEl: HTMLElement | null = null;

    player.onShowRemoteCursor = (userName: string, color: string, position: 'start' | 'middle' | 'end') => {
      // Remove existing cursor if any
      if (remoteCursorEl) {
        remoteCursorEl.remove();
      }

      const editorContainer = document.getElementById('editor-container');
      const prosemirror = editorContainer?.querySelector('.ProseMirror') as HTMLElement;
      if (!editorContainer || !prosemirror) return;

      // Create cursor element that matches the real y-prosemirror cursor style
      // See customCursorBuilder() for the actual implementation
      remoteCursorEl = document.createElement('span');
      remoteCursorEl.className = 'demo-yjs-cursor';
      remoteCursorEl.style.position = 'absolute';
      remoteCursorEl.style.marginLeft = '-1px';
      remoteCursorEl.style.marginRight = '-1px';
      remoteCursorEl.style.borderLeft = `2px solid ${color}`;
      remoteCursorEl.style.borderRight = 'none';
      remoteCursorEl.style.height = '1.2em';
      remoteCursorEl.style.display = 'inline-block';
      remoteCursorEl.style.pointerEvents = 'none';
      remoteCursorEl.style.zIndex = '100';

      // Create label that appears above the cursor (like real y-prosemirror)
      const label = document.createElement('div');
      label.style.position = 'absolute';
      label.style.top = '-1.6em';
      label.style.left = '0';
      label.style.fontSize = '10px';
      label.style.fontWeight = '600';
      label.style.backgroundColor = color;
      label.style.color = 'white';
      label.style.padding = '2px 6px';
      label.style.borderRadius = '3px';
      label.style.whiteSpace = 'nowrap';
      label.style.boxShadow = '0 1px 3px rgba(0,0,0,0.2)';
      label.style.pointerEvents = 'none';
      label.textContent = userName;
      remoteCursorEl.appendChild(label);

      // Use ProseMirror's coordsAtPos to get exact pixel position
      // Position mapping: start=beginning of doc, middle=middle paragraph, end=last paragraph
      const docSize = editor.state.doc.content.size;
      let pos = 1; // default to start
      if (position === 'start') {
        pos = 2; // Just after first paragraph start
      } else if (position === 'middle') {
        pos = Math.floor(docSize / 2);
      } else if (position === 'end') {
        pos = Math.max(1, docSize - 2);
      }

      // Get coordinates at the position
      try {
        const coords = editor.view.coordsAtPos(pos);
        const containerRect = editorContainer.getBoundingClientRect();

        // Position relative to editor container
        remoteCursorEl.style.left = `${coords.left - containerRect.left}px`;
        remoteCursorEl.style.top = `${coords.top - containerRect.top + editorContainer.scrollTop}px`;
      } catch (e) {
        // Fallback positioning if coordsAtPos fails
        const containerRect = editorContainer.getBoundingClientRect();
        const prosemirrorRect = prosemirror.getBoundingClientRect();
        const prosemirrorTop = prosemirrorRect.top - containerRect.top + editorContainer.scrollTop;
        remoteCursorEl.style.left = '20px';
        remoteCursorEl.style.top = `${prosemirrorTop + 10}px`;
      }

      // Add to editor container
      editorContainer.style.position = 'relative';
      editorContainer.appendChild(remoteCursorEl);

      // Fade in
      remoteCursorEl.style.opacity = '0';
      requestAnimationFrame(() => {
        if (remoteCursorEl) {
          remoteCursorEl.style.transition = 'opacity 0.2s ease-out';
          remoteCursorEl.style.opacity = '1';
        }
      });

      console.log(`[AutoplayDemo] Showed remote cursor for ${userName} at ${position} (pos=${pos})`);
    };

    player.onMoveRemoteCursor = (position: 'start' | 'middle' | 'end', duration: number): Promise<void> => {
      return new Promise((resolve) => {
        if (!remoteCursorEl) {
          resolve();
          return;
        }

        const editorContainer = document.getElementById('editor-container');
        if (!editorContainer) {
          resolve();
          return;
        }

        // Calculate target position using ProseMirror coordinates
        const docSize = editor.state.doc.content.size;
        let pos = 1;
        if (position === 'start') {
          pos = 2;
        } else if (position === 'middle') {
          pos = Math.floor(docSize / 2);
        } else if (position === 'end') {
          pos = Math.max(1, docSize - 2);
        }

        try {
          const coords = editor.view.coordsAtPos(pos);
          const containerRect = editorContainer.getBoundingClientRect();

          // Animate to new position
          remoteCursorEl.style.transition = `top ${duration}ms ease-in-out, left ${duration}ms ease-in-out`;
          remoteCursorEl.style.left = `${coords.left - containerRect.left}px`;
          remoteCursorEl.style.top = `${coords.top - containerRect.top + editorContainer.scrollTop}px`;
        } catch (e) {
          // Fallback - just animate vertically
          const prosemirror = editorContainer.querySelector('.ProseMirror') as HTMLElement;
          if (prosemirror) {
            const containerRect = editorContainer.getBoundingClientRect();
            const prosemirrorRect = prosemirror.getBoundingClientRect();
            const contentHeight = prosemirror.scrollHeight;
            const prosemirrorTop = prosemirrorRect.top - containerRect.top + editorContainer.scrollTop;

            let topOffset = prosemirrorTop + 10;
            if (position === 'middle') {
              topOffset = prosemirrorTop + contentHeight * 0.4;
            } else if (position === 'end') {
              topOffset = prosemirrorTop + contentHeight - 30;
            }

            remoteCursorEl.style.transition = `top ${duration}ms ease-in-out`;
            remoteCursorEl.style.top = `${topOffset}px`;
          }
        }

        setTimeout(resolve, duration);
      });
    };

    player.onHideRemoteCursor = () => {
      if (remoteCursorEl) {
        remoteCursorEl.style.transition = 'opacity 0.2s ease-out';
        remoteCursorEl.style.opacity = '0';
        setTimeout(() => {
          if (remoteCursorEl) {
            remoteCursorEl.remove();
            remoteCursorEl = null;
          }
        }, 200);
      }
      console.log('[AutoplayDemo] Hid remote cursor');
    };

    // Wire up remote map bounds overlay for collaboration demo
    let remoteMapClientId: number | null = null;

    player.onShowRemoteMapBounds = (clientId: number, userName: string, color: string, bounds: { north: number; south: number; east: number; west: number }) => {
      // Find the demo client by userName instead of using hardcoded clientId from action
      // (since onShowAvatar assigns dynamic clientIds based on registration order)
      let actualClientId: number | null = null;
      let demoClient: DemoClientState | null = null;
      for (const [id, client] of demoClients.entries()) {
        if (client.name === userName) {
          actualClientId = id;
          demoClient = client;
          break;
        }
      }

      remoteMapClientId = actualClientId ?? clientId;

      // Update demo client state with mapBounds (for follow mode support)
      if (demoClient) {
        demoClient.mapBounds = {
          ...bounds,
          // Add center/zoom for accurate follow mode (estimate from bounds)
          center: {
            lng: (bounds.east + bounds.west) / 2,
            lat: (bounds.north + bounds.south) / 2
          },
          zoom: 14, // Reasonable default zoom for Copenhagen area
          pitch: 0,
          bearing: 0,
        };
        demoClient.viewState.fullscreenMapOpen = true;
        console.log(`[AutoplayDemo] Updated demo client ${actualClientId} (${userName}) mapBounds:`, demoClient.mapBounds);

        // If we're following this demo client, open fullscreen map with their bounds
        if (viewSyncService?.getFollowingUserId() === actualClientId) {
          console.log(`[AutoplayDemo] Following ${userName}, opening fullscreen map with their bounds`);
          showFullscreenMap(demoClient.mapBounds);
        }
      }

      // Use existing function from AwarenessOverlayRenderer (use actualClientId for consistent layer naming)
      addBoundsOverlay(actualClientId ?? clientId, bounds, color);
      console.log(`[AutoplayDemo] Showed map bounds overlay for ${userName} (clientId: ${actualClientId ?? clientId})`);
    };

    player.onMoveRemoteMapBounds = (bounds: { north: number; south: number; east: number; west: number }, duration: number): Promise<void> => {
      return new Promise((resolve) => {
        if (remoteMapClientId !== null) {
          // Update demo client state
          const demoClient = demoClients.get(remoteMapClientId);
          if (demoClient) {
            demoClient.mapBounds = {
              ...bounds,
              center: {
                lng: (bounds.east + bounds.west) / 2,
                lat: (bounds.north + bounds.south) / 2
              },
              zoom: 14,
              pitch: 0,
              bearing: 0,
            };

            // If we're following this demo client, sync fullscreen map
            if (viewSyncService?.getFollowingUserId() === remoteMapClientId && fullscreenMapView) {
              const isFullscreenOpen = document.getElementById('fullscreen-overlay')?.classList.contains('visible');
              if (isFullscreenOpen) {
                console.log(`[AutoplayDemo] Syncing fullscreen map to demo client ${remoteMapClientId} bounds`);
                fullscreenMapView.fitBounds(demoClient.mapBounds);
              }
            }
          }

          updateBoundsOverlay(remoteMapClientId, bounds, '#3B82F6');
        }
        setTimeout(resolve, duration);
      });
    };

    player.onHideRemoteMapBounds = () => {
      if (remoteMapClientId !== null) {
        // Update demo client state
        const demoClient = demoClients.get(remoteMapClientId);
        if (demoClient) {
          demoClient.mapBounds = null;
          demoClient.viewState.fullscreenMapOpen = false;

          // If we're following this demo client and fullscreen is open, close it
          if (viewSyncService?.getFollowingUserId() === remoteMapClientId) {
            const isFullscreenOpen = document.getElementById('fullscreen-overlay')?.classList.contains('visible');
            if (isFullscreenOpen && fullscreenMapView) {
              console.log(`[AutoplayDemo] Demo client ${remoteMapClientId} closed map, closing fullscreen`);
              fullscreenMapView.hide();
            }
          }
        }

        removeBoundsOverlay(remoteMapClientId);
        remoteMapClientId = null;
      }
      console.log('[AutoplayDemo] Hid map bounds overlay');
    };

    // Wire up share modal actions
    player.onShowShareModal = () => {
      const modal = document.getElementById('share-modal');
      if (modal) {
        // Reset state for both copy buttons
        const copyBtn = document.getElementById('share-copy-btn');
        if (copyBtn) {
          copyBtn.classList.remove('copied', 'tapped');
        }
        const followCopyBtn = document.getElementById('follow-copy-btn');
        if (followCopyBtn) {
          followCopyBtn.classList.remove('copied', 'tapped');
        }
        const status = document.getElementById('share-status');
        if (status) {
          status.classList.remove('visible');
        }

        // Populate the "View my screen" follow URL with current clientId
        const followUrlText = document.getElementById('follow-url-text');
        if (followUrlText && awareness) {
          const myClientId = awareness.clientID;
          const baseUrl = window.location.origin + window.location.pathname;
          const docId = documentId || 'demo';
          const followUrl = `${baseUrl}?doc=${docId}&follow=${myClientId}`;
          // Show shortened version for display
          followUrlText.textContent = `tourvision.com/...&follow=${myClientId}`;
          // Store full URL in data attribute for copying
          followUrlText.setAttribute('data-full-url', followUrl);
          console.log('[AutoplayDemo] Follow URL set:', followUrl);
        }

        // Show modal
        modal.classList.add('visible');
        console.log('[AutoplayDemo] Showing share modal');
      }
    };

    player.onTapCopyUrl = () => {
      return new Promise<void>((resolve) => {
        const finger = document.getElementById('demo-finger');
        const copyBtn = document.getElementById('share-copy-btn') as HTMLElement;

        if (!finger || !copyBtn) {
          console.warn(`[AutoplayDemo] Tap copy URL failed - finger: ${!!finger}, copyBtn: ${!!copyBtn}`);
          resolve();
          return;
        }

        // Get copy button position
        const rect = copyBtn.getBoundingClientRect();
        const targetX = rect.left + rect.width / 2;
        const targetY = rect.top + rect.height / 2;

        // Animate finger from right side to target
        const startX = window.innerWidth + 60;
        const startY = targetY;

        // Position finger at start
        finger.style.left = `${startX}px`;
        finger.style.top = `${startY}px`;
        finger.classList.add('visible');

        // Animate to target
        setTimeout(() => {
          finger.style.transition = 'left 0.4s cubic-bezier(0.4, 0, 0.2, 1), top 0.4s cubic-bezier(0.4, 0, 0.2, 1)';
          finger.style.left = `${targetX}px`;
          finger.style.top = `${targetY}px`;

          // Tap animation
          setTimeout(() => {
            finger.classList.add('tapping');
            copyBtn.classList.add('tapped');

            setTimeout(() => {
              finger.classList.remove('tapping');
              copyBtn.classList.remove('tapped');
              copyBtn.classList.add('copied');

              // Show "Copied!" status
              const status = document.getElementById('share-status');
              if (status) {
                status.classList.add('visible');
              }

              // Hide finger and resolve
              setTimeout(() => {
                finger.classList.remove('visible');
                finger.style.transition = '';
                resolve();
              }, 400);
            }, 200);
          }, 450);
        }, 50);
      });
    };

    player.onHideShareModal = () => {
      const modal = document.getElementById('share-modal');
      if (modal) {
        modal.classList.remove('visible');
        // Reset copy button states
        const copyBtn = document.getElementById('share-copy-btn');
        if (copyBtn) {
          copyBtn.classList.remove('copied');
        }
        const followCopyBtn = document.getElementById('follow-copy-btn');
        if (followCopyBtn) {
          followCopyBtn.classList.remove('copied');
        }
        console.log('[AutoplayDemo] Hiding share modal');
      }
    };

    // Wire up demo video call overlay
    player.onShowVideoCall = () => {
      const overlay = document.getElementById('demo-video-call-overlay');
      if (overlay) {
        overlay.classList.add('visible');
        console.log('[AutoplayDemo] Showing demo video call overlay');
      }
    };

    player.onHideVideoCall = () => {
      const overlay = document.getElementById('demo-video-call-overlay');
      if (overlay) {
        overlay.classList.remove('visible');
        console.log('[AutoplayDemo] Hiding demo video call overlay');
      }
    };

    // Wire up tap on follow copy button (for "View my screen" link)
    player.onTapFollowCopyUrl = () => {
      return new Promise<void>((resolve) => {
        const finger = document.getElementById('demo-finger');
        const copyBtn = document.getElementById('follow-copy-btn') as HTMLElement;

        if (!finger || !copyBtn) {
          console.warn(`[AutoplayDemo] Tap follow copy URL failed - finger: ${!!finger}, copyBtn: ${!!copyBtn}`);
          resolve();
          return;
        }

        // Get copy button position
        const rect = copyBtn.getBoundingClientRect();
        const targetX = rect.left + rect.width / 2;
        const targetY = rect.top + rect.height / 2;

        // Animate finger from right side to target
        const startX = window.innerWidth + 60;
        const startY = targetY;

        // Position finger at start
        finger.style.left = `${startX}px`;
        finger.style.top = `${startY}px`;
        finger.classList.add('visible');

        // Animate to target
        setTimeout(() => {
          finger.style.transition = 'left 0.4s cubic-bezier(0.4, 0, 0.2, 1), top 0.4s cubic-bezier(0.4, 0, 0.2, 1)';
          finger.style.left = `${targetX}px`;
          finger.style.top = `${targetY}px`;

          // Tap animation
          setTimeout(() => {
            finger.classList.add('tapping');
            copyBtn.classList.add('tapped');

            setTimeout(() => {
              finger.classList.remove('tapping');
              copyBtn.classList.remove('tapped');
              copyBtn.classList.add('copied');

              // Show "Copied!" status
              const status = document.getElementById('share-status');
              if (status) {
                status.classList.add('visible');
              }

              // Hide finger and resolve
              setTimeout(() => {
                finger.classList.remove('visible');
                finger.style.transition = '';
                resolve();
              }, 400);
            }, 200);
          }, 450);
        }, 50);
      });
    };

    // Wire up chapter state setup for independent/shuffleable chapters
    player.onSetupChapterState = async (state: 'empty' | 'saturday-content' | 'saturday-with-map' | 'saturday-with-route' | 'full-content') => {
      console.log(`[AutoplayDemo] Setting up chapter state: ${state}`);

      // Reset deterministic color index for new chapter
      demoColorIndex = 0;

      // Step 1: Clear the document
      const { tr } = editor.state;
      let clearTr = editor.state.tr.delete(0, editor.state.doc.content.size);
      // Insert empty paragraph to ensure valid document
      const emptyPara = customSchema.nodes.paragraph.create();
      clearTr = clearTr.insert(0, emptyPara);
      editor.dispatch(clearTr);

      if (state === 'empty') {
        console.log('[AutoplayDemo] Chapter state: empty - done');
        return;
      }

      // Step 2: Build document content based on state
      // All states except 'empty' include the Saturday content base
      const nodes: any[] = [];

      // H1: "Weekend in Denmark?"
      nodes.push(customSchema.nodes.heading.create(
        { level: 1 },
        customSchema.text('Weekend in Denmark?')
      ));

      // Intro paragraph
      nodes.push(customSchema.nodes.paragraph.create(
        null,
        customSchema.text('Hey guys! What do you think about this plan:')
      ));

      // Empty paragraph for spacing
      nodes.push(customSchema.nodes.paragraph.create());

      // H2: "Saturday"
      nodes.push(customSchema.nodes.heading.create(
        { level: 2 },
        customSchema.text('Saturday')
      ));

      // Saturday description - with or without geomarks depending on state
      if (state === 'saturday-content') {
        // Just text, no geomarks
        nodes.push(customSchema.nodes.paragraph.create(
          null,
          customSchema.text('Explore Copenhagen and visit Tivoli Gardens')
        ));
        nodes.push(customSchema.nodes.paragraph.create());
      } else {
        // saturday-with-map, saturday-with-route, or full-content: include geomarks (deterministic IDs)
        const copenhagenMark = customSchema.marks.geoMark.create({
          geoId: 'geo-setup-copenhagen',
          displayText: 'Copenhagen',
          placeName: 'Copenhagen, Denmark',
          lat: 55.6761,
          lng: 12.5683,
          colorIndex: 0,
          coordSource: 'demo'
        });

        // saturday-with-route includes transport config for the route
        const tivoliMarkAttrs: any = {
          geoId: 'geo-setup-tivoli',
          displayText: 'Tivoli Gardens',
          placeName: 'Tivoli Gardens, Copenhagen',
          lat: 55.6736,
          lng: 12.5681,
          colorIndex: 1,
          coordSource: 'demo'
        };

        // Add transport config only for saturday-with-route state
        if (state === 'saturday-with-route') {
          tivoliMarkAttrs.transportFrom = 'geo-setup-copenhagen';
          tivoliMarkAttrs.transportProfile = 'walking';
        }

        const tivoliMark = customSchema.marks.geoMark.create(tivoliMarkAttrs);

        // Create text with geomarks: "Explore Copenhagen and visit Tivoli Gardens"
        const saturdayText = customSchema.nodes.paragraph.create(null, [
          customSchema.text('Explore '),
          customSchema.text('Copenhagen', [copenhagenMark]),
          customSchema.text(' and visit '),
          customSchema.text('Tivoli Gardens', [tivoliMark])
        ]);
        nodes.push(saturdayText);
        nodes.push(customSchema.nodes.paragraph.create());

        // Add Saturday map
        nodes.push(customSchema.nodes.map.create({ height: 300 }));
        nodes.push(customSchema.nodes.paragraph.create());
      }

      // For full-content, add Sunday section
      if (state === 'full-content') {
        // H2: "Sunday"
        nodes.push(customSchema.nodes.heading.create(
          { level: 2 },
          customSchema.text('Sunday')
        ));

        // Sunday description with Aarhus geomark (deterministic ID)
        const aarhusMark = customSchema.marks.geoMark.create({
          geoId: 'geo-setup-aarhus',
          displayText: 'Aarhus',
          placeName: 'Aarhus, Denmark',
          lat: 56.1629,
          lng: 10.2039,
          colorIndex: 2,
          coordSource: 'demo'
        });

        const sundayText = customSchema.nodes.paragraph.create(null, [
          customSchema.text('Drive to '),
          customSchema.text('Aarhus', [aarhusMark]),
          customSchema.text(' for the old town museum')
        ]);
        nodes.push(sundayText);
        nodes.push(customSchema.nodes.paragraph.create());

        // Add Sunday map
        nodes.push(customSchema.nodes.map.create({ height: 300 }));
        nodes.push(customSchema.nodes.paragraph.create());
      }

      // Step 3: Insert all nodes into the document
      let insertTr = editor.state.tr;
      // Delete the empty paragraph we inserted earlier
      insertTr = insertTr.delete(0, editor.state.doc.content.size);

      // Insert all nodes at position 0
      for (let i = nodes.length - 1; i >= 0; i--) {
        insertTr = insertTr.insert(0, nodes[i]);
      }

      editor.dispatch(insertTr);

      // Step 4: Notify map listeners to update
      notifyGeoMarkChange();

      console.log(`[AutoplayDemo] Chapter state ${state} setup complete with ${nodes.length} nodes`);

      // Small delay to let maps render
      await new Promise(resolve => setTimeout(resolve, 100));
    };

    // Start autoplay after a short delay (let editor settle)
    // In remote control mode, wait for parent DemoPlayer to send start command
    if (!isRemoteControlMode) {
      setTimeout(() => player.start(), 1000);
    } else {
      console.log('[Main] Remote control mode - waiting for parent to start demo');
    }
  }

  // Initialize location detection services for voice input
  const geocodingService = new GeocodingService();
  const geoMarkingService = new GeoMarkingService(
    editor,
    customSchema,
    geocodingService,
    {
      onLocationExtracted: (locations) => {
        console.log(`[Main] 📍 Voice input detected ${locations.length} locations:`, locations);
      },
      onGeoMarkCreated: (geoId, locationName) => {
        console.log(`[Main] ✅ Created geo-mark from voice: ${locationName} (${geoId})`);
      },
      onError: (error) => {
        console.error('[Main] ❌ Error during voice location detection:', error);
      }
    }
  );

  // Set voice draft sheet dependencies
  setVoiceDraftSheetDependencies(
    editor,
    customSchema,
    geocodingService,
    voiceInputService,
    () => {
      // Change callback - refresh maps, etc.
      console.log('[Main] Voice draft applied, refreshing maps');
      notifyGeoMarkChange();
    }
  );

  // Set up toolbar button handlers
  initToolbar({
    view: editor,
    videoChatService,
    voiceInputService,
    geoMarkingService,
    createGeoMark,
    insertMapWithAutoGeoMark,
    hideVideoContainer,
    showJoinVideoModal,
    hideJoinVideoModal,
    getFormatButtonUpdateDisabled: () => formatButtonUpdateDisabled,
  });

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

  // === Cleanup handlers for demo state isolation ===
  // Clear Y.js document content at startup if in demo mode with sync enabled
  // This prevents ghost states from previous sessions in the same document
  if (isAutoplayMode && enableSync) {
    console.log('[Main] Demo mode with sync - clearing Y.js document content');
    ydoc.transact(() => {
      while (yXmlFragment.length > 0) {
        yXmlFragment.delete(0, 1);
      }
    });
  }

  // Add beforeunload cleanup to properly disconnect and clear state
  window.addEventListener('beforeunload', () => {
    console.log('[Main] Page unloading - cleaning up state');

    // 1. Clear awareness state (removes our cursor/presence from other clients)
    if (awareness) {
      awareness.setLocalState(null);
    }

    // 2. Disconnect WebRTC provider
    if (provider) {
      provider.disconnect();
      provider.destroy();
    }

    // 3. Clear demo clients map (for autoplay demos)
    demoClients.clear();
  });

  /**
   * Handle demo commands forwarded from DemoPlayer (for Bob's phone in dual-phone mode)
   */
  function handleDemoCommand(data: any): void {
    switch (data.command) {
      case 'scroll':
        // Scroll to a target in the editor
        console.log('[Main] Executing scroll command:', data.target);

        // In observeOnly mode, skip scroll commands - we follow Alice's scroll position instead
        if (isObserveOnly) {
          console.log('[Main] Skipping scroll command in observeOnly mode (following Alice)');
          break;
        }

        const editorContainer = document.getElementById('editor-container');
        if (!editorContainer) return;

        if (data.target === 'firstMap') {
          // Scroll to first map block
          const firstMap = document.querySelector('.prosemirror-map');
          if (firstMap) {
            firstMap.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        } else if (data.target === 'secondMap') {
          // Scroll to second map block
          const maps = document.querySelectorAll('.prosemirror-map');
          if (maps.length > 1) {
            maps[1].scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        } else if (typeof data.target === 'number') {
          // Scroll to specific pixel position
          editorContainer.scrollTop = data.target;
        }
        break;

      case 'fingerTap':
        // Show finger tap animation (Bob's phone)
        console.log('[Main] Executing fingerTap command:', data.selector);
        showBobFingerTap(data.selector, data.fromSide || 'right');
        break;

      case 'openFullscreenMap':
        // Open fullscreen map on Bob's phone (video thumbnail is shown via showFullscreenMap)
        console.log('[Main] Executing openFullscreenMap command');
        (window as any).showFullscreenMap?.();
        break;

      case 'closeFullscreenMap':
        // Close fullscreen map on Bob's phone
        console.log('[Main] Executing closeFullscreenMap command');
        if (fullscreenMapView) {
          fullscreenMapView.hide();
        }
        break;

      case 'panMap':
        // Pan the fullscreen map with finger drag animation
        console.log('[Main] Executing panMap command:', data.direction, data.distance);
        if (fullscreenMapView) {
          const map = fullscreenMapView.getMap();
          if (map) {
            const distance = data.distance || 100;
            let offset: [number, number] = [0, 0];
            switch (data.direction) {
              case 'up': offset = [0, -distance]; break;
              case 'down': offset = [0, distance]; break;
              case 'left': offset = [-distance, 0]; break;
              case 'right': offset = [distance, 0]; break;
            }
            // Show finger drag animation, then pan
            showBobFingerDrag(data.direction, distance, () => {
              map.panBy(offset, { duration: 400 });
            });
          }
        }
        break;

      case 'zoomMap':
        // Zoom the fullscreen map with finger pinch animation
        console.log('[Main] Executing zoomMap command:', data.direction, data.amount);
        if (fullscreenMapView) {
          const map = fullscreenMapView.getMap();
          if (map) {
            // Show pinch gesture animation, then zoom
            showBobPinchGesture(data.direction === 'in', () => {
              if (data.direction === 'in') {
                map.zoomIn({ duration: 400 });
              } else {
                map.zoomOut({ duration: 400 });
              }
            });
          }
        }
        break;

      case 'showVideoCall':
        // Show demo video call overlay on Bob's phone
        console.log('[Main] Executing showVideoCall command');
        const videoOverlay = document.getElementById('demo-video-call-overlay');
        if (videoOverlay) {
          videoOverlay.classList.add('visible');
        }
        break;

      case 'hideVideoCall':
        // Hide demo video call overlay on Bob's phone
        console.log('[Main] Executing hideVideoCall command');
        const videoOverlayHide = document.getElementById('demo-video-call-overlay');
        if (videoOverlayHide) {
          videoOverlayHide.classList.remove('visible');
        }
        break;
    }
  }

  /**
   * Show finger tap animation on Bob's phone
   */
  function showBobFingerTap(selector: string, fromSide: string): void {
    const target = document.querySelector(selector);
    if (!target) {
      console.warn('[Main] Finger tap target not found:', selector);
      return;
    }

    // Get or create finger element for Bob
    let finger = document.getElementById('demo-finger-bob');
    if (!finger) {
      finger = document.createElement('div');
      finger.id = 'demo-finger-bob';
      finger.className = 'demo-finger';
      finger.innerHTML = `<img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%23333'%3E%3Cpath d='M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z'/%3E%3C/svg%3E" style="width: 48px; height: 48px; filter: drop-shadow(2px 2px 4px rgba(0,0,0,0.3));" />`;
      document.body.appendChild(finger);
    }

    const rect = target.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    // Calculate start position based on fromSide
    let startX = centerX;
    let startY = centerY;
    const offset = 80;
    switch (fromSide) {
      case 'left': startX = centerX - offset; break;
      case 'right': startX = centerX + offset; break;
      case 'bottom': startY = centerY + offset; break;
    }

    // Position finger at start
    finger.style.left = `${startX - 24}px`;
    finger.style.top = `${startY - 24}px`;
    finger.classList.add('visible');

    // Animate to center
    setTimeout(() => {
      finger!.style.transition = 'left 0.3s ease-out, top 0.3s ease-out';
      finger!.style.left = `${centerX - 24}px`;
      finger!.style.top = `${centerY - 24}px`;

      // Add tap effect
      setTimeout(() => {
        finger!.classList.add('tapping');
        setTimeout(() => {
          finger!.classList.remove('tapping');
          // Hide after tap
          setTimeout(() => {
            finger!.classList.remove('visible');
            finger!.style.transition = '';
          }, 200);
        }, 150);
      }, 300);
    }, 50);
  }

  /**
   * Show finger drag animation on Bob's phone (for panning)
   */
  function showBobFingerDrag(direction: string, distance: number, onDragStart: () => void): void {
    // Get fullscreen overlay as reference for positioning
    const overlay = document.getElementById('fullscreen-overlay');
    if (!overlay) {
      onDragStart();
      return;
    }

    // Get or create finger element for Bob
    let finger = document.getElementById('demo-finger-bob');
    if (!finger) {
      finger = document.createElement('div');
      finger.id = 'demo-finger-bob';
      finger.className = 'demo-finger';
      finger.innerHTML = `<img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%23333'%3E%3Cpath d='M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z'/%3E%3C/svg%3E" style="width: 48px; height: 48px; filter: drop-shadow(2px 2px 4px rgba(0,0,0,0.3));" />`;
      document.body.appendChild(finger);
    }

    const rect = overlay.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    // Calculate drag distance (scaled for visual effect)
    const dragDistance = Math.min(distance * 0.8, 80);

    // Calculate start and end positions based on direction
    // Drag opposite to pan direction (drag left to pan right, etc.)
    let startX = centerX, startY = centerY;
    let endX = centerX, endY = centerY;

    switch (direction) {
      case 'up':
        startY = centerY + dragDistance / 2;
        endY = centerY - dragDistance / 2;
        break;
      case 'down':
        startY = centerY - dragDistance / 2;
        endY = centerY + dragDistance / 2;
        break;
      case 'left':
        startX = centerX + dragDistance / 2;
        endX = centerX - dragDistance / 2;
        break;
      case 'right':
        startX = centerX - dragDistance / 2;
        endX = centerX + dragDistance / 2;
        break;
    }

    // Position finger at start
    finger.style.transition = '';
    finger.style.left = `${startX - 24}px`;
    finger.style.top = `${startY - 24}px`;
    finger.classList.add('visible');
    finger.classList.add('pressing'); // Show pressed state

    // Start dragging after brief delay
    setTimeout(() => {
      finger!.style.transition = 'left 0.4s ease-out, top 0.4s ease-out';
      finger!.style.left = `${endX - 24}px`;
      finger!.style.top = `${endY - 24}px`;

      // Trigger the map pan at start of drag
      onDragStart();

      // Release and hide after drag completes
      setTimeout(() => {
        finger!.classList.remove('pressing');
        setTimeout(() => {
          finger!.classList.remove('visible');
          finger!.style.transition = '';
        }, 150);
      }, 400);
    }, 100);
  }

  /**
   * Show pinch gesture animation on Bob's phone (for zooming)
   */
  function showBobPinchGesture(zoomIn: boolean, onPinch: () => void): void {
    // Get fullscreen overlay as reference for positioning
    const overlay = document.getElementById('fullscreen-overlay');
    if (!overlay) {
      onPinch();
      return;
    }

    // Get or create two finger elements for pinch gesture
    let finger1 = document.getElementById('demo-finger-bob');
    let finger2 = document.getElementById('demo-finger-bob-2');

    if (!finger1) {
      finger1 = document.createElement('div');
      finger1.id = 'demo-finger-bob';
      finger1.className = 'demo-finger';
      finger1.innerHTML = `<img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%23333'%3E%3Cpath d='M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z'/%3E%3C/svg%3E" style="width: 48px; height: 48px; filter: drop-shadow(2px 2px 4px rgba(0,0,0,0.3));" />`;
      document.body.appendChild(finger1);
    }

    if (!finger2) {
      finger2 = document.createElement('div');
      finger2.id = 'demo-finger-bob-2';
      finger2.className = 'demo-finger';
      finger2.innerHTML = `<img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%23333'%3E%3Cpath d='M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z'/%3E%3C/svg%3E" style="width: 48px; height: 48px; filter: drop-shadow(2px 2px 4px rgba(0,0,0,0.3));" />`;
      document.body.appendChild(finger2);
    }

    const rect = overlay.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    // Pinch distance (spread for zoom in, pinch for zoom out)
    const closeDistance = 30;
    const farDistance = 70;

    const startDist = zoomIn ? closeDistance : farDistance;
    const endDist = zoomIn ? farDistance : closeDistance;

    // Position fingers at starting distance (diagonal)
    finger1.style.transition = '';
    finger2.style.transition = '';
    finger1.style.left = `${centerX - startDist - 24}px`;
    finger1.style.top = `${centerY - startDist - 24}px`;
    finger2.style.left = `${centerX + startDist - 24}px`;
    finger2.style.top = `${centerY + startDist - 24}px`;

    finger1.classList.add('visible', 'pressing');
    finger2.classList.add('visible', 'pressing');

    // Animate pinch/spread
    setTimeout(() => {
      finger1!.style.transition = 'left 0.35s ease-out, top 0.35s ease-out';
      finger2!.style.transition = 'left 0.35s ease-out, top 0.35s ease-out';
      finger1!.style.left = `${centerX - endDist - 24}px`;
      finger1!.style.top = `${centerY - endDist - 24}px`;
      finger2!.style.left = `${centerX + endDist - 24}px`;
      finger2!.style.top = `${centerY + endDist - 24}px`;

      // Trigger the zoom
      onPinch();

      // Release and hide after gesture
      setTimeout(() => {
        finger1!.classList.remove('pressing');
        finger2!.classList.remove('pressing');
        setTimeout(() => {
          finger1!.classList.remove('visible');
          finger2!.classList.remove('visible');
          finger1!.style.transition = '';
          finger2!.style.transition = '';
        }, 150);
      }, 350);
    }, 100);
  }

  // Listen for messages from parent DemoPlayer
  window.addEventListener('message', (event) => {
    const data = event.data;
    if (!data?.type) return;

    switch (data.type) {
      case 'demoCleanup':
        console.log('[Main] Received demoCleanup message from parent');
        // Clear awareness state
        if (awareness) {
          awareness.setLocalState(null);
        }
        // Disconnect provider
        if (provider) {
          provider.disconnect();
          provider.destroy();
        }
        // Clear demo state
        demoClients.clear();
        break;

      case 'captureSnapshot':
        // Capture current Y.js state and send back to parent
        console.log('[Main] Capturing snapshot for step:', data.step);
        const stateVector = Y.encodeStateAsUpdate(ydoc);
        window.parent?.postMessage({
          type: 'snapshotCaptured',
          step: data.step,
          actionIndex: data.actionIndex,
          stateVector: Array.from(stateVector)  // Convert Uint8Array for postMessage
        }, '*');
        break;

      case 'restoreSnapshot':
        // Restore Y.js state from snapshot
        console.log('[Main] Restoring snapshot for step:', data.step);

        // Close fullscreen map if open (it's from a different step's state)
        if (fullscreenMapView) {
          fullscreenMapView.hide();
        }

        // Hide finger cursor if visible
        const finger = document.getElementById('demo-finger');
        if (finger) {
          finger.classList.remove('visible');
        }

        // Clear demo clients to prevent ghost avatars
        demoClients.clear();

        const updateData = new Uint8Array(data.stateVector);

        // Clear existing document content
        const yXmlFragment = ydoc.getXmlFragment('prosemirror');
        ydoc.transact(() => {
          while (yXmlFragment.length > 0) {
            yXmlFragment.delete(0, 1);
          }
        });

        // Apply the snapshot - create a fresh doc and copy state
        const tempDoc = new Y.Doc();
        Y.applyUpdate(tempDoc, updateData);
        const tempFragment = tempDoc.getXmlFragment('prosemirror');

        // Copy content from temp doc to main doc
        ydoc.transact(() => {
          for (let i = 0; i < tempFragment.length; i++) {
            const item = tempFragment.get(i);
            if (item) {
              // Clone the item into our document
              yXmlFragment.insert(i, [item.clone()]);
            }
          }
        });

        console.log('[Main] Snapshot restored, fragment length:', yXmlFragment.length);
        break;

      case 'demoCommand':
        // Handle demo commands forwarded from DemoPlayer (for Bob's phone)
        console.log('[Main] Received demoCommand:', data.command);
        handleDemoCommand(data);
        break;
    }
  });

}

// Function to geocode a place name using Nominatim
// In demo/autoplay mode, uses predefined locations for deterministic behavior
async function geocodePlace(placeName: string) {
  // In demo mode, use predefined locations (no API calls)
  if (isAutoplayMode || isRemoteControlMode) {
    const demoLocation = DEMO_LOCATIONS[placeName];
    if (demoLocation) {
      console.log(`[Main] Using predefined demo location for "${placeName}"`);
      return {
        placeName: demoLocation.placeName,
        lat: demoLocation.lat,
        lng: demoLocation.lng
      };
    }
    // Location not in demo list - log warning but don't fail
    console.warn(`[Main] Demo location not found for "${placeName}", no API call will be made`);
    return null;
  }

  // Normal mode - call Nominatim API
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

/**
 * Extract text content from paragraphs between the previous heading
 * and the given position (where map will be inserted)
 */
function extractSectionText(
  doc: any,
  mapPosition: number
): { text: string; startPos: number; endPos: number } {
  let sectionStart = 0;
  const sectionEnd = mapPosition;

  // Find the last heading before mapPosition
  doc.nodesBetween(0, mapPosition, (node: any, pos: number) => {
    if (node.type.name === 'heading') {
      sectionStart = pos + node.nodeSize; // Start after the heading
    }
  });

  // Extract text content from that range
  let text = '';
  doc.nodesBetween(sectionStart, sectionEnd, (node: any) => {
    if (node.isText) {
      text += node.text;
    } else if (node.type.name === 'paragraph') {
      text += ' '; // Space between paragraphs
    }
  });

  return { text: text.trim(), startPos: sectionStart, endPos: sectionEnd };
}

/**
 * Extract location names from text using pattern matching
 */
function extractLocationsFromText(text: string): string[] {
  const locations: string[] = [];
  const locationPattern = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g;
  const matches = text.matchAll(locationPattern);

  // Words that are never locations
  const blacklist = ['The', 'A', 'An', 'This', 'That', 'These', 'Those',
                     'I', 'We', 'You', 'He', 'She', 'It', 'They',
                     'Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday',
                     'Thursday', 'Friday', 'January', 'February', 'March',
                     'April', 'May', 'June', 'July', 'August', 'September',
                     'October', 'November', 'December', 'Hey', 'What'];

  // Action words that shouldn't start a location phrase
  const actionWords = ['Explore', 'Drive', 'Visit', 'See', 'Go', 'Take',
                       'Walk', 'Fly', 'Meet', 'Check', 'Stop', 'Stay'];

  for (const match of matches) {
    let candidate = match[1];

    // Strip leading action words from phrases like "Explore Copenhagen"
    for (const action of actionWords) {
      if (candidate.startsWith(action + ' ')) {
        candidate = candidate.substring(action.length + 1);
        break;
      }
    }

    if (!blacklist.includes(candidate) && candidate.length > 2) {
      if (!locations.includes(candidate)) {
        locations.push(candidate);
      }
    }
  }

  return locations.slice(0, 10); // Limit to 10 locations
}

/**
 * Find text position within a specific range of the document
 */
function findTextInRange(
  doc: any,
  searchText: string,
  rangeStart: number,
  rangeEnd: number
): { from: number; to: number } | null {
  let result: { from: number; to: number } | null = null;

  doc.nodesBetween(rangeStart, rangeEnd, (node: any, pos: number) => {
    if (result) return false; // Stop if already found

    if (node.isText && node.text) {
      const text = node.text;
      const index = text.indexOf(searchText);

      if (index !== -1) {
        result = {
          from: pos + index,
          to: pos + index + searchText.length
        };
        return false;
      }
    }
    return true;
  });

  return result;
}

/**
 * Check if text at position already has a geoMark
 */
function hasGeoMarkAt(doc: any, from: number, to: number): boolean {
  let hasIt = false;
  doc.nodesBetween(from, to, (node: any) => {
    if (node.marks) {
      for (const mark of node.marks) {
        if (mark.type.name === 'geoMark') {
          hasIt = true;
          return false;
        }
      }
    }
  });
  return hasIt;
}

// Function to create a geo mark on selected text
async function createGeoMark(view: EditorView) {
  const { state } = view;
  const { from, to } = state.selection;

  if (from === to) {
    // In autoplay/demo mode, silently skip (don't block with alert)
    const params = new URLSearchParams(window.location.search);
    if (params.get('autoplay') === 'true') {
      console.warn('[GeoMark] No text selected during autoplay, skipping');
      return;
    }
    alert('Please select some text to create a geo mark');
    return;
  }

  // Get the selected text (save it before async operation)
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

  // Re-find the text in the current document state (may have changed during async geocoding)
  const currentState = view.state;
  let newFrom = -1;
  let newTo = -1;

  currentState.doc.descendants((node, pos) => {
    if (newFrom !== -1) return false; // Already found
    if (node.isText && node.text) {
      const idx = node.text.indexOf(selectedText);
      if (idx !== -1) {
        newFrom = pos + idx;
        newTo = pos + idx + selectedText.length;
        return false;
      }
    }
    return true;
  });

  if (newFrom === -1) {
    updateStatus('Text not found', 'disconnected');
    console.warn(`[Main] Could not find "${selectedText}" in current document state`);
    return;
  }

  // Check if already has a geo mark
  let alreadyMarked = false;
  currentState.doc.nodesBetween(newFrom, newTo, (node) => {
    if (node.marks) {
      for (const mark of node.marks) {
        if (mark.type.name === 'geoMark') {
          alreadyMarked = true;
          return false;
        }
      }
    }
  });

  if (alreadyMarked) {
    updateStatus('Already marked', 'connected');
    console.log(`[Main] "${selectedText}" already has a geo mark`);
    return;
  }

  // Generate a unique ID (deterministic in demo mode)
  const geoId = (isAutoplayMode || isRemoteControlMode)
    ? `geo-demo-${demoColorIndex}`
    : `geo-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  // In demo mode, use deterministic color index; otherwise random
  const colorIndex = (isAutoplayMode || isRemoteControlMode)
    ? (demoColorIndex++ % 10)
    : Math.floor(Math.random() * 10);

  // Create the geo mark
  const geoMarkType = customSchema.marks.geoMark;
  const mark = geoMarkType.create({
    geoId,
    displayText: selectedText,
    placeName: geocodeResult.placeName,
    lat: geocodeResult.lat,
    lng: geocodeResult.lng,
    colorIndex,
    coordSource: (isAutoplayMode || isRemoteControlMode) ? 'demo' : 'nominatim'
  });

  // Apply the mark using current state (not the stale captured state)
  const tr = currentState.tr.addMark(newFrom, newTo, mark);
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

// Function to insert a map block (simple version for internal use)
function insertMapNode(view: EditorView, position?: number) {
  const { state } = view;
  const insertPos = position ?? state.selection.$from.pos;

  // Create the map node
  const mapNode = customSchema.nodes.map.create({ height: 400 });

  // Insert at the specified position
  const tr = state.tr.insert(insertPos, mapNode);
  view.dispatch(tr);

  console.log('[Main] Inserted map block at position:', insertPos);

  // Scroll to show the inserted map
  const editorContainer = document.getElementById('editor-container');
  if (editorContainer) {
    requestAnimationFrame(() => {
      try {
        // Get coordinates of the inserted map position
        const coords = view.coordsAtPos(insertPos);
        if (coords) {
          const containerRect = editorContainer.getBoundingClientRect();
          // If the map (400px height) extends below visible area, scroll down
          const mapBottom = coords.top + 400;
          if (mapBottom > containerRect.bottom - 20) {
            const scrollAmount = mapBottom - containerRect.bottom + 60;
            editorContainer.scrollTo({
              top: editorContainer.scrollTop + scrollAmount,
              behavior: 'smooth'
            });
          }
        }
      } catch (e) {
        // Ignore scroll errors
      }
    });
  }
}

/**
 * Create geo-mark for a location within the section bounds
 */
async function createGeoMarkInSection(
  view: EditorView,
  locationName: string,
  sectionStart: number,
  sectionEnd: number,
  colorIndex: number
): Promise<boolean> {
  // Check if position exists initially
  const initialPosition = findTextInRange(view.state.doc, locationName, sectionStart, sectionEnd);
  if (!initialPosition) {
    console.warn(`[GeoMark] Could not find "${locationName}" in section`);
    return false;
  }

  // Check if already marked
  if (hasGeoMarkAt(view.state.doc, initialPosition.from, initialPosition.to)) {
    console.log(`[GeoMark] "${locationName}" already has a geo-mark, skipping`);
    return false;
  }

  // Geocode the location
  const result = await geocodePlace(locationName);
  if (!result) {
    console.warn(`[GeoMark] Could not geocode: ${locationName}`);
    return false;
  }

  // Re-find the text position after async geocoding (document may have changed)
  const currentDoc = view.state.doc;
  let newFrom = -1;
  let newTo = -1;

  currentDoc.descendants((node, pos) => {
    if (newFrom !== -1) return false;
    if (node.isText && node.text) {
      const idx = node.text.indexOf(locationName);
      if (idx !== -1) {
        newFrom = pos + idx;
        newTo = pos + idx + locationName.length;
        return false;
      }
    }
    return true;
  });

  if (newFrom === -1) {
    console.warn(`[GeoMark] Could not find "${locationName}" after geocoding`);
    return false;
  }

  // Check again if already marked (may have changed)
  if (hasGeoMarkAt(currentDoc, newFrom, newTo)) {
    console.log(`[GeoMark] "${locationName}" already has a geo-mark (after geocoding), skipping`);
    return false;
  }

  // Create geo-mark (deterministic geoId in demo mode)
  const geoId = (isAutoplayMode || isRemoteControlMode)
    ? `geo-section-${colorIndex}`
    : `geo-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const mark = customSchema.marks.geoMark.create({
    geoId,
    displayText: locationName,
    placeName: result.placeName || locationName,
    lat: result.lat,
    lng: result.lng,
    colorIndex,
    coordSource: (isAutoplayMode || isRemoteControlMode) ? 'demo' : 'nominatim'
  });

  const tr = view.state.tr.addMark(newFrom, newTo, mark);
  view.dispatch(tr);

  console.log(`[GeoMark] Created: ${locationName} @ ${result.lat}, ${result.lng}`);
  return true;
}

/**
 * Insert a map block with automatic geo-marking of locations in the section above
 */
async function insertMapWithAutoGeoMark(view: EditorView): Promise<void> {
  const { state } = view;
  const insertPos = state.doc.content.size;

  // 1. Extract text from section above
  const { text, startPos, endPos } = extractSectionText(state.doc, insertPos);
  console.log('[InsertMap] Section text:', text);

  if (!text.trim()) {
    // No text to process, just insert map
    insertMapNode(view, insertPos);
    notifyGeoMarkChange();
    return;
  }

  // 2. Extract locations using pattern matching
  const locations = extractLocationsFromText(text);
  console.log('[InsertMap] Found locations:', locations);

  if (locations.length === 0) {
    // No locations found, just insert map
    insertMapNode(view, insertPos);
    notifyGeoMarkChange();
    return;
  }

  // 3. Geocode and create geo-marks for each location
  let createdCount = 0;
  for (let i = 0; i < locations.length; i++) {
    const locationName = locations[i];
    const created = await createGeoMarkInSection(view, locationName, startPos, endPos, i);
    if (created) createdCount++;
  }

  console.log(`[InsertMap] Created ${createdCount} geo-marks`);

  // 4. Insert the map node (get fresh state after modifications)
  insertMapNode(view, view.state.doc.content.size);

  // 5. Notify change listeners (maps will auto-update)
  notifyGeoMarkChange();
}

// Legacy function name for compatibility
function insertMap(view: EditorView) {
  insertMapWithAutoGeoMark(view);
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

  // Initialize voice draft sheet
  initializeVoiceDraftSheet();
});

// Start the application
main().catch((error) => {
  console.error('[Main] Initialization error:', error);
  updateStatus(`Error: ${error.message}`, 'disconnected');
});
