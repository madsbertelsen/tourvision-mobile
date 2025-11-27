/**
 * AnimatePlayback - Scroll-based content reveal for landing page demo
 *
 * User tab (in iframe): Receives scroll position from parent landing page via postMessage,
 *                       broadcasts to agent tab via awareness
 * Agent tab: Observes scroll position and types content via Y.js sync
 */

import type { EditorView } from 'prosemirror-view';

// Demo content for landing page playback (used by agent)
export const DEMO_CONTENT = [
  { scrollPercent: 0, text: `Welcome to TourVision\n\n` },
  { scrollPercent: 5, text: `The collaborative trip planning tool that lets you create beautiful itineraries with your travel companions.\n\n` },
  { scrollPercent: 15, text: `---\n\nDay 1: Tokyo\n\n` },
  { scrollPercent: 20, text: `Arrive at Narita Airport. ` },
  { scrollPercent: 25, text: `Take the Narita Express to Shinjuku Station.\n\n` },
  { scrollPercent: 30, text: `First stop: Shibuya Crossing - the world's busiest pedestrian intersection.\n\n` },
  { scrollPercent: 40, text: `Evening: Explore the neon-lit streets of Shinjuku.\n\n` },
  { scrollPercent: 50, text: `---\n\nDay 2: Kyoto\n\n` },
  { scrollPercent: 55, text: `Take the Shinkansen bullet train from Tokyo Station. ` },
  { scrollPercent: 60, text: `Journey time: about 2 hours.\n\n` },
  { scrollPercent: 65, text: `Must visit:\n` },
  { scrollPercent: 70, text: `- Fushimi Inari Shrine (thousands of orange torii gates)\n` },
  { scrollPercent: 75, text: `- Kinkaku-ji (the Golden Pavilion)\n` },
  { scrollPercent: 80, text: `- Arashiyama Bamboo Grove\n\n` },
  { scrollPercent: 90, text: `---\n\nReady to plan your adventure?` }
];

/**
 * AnimatePlayback for USER tab (runs inside iframe on landing page)
 * Receives scroll position from parent landing page and broadcasts via awareness
 */
export class AnimatePlayback {
  private awareness: any;
  private documentId: string;
  private agentWindow: Window | null = null;
  private messageHandler: ((event: MessageEvent) => void) | null = null;

  constructor(awareness: any, documentId: string) {
    this.awareness = awareness;
    this.documentId = documentId;
  }

  /**
   * Initialize animate playback mode (user tab in iframe)
   */
  initialize() {
    console.log('[AnimatePlayback] Initializing user tab - listening for scroll from parent');

    // Open agent tab to generate content
    this.openAgentTab();

    // Listen for scroll position from parent landing page
    this.messageHandler = (event: MessageEvent) => {
      if (event.data?.type === 'scrollPosition') {
        const scrollPercent = event.data.scrollPercent;
        console.log('[AnimatePlayback] Received scroll position from parent:', scrollPercent);
        this.broadcastScrollPosition(scrollPercent);
      }
    };
    window.addEventListener('message', this.messageHandler);

    // Signal to parent that we're ready to receive scroll updates
    if (window.parent !== window) {
      window.parent.postMessage({ type: 'animateReady' }, '*');
      console.log('[AnimatePlayback] Sent animateReady to parent');
    }

    // Broadcast initial scroll position
    this.broadcastScrollPosition(0);
  }

  /**
   * Open agent tab that will generate content
   */
  private openAgentTab() {
    const agentUrl = `${window.location.origin}/doc/${this.documentId}?animate=true&agent=true`;
    console.log('[AnimatePlayback] Opening agent tab:', agentUrl);

    this.agentWindow = window.open(agentUrl, `animate-agent-${this.documentId}`, 'width=600,height=400');

    if (!this.agentWindow) {
      console.error('[AnimatePlayback] Failed to open agent tab - popup blocked?');
    }

    // Close agent tab when user tab closes
    window.addEventListener('beforeunload', () => {
      if (this.agentWindow && !this.agentWindow.closed) {
        this.agentWindow.close();
      }
    });
  }

