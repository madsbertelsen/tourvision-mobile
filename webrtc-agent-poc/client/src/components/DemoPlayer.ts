/**
 * DemoPlayer - Parent-controlled demo player that wraps an editor iframe
 *
 * The DemoPlayer:
 * 1. Renders the phone frame with iframe inside
 * 2. Shows comment overlays (heading + text with typewriter effect)
 * 3. Controls step tabs
 * 4. Sends commands to iframe to execute demo actions
 */

import { DEMO_SCRIPTS, type DemoAction } from '../services/AutoplayDemo';

export interface StepDefinition {
  label: string;
  heading: string;
  text: string;
}

export interface DemoPlayerOptions {
  container: HTMLElement;
  demoScript: string;
  editorUrl: string;
  steps: StepDefinition[];
  autoStart?: boolean;
  dualPhone?: boolean; // Show two phones side by side for collab demos
  enableSync?: boolean; // Enable Y.js sync from the start (needed for addSecondPhone)
  sessionId?: string; // Unique session ID for state isolation (auto-generated if not provided)
  offlineMode?: boolean; // Disable all network connections (for landing page without server)
  stepMode?: boolean; // Manual step mode - user must click "Next" to advance (no auto-countdown)
}

// Messages sent from Player to Iframe
export interface DemoCommand {
  type: 'demoCommand';
  action: any; // DemoAction from AutoplayDemo
}

export interface DemoControl {
  type: 'demoControl';
  command: 'start' | 'stop' | 'pause' | 'resume' | 'resumeFromAction' | 'goToStep' | 'nextAction' | 'setStepMode' | 'startFromAction' | 'executeAction';
  actionIndex?: number;  // Required for resumeFromAction and startFromAction commands
  step?: number;         // Required for goToStep command
  enabled?: boolean;     // Required for setStepMode command
  action?: DemoAction;   // Required for executeAction command
  fastForward?: boolean; // When true, action is executed in fast-forward mode (no animations)
}

// Messages received from Iframe
export interface DemoReadyEvent {
  type: 'demoReady';
}

export interface DemoActionCompleteEvent {
  type: 'demoActionComplete';
  actionIndex: number;
}

export interface DemoStepChangedEvent {
  type: 'demoStepChanged';
  step: number;
}

export type IframeMessage = DemoReadyEvent | DemoActionCompleteEvent | DemoStepChangedEvent;

// Snapshot data for a step
interface StepSnapshot {
  step: number;
  actionIndex: number;
  stateVector: number[];  // Y.js state as array (for postMessage serialization)
}

export class DemoPlayer {
  private container: HTMLElement;
  private iframes: HTMLIFrameElement[] = [];
  private tabsContainer: HTMLElement | null = null;
  private overlayContainer: HTMLElement | null = null;
  private phoneScreen: HTMLElement | null = null;
  private commentDismissTimer: ReturnType<typeof setTimeout> | null = null;
  private playerFrame: HTMLElement | null = null;
  private hasSecondPhone: boolean = false;
  private messageHandler: ((event: MessageEvent) => void) | null = null;

  private options: DemoPlayerOptions;
  private sessionId: string;
  private currentStep: number = 0;
  private isPlaying: boolean = false;
  private isPausedState: boolean = false;
  private iframesReady: boolean[] = [];
  private iframeAcknowledgedStart: boolean = false; // Tracks if iframe has acknowledged startFromAction
  private keyboardHandler: ((event: KeyboardEvent) => void) | null = null;
  private pauseButton: HTMLElement | null = null;
  private videoCallOverlay: HTMLElement | null = null;
  private stepModeNextButton: HTMLElement | null = null;
  private actionListContainer: HTMLElement | null = null;
  private demoActions: DemoAction[] = [];

  // Chapter snapshots for navigation
  private snapshots: Map<number, StepSnapshot> = new Map();
  private currentActionIndex: number = 0;  // Track current action for snapshot capture

  // Pending command to execute when comment overlay is dismissed
  private pendingCommand: DemoControl | null = null;

  // Callbacks
  public onStepChange?: (step: number) => void;
  public onPlaybackComplete?: () => void;

  constructor(options: DemoPlayerOptions) {
    this.options = options;
    this.container = options.container;
    // Generate unique session ID if not provided
    this.sessionId = options.sessionId || Math.random().toString(36).substring(2, 10);
    console.log('[DemoPlayer] Session ID:', this.sessionId);
    this.createDOM();
    this.setupMessageListener();
    this.setupKeyboardListener();

    // Check for initial action from URL hash
    const initialAction = this.parseUrlHash();
    if (initialAction !== null) {
      console.log('[DemoPlayer] Starting from URL hash action:', initialAction);
      this.currentActionIndex = initialAction;
    }

    if (options.autoStart !== false) {
      // Wait for iframe to be ready before starting
      this.waitForReady().then(() => {
        if (initialAction !== null) {
          this.startFromAction(initialAction);
        } else {
          this.start();
        }
      });
    }
  }

  /**
   * Parse URL hash for action index (e.g., #action=26)
   */
  private parseUrlHash(): number | null {
    const hash = window.location.hash;
    if (!hash) return null;

    // Parse #action=N format
    const match = hash.match(/action=(\d+)/);
    if (match) {
      const actionIndex = parseInt(match[1], 10);
      if (!isNaN(actionIndex) && actionIndex >= 0) {
        return actionIndex;
      }
    }
    return null;
  }

  /**
   * Update URL hash with current action index
   */
  private updateUrlHash(actionIndex: number): void {
    // Only update in step mode to avoid polluting history during auto-play
    if (!this.options.stepMode) return;

    const newHash = `#action=${actionIndex}`;
    // Use replaceState to avoid adding to browser history
    const url = new URL(window.location.href);
    url.hash = newHash;
    window.history.replaceState(null, '', url.toString());
  }

