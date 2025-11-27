/**
 * AnimatePlayback - Scroll-based content reveal for landing page demo
 *
 * Progressively types pre-defined content as user scrolls down the page.
 */

import type { EditorView } from 'prosemirror-view';

interface ContentSection {
  scrollPercent: number;
  text: string;
}

// Demo content for landing page playback
const DEMO_CONTENT: ContentSection[] = [
  {
    scrollPercent: 0,
    text: `Welcome to TourVision

`
  },
  {
    scrollPercent: 5,
    text: `The collaborative trip planning tool that lets you create beautiful itineraries with your travel companions.

`
  },
  {
    scrollPercent: 15,
    text: `---

Day 1: Tokyo

`
  },
  {
    scrollPercent: 20,
    text: `Arrive at Narita Airport. `
  },
  {
    scrollPercent: 25,
    text: `Take the Narita Express to Shinjuku Station.

`
  },
  {
    scrollPercent: 30,
    text: `First stop: Shibuya Crossing - the world's busiest pedestrian intersection.

`
  },
  {
    scrollPercent: 40,
    text: `Evening: Explore the neon-lit streets of Shinjuku.

`
  },
  {
    scrollPercent: 50,
    text: `---

Day 2: Kyoto

`
  },
  {
    scrollPercent: 55,
    text: `Take the Shinkansen bullet train from Tokyo Station. `
  },
  {
    scrollPercent: 60,
    text: `Journey time: about 2 hours.

`
  },
  {
    scrollPercent: 65,
    text: `Must visit:
`
  },
  {
    scrollPercent: 70,
    text: `- Fushimi Inari Shrine (thousands of orange torii gates)
`
  },
  {
    scrollPercent: 75,
    text: `- Kinkaku-ji (the Golden Pavilion)
`
  },
  {
    scrollPercent: 80,
    text: `- Arashiyama Bamboo Grove

`
  },
  {
    scrollPercent: 90,
    text: `---

Ready to plan your adventure?`
  }
];

export class AnimatePlayback {
  private view: EditorView;
  private currentSectionIndex = 0;
  private isTyping = false;
  private typewriterQueue: { text: string; callback?: () => void }[] = [];
  private scrollContainer: HTMLElement | null = null;
  private progressBar: HTMLElement | null = null;
  private ctaOverlay: HTMLElement | null = null;

  constructor(view: EditorView) {
    this.view = view;
  }

  /**
   * Initialize animate playback mode
   */
  initialize() {
    console.log('[AnimatePlayback] Initializing scroll-based playback');

    // Create scroll container overlay
    this.createScrollOverlay();

    // Start initial content
    this.typeText(DEMO_CONTENT[0].text);
    this.currentSectionIndex = 1;
  }

