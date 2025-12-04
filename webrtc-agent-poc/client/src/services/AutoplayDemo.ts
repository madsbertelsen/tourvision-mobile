/**
 * AutoplayDemo - Self-playing demo animations for landing page showcases
 *
 * Reusable system that plays scripted actions in a loop:
 * - Typing text with realistic delays
 * - Headings (h1, h2, h3)
 * - Simulated cursor/caret with awareness integration
 * - Geocoding simulation (type -> search -> mark)
 * - Custom actions (geo-marks, maps, etc.)
 */

import { TextSelection } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';

// Action types for demo scripts
export type DemoAction =
  | { type: 'type'; text: string; speed?: 'slow' | 'normal' | 'fast' }
  | { type: 'pause'; duration: number }
  | { type: 'clear' }
  | { type: 'heading'; level: 1 | 2 | 3; text: string }
  | { type: 'geomark'; text: string; lat: number; lng: number } // Find text and create geo-mark directly
  | { type: 'geocode'; placeName: string; lat: number; lng: number } // Simulates geocoding process (types + marks)
  | { type: 'insertMap' }
  | { type: 'newline'; count?: number }
  | { type: 'moveCursor'; position: 'end' | 'start' | number }
  | { type: 'showCursor'; userName: string; color: string } // Show a simulated remote cursor
  | { type: 'hideCursor' } // Hide simulated remote cursor
  | { type: 'select'; text: string } // Select text in the document
  | { type: 'clickToolbar'; button: 'geomark' | 'map'; lat?: number; lng?: number } // Simulate toolbar click
  | { type: 'comment'; text: string; heading?: string; duration?: number; step?: number } // Product explainer commentary with typewriter effect
  | { type: 'openFullscreenMap' } // Open fullscreen map view
  | { type: 'closeFullscreenMap' } // Close fullscreen map view
  | { type: 'scroll'; to: 'top' | 'bottom' | 'firstMap' | 'secondMap' } // Scroll Alice's editor
  | { type: 'panMap'; direction: 'up' | 'down' | 'left' | 'right'; distance?: number } // Pan Alice's fullscreen map
  | { type: 'zoomMap'; direction: 'in' | 'out'; amount?: number } // Zoom Alice's fullscreen map
  | { type: 'clickMapMarker'; markerIndex: number } // Click a marker on the fullscreen map (0-based index)
  | { type: 'addWaypoint'; destGeoId: string; lat: number; lng: number } // Add a waypoint to a route
  | { type: 'fingerTapMapCoords'; lat: number; lng: number; fromSide?: 'left' | 'right' | 'bottom'; persist?: boolean } // Finger tap on map at lat/lng coordinates
  | { type: 'fingerTapRoute'; fraction?: number; fromSide?: 'left' | 'right' | 'bottom'; persist?: boolean } // Finger tap on route at fraction (0-1, default 0.5)
  | { type: 'showFingerTap'; selector: string; fromSide?: 'left' | 'right' | 'bottom'; persist?: boolean } // Show finger animation tapping on element
  | { type: 'hideFinger' } // Hide the finger (for ending persisted finger sequences)
  | { type: 'clickElement'; selector: string } // Click an element by selector
  | { type: 'fingerDrag'; selector: string; direction: 'up' | 'down' | 'left' | 'right'; distance?: number } // Drag with finger on element
  | { type: 'showAvatar'; name: string; color: string } // Show a user avatar
  | { type: 'clearAvatars' } // Clear all demo avatars
  | { type: 'showRemoteCursor'; userName: string; color: string; position?: 'start' | 'middle' | 'end' } // Show a remote user's cursor
  | { type: 'moveRemoteCursor'; position: 'start' | 'middle' | 'end'; duration?: number } // Animate cursor to position
  | { type: 'hideRemoteCursor' } // Hide the remote cursor
  | { type: 'showRemoteMapBounds'; clientId: number; userName: string; color: string; bounds: { north: number; south: number; east: number; west: number } } // Show remote user's map viewport overlay
  | { type: 'moveRemoteMapBounds'; bounds: { north: number; south: number; east: number; west: number }; duration?: number } // Animate map bounds overlay
  | { type: 'hideRemoteMapBounds' } // Hide the map bounds overlay
  // Bob actions (for dual-phone Share demo - sent to second phone)
  | { type: 'bobScroll'; target: 'firstMap' | 'secondMap' | number } // Scroll Bob's editor to a target
  | { type: 'bobFingerTap'; selector: string; fromSide?: 'left' | 'right' | 'bottom' } // Show finger tap on Bob's phone
  | { type: 'bobOpenFullscreenMap' } // Open fullscreen map on Bob's phone
  | { type: 'bobCloseFullscreenMap' } // Close fullscreen map on Bob's phone
  | { type: 'bobPanMap'; direction: 'up' | 'down' | 'left' | 'right'; distance?: number } // Pan Bob's fullscreen map
  | { type: 'bobZoomMap'; direction: 'in' | 'out'; amount?: number } // Zoom Bob's fullscreen map
  // Finger text selection actions
  | { type: 'fingerSelect'; text: string; fromSide?: 'left' | 'right' | 'bottom' } // Double-tap to select text, show handles
  | { type: 'dragSelectionHandle'; handle: 'start' | 'end'; toText: string } // Drag selection handle to expand/shrink
  // Context menu actions
  | { type: 'showContextMenu'; position?: 'above' | 'below' } // Show context menu at current selection
  | { type: 'tapContextMenuItem'; item: 'geomark' | 'map' | 'h1' | 'h2' | 'paragraph' | 'share' } // Tap a context menu item
  | { type: 'fingerTapButton'; button: 'geomark' | 'map' | 'h1' | 'h2' | 'share' } // Tap a toolbar button with finger animation
  | { type: 'fingerDoubleTap'; target: 'cursor' | 'endOfDoc'; fromSide?: 'left' | 'right' | 'bottom' } // Double-tap at cursor or end of document
  | { type: 'fingerScroll'; direction: 'up' | 'down'; distance?: number; fromSide?: 'left' | 'right' | 'bottom' } // Scroll editor with finger swipe
  // Share modal actions
  | { type: 'showShareModal' } // Show the share modal with URL
  | { type: 'tapCopyUrl' } // Tap the copy button to copy the share URL
  | { type: 'tapFollowCopyUrl' } // Tap the copy button for "View my screen" follow URL
  | { type: 'hideShareModal' } // Hide the share modal
  // Chapter state setup (for independent chapters)
  | { type: 'setupChapterState'; state: 'empty' | 'saturday-content' | 'saturday-with-map' | 'saturday-with-route' | 'full-content'; step?: number } // Setup document state for chapter
  // Video call actions
  | { type: 'showVideoCall' } // Show simulated video call overlay (Alice's phone)
  | { type: 'hideVideoCall' } // Hide video call overlay
  | { type: 'bobShowVideoCall' } // Show video call on Bob's phone
  | { type: 'bobHideVideoCall' } // Hide video call on Bob's phone
  // Debug/test actions
  | { type: 'drawTestLines'; startX: number; startY: number; endX: number; endY: number; duration?: number }; // Draw red line (screen coords) and blue line (geo coords)

export interface DemoScript {
  name: string;
  actions: DemoAction[];
  loopDelay?: number; // Delay before restarting (default 3000ms)
  userName?: string; // Name shown for the typing cursor
  userColor?: string; // Color for the cursor
}

/**
 * Playback control options - parsed from query params
 * Example URLs:
 *   ?autoplay=true&demo=maps&stopAt=10       - Stop after action index 10
 *   ?autoplay=true&demo=maps&stopAfter=insertMap  - Stop after first insertMap action
 *   ?autoplay=true&demo=maps&stopAfter=geomark:2  - Stop after 2nd geomark action
 */
export interface PlaybackOptions {
  stopAt?: number;        // Stop after action at this index (0-based)
  stopAfter?: string;     // Stop after action type, e.g., "insertMap" or "geomark:2" (2nd occurrence)
  noLoop?: boolean;       // Don't loop after completion
}

/**
 * Parse playback options from URL query params
 */
export function parsePlaybackOptions(): PlaybackOptions {
  const params = new URLSearchParams(window.location.search);
  const options: PlaybackOptions = {};

  const stopAt = params.get('stopAt');
  if (stopAt !== null) {
    options.stopAt = parseInt(stopAt, 10);
  }

  const stopAfter = params.get('stopAfter');
  if (stopAfter !== null) {
    options.stopAfter = stopAfter;
  }

  if (params.has('noLoop')) {
    options.noLoop = true;
  }

  return options;
}

// ===== Composed Demo Types (for multi-section demos) =====

// Section definition - references an existing script by name
export interface DemoSection {
  scriptName: string;  // Reference to DEMO_SCRIPTS key (e.g., 'maps', 'collab')
}

// Composed demo - multiple sections in sequence
export interface ComposedDemo {
  name: string;
  sections: DemoSection[];
}