  /**
   * Broadcast scroll position via awareness to agent tab
   */
  private broadcastScrollPosition(scrollPercent: number) {
    const currentState = this.awareness.getLocalState();
    this.awareness.setLocalStateField('user', {
      ...currentState?.user,
      animateScrollPercent: scrollPercent
    });
  }

  /**
   * Cleanup when leaving animate mode
   */
  destroy() {
    if (this.messageHandler) {
      window.removeEventListener('message', this.messageHandler);
    }
    if (this.agentWindow && !this.agentWindow.closed) {
      this.agentWindow.close();
    }
  }
}

/**
 * AnimateAgent for AGENT tab
 * Observes scroll position from awareness and types content via Y.js
 */
export class AnimateAgent {
  private view: EditorView;
  private awareness: any;
  private currentSectionIndex = 0;
  private isTyping = false;
  private typewriterQueue: { text: string; callback?: () => void }[] = [];
  private lastScrollPercent = 0;

  constructor(view: EditorView, awareness: any) {
    this.view = view;
    this.awareness = awareness;
  }

  /**
   * Initialize animate agent (agent tab)
   */
  initialize() {
    console.log('[AnimateAgent] Initializing agent tab for content generation');

    // Listen for awareness changes to get scroll position
    this.awareness.on('change', () => this.handleAwarenessChange());

    // Start with first content section
    this.typeText(DEMO_CONTENT[0].text);
    this.currentSectionIndex = 1;
  }

  /**
   * Handle awareness changes - check for scroll position updates
   */
  private handleAwarenessChange() {
    const states = this.awareness.getStates();

    // Find the user tab's scroll position (non-agent client)
    states.forEach((state: any, clientId: number) => {
      if (clientId === this.awareness.clientID) return; // Skip self

      const scrollPercent = state?.user?.animateScrollPercent;
      if (typeof scrollPercent === 'number' && scrollPercent !== this.lastScrollPercent) {
        this.lastScrollPercent = scrollPercent;
        this.handleScrollUpdate(scrollPercent);
      }
    });
  }

  /**
   * Handle scroll position update - type content as needed
   */
  private handleScrollUpdate(scrollPercent: number) {
    // Trigger content sections based on scroll position
    while (
      this.currentSectionIndex < DEMO_CONTENT.length &&
      scrollPercent >= DEMO_CONTENT[this.currentSectionIndex].scrollPercent
    ) {
      const section = DEMO_CONTENT[this.currentSectionIndex];
      console.log(`[AnimateAgent] Typing section ${this.currentSectionIndex} at ${scrollPercent}%`);
      this.typeText(section.text);
      this.currentSectionIndex++;
    }
  }

  /**
   * Type text character by character
   */
  private typeText(text: string, callback?: () => void) {
    // Queue if already typing
    if (this.isTyping) {
      this.typewriterQueue.push({ text, callback });
      return;
    }

    let index = 0;
    this.isTyping = true;

    const typeNext = () => {
      if (index >= text.length) {
        this.isTyping = false;
        if (callback) callback();
        setTimeout(() => this.processQueue(), 50);
        return;
      }

      const char = text[index];
      this.insertChar(char);
      index++;

      // Vary typing speed
      let delay = 15 + Math.random() * 25;
      if (char === '\n') delay = 80;
      if (char === '.') delay = 150;
      if (char === ':') delay = 100;
      if (char === '-') delay = 50;

      setTimeout(typeNext, delay);
    };

    typeNext();
  }

  /**
   * Insert a character at the end of the document (via ProseMirror/Y.js)
   */
  private insertChar(char: string) {
    const { state, dispatch } = this.view;
    const lastPos = state.doc.content.size;
    const $pos = state.doc.resolve(lastPos - 1);
    const insertPos = $pos.end($pos.depth);
    const tr = state.tr.insertText(char, insertPos);
    dispatch(tr);
  }

  /**
   * Process queued typewriter items
   */
  private processQueue() {
    if (this.isTyping || this.typewriterQueue.length === 0) return;
    const { text, callback } = this.typewriterQueue.shift()!;
    this.isTyping = false;
    this.typeText(text, callback);
  }
}
