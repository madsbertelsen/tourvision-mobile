/**
 * DemoPlayer - Parent-controlled demo player that wraps an editor iframe
 *
 * The DemoPlayer:
 * 1. Renders the phone frame with iframe inside
 * 2. Shows comment overlays (heading + text with typewriter effect)
 * 3. Controls step tabs
 * 4. Sends commands to iframe to execute demo actions
 */

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
}

// Messages sent from Player to Iframe
export interface DemoCommand {
  type: 'demoCommand';
  action: any; // DemoAction from AutoplayDemo
}

export interface DemoControl {
  type: 'demoControl';
  command: 'start' | 'stop' | 'pause' | 'resume' | 'resumeFromAction';
  actionIndex?: number;  // Required for resumeFromAction command
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
  private playerFrame: HTMLElement | null = null;
  private hasSecondPhone: boolean = false;
  private messageHandler: ((event: MessageEvent) => void) | null = null;

  private options: DemoPlayerOptions;
  private sessionId: string;
  private currentStep: number = 0;
  private isPlaying: boolean = false;
  private iframesReady: boolean[] = [];

  // Chapter snapshots for navigation
  private snapshots: Map<number, StepSnapshot> = new Map();
  private currentActionIndex: number = 0;  // Track current action for snapshot capture

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

    if (options.autoStart !== false) {
      // Wait for iframe to be ready before starting
      this.waitForReady().then(() => this.start());
    }
  }

  /**
   * Create the DOM structure for the demo player
   */
  private createDOM(): void {
    const { steps, editorUrl, demoScript, dualPhone, enableSync } = this.options;
    const phoneCount = dualPhone ? 2 : 1;

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

    // Create phone mockup(s)
    for (let i = 0; i < phoneCount; i++) {
      // Wrap phone in container for label positioning
      const phoneWrapper = document.createElement('div');
      phoneWrapper.className = 'phone-wrapper';

      const phoneMockup = document.createElement('div');
      phoneMockup.className = 'phone-mockup';

      const phoneScreen = document.createElement('div');
      phoneScreen.className = 'phone-screen';

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
      iframe.src = `${editorUrl}?autoplay=true&remoteControl=true&demo=${demoScript}&hideHeader=true${syncParams}`;
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

    // Create comment overlay
    this.overlayContainer = document.createElement('div');
    this.overlayContainer.className = 'comment-overlay';
    this.overlayContainer.innerHTML = `
      <div class="comment-content">
        <div class="comment-icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
            <circle cx="12" cy="10" r="3"></circle>
          </svg>
        </div>
        <div class="comment-heading"></div>
        <div class="comment-text"></div>
      </div>
    `;

    // Create player content wrapper (frame + overlay)
    const playerContent = document.createElement('div');
    playerContent.className = 'player-content';
    playerContent.appendChild(playerFrame);
    playerContent.appendChild(this.overlayContainer);

    // Assemble player - tabs above, then player content with overlay
    playerEl.appendChild(this.tabsContainer);
    playerEl.appendChild(playerContent);

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
        background: #f3f4f6;
        border-radius: 16px;
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
        width: 280px;
        background: #1a1a1a;
        border-radius: 40px;
        padding: 12px;
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

      .comment-overlay {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.95);
        display: flex;
        align-items: center;
        justify-content: center;
        opacity: 0;
        pointer-events: none;
        transition: opacity 0.3s ease-in-out;
        z-index: 100;
        border-radius: 16px;
      }

      .comment-overlay.visible {
        opacity: 1;
      }

      .comment-content {
        text-align: center;
        color: white;
        padding: 40px 32px;
      }

      .comment-icon {
        margin-bottom: 24px;
        opacity: 0.7;
      }

      .comment-icon svg {
        width: 48px;
        height: 48px;
      }

      .comment-heading {
        font-size: 36px;
        font-weight: 700;
        margin-bottom: 12px;
        letter-spacing: -0.5px;
        min-height: 44px;
        color: white;
      }

      .comment-text {
        font-size: 18px;
        font-weight: 500;
        opacity: 0.7;
        min-height: 24px;
        color: white;
        line-height: 1.4;
      }

      .comment-heading .cursor,
      .comment-text .cursor {
        display: inline-block;
        width: 2px;
        height: 1em;
        background: white;
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
   * Show comment overlay with typewriter effect
   */
  public async showComment(heading: string, text: string, duration: number = 1500): Promise<void> {
    if (!this.overlayContainer) return;

    const headingEl = this.overlayContainer.querySelector('.comment-heading') as HTMLElement;
    const textEl = this.overlayContainer.querySelector('.comment-text') as HTMLElement;

    // Clear previous content
    headingEl.innerHTML = '';
    textEl.innerHTML = '';

    // Show overlay
    this.overlayContainer.classList.add('visible');

    // Type heading
    await this.typeText(headingEl, heading, 40);

    // Brief pause
    await this.delay(200);

    // Type body text
    await this.typeText(textEl, text, 30);

    // Hold for duration
    await this.delay(duration);

    // Fade out
    this.overlayContainer.classList.remove('visible');
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

      // Show the step comment
      this.showComment(stepDef.heading, stepDef.text);

      // Resume playback from the action after the comment
      // Small delay to let snapshot restore complete
      setTimeout(() => {
        this.sendCommand({
          type: 'demoControl',
          command: 'resumeFromAction',
          actionIndex: snapshot.actionIndex
        });
      }, 100);
    } else {
      console.log(`[DemoPlayer] No snapshot for step ${step}, showing comment only`);
      // No snapshot yet - just show the comment
      this.showComment(stepDef.heading, stepDef.text);

      // Start from beginning (demo hasn't played this step yet)
      this.sendCommand({
        type: 'demoControl',
        command: 'start'
      });
    }
  }

  /**
   * Start demo playback
   */
  public start(): void {
    if (this.isPlaying) return;

    this.isPlaying = true;
    console.log('[DemoPlayer] Starting playback');

    // Tell iframe to start - it will send step changes via postMessage
    // which will trigger showComment() in the message handler
    this.sendCommand({
      type: 'demoControl',
      command: 'start'
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
    const iframe = document.createElement('iframe');
    iframe.src = `${editorUrl}?autoplay=true&remoteControl=true&demo=${demoScript}&hideHeader=true&enableSync=true&demoUser=2&observeOnly=true`;
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