// Pre-defined demo scripts for different landing page sections
export const DEMO_SCRIPTS: Record<string, DemoScript> = {
  collab: {
    name: 'Real-time Collaboration',
    loopDelay: 2500,
    userName: 'Sarah',
    userColor: '#3B82F6',
    actions: [
      // Intro comment (chapter heading + description)
      { type: 'comment', heading: 'Real-time Collaboration', text: 'Edit together and see each other\'s cursors live', duration: 2000 },

      // Demo actions
      { type: 'showCursor', userName: 'Sarah', color: '#3B82F6' },
      { type: 'heading', level: 1, text: 'Japan Trip 2024' },
      { type: 'pause', duration: 600 },
      { type: 'newline' },
      { type: 'heading', level: 2, text: 'Day 1: Tokyo' },
      { type: 'newline' },
      { type: 'type', text: 'Arrive at Narita Airport in the morning.', speed: 'normal' },
      { type: 'newline' },
      { type: 'type', text: 'Take the Narita Express to Shinjuku.', speed: 'normal' },
      { type: 'pause', duration: 800 },
      { type: 'newline', count: 2 },
      { type: 'heading', level: 2, text: 'Day 2: Kyoto' },
      { type: 'newline' },
      { type: 'type', text: 'Shinkansen from Tokyo Station (2 hours).', speed: 'normal' },
      { type: 'newline' },
      { type: 'type', text: 'Visit Fushimi Inari and Kinkaku-ji.', speed: 'normal' },
      { type: 'pause', duration: 1500 },
      { type: 'hideCursor' },
      { type: 'pause', duration: 500 },
      { type: 'clear' },
    ]
  },

  geomarks: {
    name: 'Location Tagging',
    loopDelay: 2500,
    userName: 'Marco',
    userColor: '#10B981',
    actions: [
      { type: 'showCursor', userName: 'Marco', color: '#10B981' },
      { type: 'heading', level: 1, text: 'Italy Road Trip' },
      { type: 'pause', duration: 400 },
      { type: 'newline' },
      { type: 'type', text: '1. ', speed: 'fast' },
      { type: 'geocode', placeName: 'Rome', lat: 41.9028, lng: 12.4964 },
      { type: 'type', text: ' - Colosseum', speed: 'normal' },
      { type: 'newline' },
      { type: 'type', text: '2. ', speed: 'fast' },
      { type: 'geocode', placeName: 'Florence', lat: 43.7696, lng: 11.2558 },
      { type: 'type', text: ' - Renaissance art', speed: 'normal' },
      { type: 'newline' },
      { type: 'type', text: '3. ', speed: 'fast' },
      { type: 'geocode', placeName: 'Venice', lat: 45.4408, lng: 12.3155 },
      { type: 'type', text: ' - Grand Canal', speed: 'normal' },
      { type: 'pause', duration: 500 },
      { type: 'newline', count: 2 },
      { type: 'insertMap' },
      { type: 'pause', duration: 3000 },
      { type: 'hideCursor' },
      { type: 'pause', duration: 500 },
      { type: 'clear' },
    ]
  },

  maps: {
    name: 'Interactive Maps',
    loopDelay: 2500,
    userName: 'Emma',
    userColor: '#EC4899',
    actions: [
      // Clear any previous avatars and show Emma
      { type: 'clearAvatars' },
      { type: 'showAvatar', name: 'Emma', color: '#EC4899' },

      // Step 0: Writing - starts with empty document
      { type: 'setupChapterState', state: 'empty', step: 0 },
      { type: 'comment', heading: 'Writing', text: 'Just type - like any other doc', duration: 2000, step: 0 },

      // Demo: Emma proposes a weekend trip to friends
      { type: 'showCursor', userName: 'Emma', color: '#EC4899' },

      // Main heading - type then select and format via context menu
      { type: 'type', text: 'Weekend in Denmark?', speed: 'normal' },
      { type: 'fingerSelect', text: 'Weekend in Denmark?', fromSide: 'right' },
      { type: 'pause', duration: 400 },
      { type: 'showContextMenu' },
      { type: 'pause', duration: 400 },
      { type: 'tapContextMenuItem', item: 'h1' },
      { type: 'pause', duration: 300 },
      { type: 'newline' },
      { type: 'type', text: 'Hey guys! What do you think about this plan:', speed: 'normal' },
      { type: 'pause', duration: 600 },

      { type: 'newline' },
      { type: 'newline' },

      // ===== Day 1: Saturday (complete section) =====
      { type: 'type', text: 'Saturday', speed: 'normal' },
      { type: 'fingerSelect', text: 'Saturday', fromSide: 'right' },
      { type: 'pause', duration: 400 },
      { type: 'showContextMenu' },
      { type: 'pause', duration: 400 },
      { type: 'tapContextMenuItem', item: 'h2' },
      { type: 'pause', duration: 200 },
      { type: 'newline' },
      { type: 'type', text: 'Explore Copenhagen and visit Tivoli Gardens', speed: 'normal' },
      { type: 'pause', duration: 500 },
      { type: 'newline', count: 2 },

      // Step 1: Location Tagging - text exists, will create geomarks
      { type: 'setupChapterState', state: 'saturday-content', step: 1 },
      { type: 'comment', heading: 'Location Tagging', text: 'Double-tap text to create geo-marks', duration: 2000, step: 1 },

      // Create geo-mark for Copenhagen via context menu
      { type: 'fingerSelect', text: 'Copenhagen', fromSide: 'right' },
      { type: 'pause', duration: 500 },
      { type: 'showContextMenu' },
      { type: 'pause', duration: 400 },
      { type: 'tapContextMenuItem', item: 'geomark' },
      { type: 'pause', duration: 600 },

      // Create geo-mark for Tivoli Gardens via context menu
      { type: 'fingerSelect', text: 'Tivoli Gardens', fromSide: 'right' },
      { type: 'pause', duration: 500 },
      { type: 'showContextMenu' },
      { type: 'pause', duration: 400 },
      { type: 'tapContextMenuItem', item: 'geomark' },
      { type: 'pause', duration: 800 },

      // Insert Saturday map via context menu (double-tap on empty line)
      { type: 'fingerDoubleTap', target: 'endOfDoc', fromSide: 'bottom' },
      { type: 'pause', duration: 400 },
      { type: 'showContextMenu' },
      { type: 'pause', duration: 400 },
      { type: 'tapContextMenuItem', item: 'map' },
      { type: 'pause', duration: 600 },

      // Scroll down to see the map that was just inserted
   //   { type: 'fingerScroll', direction: 'up', distance: 300, fromSide: 'right' },
//      { type: 'pause', duration: 400 },

      // Step 2: Fullscreen Map - geomarks and map exist
      { type: 'setupChapterState', state: 'saturday-with-map', step: 2 },
      { type: 'comment', heading: 'Fullscreen Map', text: 'Click any map to expand and explore', duration: 2000, step: 2 },

      // Finger taps on block map to open fullscreen (start sequence with persist)
      { type: 'showFingerTap', selector: '.prosemirror-map', fromSide: 'right', persist: true },
      { type: 'openFullscreenMap' },
      { type: 'pause', duration: 800 },

      // Pan the map up so markers are in upper half of screen
      { type: 'fingerDrag', selector: '#fullscreen-map', direction: 'up', distance: 180 },
      { type: 'pause', duration: 500 },

      // Click marker to show location details (finger moves to marker)
      { type: 'showFingerTap', selector: '#fullscreen-overlay .mapboxgl-marker:nth-of-type(2)', fromSide: 'bottom', persist: true },
      { type: 'clickMapMarker', markerIndex: 1 }, // Actually click to open sheet
      { type: 'pause', duration: 1000 }, // Let location sheet appear

      // Step 3: Transport - needs fullscreen map with location sheet open
      { type: 'setupChapterState', state: 'saturday-with-map', step: 3 },
      { type: 'comment', heading: 'Transport', text: 'Add routes between locations', duration: 2000, step: 3 },

      // Tap Configure Transport (finger moves to button)
      { type: 'showFingerTap', selector: '#transport-config-btn', fromSide: 'right', persist: true },
//      { type: 'clickElement', selector: '#transport-config-btn' }, // Actually click to expand
      { type: 'pause', duration: 1000 }, // Let it expand

      // Tap Copenhagen as the origin (finger moves to chip)
      { type: 'showFingerTap', selector: '.source-location-chip', fromSide: 'right', persist: true },
//      { type: 'clickElement', selector: '.source-location-chip' }, // Select Copenhagen
      { type: 'pause', duration: 1500 },

      // Tap Walking as the transport mode (finger moves to button)
      { type: 'showFingerTap', selector: '.transport-mode-btn:first-of-type', fromSide: 'bottom', persist: true },
 //     { type: 'clickElement', selector: '.transport-mode-btn:first-of-type' }, // Select Walking
      { type: 'pause', duration: 1500 }, // Show the final result

      // Tap X button to dismiss location sheet
      { type: 'showFingerTap', selector: '#location-sheet-close-btn', fromSide: 'right', persist: true },
      { type: 'clickElement', selector: '#location-sheet-close-btn' }, // Dismiss sheet
      { type: 'pause', duration: 600 },

      // Tap X button in top-right to exit fullscreen map (shows user how to close)
      { type: 'showFingerTap', selector: '#fullscreen-overlay .close-btn', fromSide: 'left' }, // Final tap - no persist
      { type: 'closeFullscreenMap' },
      { type: 'pause', duration: 500 },
      { type: 'newline' },

      // Step 4: Share - Alice shares her screen with Bob (with route from Step 3)
      { type: 'setupChapterState', state: 'saturday-with-route', step: 4 },
      // Tap the Share button to show the share modal
      { type: 'fingerTapButton', button: 'share' },
      { type: 'pause', duration: 300 },
      { type: 'showShareModal' },
      { type: 'pause', duration: 800 },

      // Tap the "View my screen" copy button
      { type: 'tapFollowCopyUrl' },
      { type: 'pause', duration: 1500 },

      // Hide the share modal
      { type: 'hideShareModal' },
      { type: 'pause', duration: 400 },

      // Show the step comment - Bob is now following Alice's screen
      { type: 'comment', heading: 'Share', text: 'Bob is following your screen', duration: 2000, step: 4 },
      { type: 'pause', duration: 400 },

      // Bob's avatar appears in Alice's toolbar (he joined via follow link!)
      { type: 'showAvatar', name: 'Bob', color: '#3b82f6' },
      { type: 'pause', duration: 1000 },

      // Alice scrolls down to the first map - Bob's view follows automatically
      { type: 'scroll', to: 'firstMap' },
      { type: 'pause', duration: 800 },

      // Alice taps on the map to open fullscreen - Bob sees it too
      { type: 'showFingerTap', selector: '.prosemirror-map', fromSide: 'right' },
      { type: 'openFullscreenMap' },
      { type: 'pause', duration: 1000 },

      // Alice zooms in - Bob's map follows
      { type: 'zoomMap', direction: 'in' },
      { type: 'pause', duration: 600 },

      // Alice pans around - Bob sees the same view
      { type: 'panMap', direction: 'left', distance: 80 },
      { type: 'pause', duration: 500 },
      { type: 'panMap', direction: 'up', distance: 60 },
      { type: 'pause', duration: 500 },

      // Alice zooms in more
      { type: 'zoomMap', direction: 'in' },
      { type: 'pause', duration: 600 },

      // Alice pans right
      { type: 'panMap', direction: 'right', distance: 100 },
      { type: 'pause', duration: 1500 },

      // Close fullscreen map before video call
      { type: 'closeFullscreenMap' },
      { type: 'pause', duration: 500 },

      // Step 5: Video Call - Alice and Bob discuss the trip
      { type: 'setupChapterState', state: 'saturday-with-route', step: 5 },
      { type: 'comment', heading: 'Video Call', text: 'Discuss your trip together', duration: 2000, step: 5 },

      // Show video call overlay on both phones
      { type: 'showVideoCall' },
      { type: 'bobShowVideoCall' },
      { type: 'pause', duration: 4000 },

      // Hide video call to end the demo
      { type: 'hideVideoCall' },
      { type: 'bobHideVideoCall' },
      { type: 'pause', duration: 1000 },

    ]
  },

  // Simple test demo for debugging button tap active states
  btnTest: {
    name: 'Button Tap Test',
    loopDelay: 0, // No loop
    userName: 'Test',
    userColor: '#3B82F6',
    actions: [
      { type: 'pause', duration: 1000 },
      { type: 'showFingerTap', selector: '#heading1-btn', fromSide: 'bottom' },
      { type: 'pause', duration: 2000 },
      { type: 'showFingerTap', selector: '#heading2-btn', fromSide: 'bottom' },
      { type: 'pause', duration: 2000 },
      { type: 'showFingerTap', selector: '#paragraph-btn', fromSide: 'bottom' },
      { type: 'pause', duration: 2000 },
    ]
  },

  // Test demo for finger text selection
  fingerSelectTest: {
    name: 'Finger Selection Test',
    loopDelay: 0, // No loop
    userName: 'Test',
    userColor: '#10B981',
    actions: [
      // Type some content first
      { type: 'showCursor', userName: 'Test', color: '#10B981' },
      { type: 'heading', level: 1, text: 'Copenhagen Trip' },
      { type: 'newline' },
      { type: 'type', text: 'Visit Copenhagen and then head to Denmark for more adventures.', speed: 'fast' },
      { type: 'newline', count: 2 },
      { type: 'pause', duration: 1000 },

      // Double-tap to select "Copenhagen"
      { type: 'fingerSelect', text: 'Copenhagen', fromSide: 'right' },
      { type: 'pause', duration: 800 },

      // Show context menu and tap "Create Geo Mark"
      { type: 'showContextMenu' },
      { type: 'pause', duration: 600 },
      { type: 'tapContextMenuItem', item: 'geomark' },
      { type: 'pause', duration: 1000 },

      // Double-tap to select "Denmark"
      { type: 'fingerSelect', text: 'Denmark', fromSide: 'right' },
      { type: 'pause', duration: 800 },

      // Show context menu and tap "Create Geo Mark"
      { type: 'showContextMenu' },
      { type: 'pause', duration: 600 },
      { type: 'tapContextMenuItem', item: 'geomark' },
      { type: 'pause', duration: 1000 },

      // Double-tap on new line (at end of document) to insert map
      { type: 'fingerDoubleTap', target: 'endOfDoc', fromSide: 'bottom' },
      { type: 'pause', duration: 500 },
      { type: 'showContextMenu' },
      { type: 'pause', duration: 600 },
      { type: 'tapContextMenuItem', item: 'map' },
      { type: 'pause', duration: 2500 },

      // Clean up
      { type: 'hideFinger' },
      { type: 'hideCursor' },
      { type: 'pause', duration: 500 },
      { type: 'clear' },
    ]
  },

  // Collaboration demo that starts with a document containing a block map
  // Used for landing-collab.html with dual phones showing Alice and Bob
  collabMap: {
    name: 'Collaborative Map Demo',
    loopDelay: 3000,
    userName: 'Alice',
    userColor: '#EC4899',
    actions: [
      // Start with document containing geomarks and map
      { type: 'setupChapterState', state: 'saturday-with-map', step: 0 },

      // Open fullscreen map immediately
      { type: 'openFullscreenMap' },
      { type: 'pause', duration: 800 },

      // Draw test lines (red=screen coords, blue=geo coords) - vertical line test
      { type: 'drawTestLines', startX: 50, startY: 100, endX: 50, endY: 250, duration: 999999 },
      { type: 'pause', duration: 500 },

      // Finger drag downward (same path as test line)
      { type: 'fingerDrag', selector: '#fullscreen-map', direction: 'down', distance: 150 },
      { type: 'pause', duration: 500 },

      // Click Tivoli marker to open location sheet
      { type: 'clickMapMarker', markerIndex: 1 },
      { type: 'pause', duration: 1000 }, // Wait for location sheet to appear

      // Tap Configure Transport button (showFingerTap triggers click)
      { type: 'showFingerTap', selector: '#transport-config-btn', fromSide: 'right', persist: true },
      { type: 'pause', duration: 800 }, // Wait for transport config to expand

      // Tap source location (Copenhagen - first chip)
      { type: 'showFingerTap', selector: '.source-location-chip', fromSide: 'bottom', persist: true },
      { type: 'pause', duration: 800 },

      // Tap Walking transport mode (first button)
      { type: 'showFingerTap', selector: '.transport-mode-btn:first-of-type', fromSide: 'bottom', persist: true },
      { type: 'pause', duration: 1500 }, // Show the walking route result

      // Hide finger and close the location sheet to see the full map
      { type: 'hideFinger' },
      { type: 'showFingerTap', selector: '#location-sheet-close-btn', fromSide: 'left', persist: false },
      { type: 'pause', duration: 800 }, // Wait for sheet to close

      // Tap on the route to add a waypoint (at midpoint of route geometry)
      // Uses fingerTapRoute to get coordinates dynamically from the route line
      { type: 'fingerTapRoute', fraction: 0.5, fromSide: 'bottom', persist: true },
      { type: 'pause', duration: 2000 }, // Show the route with waypoint on full map
    ]
  }
};