  /**
   * Create the DOM structure for the demo player
   */
  private createDOM(): void {
    const { steps, editorUrl, demoScript, dualPhone, enableSync, offlineMode } = this.options;
    const phoneCount = dualPhone ? 2 : 1;
    const offlineParam = offlineMode ? '&offline=true' : '';

    // Create main wrapper
    const playerEl = document.createElement('div');
    playerEl.className = 'demo-player';

    // Create tabs
    this.tabsContainer = document.createElement('div');
    this.tabsContainer.className = 'demo-tabs';

    steps.forEach((step, index) => {
      const tab = document.createElement('button');
      tab.className = 'demo-tab' + (index === 0 ? ' active' : '');
      tab.textContent = step.label;
      tab.dataset.step = String(index);
      tab.addEventListener('click', () => this.goToStep(index));
      this.tabsContainer!.appendChild(tab);
    });

    // Create player frame (grows horizontally to fill)
    const playerFrame = document.createElement('div');
    playerFrame.className = 'player-frame' + (dualPhone ? ' dual-phone' : '');
    this.playerFrame = playerFrame; // Store reference for addSecondPhone

    // User identities for dual phone mode
    const DEMO_USERS = [
      { name: 'Alice', color: '#3b82f6' },  // Blue
      { name: 'Bob', color: '#10b981' },    // Green
    ];

    // Store reference to Alice's phone screen for video call overlay
    let alicePhoneScreen: HTMLElement | null = null;

    // Create phone mockup(s)
    for (let i = 0; i < phoneCount; i++) {
      // Wrap phone in container for label positioning
      const phoneWrapper = document.createElement('div');
      phoneWrapper.className = 'phone-wrapper';

      const phoneMockup = document.createElement('div');
      phoneMockup.className = 'phone-mockup';

      const phoneScreen = document.createElement('div');
      phoneScreen.className = 'phone-screen';

      // Store Alice's phone screen (first phone)
      if (i === 0) {
        alicePhoneScreen = phoneScreen;
      }

      // Create iframe
      // Include autoplay=true so AutoplayDemo is initialized in main.ts
      // remoteControl=true tells AutoplayDemo to let parent handle overlays
      // For dual phone: enableSync=true so both phones sync, demoUser for different identities
      // Second phone gets observeOnly=true so it doesn't run the demo script
      const iframe = document.createElement('iframe');
      let syncParams = '';
      if (dualPhone) {
        const isSecondPhone = i === 1;
        syncParams = `&enableSync=true&demoUser=${i + 1}${isSecondPhone ? '&observeOnly=true' : ''}`;
      } else if (enableSync) {
        // Single phone with sync enabled (for later addSecondPhone)
        syncParams = `&enableSync=true&demoUser=1`;
      }
      iframe.src = `${editorUrl}?autoplay=true&remoteControl=true&demo=${demoScript}&showToolbar=true${syncParams}${offlineParam}`;
      iframe.setAttribute('frameborder', '0');
      iframe.setAttribute('allowfullscreen', 'true');

      // Create home indicator
      const homeIndicator = document.createElement('div');
      homeIndicator.className = 'home-indicator';

      // Assemble phone
      phoneScreen.appendChild(iframe);
      phoneScreen.appendChild(homeIndicator);
      phoneMockup.appendChild(phoneScreen);
      phoneWrapper.appendChild(phoneMockup);

      // Add user label for dual phone mode
      if (dualPhone || enableSync) {
        const user = DEMO_USERS[i];
        const label = document.createElement('div');
        label.className = 'phone-label';
        label.innerHTML = `
          <span class="phone-label-avatar" style="background-color: ${user.color}">${user.name[0]}</span>
          <span class="phone-label-name">${user.name}</span>
        `;
        phoneWrapper.appendChild(label);
      }

      playerFrame.appendChild(phoneWrapper);

      // Store references
      this.iframes.push(iframe);
      this.iframesReady.push(false);

      // Store first phone screen for backward compatibility
      if (i === 0) {
        this.phoneScreen = phoneScreen;
      }
    }

    // Create floating speech bubble overlay (positioned inside player)
    this.overlayContainer = document.createElement('div');
    this.overlayContainer.className = 'speech-bubble-overlay';
    this.overlayContainer.innerHTML = `
      <div class="speech-bubble">
        <div class="bubble-content">
          <div class="comment-heading"></div>
          <div class="comment-text"></div>
        </div>
        <div class="bubble-footer">
          <div class="countdown-ring">
            <svg viewBox="0 0 36 36">
              <circle class="countdown-bg" cx="18" cy="18" r="16" />
              <circle class="countdown-progress" cx="18" cy="18" r="16" />
            </svg>
            <span class="tap-hint">Tap</span>
          </div>
        </div>
        <div class="bubble-tail"></div>
      </div>
    `;

    // Add click handler to dismiss and resume playback
    this.overlayContainer.addEventListener('click', () => {
      this.hideComment();
    });

    // Create pause button (shows when paused)
    this.pauseButton = document.createElement('div');
    this.pauseButton.className = 'pause-button';
    this.pauseButton.innerHTML = `
      <svg class="play-icon" width="48" height="48" viewBox="0 0 24 24" fill="white">
        <polygon points="5,3 19,12 5,21" />
      </svg>
      <svg class="pause-icon" width="48" height="48" viewBox="0 0 24 24" fill="white">
        <rect x="6" y="4" width="4" height="16" />
        <rect x="14" y="4" width="4" height="16" />
      </svg>
    `;
    this.pauseButton.addEventListener('click', () => {
      this.togglePause();
    });

    // Create step mode Next button (large, prominent button for manual advancement)
    if (this.options.stepMode) {
      this.stepModeNextButton = document.createElement('button');
      this.stepModeNextButton.className = 'step-mode-next-button';
      this.stepModeNextButton.innerHTML = `
        <span class="step-next-icon">→</span>
        <span class="step-next-text">Next Action</span>
        <span class="step-next-index">#${this.currentActionIndex}</span>
      `;
      this.stepModeNextButton.addEventListener('click', () => {
        // If iframe hasn't acknowledged start yet, re-send startFromAction
        // This handles cases where the initial command wasn't received
        if (!this.iframeAcknowledgedStart && this.currentActionIndex > 0) {
          console.log('[DemoPlayer] Iframe not yet acknowledged, re-sending startFromAction:', this.currentActionIndex);
          // Re-send the commands to ensure iframe is in sync
          this.sendCommand({
            type: 'demoControl',
            command: 'setStepMode',
            enabled: true
          });
          this.sendCommand({
            type: 'demoControl',
            command: 'startFromAction',
            actionIndex: this.currentActionIndex
          });
          return;
        }

        // Send nextAction command to iframe - execute just one action
        this.sendCommand({
          type: 'demoControl',
          command: 'nextAction'
        });
      });
    }

    // Create video call overlay (FaceTime-style floating thumbnails)
    this.videoCallOverlay = document.createElement('div');
    this.videoCallOverlay.className = 'demo-video-call-overlay';
    this.videoCallOverlay.innerHTML = `
      <div class="video-call-container">
        <div class="video-thumbnail bob">
          <div class="video-avatar-circle">B</div>
          <span class="video-name">Bob</span>
        </div>
        <div class="video-thumbnail self">
          <div class="video-avatar-circle self">A</div>
        </div>
      </div>
    `;

    // Add video call overlay to Alice's phone screen (so it appears on top of the map)
    if (alicePhoneScreen) {
      alicePhoneScreen.appendChild(this.videoCallOverlay);
    }

    // Create player content wrapper (frame + pause button + speech bubble overlay)
    const playerContent = document.createElement('div');
    playerContent.className = 'player-content';
    playerContent.appendChild(playerFrame);
    playerContent.appendChild(this.pauseButton);
    playerContent.appendChild(this.overlayContainer);  // Speech bubble overlay inside player
    if (this.stepModeNextButton) {
      playerContent.appendChild(this.stepModeNextButton);
    }

    // Create action list (only in step mode)
    if (this.options.stepMode) {
      this.createActionList(demoScript);
    }

    // Assemble player - tabs, then player content
    playerEl.appendChild(this.tabsContainer);
    playerEl.appendChild(playerContent);
    if (this.actionListContainer) {
      playerEl.appendChild(this.actionListContainer);
    }

    // Add styles
    this.injectStyles();

    // Mount to container
    this.container.appendChild(playerEl);
  }