  /**
   * Create the scroll container and progress UI
   */
  private createScrollOverlay() {
    // Create progress bar
    this.progressBar = document.createElement('div');
    this.progressBar.id = 'animate-progress-bar';
    this.progressBar.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      height: 3px;
      background: linear-gradient(90deg, #3B82F6, #8B5CF6, #EC4899);
      width: 0%;
      transition: width 0.1s;
      z-index: 1000;
    `;
    document.body.appendChild(this.progressBar);

    // Create invisible scroll container
    this.scrollContainer = document.createElement('div');
    this.scrollContainer.id = 'animate-scroll-container';
    this.scrollContainer.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      overflow-y: scroll;
      z-index: 50;
    `;

    const scrollContent = document.createElement('div');
    scrollContent.style.cssText = `
      height: 500vh;
      pointer-events: none;
    `;
    this.scrollContainer.appendChild(scrollContent);
    document.body.appendChild(this.scrollContainer);

    // Create scroll indicator
    const scrollIndicator = document.createElement('div');
    scrollIndicator.id = 'animate-scroll-indicator';
    scrollIndicator.innerHTML = `
      <span style="color: rgba(0,0,0,0.4); font-size: 13px;">Scroll to explore</span>
      <div style="
        width: 24px;
        height: 24px;
        border: 2px solid rgba(0,0,0,0.4);
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        animation: bounce 2s infinite;
        margin-top: 8px;
      ">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color: rgba(0,0,0,0.4)">
          <path d="M12 5v14M5 12l7 7 7-7"/>
        </svg>
      </div>
    `;
    scrollIndicator.style.cssText = `
      position: fixed;
      bottom: 40px;
      left: 50%;
      transform: translateX(-50%);
      display: flex;
      flex-direction: column;
      align-items: center;
      pointer-events: none;
      transition: opacity 0.3s;
      z-index: 100;
    `;
    document.body.appendChild(scrollIndicator);

    // Add bounce animation
    const style = document.createElement('style');
    style.textContent = `
      @keyframes bounce {
        0%, 20%, 50%, 80%, 100% { transform: translateY(0); }
        40% { transform: translateY(6px); }
        60% { transform: translateY(3px); }
      }
    `;
    document.head.appendChild(style);

    // Create CTA overlay
    this.ctaOverlay = document.createElement('div');
    this.ctaOverlay.id = 'animate-cta-overlay';
    this.ctaOverlay.innerHTML = `
      <a href="#" class="btn btn-primary" onclick="window.location.href='/doc/trip-' + Math.random().toString(36).substring(2,10); return false;" style="
        padding: 14px 28px;
        font-size: 15px;
        font-weight: 500;
        border: none;
        border-radius: 8px;
        cursor: pointer;
        text-decoration: none;
        background: #111;
        color: #fff;
      ">Start Planning Your Trip</a>
      <a href="/landing.html" style="
        padding: 14px 28px;
        font-size: 15px;
        font-weight: 500;
        border: none;
        border-radius: 8px;
        cursor: pointer;
        text-decoration: none;
        background: #fff;
        color: #111;
        border: 1px solid #ddd;
      ">Learn More</a>
    `;
    this.ctaOverlay.style.cssText = `
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      padding: 32px 24px;
      background: linear-gradient(to top, #f5f5f4 60%, transparent);
      display: flex;
      justify-content: center;
      gap: 12px;
      opacity: 0;
      transform: translateY(20px);
      transition: opacity 0.5s, transform 0.5s;
      pointer-events: none;
      z-index: 100;
    `;
    document.body.appendChild(this.ctaOverlay);

    // Add scroll listener
    this.scrollContainer.addEventListener('scroll', () => this.handleScroll());
  }

  /**
   * Handle scroll events
   */
  private handleScroll() {
    if (!this.scrollContainer || !this.progressBar) return;

    const scrollHeight = this.scrollContainer.scrollHeight - this.scrollContainer.clientHeight;
    const scrollPercent = (this.scrollContainer.scrollTop / scrollHeight) * 100;

    // Update progress bar
    this.progressBar.style.width = scrollPercent + '%';

    // Hide scroll indicator after scrolling starts
    const scrollIndicator = document.getElementById('animate-scroll-indicator');
    if (scrollIndicator) {
      scrollIndicator.style.opacity = scrollPercent > 2 ? '0' : '1';
    }

    // Show CTA at end
    if (this.ctaOverlay) {
      if (scrollPercent > 95) {
        this.ctaOverlay.style.opacity = '1';
        this.ctaOverlay.style.transform = 'translateY(0)';
        this.ctaOverlay.style.pointerEvents = 'auto';
      } else {
        this.ctaOverlay.style.opacity = '0';
        this.ctaOverlay.style.transform = 'translateY(20px)';
        this.ctaOverlay.style.pointerEvents = 'none';
      }
    }

    // Trigger content sections based on scroll position
    while (
      this.currentSectionIndex < DEMO_CONTENT.length &&
      scrollPercent >= DEMO_CONTENT[this.currentSectionIndex].scrollPercent
    ) {
      const section = DEMO_CONTENT[this.currentSectionIndex];
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
        // Process next item in queue
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
   * Insert a character at the end of the document
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

  /**
   * Cleanup when leaving animate mode
   */
  destroy() {
    this.scrollContainer?.remove();
    this.progressBar?.remove();
    this.ctaOverlay?.remove();
    document.getElementById('animate-scroll-indicator')?.remove();
  }
}