// Pre-defined composed demos (multi-section demos)
// Note: Intros are now handled via inline 'comment' actions in each script
export const COMPOSED_DEMOS: Record<string, ComposedDemo> = {
  fullDemo: {
    name: 'TourVision Features',
    sections: [
      { scriptName: 'maps' },
      { scriptName: 'collab' }
    ]
  }
};

/**
 * AutoplayDemo - Plays demo scripts in the editor
 */
export class AutoplayDemo {
  private view: EditorView;
  private script: DemoScript;
  private awareness: any;
  private isPlaying = false;
  private isPaused = false;
  private pendingStepCallback: (() => void) | null = null;
  private currentActionIndex = 0;
  private timeoutId: number | null = null;
  private colorIndex = 0;
  private options: PlaybackOptions;
  private actionTypeCounts: Map<string, number> = new Map(); // Track occurrences of each action type
  private remoteControlMode = false; // When true, parent controls overlay display
  private stepMode = false; // When true, pause after each action (for manual stepping)
  private stepModeCallback: (() => void) | null = null; // Callback to call after action completes in step mode

  // Callbacks for custom actions
  public onGeoMark?: (placeName: string, lat: number, lng: number, colorIndex: number) => void;
  public onInsertMap?: () => Promise<void> | void;
  public onHeading?: (level: 1 | 2 | 3, text: string) => void;
  public onSetHeadingLevel?: (level: 1 | 2 | 3) => void; // Set current block to heading (for typewriter animation)
  public onNewline?: () => void; // Create new paragraph block
  public onType?: (char: string) => void; // Type a character into the last paragraph
  public onSelect?: (text: string) => { from: number; to: number } | null; // Select text, return positions
  public onClickToolbar?: (button: 'geomark' | 'map', lat?: number, lng?: number) => void; // Toolbar click
  public onLoopComplete?: () => void; // Called when script completes one full loop (for composed mode)
  public onPlaybackStopped?: () => void; // Called when playback stops due to stopAt/stopAfter
  public onOpenFullscreenMap?: () => void; // Open fullscreen map view
  public onCloseFullscreenMap?: () => void; // Close fullscreen map view
  public onScroll?: (to: 'top' | 'bottom' | 'firstMap' | 'secondMap') => void; // Scroll Alice's editor
  public onPanMap?: (direction: 'up' | 'down' | 'left' | 'right', distance: number) => void; // Pan Alice's fullscreen map
  public onZoomMap?: (direction: 'in' | 'out', amount: number) => void; // Zoom Alice's fullscreen map
  public onClickMapMarker?: (markerIndex: number) => void; // Click a marker on fullscreen map
  public onAddWaypoint?: (destGeoId: string, lat: number, lng: number) => void; // Add a waypoint to a route
  public onFingerTapMapCoords?: (lat: number, lng: number, fromSide: 'left' | 'right' | 'bottom', persist?: boolean) => Promise<void>; // Finger tap on map at lat/lng
  public onFingerTapRoute?: (fraction: number, fromSide: 'left' | 'right' | 'bottom', persist?: boolean) => Promise<void>; // Finger tap on route at fraction (gets coords from route geometry)
  public onShowFingerTap?: (selector: string, fromSide: 'left' | 'right' | 'bottom', persist?: boolean) => Promise<void>; // Show finger tap animation
  public onHideFinger?: () => void; // Hide the finger (for ending persisted sequences)
  public onClickElement?: (selector: string) => void; // Click an element by selector
  public onFastClick?: (selector: string) => void; // Fast click without animation (for fast-forward mode)
  public onFingerDrag?: (selector: string, direction: 'up' | 'down' | 'left' | 'right', distance: number) => Promise<void>; // Drag finger on element
  public onShowAvatar?: (name: string, color: string) => void; // Show a user avatar
  public onClearAvatars?: () => void; // Clear all demo avatars
  public onShowRemoteCursor?: (userName: string, color: string, position: 'start' | 'middle' | 'end') => void; // Show remote cursor
  public onMoveRemoteCursor?: (position: 'start' | 'middle' | 'end', duration: number) => Promise<void>; // Move remote cursor
  public onHideRemoteCursor?: () => void; // Hide remote cursor
  public onShowRemoteMapBounds?: (clientId: number, userName: string, color: string, bounds: { north: number; south: number; east: number; west: number }) => void; // Show remote map bounds overlay
  public onMoveRemoteMapBounds?: (bounds: { north: number; south: number; east: number; west: number }, duration: number) => Promise<void>; // Animate map bounds
  public onHideRemoteMapBounds?: () => void; // Hide map bounds overlay
  // Finger text selection callbacks
  public onFingerSelect?: (text: string, fromSide: 'left' | 'right' | 'bottom') => Promise<void>; // Double-tap to select text, show handles
  public onDragSelectionHandle?: (handle: 'start' | 'end', toText: string) => Promise<void>; // Drag selection handle to expand/shrink
  // Context menu callbacks
  public onShowContextMenu?: (position: 'above' | 'below') => Promise<void>; // Show context menu at selection
  public onTapContextMenuItem?: (item: 'geomark' | 'map' | 'h1' | 'h2' | 'paragraph' | 'share') => Promise<void>; // Tap a toolbar/menu item
  public onFingerDoubleTap?: (target: 'cursor' | 'endOfDoc', fromSide: 'left' | 'right' | 'bottom') => Promise<void>; // Double-tap at position
  public onFingerScroll?: (direction: 'up' | 'down', distance: number, fromSide: 'left' | 'right' | 'bottom') => Promise<void>; // Scroll with finger swipe
  public onDrawTestLines?: (startX: number, startY: number, endX: number, endY: number, duration?: number) => Promise<void>; // Draw test lines (red screen coords, blue geo coords)
  // Share modal callbacks
  public onShowShareModal?: () => void; // Show share modal
  public onTapCopyUrl?: () => Promise<void>; // Tap copy button (trip link)
  public onTapFollowCopyUrl?: () => Promise<void>; // Tap copy button for "View my screen" follow URL
  public onHideShareModal?: () => void; // Hide share modal
  // Chapter state setup callback
  public onSetupChapterState?: (state: 'empty' | 'saturday-content' | 'saturday-with-map' | 'saturday-with-route' | 'full-content') => Promise<void>; // Setup document state
  // Video call callbacks
  public onShowVideoCall?: () => void; // Show video call overlay
  public onHideVideoCall?: () => void; // Hide video call overlay

  constructor(view: EditorView, scriptName: string = 'collab', awareness?: any, options?: PlaybackOptions) {
    this.view = view;
    this.script = DEMO_SCRIPTS[scriptName] || DEMO_SCRIPTS.collab;
    this.awareness = awareness;
    this.options = options || parsePlaybackOptions();

    // Check if running in remote control mode (controlled by parent DemoPlayer)
    const params = new URLSearchParams(window.location.search);
    this.remoteControlMode = params.get('remoteControl') === 'true' && window.parent !== window;

    if (this.remoteControlMode) {
      console.log(`[AutoplayDemo] Remote control mode enabled`);
      this.setupRemoteControlListener();
      // Notify parent that we're ready
      this.notifyParent({ type: 'demoReady' });
    }

    console.log(`[AutoplayDemo] Initialized with script: ${this.script.name}`, this.options);
  }