  /**
   * Inject CSS styles for the demo player
   */
  private injectStyles(): void {
    const styleId = 'demo-player-styles';
    if (document.getElementById(styleId)) return;

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      .demo-player {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 24px;
        width: 100%;
      }

      .player-content {
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 100%;
      }

      .player-frame {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 40px;
        min-width: 800px;
        padding: 40px;
        min-height: 500px;
      }

      .player-frame.dual-phone {
        min-width: 700px;
      }

      .player-frame.dual-phone .phone-mockup {
        width: 240px;
      }

      .demo-tabs {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        justify-content: center;
      }

      .demo-tab {
        padding: 8px 16px;
        border: 1.5px solid #E5E7EB;
        border-radius: 20px;
        background: white;
        font-size: 14px;
        font-weight: 500;
        color: #6B7280;
        cursor: pointer;
        transition: all 0.2s;
      }

      .demo-tab:hover {
        border-color: #9CA3AF;
      }

      .demo-tab.active {
        background: #111827;
        border-color: #111827;
        color: white;
      }

      .demo-tab.completed {
        background: #10B981;
        border-color: #10B981;
        color: white;
      }

      .phone-mockup {
        position: relative;
        width: 340px;
        background: #1a1a1a;
        border-radius: 44px;
        padding: 14px;
        box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
      }

      .phone-screen {
        position: relative;
        width: 100%;
        aspect-ratio: 9 / 19.5;
        background: white;
        border-radius: 28px;
        overflow: hidden;
      }

      .phone-screen iframe {
        width: 100%;
        height: 100%;
        border: none;
      }

      /* Speech bubble overlay - cartoonish floating bubble */
      .speech-bubble-overlay {
        position: absolute;
        bottom: 20%;
        right: 5%;
        z-index: 100;
        opacity: 0;
        pointer-events: none;
        transition: opacity 0.2s ease-out;
      }

      .speech-bubble-overlay.visible {
        opacity: 1;
        pointer-events: auto;
        cursor: pointer;
      }

      .speech-bubble {
        position: relative;
        background: white;
        /* Asymmetric border-radius for organic hand-drawn feel */
        border-radius: 24px 28px 8px 26px;
        padding: 14px 18px;
        min-width: 160px;
        max-width: 200px;
        /* Comic-style border */
        border: 2.5px solid #1f2937;
        /* Playful shadow offset */
        box-shadow: 4px 4px 0 #1f2937;
        transform: scale(0.8) rotate(-2deg);
        opacity: 0;
        animation: none;
      }

      .speech-bubble-overlay.visible .speech-bubble {
        animation: bubblePopIn 0.35s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
      }

      @keyframes bubblePopIn {
        0% { opacity: 0; transform: scale(0.6) rotate(-8deg); }
        60% { transform: scale(1.05) rotate(1deg); }
        100% { opacity: 1; transform: scale(1) rotate(-2deg); }
      }

      /* Bubble tail - curved comic style pointing to bottom-left */
      .bubble-tail {
        position: absolute;
        bottom: -18px;
        left: 25px;
        width: 20px;
        height: 20px;
        background: white;
        border-left: 2.5px solid #1f2937;
        border-bottom: 2.5px solid #1f2937;
        transform: rotate(-45deg) skewX(-10deg);
        transform-origin: top left;
      }

      /* Shadow for tail */
      .bubble-tail::after {
        content: '';
        position: absolute;
        width: 100%;
        height: 100%;
        background: #1f2937;
        left: 4px;
        top: 4px;
        z-index: -1;
        border-radius: 0 0 0 2px;
      }

      .bubble-content {
        text-align: left;
        margin-bottom: 10px;
      }

      .comment-heading {
        font-size: 15px;
        font-weight: 700;
        color: #1f2937;
        line-height: 1.2;
        margin-bottom: 4px;
      }

      .comment-text {
        font-size: 12px;
        font-weight: 500;
        color: #4b5563;
        line-height: 1.4;
      }

      .bubble-footer {
        display: flex;
        justify-content: flex-end;
      }

      /* Countdown ring - smaller for compact bubble */
      .countdown-ring {
        position: relative;
        width: 32px;
        height: 32px;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .countdown-ring svg {
        position: absolute;
        width: 100%;
        height: 100%;
        transform: rotate(-90deg);
      }

      .countdown-bg {
        fill: none;
        stroke: #e5e7eb;
        stroke-width: 3;
      }

      .countdown-progress {
        fill: none;
        stroke: #3b82f6;
        stroke-width: 3;
        stroke-linecap: round;
        stroke-dasharray: 100.53;
        stroke-dashoffset: 100.53;
        transition: stroke-dashoffset 0.1s linear;
      }

      .speech-bubble-overlay.visible .countdown-progress {
        animation: countdownFill var(--countdown-duration, 5s) linear forwards;
      }

      @keyframes countdownFill {
        0% { stroke-dashoffset: 100.53; }
        100% { stroke-dashoffset: 0; }
      }

      .tap-hint {
        font-size: 9px;
        color: #6b7280;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.3px;
        z-index: 1;
      }

      /* Step mode - hide countdown animation, show button style */
      .countdown-ring.step-mode svg {
        display: none;
      }

      .countdown-ring.step-mode {
        background: #3b82f6;
        border-radius: 6px;
        width: auto;
        height: auto;
        padding: 6px 12px;
        cursor: pointer;
        transition: background 0.2s;
      }

      .countdown-ring.step-mode:hover {
        background: #2563eb;
      }

      .countdown-ring.step-mode .tap-hint {
        color: white;
        font-size: 11px;
      }

      .comment-heading .cursor,
      .comment-text .cursor {
        display: inline-block;
        width: 2px;
        height: 1em;
        background: #3b82f6;
        margin-left: 2px;
        animation: cursor-blink 0.8s step-end infinite;
      }

      @keyframes cursor-blink {
        0%, 100% { opacity: 1; }
        50% { opacity: 0; }
      }

      .home-indicator {
        position: absolute;
        bottom: 8px;
        left: 50%;
        transform: translateX(-50%);
        width: 100px;
        height: 4px;
        background: rgba(0, 0, 0, 0.3);
        border-radius: 2px;
      }

      /* Phone wrapper for label positioning */
      .phone-wrapper {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 16px;
      }

      /* User label below phone */
      .phone-label {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 16px;
        background: white;
        border-radius: 24px;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
        opacity: 0;
        transform: translateY(-10px);
        animation: labelFadeIn 0.3s ease-out forwards;
        animation-delay: 0.2s;
      }

      .phone-label-avatar {
        width: 28px;
        height: 28px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        font-weight: 600;
        font-size: 14px;
      }

      .phone-label-name {
        font-size: 14px;
        font-weight: 600;
        color: #374151;
      }

      @keyframes labelFadeIn {
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }

      /* Second phone slide-in animation */
      .phone-wrapper.second-phone {
        animation: slideInFromRight 0.5s ease-out forwards;
      }

      .phone-wrapper.second-phone .phone-label {
        animation-delay: 0.4s;
      }

      @keyframes slideInFromRight {
        from {
          opacity: 0;
          transform: translateX(50px);
        }
        to {
          opacity: 1;
          transform: translateX(0);
        }
      }

      /* Transition for player frame when adding second phone */
      .player-frame.transitioning {
        transition: all 0.3s ease-out;
      }

      /* Second phone slide-out animation for removal */
      .phone-wrapper.second-phone.removing {
        animation: slideOutToRight 0.3s ease-out forwards;
      }

      @keyframes slideOutToRight {
        from {
          opacity: 1;
          transform: translateX(0);
        }
        to {
          opacity: 0;
          transform: translateX(50px);
        }
      }

      /* Label fade-out animation */
      .phone-label.removing {
        animation: labelFadeOut 0.3s ease-out forwards;
      }

      @keyframes labelFadeOut {
        from {
          opacity: 1;
          transform: translateY(0);
        }
        to {
          opacity: 0;
          transform: translateY(-10px);
        }
      }

      /* Pause button */
      .pause-button {
        position: absolute;
        bottom: 20px;
        right: 20px;
        width: 56px;
        height: 56px;
        background: rgba(0, 0, 0, 0.6);
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        z-index: 150;
        transition: all 0.2s ease;
        opacity: 0.6;
      }

      .pause-button:hover {
        opacity: 1;
        background: rgba(0, 0, 0, 0.8);
        transform: scale(1.1);
      }

      .pause-button .play-icon {
        display: none;
      }

      .pause-button .pause-icon {
        display: block;
      }

      .pause-button.paused .play-icon {
        display: block;
      }

      .pause-button.paused .pause-icon {
        display: none;
      }

      .pause-button.paused {
        opacity: 1;
        background: rgba(0, 0, 0, 0.8);
      }

      /* Step mode Next button - large, prominent button */
      .step-mode-next-button {
        position: absolute;
        bottom: 20px;
        right: 100px;
        padding: 16px 32px;
        font-size: 18px;
        font-weight: 600;
        background: #3b82f6;
        color: white;
        border: none;
        border-radius: 12px;
        cursor: pointer;
        z-index: 200;
        display: flex;
        align-items: center;
        gap: 12px;
        box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4);
        transition: all 0.2s ease;
      }

      .step-mode-next-button:hover {
        background: #2563eb;
        transform: translateY(-2px);
        box-shadow: 0 6px 16px rgba(59, 130, 246, 0.5);
      }

      .step-mode-next-button:active {
        transform: translateY(0);
      }

      .step-next-icon {
        font-size: 24px;
      }

      .step-next-text {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      }

      .step-next-index {
        background: rgba(255, 255, 255, 0.2);
        padding: 4px 8px;
        border-radius: 6px;
        font-size: 14px;
        font-family: monospace;
      }

      .step-mode-next-button:disabled {
        background: #22c55e;
        cursor: default;
      }

      .step-mode-next-button:disabled:hover {
        background: #22c55e;
        transform: none;
        box-shadow: 0 4px 12px rgba(34, 197, 94, 0.4);
      }

      /* Responsive scaling - use viewport-based sizing for dual phones */
      @media (max-width: 768px) {
        .player-frame {
          min-width: unset;
          width: 100%;
          padding: 20px;
          gap: 20px;
        }

        .player-frame.dual-phone {
          min-width: unset;
          gap: 16px;
          padding: 16px;
        }

        /* Single phone stays large on tablet */
        .phone-mockup {
          width: 300px;
        }

        /* Dual phone: each phone takes ~45% of container width minus gap */
        .player-frame.dual-phone .phone-mockup {
          width: calc(45vw - 20px);
          max-width: 240px;
          min-width: 140px;
        }
      }

      /* Narrow screens - tighter layout */
      @media (max-width: 550px) {
        .player-frame {
          padding: 12px;
          gap: 12px;
        }

        .player-frame.dual-phone {
          gap: 10px;
          padding: 8px;
        }

        /* Single phone: take most of screen width */
        .phone-mockup {
          width: min(280px, 85vw);
        }

        /* Dual phone: maximize available width */
        .player-frame.dual-phone .phone-mockup {
          width: calc(48vw - 12px);
          max-width: 200px;
          min-width: 120px;
        }
      }

      /* Very narrow devices (iPhone SE, small phones) */
      @media (max-width: 400px) {
        /* Single phone: nearly full width */
        .phone-mockup {
          width: min(260px, 90vw);
        }

        .player-frame.dual-phone {
          gap: 6px;
          padding: 4px;
        }

        .player-frame.dual-phone .phone-mockup {
          width: calc(49vw - 8px);
          max-width: 180px;
          min-width: 100px;
        }
      }

      /* Video call overlay - FaceTime-style floating thumbnails inside phone */
      .demo-video-call-overlay {
        position: absolute;
        top: 50px;
        right: 8px;
        z-index: 200;
        opacity: 0;
        pointer-events: none;
        transition: opacity 0.3s ease;
      }

      .demo-video-call-overlay.visible {
        opacity: 1;
        pointer-events: auto;
      }

      .video-call-container {
        display: flex;
        flex-direction: column;
        gap: 8px;
        align-items: flex-end;
      }

      .video-thumbnail {
        display: flex;
        align-items: center;
        gap: 6px;
        background: rgba(0, 0, 0, 0.6);
        padding: 6px 10px 6px 6px;
        border-radius: 20px;
        backdrop-filter: blur(8px);
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
      }

      .video-thumbnail.self {
        background: rgba(0, 0, 0, 0.4);
        padding: 4px;
        border-radius: 12px;
      }

      .video-avatar-circle {
        width: 32px;
        height: 32px;
        border-radius: 50%;
        background: #10b981;
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        font-weight: 600;
        font-size: 14px;
        border: 2px solid rgba(255, 255, 255, 0.3);
      }

      .video-avatar-circle.self {
        width: 40px;
        height: 40px;
        font-size: 16px;
        background: #3b82f6;
        border: 2px solid rgba(255, 255, 255, 0.5);
      }

      .video-name {
        font-size: 12px;
        font-weight: 500;
        color: white;
      }

      /* Pop-in animation for video call */
      .demo-video-call-overlay.visible .video-thumbnail {
        animation: thumbnailPopIn 0.3s ease-out forwards;
        opacity: 0;
      }

      .demo-video-call-overlay.visible .video-thumbnail.self {
        animation-delay: 0.15s;
      }

      @keyframes thumbnailPopIn {
        0% {
          opacity: 0;
          transform: scale(0.7) translateX(20px);
        }
        100% {
          opacity: 1;
          transform: scale(1) translateX(0);
        }
      }

      /* Action list panel */
      .action-list-container {
        width: 100%;
        max-width: 600px;
        background: #f8fafc;
        border: 1px solid #e2e8f0;
        border-radius: 12px;
        padding: 16px;
        margin-top: 24px;
      }

      .action-list-header {
        font-size: 14px;
        font-weight: 600;
        color: #475569;
        margin-bottom: 12px;
        padding-bottom: 8px;
        border-bottom: 1px solid #e2e8f0;
      }

      .action-list {
        max-height: 400px;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: 4px;
      }

      .action-list-item {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 12px;
        background: white;
        border-radius: 8px;
        border: 1px solid transparent;
        cursor: pointer;
        transition: all 0.15s ease;
        font-size: 13px;
      }

      .action-list-item:hover {
        border-color: #cbd5e1;
        background: #f1f5f9;
      }

      .action-list-item.active {
        background: #3b82f6;
        border-color: #3b82f6;
        color: white;
      }

      .action-list-item.active .action-index,
      .action-list-item.active .action-type,
      .action-list-item.active .action-detail {
        color: white;
      }

      .action-list-item.completed {
        background: #f0fdf4;
        border-color: #bbf7d0;
      }

      .action-list-item.completed .action-index {
        color: #16a34a;
      }

      .action-index {
        font-family: monospace;
        font-size: 11px;
        color: #94a3b8;
        min-width: 28px;
      }

      .action-type {
        font-weight: 600;
        color: #334155;
        min-width: 140px;
      }

      .action-detail {
        color: #64748b;
        font-size: 12px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
    `;
    document.head.appendChild(style);
  }

  /**
   * Setup message listener for iframe communication
   */
  private setupMessageListener(): void {
    this.messageHandler = (event: MessageEvent) => {
      const data = event.data;

      // Find which iframe sent the message
      const iframeIndex = this.iframes.findIndex(iframe =>
        iframe.contentWindow === event.source
      );

      switch (data.type) {
        case 'demoReady':
          console.log('[DemoPlayer] Iframe ready:', iframeIndex);
          if (iframeIndex >= 0) {
            this.iframesReady[iframeIndex] = true;
          }
          break;

        case 'demoActionComplete':
          // Track current action index for snapshot capture
          if (iframeIndex === 0 && typeof data.actionIndex === 'number') {
            this.currentActionIndex = data.actionIndex;
            // Mark that iframe has acknowledged and is ready for nextAction commands
            this.iframeAcknowledgedStart = true;

            // Update URL hash with next action index (the action we'll execute next)
            const nextIndex = data.actionIndex + 1;
            this.updateUrlHash(nextIndex);

            // Update action list highlighting
            this.updateActionListHighlight(nextIndex);

            // In step mode, update the button to show the next action info
            if (this.options.stepMode && this.stepModeNextButton) {
              const actionType = data.actionType || 'unknown';
              const isLastAction = data.isLastAction === true;

              if (isLastAction) {
                this.stepModeNextButton.innerHTML = `
                  <span class="step-next-icon">✓</span>
                  <span class="step-next-text">Demo Complete</span>
                `;
                this.stepModeNextButton.disabled = true;
              } else {
                this.stepModeNextButton.innerHTML = `
                  <span class="step-next-icon">→</span>
                  <span class="step-next-text">Next Action</span>
                  <span class="step-next-index">#${nextIndex}</span>
                `;
              }

              console.log(`[DemoPlayer] Step mode: action ${data.actionIndex} (${actionType}) complete, next: ${nextIndex}`);
            }
          }
          break;

        case 'demoStepChanged':
          // Only respond to first iframe's step changes to avoid duplicates
          if (iframeIndex === 0) {
            console.log('[DemoPlayer] Step changed:', data.step, 'actionIndex:', data.actionIndex, data.heading, data.text);
            this.updateTabs(data.step);
            this.currentStep = data.step;
            // Track the action index from the demo
            if (typeof data.actionIndex === 'number') {
              this.currentActionIndex = data.actionIndex;
            }
            this.onStepChange?.(data.step);

            // Capture snapshot for this step if we don't have one yet
            if (!this.snapshots.has(data.step)) {
              const actionIdx = data.actionIndex ?? this.currentActionIndex;
              console.log(`[DemoPlayer] Requesting snapshot for step ${data.step}, actionIndex ${actionIdx}`);
              // Request snapshot from first iframe
              this.iframes[0]?.contentWindow?.postMessage({
                type: 'captureSnapshot',
                step: data.step,
                actionIndex: actionIdx
              }, '*');
            }

            // Dynamically add/remove second phone based on step (for enableSync mode)
            if (this.options.enableSync && !this.options.dualPhone) {
              if (data.step === 4) {
                // Share step - add Bob's phone
                this.addSecondPhone();
              } else if (data.step === 0 && this.hasSecondPhone) {
                // Writing step (loop restart) - remove Bob's phone
                this.removeSecondPhone();
              }
            }

            // Show comment overlay if heading/text provided
            if (data.heading || data.text) {
              this.showComment(data.heading || '', data.text || '', data.duration || 1500);
            }
          }
          break;

        case 'snapshotCaptured':
          // Store the captured snapshot
          console.log(`[DemoPlayer] Snapshot captured for step ${data.step}, actionIndex ${data.actionIndex}`);
          this.snapshots.set(data.step, {
            step: data.step,
            actionIndex: data.actionIndex,
            stateVector: data.stateVector
          });
          break;

        case 'showVideoCall':
          // Show video call overlay
          console.log('[DemoPlayer] Showing video call overlay');
          this.showVideoCallOverlay();
          break;

        case 'hideVideoCall':
          // Hide video call overlay
          console.log('[DemoPlayer] Hiding video call overlay');
          this.hideVideoCallOverlay();
          break;

        case 'bobCommand':
          // Forward command to Bob's iframe (second phone)
          if (this.iframes.length > 1 && this.iframes[1]?.contentWindow) {
            console.log(`[DemoPlayer] Forwarding bobCommand to Bob:`, data.command);
            // Extract type from data to avoid overwriting 'demoCommand'
            const { type: _, ...commandData } = data;
            this.iframes[1].contentWindow.postMessage({
              type: 'demoCommand',
              ...commandData
            }, '*');
          } else {
            console.warn('[DemoPlayer] No second iframe to forward bobCommand to');
          }
          break;
      }
    };
    window.addEventListener('message', this.messageHandler);
  }

  /**
   * Setup keyboard listener for pause/resume
   */
  private setupKeyboardListener(): void {
    this.keyboardHandler = (event: KeyboardEvent) => {
      // Space bar toggles pause (only if not typing in an input)
      if (event.code === 'Space' &&
          !(event.target instanceof HTMLInputElement) &&
          !(event.target instanceof HTMLTextAreaElement)) {
        event.preventDefault();
        this.togglePause();
      }
    };
    window.addEventListener('keydown', this.keyboardHandler);
  }

  /**
   * Check if all iframes are ready
   */
  private allIframesReady(): boolean {
    return this.iframesReady.every(ready => ready);
  }

  /**
   * Wait for all iframes to be ready
   */
  private waitForReady(): Promise<void> {
    return new Promise((resolve) => {
      if (this.allIframesReady()) {
        resolve();
        return;
      }

      const checkReady = () => {
        if (this.allIframesReady()) {
          resolve();
        } else {
          setTimeout(checkReady, 100);
        }
      };

      // Also wait for iframe load events
      this.iframes.forEach((iframe, index) => {
        iframe.addEventListener('load', () => {
          // Give it a moment to initialize
          setTimeout(() => {
            if (!this.iframesReady[index]) {
              // Assume ready if no message received
              this.iframesReady[index] = true;
            }
            if (this.allIframesReady()) {
              resolve();
            }
          }, 500);
        });
      });

      checkReady();
    });
  }

  /**
   * Send a command to all iframes
   */
  private sendCommand(message: DemoCommand | DemoControl): void {
    this.iframes.forEach(iframe => {
      if (iframe.contentWindow) {
        iframe.contentWindow.postMessage(message, '*');
      }
    });
  }

  /**
   * Show speech bubble overlay with countdown animation
   * When countdown completes (or user taps), bubble dismisses and demo resumes
   * In stepMode, no auto-countdown - user must click to advance
   */
  public async showComment(heading: string, text: string, duration: number = 5000): Promise<void> {
    if (!this.overlayContainer) return;

    // Clear any existing dismiss timer
    if (this.commentDismissTimer) {
      clearTimeout(this.commentDismissTimer);
      this.commentDismissTimer = null;
    }

    const headingEl = this.overlayContainer.querySelector('.comment-heading') as HTMLElement;
    const textEl = this.overlayContainer.querySelector('.comment-text') as HTMLElement;
    const bubble = this.overlayContainer.querySelector('.speech-bubble') as HTMLElement;
    const countdownProgress = this.overlayContainer.querySelector('.countdown-progress') as SVGCircleElement;
    const countdownRing = this.overlayContainer.querySelector('.countdown-ring') as HTMLElement;
    const tapHint = this.overlayContainer.querySelector('.tap-hint') as HTMLElement;

    // Set text directly
    headingEl.textContent = heading;
    textEl.textContent = text;

    // Handle step mode vs auto mode
    const isStepMode = this.options.stepMode === true;

    if (isStepMode) {
      // Step mode: hide countdown, show "Next" button
      if (countdownRing) {
        countdownRing.classList.add('step-mode');
      }
      if (tapHint) {
        tapHint.textContent = 'Next';
      }
    } else {
      // Auto mode: show countdown
      if (countdownRing) {
        countdownRing.classList.remove('step-mode');
      }
      if (tapHint) {
        tapHint.textContent = 'Tap';
      }
      // Set countdown duration as CSS variable
      this.overlayContainer.style.setProperty('--countdown-duration', `${duration}ms`);
    }

    // Reset animations by removing and re-adding visible class
    this.overlayContainer.classList.remove('visible');
    if (bubble) {
      bubble.style.animation = 'none';
      bubble.offsetHeight; // Force reflow
      bubble.style.animation = '';
    }
    if (countdownProgress && !isStepMode) {
      countdownProgress.style.animation = 'none';
      void countdownProgress.getBoundingClientRect(); // Force reflow for SVG
      countdownProgress.style.animation = '';
    }

    // Pause all iframes
    this.iframes.forEach(iframe => {
      iframe.contentWindow?.postMessage({ type: 'demoControl', command: 'pause' }, '*');
    });

    // Show bubble
    this.overlayContainer.classList.add('visible');

    // Auto-dismiss when countdown completes (only in auto mode)
    if (!isStepMode) {
      this.commentDismissTimer = setTimeout(() => {
        this.hideComment();
      }, duration);
    }
  }

  /**
   * Hide comment overlay and resume playback
   */
  public hideComment(): void {
    if (!this.overlayContainer) return;

    // Clear dismiss timer if user clicked early
    if (this.commentDismissTimer) {
      clearTimeout(this.commentDismissTimer);
      this.commentDismissTimer = null;
    }

    // Hide overlay
    this.overlayContainer.classList.remove('visible');

    // Check if there's a pending command to execute (from goToStep navigation)
    if (this.pendingCommand) {
      console.log('[DemoPlayer] Executing pending command:', this.pendingCommand.command);
      this.sendCommand(this.pendingCommand);
      this.pendingCommand = null;
    } else {
      // Resume all iframes with generic resume
      this.iframes.forEach(iframe => {
        iframe.contentWindow?.postMessage({ type: 'demoControl', command: 'resume' }, '*');
      });
    }
  }

  /**
   * Typewriter effect for text
   */
  private async typeText(element: HTMLElement, text: string, speed: number): Promise<void> {
    element.innerHTML = '<span class="cursor"></span>';

    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const cursorEl = element.querySelector('.cursor');

      if (cursorEl) {
        const textNode = document.createTextNode(char);
        element.insertBefore(textNode, cursorEl);
      }

      await this.delay(speed);
    }

    // Remove cursor after typing complete
    const cursor = element.querySelector('.cursor');
    if (cursor) cursor.remove();
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Update tab styling based on current step
   */
  private updateTabs(step: number): void {
    if (!this.tabsContainer) return;

    const tabs = this.tabsContainer.querySelectorAll('.demo-tab');
    tabs.forEach((tab, index) => {
      tab.classList.remove('active', 'completed');
      if (index < step) {
        tab.classList.add('completed');
      } else if (index === step) {
        tab.classList.add('active');
      }
    });
  }

  /**
   * Go to a specific step (chapter navigation)
   * If we have a snapshot, restore it and resume playback from that action
   */
  public goToStep(step: number): void {
    const stepDef = this.options.steps[step];
    if (!stepDef) return;

    this.currentStep = step;
    this.updateTabs(step);

    // Handle second phone visibility based on step
    // Bob's phone should only be visible at Share step (step 4)
    if (this.options.enableSync && !this.options.dualPhone) {
      if (step < 4 && this.hasSecondPhone) {
        // Going to a step before Share - remove Bob's phone
        this.removeSecondPhone();
      } else if (step === 4 && !this.hasSecondPhone) {
        // Going to Share step - add Bob's phone
        this.addSecondPhone();
      }
    }

    // Check if we have a snapshot for this step
    const snapshot = this.snapshots.get(step);

    if (snapshot) {
      console.log(`[DemoPlayer] Restoring snapshot for step ${step}, resuming from action ${snapshot.actionIndex}`);

      // Restore snapshot to all iframes
      this.iframes.forEach(iframe => {
        iframe.contentWindow?.postMessage({
          type: 'restoreSnapshot',
          step: step,
          stateVector: snapshot.stateVector
        }, '*');
      });

      // Store the pending command to be executed when comment is dismissed
      this.pendingCommand = {
        type: 'demoControl',
        command: 'resumeFromAction',
        actionIndex: snapshot.actionIndex
      };

      // Show the step comment - playback will resume when comment is dismissed
      this.showComment(stepDef.heading, stepDef.text);
    } else {
      console.log(`[DemoPlayer] No snapshot for step ${step}, jumping to step`);

      // Store the pending command to be executed when comment is dismissed
      this.pendingCommand = {
        type: 'demoControl',
        command: 'goToStep',
        step: step
      };

      // Show the step comment - playback will start when comment is dismissed
      this.showComment(stepDef.heading, stepDef.text);
    }
  }

  /**
   * Start demo playback
   */
  public start(): void {
    if (this.isPlaying) return;

    this.isPlaying = true;
    this.iframeAcknowledgedStart = false; // Reset acknowledgement flag
    console.log('[DemoPlayer] Starting playback');

    // Sync step mode to iframe if enabled
    if (this.options.stepMode) {
      this.sendCommand({
        type: 'demoControl',
        command: 'setStepMode',
        enabled: true
      });
    }

    // Tell iframe to start - it will send step changes via postMessage
    // which will trigger showComment() in the message handler
    this.sendCommand({
      type: 'demoControl',
      command: 'start'
    });
  }

  /**
   * Start demo playback from a specific action index
   * This fast-forwards through previous actions to reach the target
   */
  public async startFromAction(actionIndex: number): Promise<void> {
    if (this.isPlaying) return;

    this.isPlaying = true;
    this.iframeAcknowledgedStart = false;
    console.log('[DemoPlayer] Starting from action:', actionIndex);

    // Update URL hash
    this.updateUrlHash(actionIndex);

    // First, sync step mode to iframe if enabled
    if (this.options.stepMode) {
      this.sendCommand({
        type: 'demoControl',
        command: 'setStepMode',
        enabled: true
      });
    }

    // Fast-forward to the target action from the host
    await this.fastForwardToAction(actionIndex);

    // Update current action index and UI
    this.currentActionIndex = actionIndex;
    this.iframeAcknowledgedStart = true;

    // Update step mode button if present
    if (this.options.stepMode && this.stepModeNextButton) {
      this.stepModeNextButton.innerHTML = `
        <span class="step-next-icon">→</span>
        <span class="step-next-text">Next Action</span>
        <span class="step-next-index">#${actionIndex}</span>
      `;
    }

    // Update action list highlight
    this.updateActionListHighlight(actionIndex);

    console.log('[DemoPlayer] Fast-forward complete, ready at action:', actionIndex);
  }

  /**
   * Fast-forward through actions from setupChapterState to target action
   * Executed from host with full control over timing
   */
  private async fastForwardToAction(targetIndex: number): Promise<void> {
    const actions = this.demoActions;
    if (actions.length === 0) {
      console.warn('[DemoPlayer] No demo actions loaded, cannot fast-forward');
      return;
    }

    // Find the most recent setupChapterState action at or before target
    let setupIndex = -1;
    for (let i = targetIndex; i >= 0; i--) {
      if (actions[i].type === 'setupChapterState') {
        setupIndex = i;
        break;
      }
    }

    console.log(`[DemoPlayer] Fast-forwarding: setupIndex=${setupIndex}, targetIndex=${targetIndex}`);

    // Execute setupChapterState first if found
    if (setupIndex >= 0) {
      await this.executeActionAndWait(actions[setupIndex], setupIndex, true);
      // Wait for document to update after setup
      await this.delay(200);
    }

    // Fast-forward through intermediate actions (setupIndex+1 to targetIndex-1)
    const startFrom = setupIndex >= 0 ? setupIndex + 1 : 0;
    for (let i = startFrom; i < targetIndex; i++) {
      const action = actions[i];

      // Skip pause and comment actions during fast-forward
      if (action.type === 'pause' || action.type === 'comment') {
        continue;
      }

      console.log(`[DemoPlayer] Fast-forward executing action ${i}: ${action.type}`);
      await this.executeActionAndWait(action, i, true);

      // Add delay based on action type to let UI settle
      const delay = this.getFastForwardDelay(action);
      if (delay > 0) {
        await this.delay(delay);
      }
    }
  }

  /**
   * Get the delay to use after an action during fast-forward
   */
  private getFastForwardDelay(action: DemoAction): number {
    switch (action.type) {
      case 'openFullscreenMap':
        return 800; // Map needs time to render
      case 'clickMapMarker':
        return 1000; // Location sheet needs time to appear and attach listeners
      case 'showFingerTap':
        return 500; // UI needs time to respond to click
      case 'addWaypoint':
        return 300;
      case 'fingerDrag':
        return 200;
      default:
        return 100;
    }
  }

  /**
   * Execute a single action and wait for completion
   */
  private executeActionAndWait(action: DemoAction, actionIndex: number, fastForward: boolean): Promise<void> {
    return new Promise((resolve) => {
      // Set up one-time listener for action completion
      const handler = (event: MessageEvent) => {
        const data = event.data;
        if (data?.type === 'actionExecuted' && data.actionIndex === actionIndex) {
          window.removeEventListener('message', handler);
          resolve();
        }
      };
      window.addEventListener('message', handler);

      // Send the action to iframe
      this.sendCommand({
        type: 'demoControl',
        command: 'executeAction',
        action: action,
        actionIndex: actionIndex,
        fastForward: fastForward
      });

      // Timeout fallback in case iframe doesn't respond
      setTimeout(() => {
        window.removeEventListener('message', handler);
        resolve();
      }, 3000);
    });
  }

  /**
   * Stop demo playback
   */
  public stop(): void {
    this.isPlaying = false;
    console.log('[DemoPlayer] Stopping playback');

    this.sendCommand({
      type: 'demoControl',
      command: 'stop'
    });
  }

  /**
   * Pause demo playback
   */
  public pause(): void {
    if (this.isPausedState) return;

    this.isPausedState = true;
    console.log('[DemoPlayer] Pausing playback');

    // Update pause button visual
    this.pauseButton?.classList.add('paused');

    this.sendCommand({
      type: 'demoControl',
      command: 'pause'
    });
  }

  /**
   * Resume demo playback
   */
  public resume(): void {
    if (!this.isPausedState) return;

    this.isPausedState = false;
    console.log('[DemoPlayer] Resuming playback');

    // Update pause button visual
    this.pauseButton?.classList.remove('paused');

    this.sendCommand({
      type: 'demoControl',
      command: 'resume'
    });
  }

  /**
   * Toggle pause/resume
   */
  public togglePause(): void {
    if (this.isPausedState) {
      this.resume();
    } else {
      this.pause();
    }
  }

  /**
   * Get pause state
   */
  public get isPaused(): boolean {
    return this.isPausedState;
  }

  /**
   * Show video call overlay
   */
  public showVideoCallOverlay(): void {
    if (this.videoCallOverlay) {
      this.videoCallOverlay.classList.add('visible');
    }
  }

  /**
   * Hide video call overlay
   */
  public hideVideoCallOverlay(): void {
    if (this.videoCallOverlay) {
      this.videoCallOverlay.classList.remove('visible');
    }
  }

  /**
   * Create the action list panel showing all demo actions
   */
  private createActionList(demoScriptName: string): void {
    const script = DEMO_SCRIPTS[demoScriptName];
    if (!script) {
      console.warn(`[DemoPlayer] Demo script '${demoScriptName}' not found`);
      return;
    }

    this.demoActions = script.actions;

    this.actionListContainer = document.createElement('div');
    this.actionListContainer.className = 'action-list-container';

    const header = document.createElement('div');
    header.className = 'action-list-header';
    header.textContent = `Actions (${this.demoActions.length})`;
    this.actionListContainer.appendChild(header);

    const list = document.createElement('div');
    list.className = 'action-list';

    this.demoActions.forEach((action, index) => {
      const item = document.createElement('div');
      item.className = 'action-list-item';
      item.dataset.index = String(index);

      // Format action description
      const actionDesc = this.formatActionDescription(action);

      item.innerHTML = `
        <span class="action-index">#${index}</span>
        <span class="action-type">${action.type}</span>
        <span class="action-detail">${actionDesc}</span>
      `;

      // Click to jump to action
      item.addEventListener('click', () => {
        this.startFromAction(index);
      });

      list.appendChild(item);
    });

    this.actionListContainer.appendChild(list);

    // Highlight initial action
    this.updateActionListHighlight(this.currentActionIndex);
  }

  /**
   * Format action description for display
   */
  private formatActionDescription(action: DemoAction): string {
    switch (action.type) {
      case 'pause':
        return `${action.duration}ms`;
      case 'fingerDrag':
        return `${action.direction} ${action.distance}px`;
      case 'clickMapMarker':
        return `marker #${action.markerIndex}`;
      case 'showFingerTap':
        return action.selector || '';
      case 'setupChapterState':
        return action.state;
      case 'addWaypoint':
        return `${action.destGeoId}`;
      default:
        return '';
    }
  }

