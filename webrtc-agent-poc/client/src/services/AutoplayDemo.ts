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
  | { type: 'comment'; text: string; heading?: string; duration?: number } // Product explainer commentary with typewriter effect
  | { type: 'openFullscreenMap' } // Open fullscreen map view
  | { type: 'closeFullscreenMap' } // Close fullscreen map view
  | { type: 'clickMapMarker'; markerIndex: number }; // Click a marker on the fullscreen map (0-based index)

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
      // Intro comment
      { type: 'comment', heading: 'Location Tagging', text: 'Insert a map to auto-detect locations', duration: 2000 },

      // Demo: Emma proposes a weekend trip to friends
      { type: 'showCursor', userName: 'Emma', color: '#EC4899' },

      // Main heading
      { type: 'heading', level: 1, text: 'Weekend in Denmark?' },
      { type: 'pause', duration: 300 },
      { type: 'newline' },
      { type: 'type', text: 'Hey guys! What do you think about this plan:', speed: 'normal' },
      { type: 'pause', duration: 400 },
      { type: 'newline' },
      { type: 'newline' },

      // ===== Day 1: Saturday (complete section) =====
      { type: 'heading', level: 2, text: 'Saturday' },
      { type: 'pause', duration: 200 },
      { type: 'newline' },
      { type: 'type', text: 'Explore Copenhagen and visit Tivoli Gardens', speed: 'normal' },
      { type: 'pause', duration: 500 },
      { type: 'newline' },

      // Insert Saturday map
      { type: 'insertMap' },
      { type: 'pause', duration: 500 },

      // Saturday geo-marks (auto-detected after map)
      { type: 'geomark', text: 'Copenhagen', lat: 55.6761, lng: 12.5683 },
      { type: 'pause', duration: 400 },
      { type: 'geomark', text: 'Tivoli Gardens', lat: 55.6733, lng: 12.5681 },
      { type: 'pause', duration: 800 },

      // Explain fullscreen map feature
      { type: 'comment', heading: 'Fullscreen Map', text: 'Click any map to expand it and explore locations', duration: 2000 },

      // Open fullscreen map to showcase the map feature
      { type: 'openFullscreenMap' },
      { type: 'pause', duration: 1000 },

      // Click marker to show transport configuration
      { type: 'clickMapMarker', markerIndex: 1 }, // Click Tivoli Gardens
      { type: 'pause', duration: 3000 }, // Show the location sheet
      { type: 'closeFullscreenMap' },
      { type: 'pause', duration: 500 },
      { type: 'newline' },

      // ===== Day 2: Sunday (complete section) =====
      { type: 'heading', level: 2, text: 'Sunday' },
      { type: 'pause', duration: 200 },
      { type: 'newline' },
      { type: 'type', text: 'Drive to Aarhus for the old town museum', speed: 'normal' },
      { type: 'pause', duration: 500 },
      { type: 'newline' },

      // Insert Sunday map
      { type: 'insertMap' },
      { type: 'pause', duration: 500 },

      // Sunday geo-mark (auto-detected after map)
      { type: 'geomark', text: 'Aarhus', lat: 56.1629, lng: 10.2039 },

      { type: 'pause', duration: 2500 },
      { type: 'hideCursor' },
      { type: 'pause', duration: 500 },
      { type: 'clear' },
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
  private currentActionIndex = 0;
  private timeoutId: number | null = null;
  private colorIndex = 0;
  private options: PlaybackOptions;
  private actionTypeCounts: Map<string, number> = new Map(); // Track occurrences of each action type

  // Callbacks for custom actions
  public onGeoMark?: (placeName: string, lat: number, lng: number, colorIndex: number) => void;
  public onInsertMap?: () => Promise<void> | void;
  public onHeading?: (level: 1 | 2 | 3, text: string) => void;
  public onNewline?: () => void; // Create new paragraph block
  public onType?: (char: string) => void; // Type a character into the last paragraph
  public onSelect?: (text: string) => { from: number; to: number } | null; // Select text, return positions
  public onClickToolbar?: (button: 'geomark' | 'map', lat?: number, lng?: number) => void; // Toolbar click
  public onLoopComplete?: () => void; // Called when script completes one full loop (for composed mode)
  public onPlaybackStopped?: () => void; // Called when playback stops due to stopAt/stopAfter
  public onOpenFullscreenMap?: () => void; // Open fullscreen map view
  public onCloseFullscreenMap?: () => void; // Close fullscreen map view
  public onClickMapMarker?: (markerIndex: number) => void; // Click a marker on fullscreen map

  constructor(view: EditorView, scriptName: string = 'collab', awareness?: any, options?: PlaybackOptions) {
    this.view = view;
    this.script = DEMO_SCRIPTS[scriptName] || DEMO_SCRIPTS.collab;
    this.awareness = awareness;
    this.options = options || parsePlaybackOptions();
    console.log(`[AutoplayDemo] Initialized with script: ${this.script.name}`, this.options);
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
    this.clearDocument();
    this.playNextAction();
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
      console.log('[AutoplayDemo] Script complete, restarting...');
      this.timeoutId = window.setTimeout(() => {
        this.currentActionIndex = 0;
        this.colorIndex = 0;
        this.actionTypeCounts.clear();
        this.playNextAction();
      }, this.script.loopDelay || 3000);
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
        this.showComment(action.text, action.heading, action.duration, () => this.playNextAction());
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

      case 'clickMapMarker':
        if (this.onClickMapMarker) {
          this.onClickMapMarker(action.markerIndex);
          console.log(`[AutoplayDemo] Clicking map marker ${action.markerIndex}`);
        }
        this.timeoutId = window.setTimeout(() => this.playNextAction(), 500);
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
   * Insert a heading
   */
  private insertHeading(level: 1 | 2 | 3, text: string, callback: () => void) {
    if (this.onHeading) {
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
   */
  private showComment(text: string, heading: string | undefined, duration: number | undefined, callback: () => void) {
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