  /**
   * Setup listener for commands from parent DemoPlayer
   */
  private setupRemoteControlListener(): void {
    window.addEventListener('message', (event) => {
      const data = event.data;

      if (data.type === 'demoControl') {
        console.log(`[AutoplayDemo] Received control command: ${data.command}`);
        switch (data.command) {
          case 'start':
            this.start();
            break;
          case 'stop':
            this.stop();
            break;
          case 'pause':
            if (!this.isPaused) this.togglePause();
            break;
          case 'resume':
            if (this.isPaused) {
              // Check if there's a pending callback from showComment (remote mode)
              // If so, just clear pause state and call the callback - don't use togglePause
              // which would also call playNextAction() causing double-advancement
              if (this.pendingStepCallback) {
                this.isPaused = false;
                const callback = this.pendingStepCallback;
                this.pendingStepCallback = null;
                callback();
              } else {
                // Normal resume (no pending callback)
                this.togglePause();
              }
            }
            break;
          case 'resumeFromAction':
            // Resume playback from a specific action index (for chapter navigation)
            if (typeof data.actionIndex === 'number') {
              this.resumeFromAction(data.actionIndex);
            }
            break;
          case 'goToStep':
            // Jump to a specific step (chapter navigation without snapshot)
            if (typeof data.step === 'number') {
              this.goToStep(data.step);
            }
            break;
          case 'nextAction':
            // Execute just one action (for step mode)
            this.executeNextActionOnly();
            break;
          case 'setStepMode':
            // Enable/disable step mode
            this.stepMode = data.enabled === true;
            console.log(`[AutoplayDemo] Step mode ${this.stepMode ? 'enabled' : 'disabled'}`);
            break;
          case 'startFromAction':
            // Start playback from a specific action index (skipping previous actions)
            if (typeof data.actionIndex === 'number') {
              this.startFromAction(data.actionIndex);
            }
            break;
          case 'executeAction':
            // Execute a single action from the host (for host-controlled fast-forward)
            if (data.action && typeof data.actionIndex === 'number') {
              this.executeActionFromHost(data.action, data.actionIndex, data.fastForward === true);
            }
            break;
        }
      }
    });
  }

  /**
   * Send message to parent window (DemoPlayer)
   */
  private notifyParent(message: { type: string; [key: string]: any }): void {
    if (window.parent !== window) {
      window.parent.postMessage(message, '*');
    }
  }

  /**
   * Execute a single action from the host (for host-controlled fast-forward)
   * This allows the DemoPlayer to control fast-forward timing
   */
  private executeActionFromHost(action: DemoAction, actionIndex: number, fastForward: boolean): void {
    console.log(`[AutoplayDemo] Executing action from host: ${actionIndex} (${action.type}), fastForward=${fastForward}`);

    // Update currentActionIndex so subsequent nextAction commands continue from correct position
    // The next action to execute will be actionIndex + 1
    this.currentActionIndex = actionIndex + 1;

    // For setupChapterState, use the onSetupChapterState callback
    if (action.type === 'setupChapterState' && this.onSetupChapterState) {
      this.onSetupChapterState(action.state).then(() => {
        console.log(`[AutoplayDemo] setupChapterState ${action.state} complete`);
        this.notifyParent({ type: 'actionExecuted', actionIndex });
      });
      return;
    }

    // Use fast-forward execution (no animations) and notify host when complete
    this.executeFastForwardAction(action, () => {
      this.notifyParent({ type: 'actionExecuted', actionIndex });
    });
  }

  /**
   * Start the demo playback
   */
  start() {
    if (this.isPlaying) return;

    console.log('[AutoplayDemo] Starting playback');
    this.isPlaying = true;
    this.isPaused = false;
    this.currentActionIndex = 0;
    this.colorIndex = 0;
    this.actionTypeCounts.clear();

    // Clear previous demo state before starting fresh
    this.clearDemoState();

    this.clearDocument();

    // In step mode, don't auto-start - wait for user to click "Next"
    if (this.stepMode) {
      console.log('[AutoplayDemo] Step mode: ready at action 0, waiting for user to click Next');
      // Notify parent that we're ready at action 0
      this.notifyParent({
        type: 'demoActionComplete',
        actionIndex: -1, // Report -1 so button shows #0
        isLastAction: false
      });
      return;
    }

    this.playNextAction();
  }

  /**
   * Resume playback from a specific action index (for chapter navigation)
   * Document state should already be restored via snapshot before calling this
   */
  resumeFromAction(actionIndex: number) {
    // Stop any current playback
    if (this.timeoutId !== null) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }

    console.log(`[AutoplayDemo] Resuming from action index: ${actionIndex}`);
    this.isPlaying = true;
    this.isPaused = false;
    this.currentActionIndex = actionIndex;

    // Count action types up to this point (for stopAfter tracking)
    this.actionTypeCounts.clear();
    for (let i = 0; i < actionIndex; i++) {
      const action = this.script.actions[i];
      const count = (this.actionTypeCounts.get(action.type) || 0) + 1;
      this.actionTypeCounts.set(action.type, count);
    }

    // Clear visual demo state (cursors, overlays) before resuming
    this.clearDemoState();