  /**
   * Update the action list to highlight the current action
   */
  private updateActionListHighlight(actionIndex: number): void {
    if (!this.actionListContainer) return;

    const items = this.actionListContainer.querySelectorAll('.action-list-item');
    items.forEach((item, index) => {
      item.classList.remove('active', 'completed');
      if (index < actionIndex) {
        item.classList.add('completed');
      } else if (index === actionIndex) {
        item.classList.add('active');
        // Scroll item into view
        item.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    });
  }

  /**
   * Clean up resources
   */
  public destroy(): void {
    console.log('[DemoPlayer] Destroying player, session:', this.sessionId);
    this.stop();

    // Send cleanup message to all iframes before removing them
    this.iframes.forEach(iframe => {
      try {
        iframe.contentWindow?.postMessage({ type: 'demoCleanup' }, '*');
      } catch (e) {
        // Iframe may already be gone
      }
    });

    // Remove message listener
    if (this.messageHandler) {
      window.removeEventListener('message', this.messageHandler);
      this.messageHandler = null;
    }

    // Remove keyboard listener
    if (this.keyboardHandler) {
      window.removeEventListener('keydown', this.keyboardHandler);
      this.keyboardHandler = null;
    }

    // Clear iframe references
    this.iframes = [];
    this.iframesReady = [];

    // Clear DOM
    this.container.innerHTML = '';
  }

  /**
   * Dynamically add a second phone (Bob) with Y.js sync
   * Requires enableSync=true to have been set in options
   */
  public addSecondPhone(): void {
    if (this.hasSecondPhone || !this.playerFrame) {
      console.log('[DemoPlayer] Second phone already added or playerFrame not ready');
      return;
    }

    console.log('[DemoPlayer] Adding second phone (Bob)');
    this.hasSecondPhone = true;

    const { editorUrl, demoScript } = this.options;

    // Add dual-phone class to player frame for styling
    this.playerFrame.classList.add('transitioning', 'dual-phone');

    // Add label to first phone (Alice) if not already present
    const firstWrapper = this.playerFrame.querySelector('.phone-wrapper');
    if (firstWrapper && !firstWrapper.querySelector('.phone-label')) {
      const aliceLabel = document.createElement('div');
      aliceLabel.className = 'phone-label';
      aliceLabel.innerHTML = `
        <span class="phone-label-avatar" style="background-color: #3b82f6">A</span>
        <span class="phone-label-name">Alice</span>
      `;
      firstWrapper.appendChild(aliceLabel);
    }

    // Create wrapper for second phone
    const phoneWrapper = document.createElement('div');
    phoneWrapper.className = 'phone-wrapper second-phone';

    // Create second phone mockup
    const phoneMockup = document.createElement('div');
    phoneMockup.className = 'phone-mockup';

    const phoneScreen = document.createElement('div');
    phoneScreen.className = 'phone-screen';

    // Create iframe for second phone (Bob)
    // - enableSync=true for Y.js sync
    // - demoUser=2 for Bob identity
    // - observeOnly=true so Bob doesn't run the demo script
    // - offline=true if parent is in offline mode
    const iframe = document.createElement('iframe');
    const offlineParam = this.options.offlineMode ? '&offline=true' : '';
    iframe.src = `${editorUrl}?autoplay=true&remoteControl=true&demo=${demoScript}&showToolbar=true&enableSync=true&demoUser=2&observeOnly=true${offlineParam}`;
    iframe.setAttribute('frameborder', '0');
    iframe.setAttribute('allowfullscreen', 'true');

    // Create home indicator
    const homeIndicator = document.createElement('div');
    homeIndicator.className = 'home-indicator';

    // Assemble phone
    phoneScreen.appendChild(iframe);
    phoneScreen.appendChild(homeIndicator);
    phoneMockup.appendChild(phoneScreen);
    phoneWrapper.appendChild(phoneMockup);

    // Add Bob's label
    const bobLabel = document.createElement('div');
    bobLabel.className = 'phone-label';
    bobLabel.innerHTML = `
      <span class="phone-label-avatar" style="background-color: #10b981">B</span>
      <span class="phone-label-name">Bob</span>
    `;
    phoneWrapper.appendChild(bobLabel);

    // Add to player frame
    this.playerFrame.appendChild(phoneWrapper);

    // Store references
    this.iframes.push(iframe);
    this.iframesReady.push(false);

    // Setup ready listener for second iframe
    iframe.addEventListener('load', () => {
      setTimeout(() => {
        const index = this.iframes.indexOf(iframe);
        if (index >= 0) {
          this.iframesReady[index] = true;
          console.log('[DemoPlayer] Second phone iframe ready');
        }
      }, 500);
    });

    // Remove transitioning class after animation
    setTimeout(() => {
      this.playerFrame?.classList.remove('transitioning');
    }, 500);
  }

  /**
   * Remove the second phone (Bob) - used when demo loops back to start
   */
  public removeSecondPhone(): void {
    if (!this.hasSecondPhone || !this.playerFrame) {
      console.log('[DemoPlayer] No second phone to remove');
      return;
    }

    console.log('[DemoPlayer] Removing second phone (Bob)');

    // Find and remove the second phone wrapper
    const secondWrapper = this.playerFrame.querySelector('.phone-wrapper.second-phone');
    if (secondWrapper) {
      // Send cleanup message to second iframe before removing
      const secondIframe = this.iframes[1];
      if (secondIframe?.contentWindow) {
        try {
          secondIframe.contentWindow.postMessage({ type: 'demoCleanup' }, '*');
        } catch (e) {
          // Iframe may already be gone
        }
      }

      // Animate out
      secondWrapper.classList.add('removing');

      setTimeout(() => {
        secondWrapper.remove();

        // Update tracking
        this.hasSecondPhone = false;
        if (this.iframes.length > 1) {
          this.iframes.pop();
          this.iframesReady.pop();
        }

        // Remove dual-phone class from player frame
        this.playerFrame?.classList.remove('dual-phone');
      }, 300);
    }

    // Also remove Alice's label when going back to single phone
    const firstWrapper = this.playerFrame.querySelector('.phone-wrapper');
    const aliceLabel = firstWrapper?.querySelector('.phone-label');
    if (aliceLabel) {
      aliceLabel.classList.add('removing');
      setTimeout(() => aliceLabel.remove(), 300);
    }
  }
}
