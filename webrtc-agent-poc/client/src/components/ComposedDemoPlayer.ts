/**
 * ComposedDemoPlayer - Transitions from single phone to dual phone mode
 *
 * This component shows a single phone demo for the first N steps,
 * then transitions to a dual phone view for collaboration demos.
 * Both phones share the same Y.js document with real-time sync and cursor awareness.
 */

import { DemoPlayer, DemoPlayerOptions, StepDefinition } from './DemoPlayer.js';

export interface ComposedDemoPlayerOptions {
  container: HTMLElement;
  // Single phone demo config
  singlePhoneDemo: {
    demoScript: string;
    editorUrl: string;
    steps: StepDefinition[];
  };
  // Dual phone demo config (starts after single phone completes or reaches transition step)
  dualPhoneDemo: {
    demoScript: string;
    editorUrl: string;
    steps: StepDefinition[];
  };
  // Step index in single phone demo that triggers transition to dual phone (0-indexed)
  transitionAfterStep: number;
  autoStart?: boolean;
}

export class ComposedDemoPlayer {
  private container: HTMLElement;
  private options: ComposedDemoPlayerOptions;
  private currentPlayer: DemoPlayer | null = null;
  private isDualPhoneMode: boolean = false;
  private wrapperEl: HTMLElement | null = null;

  constructor(options: ComposedDemoPlayerOptions) {
    this.options = options;
    this.container = options.container;
    this.createWrapper();
    this.startSinglePhoneDemo();
  }

  private createWrapper(): void {
    this.wrapperEl = document.createElement('div');
    this.wrapperEl.className = 'composed-demo-wrapper';
    this.wrapperEl.style.cssText = `
      position: relative;
      width: 100%;
    `;
    this.container.appendChild(this.wrapperEl);

    // Add transition styles
    this.injectStyles();
  }

  private injectStyles(): void {
    const styleId = 'composed-demo-styles';
    if (document.getElementById(styleId)) return;

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      .composed-demo-wrapper {
        transition: opacity 0.5s ease-in-out;
      }

      .composed-demo-wrapper.transitioning {
        opacity: 0;
      }

      .composed-demo-wrapper .demo-player {
        transition: transform 0.5s ease-in-out, opacity 0.5s ease-in-out;
      }

      /* Dual phone specific styling adjustments */
      .composed-demo-wrapper .player-frame.dual-phone {
        min-width: 650px;
        padding: 32px;
        gap: 32px;
      }

      .composed-demo-wrapper .player-frame.dual-phone .phone-mockup {
        width: 220px;
      }

      /* Transition overlay */
      .transition-overlay {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.95);
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        opacity: 0;
        pointer-events: none;
        transition: opacity 0.5s ease-in-out;
        z-index: 200;
        border-radius: 16px;
      }

      .transition-overlay.visible {
        opacity: 1;
      }

      .transition-overlay h2 {
        color: white;
        font-size: 32px;
        font-weight: 700;
        margin-bottom: 12px;
        text-align: center;
      }

      .transition-overlay p {
        color: rgba(255, 255, 255, 0.7);
        font-size: 16px;
        text-align: center;
      }

      .transition-overlay .icon {
        font-size: 48px;
        margin-bottom: 24px;
      }
    `;
    document.head.appendChild(style);
  }

  private startSinglePhoneDemo(): void {
    if (!this.wrapperEl) return;

    const { singlePhoneDemo, autoStart, transitionAfterStep } = this.options;

    // Modify steps to exclude the transition step (Share will trigger transition instead of playing)
    const stepsBeforeTransition = singlePhoneDemo.steps.slice(0, transitionAfterStep + 1);

    this.currentPlayer = new DemoPlayer({
      container: this.wrapperEl,
      demoScript: singlePhoneDemo.demoScript,
      editorUrl: singlePhoneDemo.editorUrl,
      steps: stepsBeforeTransition,
      autoStart: autoStart !== false,
      dualPhone: false,
    });

    // Listen for step changes
    this.currentPlayer.onStepChange = (step: number) => {
      console.log('[ComposedDemo] Single phone step:', step, 'transition at:', transitionAfterStep);

      // When we reach the transition step, switch to dual phone
      if (step === transitionAfterStep) {
        // Let the current step's comment play, then transition
        setTimeout(() => this.transitionToDualPhone(), 3000);
      }
    };
  }

  private async transitionToDualPhone(): Promise<void> {
    if (this.isDualPhoneMode || !this.wrapperEl) return;

    console.log('[ComposedDemo] Transitioning to dual phone mode');
    this.isDualPhoneMode = true;

    // Create transition overlay
    const overlay = document.createElement('div');
    overlay.className = 'transition-overlay';
    overlay.innerHTML = `
      <div class="icon">👥</div>
      <h2>Real-time Collaboration</h2>
      <p>See what it's like to plan together</p>
    `;
    this.wrapperEl.appendChild(overlay);

    // Show overlay
    await this.delay(50);
    overlay.classList.add('visible');

    // Wait for overlay to be visible
    await this.delay(1500);

    // Destroy single phone player
    if (this.currentPlayer) {
      this.currentPlayer.destroy();
      this.currentPlayer = null;
    }

    // Clear wrapper but keep overlay
    const children = Array.from(this.wrapperEl.children);
    children.forEach(child => {
      if (child !== overlay) {
        this.wrapperEl!.removeChild(child);
      }
    });

    // Create dual phone player
    const { dualPhoneDemo } = this.options;

    this.currentPlayer = new DemoPlayer({
      container: this.wrapperEl,
      demoScript: dualPhoneDemo.demoScript,
      editorUrl: dualPhoneDemo.editorUrl,
      steps: dualPhoneDemo.steps,
      autoStart: false, // We'll start after transition
      dualPhone: true,
    });

    // Position overlay on top
    this.wrapperEl.appendChild(overlay);

    // Fade out overlay
    await this.delay(500);
    overlay.classList.remove('visible');

    // Remove overlay and start dual phone demo
    await this.delay(500);
    overlay.remove();

    // Start the dual phone demo
    this.currentPlayer.start();
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  public start(): void {
    if (this.currentPlayer) {
      this.currentPlayer.start();
    }
  }

  public stop(): void {
    if (this.currentPlayer) {
      this.currentPlayer.stop();
    }
  }

  public destroy(): void {
    if (this.currentPlayer) {
      this.currentPlayer.destroy();
      this.currentPlayer = null;
    }
    if (this.wrapperEl) {
      this.wrapperEl.remove();
      this.wrapperEl = null;
    }
  }
}