    // Continue playback
    this.playNextAction();
  }

  /**
   * Start playback from a specific action index (for URL-based deep linking)
   * Finds and executes the most recent setupChapterState before the target action,
   * then fast-forwards through intermediate actions to restore UI state
   */
  startFromAction(actionIndex: number) {
    // Stop any current playback
    if (this.timeoutId !== null) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }

    console.log(`[AutoplayDemo] Starting from action index: ${actionIndex}`);

    // Find the most recent setupChapterState action at or before the target index
    let setupAction = null;
    let setupIndex = -1;
    for (let i = actionIndex; i >= 0; i--) {
      const action = this.script.actions[i];
      if (action.type === 'setupChapterState') {
        setupAction = action;
        setupIndex = i;
        break;
      }
    }

    // Clear previous demo state
    this.clearDemoState();
    this.clearDocument();

    // Fast-forward through actions from setupIndex+1 to actionIndex-1 to restore UI state
    const fastForwardActions = async (fromIndex: number, toIndex: number) => {
      console.log(`[AutoplayDemo] Fast-forwarding actions ${fromIndex} to ${toIndex - 1}`);

      // Enable fast-forward mode - skip pauses and use minimal delays
      const originalStepMode = this.stepMode;
      this.stepMode = false; // Disable step mode during fast-forward

      for (let i = fromIndex; i < toIndex; i++) {
        const action = this.script.actions[i];

        // Skip pause actions and comments during fast-forward
        if (action.type === 'pause' || action.type === 'comment') {
          continue;
        }

        // Skip setupChapterState - we already ran it
        if (action.type === 'setupChapterState') {
          continue;
        }

        console.log(`[AutoplayDemo] Fast-forward action ${i}: ${action.type}`);

        // Execute the action and wait for it to complete
        await this.executeActionAsync(action, i);

        // Small delay between actions to let UI settle
        await new Promise(resolve => setTimeout(resolve, 50));
      }

      // Restore step mode
      this.stepMode = originalStepMode;
      console.log(`[AutoplayDemo] Fast-forward complete, now at action ${toIndex}`);
    };

    // Helper to continue after setup and fast-forward
    const continueAfterSetup = async () => {
      // If there are intermediate actions to fast-forward through
      const startFastForward = setupIndex >= 0 ? setupIndex + 1 : 0;
      if (startFastForward < actionIndex) {
        await fastForwardActions(startFastForward, actionIndex);
      }

      // Now set up playback state
      this.isPlaying = true;
      this.isPaused = false;
      this.currentActionIndex = actionIndex;
      this.colorIndex = 0;

      // Count action types up to this point (for stopAfter tracking)
      this.actionTypeCounts.clear();
      for (let i = 0; i < actionIndex; i++) {
        const action = this.script.actions[i];
        const count = (this.actionTypeCounts.get(action.type) || 0) + 1;
        this.actionTypeCounts.set(action.type, count);
      }

      // In step mode, don't auto-start - wait for user to click "Next"
      if (this.stepMode) {
        console.log(`[AutoplayDemo] Step mode: ready at action ${actionIndex}, waiting for user to click Next`);
        // Notify parent that we're ready at this action
        this.notifyParent({
          type: 'demoActionComplete',
          actionIndex: actionIndex - 1, // Report previous action as complete so button shows correct next action
          isLastAction: false
        });
        return;
      }

      // Continue playback from the target action (auto mode only)
      this.playNextAction();
    };

    // If we found a setupChapterState, execute it via callback
    if (setupAction) {
      console.log(`[AutoplayDemo] Found setupChapterState at index ${setupIndex}: ${setupAction.state}`);
      // Execute the setup action to initialize document state
      if (this.onSetupChapterState) {
        this.onSetupChapterState(setupAction.state).then(async () => {
          console.log(`[AutoplayDemo] setupChapterState ${setupAction.state} complete, waiting for render...`);
          // Wait for document to fully render before fast-forwarding
          await new Promise(resolve => setTimeout(resolve, 500));
          console.log(`[AutoplayDemo] Fast-forwarding to action ${actionIndex}`);
          continueAfterSetup();
        });
      } else {
        console.warn('[AutoplayDemo] onSetupChapterState not configured, continuing without setup');
        continueAfterSetup();
      }
    } else {
      console.log('[AutoplayDemo] No setupChapterState found, starting with empty document');
      continueAfterSetup();
    }
  }

  /**
   * Execute a single action asynchronously (for fast-forward mode)
   * Returns a promise that resolves when the action is complete
   */
  private async executeActionAsync(action: DemoAction, actionIndex: number): Promise<void> {
    return new Promise((resolve) => {
      // Store current index and set to action index temporarily
      const originalIndex = this.currentActionIndex;
      this.currentActionIndex = actionIndex;

      // Execute the action using fast-forward logic with completion callback
      this.executeFastForwardAction(action, () => {
        this.currentActionIndex = originalIndex;
        resolve();
      });
    });
  }

  /**
   * Execute an action with a completion callback (for fast-forward)
   */
  private executeFastForwardAction(action: DemoAction, onComplete: () => void) {
    // Handle different action types for fast-forward mode
    switch (action.type) {
      case 'openFullscreenMap':
        if (this.onOpenFullscreenMap) {
          this.onOpenFullscreenMap();
        }
        // Fullscreen map needs time to render - wait longer
        setTimeout(onComplete, 800);
        break;

      case 'closeFullscreenMap':
        if (this.onCloseFullscreenMap) {
          this.onCloseFullscreenMap();
        }
        setTimeout(onComplete, 100);
        break;

      case 'clickMapMarker':
        if (this.onClickMapMarker && 'markerIndex' in action) {
          this.onClickMapMarker(action.markerIndex);
        }
        // Location sheet needs time to appear and render
        setTimeout(onComplete, 600);
        break;

      case 'addWaypoint':
        if (this.onAddWaypoint && 'destGeoId' in action && 'lat' in action && 'lng' in action) {
          this.onAddWaypoint(action.destGeoId, action.lat, action.lng);
        }
        setTimeout(onComplete, 100);
        break;

      case 'fingerTapMapCoords':
        // In fast-forward mode, call onAddWaypoint directly (the tap would trigger addWaypoint)
        // This is handled in the callback implementation
        if (this.onFingerTapMapCoords && 'lat' in action && 'lng' in action) {
          // Call synchronously with short delay
          const fromSide = action.fromSide || 'right';
          const persist = action.persist || false;
          this.onFingerTapMapCoords(action.lat, action.lng, fromSide, persist).then(() => {
            onComplete();
          });
        } else {
          setTimeout(onComplete, 100);
        }
        break;

      case 'fingerTapRoute':
        // Finger tap on route - gets coordinates from route geometry
        if (this.onFingerTapRoute) {
          const fraction = action.fraction ?? 0.5;
          const fromSide = action.fromSide || 'right';
          const persist = action.persist || false;
          this.onFingerTapRoute(fraction, fromSide, persist).then(() => {
            onComplete();
          });
        } else {
          setTimeout(onComplete, 100);
        }
        break;

      case 'showVideoCall':
        if (this.onShowVideoCall) {
          this.onShowVideoCall();
        }
        setTimeout(onComplete, 100);
        break;

      case 'hideVideoCall':
        if (this.onHideVideoCall) {
          this.onHideVideoCall();
        }
        setTimeout(onComplete, 100);
        break;

      case 'showFingerTap':
        // Use fast click without animation for fast-forward mode
        if (this.onFastClick && 'selector' in action) {
          this.onFastClick(action.selector);
        }
        // Wait for UI to respond to the click
        setTimeout(onComplete, 300);
        break;

      case 'hideFinger':
        if (this.onHideFinger) {
          this.onHideFinger();
        }
        setTimeout(onComplete, 50);
        break;

      case 'showAvatar':
        if (this.onShowAvatar && 'name' in action) {
          this.onShowAvatar(action.name, action.color);
        }
        setTimeout(onComplete, 50);
        break;

      case 'clearAvatars':
        if (this.onClearAvatars) {
          this.onClearAvatars();
        }
        setTimeout(onComplete, 50);
        break;

      case 'showCursor':
        // showCursor maps to onShowRemoteCursor
        if (this.onShowRemoteCursor && 'userName' in action) {
          this.onShowRemoteCursor(action.userName, action.color, 'start');
        }
        setTimeout(onComplete, 50);
        break;

      case 'fingerDrag':
        if (this.onFingerDrag && 'selector' in action && 'direction' in action && action.distance !== undefined) {
          this.onFingerDrag(action.selector, action.direction, action.distance);
        }
        setTimeout(onComplete, 100);
        break;

      case 'clickElement':
        if (this.onClickElement && 'selector' in action) {
          this.onClickElement(action.selector);
        }
        setTimeout(onComplete, 100);
        break;

      case 'showShareModal':
        if (this.onShowShareModal) {
          this.onShowShareModal();
        }
        setTimeout(onComplete, 100);
        break;

      case 'hideShareModal':
        if (this.onHideShareModal) {
          this.onHideShareModal();
        }
        setTimeout(onComplete, 100);
        break;

      case 'fingerScroll':
        if (this.onFingerScroll && 'direction' in action && action.distance !== undefined) {
          const scrollSide = action.fromSide || 'right';
          this.onFingerScroll(action.direction, action.distance, scrollSide);
        }
        setTimeout(onComplete, 100);
        break;

      default:
        // For actions not explicitly handled, complete immediately
        setTimeout(onComplete, 10);
        break;
    }
  }

  /**
   * Go to a specific step by finding the comment action for that step
   * and starting playback from there (clears document first)
   */
  goToStep(targetStep: number) {
    // Stop any current playback
    if (this.timeoutId !== null) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }

    console.log(`[AutoplayDemo] Going to step: ${targetStep}`);

    // Find the action index for the first action with this step number
    // Priority: setupChapterState with step > comment with step
    // setupChapterState makes chapters independent/shuffleable
    let actionIndex = 0;
    let foundSetup = false;

    // First, look for setupChapterState with matching step
    for (let i = 0; i < this.script.actions.length; i++) {
      const action = this.script.actions[i];
      if (action.type === 'setupChapterState' && 'step' in action && action.step === targetStep) {
        actionIndex = i;
        foundSetup = true;
        console.log(`[AutoplayDemo] Found setupChapterState for step ${targetStep} at action ${actionIndex}`);
        break;
      }
    }

    // Fall back to comment with matching step if no setupChapterState found
    if (!foundSetup) {
      for (let i = 0; i < this.script.actions.length; i++) {
        const action = this.script.actions[i];
        if (action.type === 'comment' && 'step' in action && action.step === targetStep) {
          actionIndex = i;
          console.log(`[AutoplayDemo] Found comment for step ${targetStep} at action ${actionIndex}`);
          break;
        }
      }
    }

    console.log(`[AutoplayDemo] Step ${targetStep} starts at action index: ${actionIndex}`);

    // Clear document and demo state
    this.clearDemoState();
    this.clearDocument();

    // Reset tracking
    this.isPlaying = true;
    this.isPaused = false;
    this.currentActionIndex = actionIndex;
    this.colorIndex = 0;
    this.actionTypeCounts.clear();

    // Start playback from that action
    this.playNextAction();
  }

  /**
   * Execute just the next action and then pause (for step mode)
   * This allows manual stepping through the demo action by action
   */
  executeNextActionOnly() {
    // If we've finished all actions, do nothing
    if (this.currentActionIndex >= this.script.actions.length) {
      console.log('[AutoplayDemo] No more actions to execute');
      this.notifyParent({
        type: 'demoActionComplete',
        actionIndex: this.currentActionIndex,
        isLastAction: true
      });
      return;
    }

    const action = this.script.actions[this.currentActionIndex];
    const actionIndex = this.currentActionIndex;
    this.currentActionIndex++;

    // Track action type occurrences
    const count = (this.actionTypeCounts.get(action.type) || 0) + 1;
    this.actionTypeCounts.set(action.type, count);

    console.log(`[AutoplayDemo] Step mode: executing action ${actionIndex}: ${action.type}`);

    // Set up step mode to pause after this action
    this.stepMode = true;
    this.isPlaying = true;
    this.isPaused = false;

    // Execute the action with a callback that pauses and notifies parent
    this.executeActionWithCallback(action, () => {
      console.log(`[AutoplayDemo] Step mode: action ${actionIndex} complete`);
      this.isPaused = true;
      this.notifyParent({
        type: 'demoActionComplete',
        actionIndex: actionIndex,
        actionType: action.type,
        isLastAction: this.currentActionIndex >= this.script.actions.length
      });
    });
  }

  /**
   * Execute an action with a custom completion callback (for step mode)
   */
  private executeActionWithCallback(action: DemoAction, onComplete: () => void) {
    // Store the callback to be called when action completes
    this.stepModeCallback = onComplete;

    // Execute the action using the normal method
    // The action will call playNextAction(), which will check stepMode
    // and call stepModeCallback instead of continuing playback
    this.executeAction(action);
  }

  /**
   * Clear all demo state from previous runs
   * This prevents ghost avatars, cursors, and map bounds from accumulating
   */
  private clearDemoState(): void {
    console.log('[AutoplayDemo] Clearing demo state');

    // Clear demo avatars via callback
    if (this.onClearAvatars) {
      this.onClearAvatars();
    }

    // Hide any remote cursor
    if (this.onHideRemoteCursor) {
      this.onHideRemoteCursor();
    }

    // Hide map bounds overlay
    if (this.onHideRemoteMapBounds) {
      this.onHideRemoteMapBounds();
    }

    // Hide finger animation
    if (this.onHideFinger) {
      this.onHideFinger();
    }

    // Close fullscreen map if open (also hides location sheet)
    if (this.onCloseFullscreenMap) {
      this.onCloseFullscreenMap();
    }

    // Hide share modal if open
    if (this.onHideShareModal) {
      this.onHideShareModal();
    }

    // Remove any demo highlight overlays
    document.querySelectorAll('.demo-selection-overlay').forEach(el => el.remove());

    // Remove any demo cursor elements
    document.querySelectorAll('.demo-yjs-cursor').forEach(el => el.remove());
  }

  /**
   * Stop the demo playback
   */
  stop() {
    console.log('[AutoplayDemo] Stopping playback');
    this.isPlaying = false;
    this.hideFakeCursor();
    if (this.timeoutId !== null) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
  }

  /**
   * Pause/resume playback
   */
  togglePause() {
    this.isPaused = !this.isPaused;
    if (!this.isPaused && this.isPlaying) {
      this.playNextAction();
    }
  }

  /**
   * Play the next action in the script
   */
  private playNextAction() {
    // In step mode with callback, call the callback instead of continuing
    if (this.stepMode && this.stepModeCallback) {
      const callback = this.stepModeCallback;
      this.stepModeCallback = null;
      callback();
      return;
    }

    if (!this.isPlaying || this.isPaused) return;

    // Loop back to start if we've finished
    if (this.currentActionIndex >= this.script.actions.length) {
      // If onLoopComplete is set (composed mode), call it and stop
      if (this.onLoopComplete) {
        console.log('[AutoplayDemo] Script complete, signaling composed player');
        this.onLoopComplete();
        this.stop();
        return;
      }

      // If noLoop option is set, stop
      if (this.options.noLoop) {
        console.log('[AutoplayDemo] Script complete (noLoop mode)');
        this.stop();
        if (this.onPlaybackStopped) this.onPlaybackStopped();
        return;
      }

      // Otherwise, loop normally (standalone mode)
      // loopDelay of 0 means no loop
      const loopDelay = this.script.loopDelay;
      if (loopDelay === 0) {
        console.log('[AutoplayDemo] Script complete (loopDelay=0, no restart)');
        this.stop();
        if (this.onPlaybackStopped) this.onPlaybackStopped();
        return;
      }
      console.log('[AutoplayDemo] Script complete, restarting...');
      this.timeoutId = window.setTimeout(() => {
        this.currentActionIndex = 0;
        this.colorIndex = 0;
        this.actionTypeCounts.clear();
        this.playNextAction();
      }, loopDelay ?? 3000);
      return;
    }

    const action = this.script.actions[this.currentActionIndex];
    const actionIndex = this.currentActionIndex;
    this.currentActionIndex++;

    // Track action type occurrences
    const count = (this.actionTypeCounts.get(action.type) || 0) + 1;
    this.actionTypeCounts.set(action.type, count);

    // Execute the action
    this.executeAction(action);

    // Check stop conditions AFTER action is executed
    // (for async actions, this happens before they complete - we handle that separately)
    this.checkStopConditions(action.type, actionIndex, count);
  }

  /**
   * Check if playback should stop based on options
   */
  private checkStopConditions(actionType: string, actionIndex: number, typeCount: number) {
    // Check stopAt (index-based)
    if (this.options.stopAt !== undefined && actionIndex >= this.options.stopAt) {
      console.log(`[AutoplayDemo] Stopping at action index ${actionIndex} (stopAt=${this.options.stopAt})`);
      // Use setTimeout to allow current action to complete
      setTimeout(() => {
        this.stop();
        if (this.onPlaybackStopped) this.onPlaybackStopped();
      }, 100);
      return;
    }

    // Check stopAfter (type-based)
    if (this.options.stopAfter) {
      const [type, occurrenceStr] = this.options.stopAfter.split(':');
      const targetOccurrence = occurrenceStr ? parseInt(occurrenceStr, 10) : 1;

      if (actionType === type && typeCount >= targetOccurrence) {
        console.log(`[AutoplayDemo] Stopping after ${actionType} #${typeCount} (stopAfter=${this.options.stopAfter})`);
        // Use setTimeout to allow current action to complete
        setTimeout(() => {
          this.stop();
          if (this.onPlaybackStopped) this.onPlaybackStopped();
        }, 100);
        return;
      }
    }
  }

  /**
   * Execute a single action
   */
  private executeAction(action: DemoAction) {
    switch (action.type) {
      case 'type':
        this.typeText(action.text, action.speed || 'normal', () => this.playNextAction());
        break;

      case 'pause':
        this.timeoutId = window.setTimeout(() => this.playNextAction(), action.duration);
        break;

      case 'clear':
        this.clearDocument();
        this.timeoutId = window.setTimeout(() => this.playNextAction(), 500);
        break;

      case 'heading':
        this.insertHeading(action.level, action.text, () => this.playNextAction());
        break;

      case 'newline':
        const count = action.count || 1;
        // Use callback if available (for proper block-level paragraph creation)
        if (this.onNewline) {
          for (let i = 0; i < count; i++) {
            this.onNewline();
          }
        } else {
          // Fallback to text insertion
          for (let i = 0; i < count; i++) {
            this.insertText('\n');
          }
        }
        this.updateCursorPosition();
        this.timeoutId = window.setTimeout(() => this.playNextAction(), 100);
        break;

      case 'geomark':
        // Find and select the text, then create geo-mark
        if (this.onSelect && this.onClickToolbar) {
          const positions = this.onSelect(action.text);
          if (positions) {
            console.log(`[AutoplayDemo] Found and selected "${action.text}" for geo-mark`);
            // Small delay to show selection, then create geo-mark
            this.timeoutId = window.setTimeout(() => {
              this.onClickToolbar!('geomark', action.lat, action.lng);
              this.colorIndex = (this.colorIndex + 1) % 8;
              // Move cursor to end of document after creating geo-mark
              this.moveCursorToEnd();
              this.timeoutId = window.setTimeout(() => this.playNextAction(), 400);
            }, 300);
          } else {
            console.warn(`[AutoplayDemo] Could not find "${action.text}" for geo-mark`);
            this.timeoutId = window.setTimeout(() => this.playNextAction(), 100);
          }
        } else {
          console.warn('[AutoplayDemo] onSelect or onClickToolbar not configured');
          this.timeoutId = window.setTimeout(() => this.playNextAction(), 100);
        }
        break;

      case 'geocode':
        this.simulateGeocode(action.placeName, action.lat, action.lng, () => this.playNextAction());
        break;

      case 'insertMap':
        if (this.onInsertMap) {
          const result = this.onInsertMap();
          // Handle async callback
          if (result instanceof Promise) {
            result.then(() => {
              console.log('[AutoplayDemo] Inserted map block');
              this.timeoutId = window.setTimeout(() => this.playNextAction(), 500);
            });
            return; // Don't continue synchronously
          }
        }
        console.log('[AutoplayDemo] Inserted map block');
        this.timeoutId = window.setTimeout(() => this.playNextAction(), 500);
        break;

      case 'showCursor':
        this.showFakeCursor(action.userName, action.color);
        this.playNextAction();
        break;

      case 'hideCursor':
        this.hideFakeCursor();
        this.playNextAction();
        break;

      case 'moveCursor':
        // Not fully implemented yet
        this.playNextAction();
        break;

      case 'select':
        // Select text in the document
        if (this.onSelect) {
          const positions = this.onSelect(action.text);
          if (positions) {
            console.log(`[AutoplayDemo] Selected "${action.text}" at positions ${positions.from}-${positions.to}`);
          }
        }
        this.timeoutId = window.setTimeout(() => this.playNextAction(), 300);
        break;

      case 'clickToolbar':
        // Simulate clicking a toolbar button
        if (this.onClickToolbar) {
          this.onClickToolbar(action.button, action.lat, action.lng);
          this.colorIndex = (this.colorIndex + 1) % 8;
        }
        this.timeoutId = window.setTimeout(() => this.playNextAction(), 600);
        break;

      case 'comment':
        // Show product explainer commentary with typewriter effect
        this.showComment(action.text, action.heading, action.duration, () => this.playNextAction(), action.step);
        break;

      case 'openFullscreenMap':
        if (this.onOpenFullscreenMap) {
          this.onOpenFullscreenMap();
          console.log('[AutoplayDemo] Opening fullscreen map');
        }
        this.timeoutId = window.setTimeout(() => this.playNextAction(), 500);
        break;

      case 'closeFullscreenMap':
        if (this.onCloseFullscreenMap) {
          this.onCloseFullscreenMap();
          console.log('[AutoplayDemo] Closing fullscreen map');
        }
        this.timeoutId = window.setTimeout(() => this.playNextAction(), 500);
        break;

      case 'scroll':
        if (this.onScroll) {
          this.onScroll(action.to);
          console.log(`[AutoplayDemo] Scrolling to ${action.to}`);
        }
        this.timeoutId = window.setTimeout(() => this.playNextAction(), 500);
        break;

      case 'panMap':
        if (this.onPanMap) {
          const distance = action.distance || 50;
          this.onPanMap(action.direction, distance);
          console.log(`[AutoplayDemo] Panning map ${action.direction} ${distance}px`);
        }
        this.timeoutId = window.setTimeout(() => this.playNextAction(), 500);
        break;

      case 'zoomMap':
        if (this.onZoomMap) {
          const amount = action.amount || 1;
          this.onZoomMap(action.direction, amount);
          console.log(`[AutoplayDemo] Zooming map ${action.direction}`);
        }
        this.timeoutId = window.setTimeout(() => this.playNextAction(), 500);
        break;

      case 'clickMapMarker':
        if (this.onClickMapMarker) {
          this.onClickMapMarker(action.markerIndex);
          console.log(`[AutoplayDemo] Clicking map marker ${action.markerIndex}`);
        }
        this.timeoutId = window.setTimeout(() => this.playNextAction(), 500);
        break;

      case 'addWaypoint':
        if (this.onAddWaypoint) {
          this.onAddWaypoint(action.destGeoId, action.lat, action.lng);
          console.log(`[AutoplayDemo] Adding waypoint to ${action.destGeoId} at ${action.lat}, ${action.lng}`);
        }
        this.timeoutId = window.setTimeout(() => this.playNextAction(), 500);
        break;

      case 'fingerTapMapCoords':
        if (this.onFingerTapMapCoords) {
          const fromSide = action.fromSide || 'right';
          const persist = action.persist || false;
          console.log(`[AutoplayDemo] Finger tap on map at (${action.lat}, ${action.lng}) from ${fromSide}${persist ? ' (persist)' : ''}`);
          this.onFingerTapMapCoords(action.lat, action.lng, fromSide, persist).then(() => {
            this.playNextAction();
          });
        } else {
          this.timeoutId = window.setTimeout(() => this.playNextAction(), 500);
        }
        break;

      case 'fingerTapRoute':
        if (this.onFingerTapRoute) {
          const fraction = action.fraction ?? 0.5;
          const fromSide = action.fromSide || 'right';
          const persist = action.persist || false;
          console.log(`[AutoplayDemo] Finger tap on route at fraction ${fraction} from ${fromSide}${persist ? ' (persist)' : ''}`);
          this.onFingerTapRoute(fraction, fromSide, persist).then(() => {
            this.playNextAction();
          });
        } else {
          this.timeoutId = window.setTimeout(() => this.playNextAction(), 500);
        }
        break;

      case 'showFingerTap':
        if (this.onShowFingerTap) {
          const fromSide = action.fromSide || 'right';
          const persist = action.persist || false;
          console.log(`[AutoplayDemo] Showing finger tap on ${action.selector} from ${fromSide}${persist ? ' (persist)' : ''}`);
          this.onShowFingerTap(action.selector, fromSide, persist).then(() => {
            this.playNextAction();
          });
        } else {
          this.timeoutId = window.setTimeout(() => this.playNextAction(), 500);
        }
        break;

      case 'hideFinger':
        if (this.onHideFinger) {
          this.onHideFinger();
          console.log('[AutoplayDemo] Hiding finger');
        }
        this.timeoutId = window.setTimeout(() => this.playNextAction(), 300);
        break;

      case 'clickElement':
        if (this.onClickElement) {
          this.onClickElement(action.selector);
          console.log(`[AutoplayDemo] Clicked element: ${action.selector}`);
        }
        this.timeoutId = window.setTimeout(() => this.playNextAction(), 300);
        break;

      case 'fingerDrag':
        if (this.onFingerDrag) {
          const distance = action.distance || 150;
          console.log(`[AutoplayDemo] Dragging finger on ${action.selector} ${action.direction} ${distance}px`);
          this.onFingerDrag(action.selector, action.direction, distance).then(() => {
            this.playNextAction();
          });
        } else {
          this.timeoutId = window.setTimeout(() => this.playNextAction(), 500);
        }
        break;

      case 'drawTestLines':
        if (this.onDrawTestLines) {
          const duration = action.duration || 2000;
          console.log(`[AutoplayDemo] Drawing test lines from (${action.startX},${action.startY}) to (${action.endX},${action.endY})`);
          this.onDrawTestLines(action.startX, action.startY, action.endX, action.endY, duration).then(() => {
            this.playNextAction();
          });
        } else {
          this.timeoutId = window.setTimeout(() => this.playNextAction(), 500);
        }
        break;

      case 'showAvatar':
        if (this.onShowAvatar) {
          this.onShowAvatar(action.name, action.color);
          console.log(`[AutoplayDemo] Showing avatar: ${action.name}`);
        }
        this.timeoutId = window.setTimeout(() => this.playNextAction(), 300);
        break;

      case 'clearAvatars':
        if (this.onClearAvatars) {
          this.onClearAvatars();
          console.log('[AutoplayDemo] Clearing avatars');
        }
        this.timeoutId = window.setTimeout(() => this.playNextAction(), 100);
        break;

      case 'showRemoteCursor':
        if (this.onShowRemoteCursor) {
          const position = action.position || 'start';
          this.onShowRemoteCursor(action.userName, action.color, position);
          console.log(`[AutoplayDemo] Showing remote cursor: ${action.userName} at ${position}`);
        }
        this.timeoutId = window.setTimeout(() => this.playNextAction(), 300);
        break;

      case 'moveRemoteCursor':
        if (this.onMoveRemoteCursor) {
          const duration = action.duration || 800;
          console.log(`[AutoplayDemo] Moving remote cursor to ${action.position}`);
          this.onMoveRemoteCursor(action.position, duration).then(() => {
            this.playNextAction();
          });
        } else {
          this.timeoutId = window.setTimeout(() => this.playNextAction(), 500);
        }
        break;

      case 'hideRemoteCursor':
        if (this.onHideRemoteCursor) {
          this.onHideRemoteCursor();
          console.log('[AutoplayDemo] Hiding remote cursor');
        }
        this.timeoutId = window.setTimeout(() => this.playNextAction(), 200);
        break;

      case 'showRemoteMapBounds':
        if (this.onShowRemoteMapBounds) {
          this.onShowRemoteMapBounds(action.clientId, action.userName, action.color, action.bounds);
          console.log(`[AutoplayDemo] Showing map bounds overlay for ${action.userName}`);
        }
        this.timeoutId = window.setTimeout(() => this.playNextAction(), 100);
        break;

      case 'moveRemoteMapBounds':
        console.log(`[AutoplayDemo] Moving map bounds to:`, action.bounds);
        if (this.onMoveRemoteMapBounds) {
          this.onMoveRemoteMapBounds(action.bounds, action.duration || 600).then(() => {
            console.log(`[AutoplayDemo] Map bounds move complete`);
            this.playNextAction();
          });
        } else {
          console.log(`[AutoplayDemo] No onMoveRemoteMapBounds handler, skipping after ${action.duration || 600}ms`);
          this.timeoutId = window.setTimeout(() => this.playNextAction(), action.duration || 600);
        }
        break;

      case 'hideRemoteMapBounds':
        if (this.onHideRemoteMapBounds) {
          this.onHideRemoteMapBounds();
          console.log('[AutoplayDemo] Hiding map bounds overlay');
        }
        this.timeoutId = window.setTimeout(() => this.playNextAction(), 100);
        break;

      // Bob actions - send to parent DemoPlayer which forwards to Bob's iframe
      case 'bobScroll':
        console.log(`[AutoplayDemo] Sending bobScroll to parent: ${action.target}`);
        this.notifyParent({ type: 'bobCommand', command: 'scroll', target: action.target });
        this.timeoutId = window.setTimeout(() => this.playNextAction(), 800);
        break;

      case 'bobFingerTap':
        console.log(`[AutoplayDemo] Sending bobFingerTap to parent: ${action.selector}`);
        this.notifyParent({ type: 'bobCommand', command: 'fingerTap', selector: action.selector, fromSide: action.fromSide || 'right' });
        this.timeoutId = window.setTimeout(() => this.playNextAction(), 1000);
        break;

      case 'bobOpenFullscreenMap':
        console.log('[AutoplayDemo] Sending bobOpenFullscreenMap to parent');
        this.notifyParent({ type: 'bobCommand', command: 'openFullscreenMap' });
        this.timeoutId = window.setTimeout(() => this.playNextAction(), 1000);
        break;

      case 'bobCloseFullscreenMap':
        console.log('[AutoplayDemo] Sending bobCloseFullscreenMap to parent');
        this.notifyParent({ type: 'bobCommand', command: 'closeFullscreenMap' });
        this.timeoutId = window.setTimeout(() => this.playNextAction(), 500);
        break;

      case 'bobPanMap':
        console.log(`[AutoplayDemo] Sending bobPanMap to parent: ${action.direction}`);
        this.notifyParent({ type: 'bobCommand', command: 'panMap', direction: action.direction, distance: action.distance || 100 });
        this.timeoutId = window.setTimeout(() => this.playNextAction(), 800);
        break;

      case 'bobZoomMap':
        console.log(`[AutoplayDemo] Sending bobZoomMap to parent: ${action.direction}`);
        this.notifyParent({ type: 'bobCommand', command: 'zoomMap', direction: action.direction, amount: action.amount || 1 });
        this.timeoutId = window.setTimeout(() => this.playNextAction(), 800);
        break;

      // Finger text selection actions
      case 'fingerSelect':
        if (this.onFingerSelect) {
          const fromSide = action.fromSide || 'right';
          console.log(`[AutoplayDemo] Finger selecting "${action.text}" from ${fromSide}`);
          this.onFingerSelect(action.text, fromSide).then(() => {
            this.playNextAction();
          });
        } else {
          console.warn('[AutoplayDemo] onFingerSelect not configured');
          this.timeoutId = window.setTimeout(() => this.playNextAction(), 500);
        }
        break;

      case 'dragSelectionHandle':
        if (this.onDragSelectionHandle) {
          console.log(`[AutoplayDemo] Dragging ${action.handle} handle to "${action.toText}"`);
          this.onDragSelectionHandle(action.handle, action.toText).then(() => {
            this.playNextAction();
          });
        } else {
          console.warn('[AutoplayDemo] onDragSelectionHandle not configured');
          this.timeoutId = window.setTimeout(() => this.playNextAction(), 500);
        }
        break;

      // Context menu actions
      case 'showContextMenu':
        if (this.onShowContextMenu) {
          const position = action.position || 'below';
          console.log(`[AutoplayDemo] Showing context menu ${position} selection`);
          this.onShowContextMenu(position).then(() => {
            this.playNextAction();
          });
        } else {
          console.warn('[AutoplayDemo] onShowContextMenu not configured');
          this.timeoutId = window.setTimeout(() => this.playNextAction(), 500);
        }
        break;

      case 'tapContextMenuItem':
        if (this.onTapContextMenuItem) {
          console.log(`[AutoplayDemo] Tapping context menu item: ${action.item}`);
          this.onTapContextMenuItem(action.item).then(() => {
            this.playNextAction();
          });
        } else {
          console.warn('[AutoplayDemo] onTapContextMenuItem not configured');
          this.timeoutId = window.setTimeout(() => this.playNextAction(), 500);
        }
        break;

      case 'fingerTapButton':
        // Tap a toolbar button with finger animation (reuses same callback as context menu)
        if (this.onTapContextMenuItem) {
          console.log(`[AutoplayDemo] Finger tapping toolbar button: ${action.button}`);
          this.onTapContextMenuItem(action.button).then(() => {
            this.playNextAction();
          });
        } else {
          console.warn('[AutoplayDemo] onTapContextMenuItem not configured for fingerTapButton');
          this.timeoutId = window.setTimeout(() => this.playNextAction(), 500);
        }
        break;

      case 'fingerDoubleTap':
        if (this.onFingerDoubleTap) {
          const fromSide = action.fromSide || 'right';
          console.log(`[AutoplayDemo] Finger double-tap at ${action.target} from ${fromSide}`);
          this.onFingerDoubleTap(action.target, fromSide).then(() => {
            this.playNextAction();
          });
        } else {
          console.warn('[AutoplayDemo] onFingerDoubleTap not configured');
          this.timeoutId = window.setTimeout(() => this.playNextAction(), 500);
        }
        break;

      case 'fingerScroll':
        if (this.onFingerScroll) {
          const distance = action.distance || 150;
          const fromSide = action.fromSide || 'right';
          console.log(`[AutoplayDemo] Finger scroll ${action.direction} ${distance}px from ${fromSide}`);
          this.onFingerScroll(action.direction, distance, fromSide).then(() => {
            this.playNextAction();
          });
        } else {
          console.warn('[AutoplayDemo] onFingerScroll not configured');
          this.timeoutId = window.setTimeout(() => this.playNextAction(), 500);
        }
        break;

      // Share modal actions
      case 'showShareModal':
        if (this.onShowShareModal) {
          this.onShowShareModal();
          console.log('[AutoplayDemo] Showing share modal');
        }
        this.timeoutId = window.setTimeout(() => this.playNextAction(), 400);
        break;

      case 'tapCopyUrl':
        if (this.onTapCopyUrl) {
          console.log('[AutoplayDemo] Tapping copy URL button');
          this.onTapCopyUrl().then(() => {
            this.playNextAction();
          });
        } else {
          console.warn('[AutoplayDemo] onTapCopyUrl not configured');
          this.timeoutId = window.setTimeout(() => this.playNextAction(), 500);
        }
        break;

      case 'tapFollowCopyUrl':
        if (this.onTapFollowCopyUrl) {
          console.log('[AutoplayDemo] Tapping follow copy URL button');
          this.onTapFollowCopyUrl().then(() => {
            this.playNextAction();
          });
        } else {
          console.warn('[AutoplayDemo] onTapFollowCopyUrl not configured');
          this.timeoutId = window.setTimeout(() => this.playNextAction(), 500);
        }
        break;

      case 'hideShareModal':
        if (this.onHideShareModal) {
          this.onHideShareModal();
          console.log('[AutoplayDemo] Hiding share modal');
        }
        this.timeoutId = window.setTimeout(() => this.playNextAction(), 400);
        break;

      case 'setupChapterState':
        if (this.onSetupChapterState) {
          console.log(`[AutoplayDemo] Setting up chapter state: ${action.state}`);
          this.onSetupChapterState(action.state).then(() => {
            this.playNextAction();
          });
        } else {
          console.warn('[AutoplayDemo] onSetupChapterState not configured');
          this.timeoutId = window.setTimeout(() => this.playNextAction(), 100);
        }
        break;

      // Video call actions
      case 'showVideoCall':
        if (this.remoteControlMode) {
          // Notify parent (DemoPlayer) to show the video call overlay
          this.notifyParent({ type: 'showVideoCall' });
          console.log('[AutoplayDemo] Notifying parent to show video call overlay');
        } else if (this.onShowVideoCall) {
          this.onShowVideoCall();
          console.log('[AutoplayDemo] Showing video call overlay');
        }
        this.timeoutId = window.setTimeout(() => this.playNextAction(), 500);
        break;

      case 'hideVideoCall':
        if (this.remoteControlMode) {
          // Notify parent (DemoPlayer) to hide the video call overlay
          this.notifyParent({ type: 'hideVideoCall' });
          console.log('[AutoplayDemo] Notifying parent to hide video call overlay');
        } else if (this.onHideVideoCall) {
          this.onHideVideoCall();
          console.log('[AutoplayDemo] Hiding video call overlay');
        }
        this.timeoutId = window.setTimeout(() => this.playNextAction(), 300);
        break;

      case 'bobShowVideoCall':
        console.log('[AutoplayDemo] Sending bobShowVideoCall to parent');
        this.notifyParent({ type: 'bobCommand', command: 'showVideoCall' });
        this.timeoutId = window.setTimeout(() => this.playNextAction(), 500);
        break;

      case 'bobHideVideoCall':
        console.log('[AutoplayDemo] Sending bobHideVideoCall to parent');
        this.notifyParent({ type: 'bobCommand', command: 'hideVideoCall' });
        this.timeoutId = window.setTimeout(() => this.playNextAction(), 300);
        break;

      default:
        this.playNextAction();
    }
  }

  /**
   * Simulate geocoding: type location, pause with "searching..." indicator, then mark
   */
  private simulateGeocode(placeName: string, lat: number, lng: number, callback: () => void) {
    // Step 1: Type the place name
    this.typeText(placeName, 'normal', () => {
      // Step 2: Brief pause to show "searching"
      this.timeoutId = window.setTimeout(() => {
        // Step 3: Apply the geo-mark
        if (this.onGeoMark) {
          this.onGeoMark(placeName, lat, lng, this.colorIndex);
          this.colorIndex = (this.colorIndex + 1) % 8;
        }
        // Step 4: Small pause after marking
        this.timeoutId = window.setTimeout(callback, 200);
      }, 400); // Simulated geocoding delay
    });
  }

  /**
   * Insert a heading with finger tap animation and typewriter effect
   */
  private insertHeading(level: 1 | 2 | 3, text: string, callback: () => void) {
    // If we have the new typewriter-style callback, use finger tap + typewriter
    if (this.onSetHeadingLevel && this.onType && this.onShowFingerTap) {
      // Step 1: Show finger tap on heading button
      const buttonId = level === 1 ? '#heading1-btn' : '#heading2-btn';
      console.log(`[AutoplayDemo] Showing finger tap on ${buttonId} for heading level ${level}`);
      this.onShowFingerTap(buttonId, 'bottom', false).then(() => {
        // Step 2: Set the block to heading level
        this.onSetHeadingLevel!(level);
        this.updateCursorPosition();

        // Step 3: Type the text with typewriter effect
        this.timeoutId = window.setTimeout(() => {
          this.typeText(text, 'fast', callback);
        }, 200);
      });
    } else if (this.onHeading) {
      // Fallback to old behavior: insert heading with text immediately
      this.onHeading(level, text);
      this.updateCursorPosition();
      this.timeoutId = window.setTimeout(callback, 100);
    } else {
      // Fallback: type as regular text with markdown-style prefix
      const prefix = '#'.repeat(level) + ' ';
      this.typeText(prefix + text, 'fast', callback);
    }
  }

  /**
   * Type text character by character
   */
  private typeText(text: string, speed: 'slow' | 'normal' | 'fast', callback: () => void) {
    const baseDelay = speed === 'slow' ? 80 : speed === 'fast' ? 25 : 45;
    let index = 0;

    const typeNext = () => {
      if (!this.isPlaying || this.isPaused) return;

      if (index >= text.length) {
        callback();
        return;
      }

      const char = text[index];
      this.insertText(char);
      this.updateCursorPosition();
      index++;

      // Vary typing speed for realism
      let delay = baseDelay + Math.random() * (baseDelay * 0.5);
      if (char === ' ') delay *= 0.5;
      if (char === '.' || char === '!' || char === '?') delay *= 2;
      if (char === ',') delay *= 1.5;

      this.timeoutId = window.setTimeout(typeNext, delay);
    };

    typeNext();
  }

  /**
   * Insert text at the end of the document
   */
  private insertText(text: string) {
    // Use callback if available (for proper text insertion into last paragraph)
    if (this.onType) {
      this.onType(text);
      return;
    }

    // Fallback: direct insertion
    const { state, dispatch } = this.view;
    const endPos = state.doc.content.size - 1;
    const tr = state.tr.insertText(text, endPos);
    dispatch(tr);
  }

  /**
   * Clear the document
   */
  private clearDocument() {
    const { state, dispatch } = this.view;
    const tr = state.tr.delete(0, state.doc.content.size);
    // Insert empty paragraph
    const emptyParagraph = state.schema.nodes.paragraph.create();
    tr.insert(0, emptyParagraph);
    dispatch(tr);
  }

  /**
   * Show a fake remote cursor via awareness
   */
  private showFakeCursor(userName: string, color: string) {
    if (!this.awareness) return;

    // Add a fake user to awareness states
    // We'll inject this directly into the awareness state display
    this.awareness.setLocalStateField('demoUser', {
      name: userName,
      color: color,
      isDemo: true
    });

    console.log(`[AutoplayDemo] Showing cursor for ${userName}`);
  }

  /**
   * Hide the fake remote cursor
   */
  private hideFakeCursor() {
    if (!this.awareness) return;
    this.awareness.setLocalStateField('demoUser', null);
    console.log('[AutoplayDemo] Hiding demo cursor');
  }

  /**
   * Update cursor position in awareness for visual feedback
   */
  private updateCursorPosition() {
    if (!this.awareness) return;

    const { state } = this.view;
    const endPos = state.doc.content.size - 1;

    // Update the cursor position for y-prosemirror to render
    // This updates the local user's cursor which will show the caret
    try {
      const tr = state.tr.setSelection(TextSelection.create(state.doc, endPos));
      this.view.dispatch(tr);
    } catch (e) {
      // Ignore selection errors
    }
  }

  /**
   * Move cursor to end of document
   * Used after geo-mark creation to ensure subsequent content is appended at end
   */
  private moveCursorToEnd() {
    const { state } = this.view;
    const endPos = state.doc.content.size - 1;
    try {
      const tr = state.tr.setSelection(TextSelection.create(state.doc, endPos));
      this.view.dispatch(tr);
    } catch (e) {
      // Ignore selection errors
    }
  }

  /**
   * Show product explainer commentary with typewriter effect
   * Black overlay with white text, typing character by character
   * Supports optional heading (chapter name) that types first
   * If step is provided, sends postMessage to parent for tab sync
   *
   * In remote control mode: skip overlay display, let parent DemoPlayer handle it
   */
  private showComment(text: string, heading: string | undefined, duration: number | undefined, callback: () => void, step?: number) {
    // Send step update to parent window (for landing page tab sync or DemoPlayer)
    if (step !== undefined && window.parent !== window) {
      const demoId = new URLSearchParams(window.location.search).get('demo') || 'maps';
      // Use demoStepChanged for remote control mode, demoStep for legacy landing page
      const messageType = this.remoteControlMode ? 'demoStepChanged' : 'demoStep';
      // Include actionIndex for snapshot capture (DemoPlayer needs to know which action to resume from)
      window.parent.postMessage({
        type: messageType,
        step,
        actionIndex: this.currentActionIndex,
        demoId,
        heading,
        text,
        duration
      }, '*');
      console.log(`[AutoplayDemo] Sent step ${step} to parent (actionIndex: ${this.currentActionIndex}, demo: ${demoId}, remote: ${this.remoteControlMode})`);
    }

    // In remote control mode, let parent DemoPlayer handle the overlay display
    // The demo pauses itself and waits for parent to send resume command
    if (this.remoteControlMode) {
      console.log(`[AutoplayDemo] Remote mode: pausing and waiting for parent to resume`);
      // Store the callback to be called when parent sends resume
      this.pendingStepCallback = callback;
      // Pause the demo - parent will resume it after showing comment
      this.isPaused = true;
      return;
    }

    // Normal mode: show overlay in iframe
    const overlay = document.getElementById('demo-intro-overlay');
    const headingEl = overlay?.querySelector('.comment-heading') as HTMLElement | null;
    const textEl = overlay?.querySelector('.comment-text') as HTMLElement | null;

    if (!overlay || !textEl) {
      console.warn('[AutoplayDemo] Comment overlay not found');
      callback();
      return;
    }

    console.log(`[AutoplayDemo] Showing comment: "${heading || ''}" / "${text}"`);

    // Show overlay and reset content
    overlay.classList.add('visible');
    if (headingEl) {
      headingEl.innerHTML = heading ? '<span class="cursor"></span>' : '';
      headingEl.style.display = heading ? 'block' : 'none';
    }
    textEl.innerHTML = '';

    const typeSpeed = 40; // ms per character

    // Type into an element with typewriter effect
    const typeIntoElement = (el: HTMLElement, content: string, onComplete: () => void) => {
      let charIndex = 0;
      el.innerHTML = '<span class="cursor"></span>';

      const typeNext = () => {
        if (!this.isPlaying || this.isPaused) return;

        if (charIndex < content.length) {
          const cursor = el.querySelector('.cursor');
          const charNode = document.createTextNode(content[charIndex]);
          if (cursor) {
            el.insertBefore(charNode, cursor);
          }
          charIndex++;
          this.timeoutId = window.setTimeout(typeNext, typeSpeed);
        } else {
          // Remove cursor when done
          const cursor = el.querySelector('.cursor');
          if (cursor) cursor.remove();
          onComplete();
        }
      };

      typeNext();
    };

    // Start typing after fade-in
    this.timeoutId = window.setTimeout(() => {
      if (heading && headingEl) {
        // Type heading first, then text
        typeIntoElement(headingEl, heading, () => {
          // Brief pause between heading and text
          this.timeoutId = window.setTimeout(() => {
            typeIntoElement(textEl, text, () => {
              // Finished typing, wait then hide
              const holdDuration = duration || 1500;
              this.timeoutId = window.setTimeout(() => {
                overlay.classList.remove('visible');
                this.timeoutId = window.setTimeout(callback, 300);
              }, holdDuration);
            });
          }, 200);
        });
      } else {
        // Just type the text
        typeIntoElement(textEl, text, () => {
          const holdDuration = duration || 1500;
          this.timeoutId = window.setTimeout(() => {
            overlay.classList.remove('visible');
            this.timeoutId = window.setTimeout(callback, 300);
          }, holdDuration);
        });
      }
    }, 300);
  }

  /**
   * Check if currently playing
   */
  isActive(): boolean {
    return this.isPlaying;
  }

  /**
   * Get current action index (for debugging)
   */
  getCurrentActionIndex(): number {
    return this.currentActionIndex;
  }

  /**
   * Get script actions (for debugging/testing)
   */
  getActions(): DemoAction[] {
    return this.script.actions;
  }

  /**
   * Get action at specific index (for debugging)
   */
  getActionAt(index: number): DemoAction | undefined {
    return this.script.actions[index];
  }

  /**
   * Cleanup
   */
  destroy() {
    this.stop();
  }
}

/**
 * ComposedDemoPlayer - Orchestrates multi-section demos
 *
 * Plays multiple demo sections in sequence:
 * 1. Each script plays with inline 'comment' actions for intros
 * 2. Sections transition automatically
 * 3. Loops continuously
 */
export class ComposedDemoPlayer {
  private view: EditorView;
  private awareness: any;
  private demo: ComposedDemo;
  private autoplay: AutoplayDemo | null = null;
  private isPlaying = false;

  // Callbacks - same as AutoplayDemo, will be passed through
  public onGeoMark?: (placeName: string, lat: number, lng: number, colorIndex: number) => void;
  public onInsertMap?: () => Promise<void> | void;
  public onHeading?: (level: 1 | 2 | 3, text: string) => void;
  public onNewline?: () => void;
  public onType?: (char: string) => void;
  public onSelect?: (text: string) => { from: number; to: number } | null;
  public onClickToolbar?: (button: 'geomark' | 'map', lat?: number, lng?: number) => void;

  constructor(view: EditorView, composedDemoName: string, awareness?: any) {
    this.view = view;
    this.awareness = awareness;
    this.demo = COMPOSED_DEMOS[composedDemoName];

    if (!this.demo) {
      console.error(`[ComposedDemoPlayer] Demo "${composedDemoName}" not found`);
      this.demo = COMPOSED_DEMOS.fullDemo; // Fallback
    }

    console.log(`[ComposedDemoPlayer] Initialized with demo: ${this.demo.name}, ${this.demo.sections.length} sections`);
  }

  /**
   * Start the composed demo
   */
  async start() {
    if (this.isPlaying) return;

    this.isPlaying = true;
    console.log('[ComposedDemoPlayer] Starting composed demo');
    await this.playSection(0);
  }

  /**
   * Stop the composed demo
   */
  stop() {
    console.log('[ComposedDemoPlayer] Stopping');
    this.isPlaying = false;

    if (this.autoplay) {
      this.autoplay.stop();
      this.autoplay = null;
    }
  }

  /**
   * Play a specific section
   */
  private async playSection(index: number) {
    if (!this.isPlaying) return;

    const section = this.demo.sections[index];
    console.log(`[ComposedDemoPlayer] Playing section ${index + 1}/${this.demo.sections.length}: ${section.scriptName}`);

    // Play the demo script (includes inline comment actions for intros)
    await this.playScript(section.scriptName);

    if (!this.isPlaying) return;

    // Move to next section or loop back to start
    const nextIndex = (index + 1) % this.demo.sections.length;
    console.log(`[ComposedDemoPlayer] Section complete, next: ${nextIndex}`);

    // Brief pause between sections
    await this.delay(500);

    this.playSection(nextIndex);
  }

  /**
   * Play a demo script and wait for it to complete one loop
   */
  private playScript(scriptName: string): Promise<void> {
    return new Promise((resolve) => {
      if (!this.isPlaying) {
        resolve();
        return;
      }

      // Create AutoplayDemo for this script
      this.autoplay = new AutoplayDemo(this.view, scriptName, this.awareness);

      // Pass through callbacks
      this.autoplay.onGeoMark = this.onGeoMark;
      this.autoplay.onInsertMap = this.onInsertMap;
      this.autoplay.onHeading = this.onHeading;
      this.autoplay.onNewline = this.onNewline;
      this.autoplay.onType = this.onType;
      this.autoplay.onSelect = this.onSelect;
      this.autoplay.onClickToolbar = this.onClickToolbar;

      // Set up completion callback
      this.autoplay.onLoopComplete = () => {
        console.log(`[ComposedDemoPlayer] Script "${scriptName}" completed`);
        this.autoplay = null;
        resolve();
      };

      // Start the script
      this.autoplay.start();
    });
  }

  /**
   * Helper to create a delay
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Check if currently playing
   */
  isActive(): boolean {
    return this.isPlaying;
  }

  /**
   * Cleanup
   */
  destroy() {
    this.stop();
  }
}
