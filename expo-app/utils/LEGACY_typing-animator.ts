/**
 * Typing animation system for ProseMirror
 * Simulates AI writing content character by character
 */

import { LANDING_DOCUMENT_CONTENT, flattenDocumentForTyping, TypedCharacter } from './landing-document-content';

export interface AnimationState {
  currentIndex: number;
  isPaused: boolean;
  isComplete: boolean;
  document: any;
}

export interface TypingConfig {
  baseSpeed: number; // Base characters per second
  speedVariation: number; // Random variation in speed (0-1)
  pauseAfterPunctuation: number; // Extra pause after . ! ? (ms)
  pauseAfterNewline: number; // Extra pause after paragraphs (ms)
  pauseAfterGeoMark: number; // Extra pause after inserting geo-mark (ms)
  cursorBlinkRate: number; // Cursor blink interval (ms)
}

export const DEFAULT_TYPING_CONFIG: TypingConfig = {
  baseSpeed: 30, // 30 characters per second
  speedVariation: 0.3,
  pauseAfterPunctuation: 200,
  pauseAfterNewline: 400,
  pauseAfterGeoMark: 300,
  cursorBlinkRate: 500
};

/**
 * Get the next animation step
 * Returns the time to wait before next character and any special commands
 */
export function getNextAnimationStep(
  characters: TypedCharacter[],
  currentIndex: number,
  config: TypingConfig = DEFAULT_TYPING_CONFIG
): { delay: number; command?: string; data?: any } {
  if (currentIndex >= characters.length) {
    return { delay: 0, command: 'complete' };
  }

  const char = characters[currentIndex];
  const baseDelay = 1000 / config.baseSpeed;

  // Add random variation
  const variation = (Math.random() - 0.5) * 2 * config.speedVariation;
  let delay = baseDelay * (1 + variation);

  // Add pauses for punctuation
  if (char.char === '.' || char.char === '!' || char.char === '?') {
    delay += config.pauseAfterPunctuation;
  }

  // Add pauses for newlines/paragraphs
  if (char.char === '\n' || char.isNodeStart) {
    delay += config.pauseAfterNewline;
  }

  // Special handling for geo-marks
  if (char.nodeType === 'geoMark') {
    if (char.isNodeStart) {
      return {
        delay: config.pauseAfterGeoMark,
        command: 'insertGeoMark',
        data: char.nodeAttrs
      };
    } else if (char.isNodeEnd) {
      return {
        delay: config.pauseAfterGeoMark,
        command: 'endGeoMark'
      };
    }
  }

  // Regular character insertion
  return {
    delay,
    command: 'insertChar',
    data: {
      char: char.char,
      marks: char.marks
    }
  };
}

/**
 * Build ProseMirror document progressively
 * This creates a document with content up to currentIndex
 */
export function buildProgressiveDocument(
  characters: TypedCharacter[],
  currentIndex: number
): any {
  const content: any[] = [];
  let currentParagraph: any = { type: 'paragraph', content: [] };
  let currentMarks: string[] = [];
  let insideGeoMark = false;
  let geoMarkContent: any[] = [];
  let geoMarkAttrs: any = null;

  for (let i = 0; i <= currentIndex && i < characters.length; i++) {
    const charData = characters[i];

    // Handle geo-mark start
    if (charData.nodeType === 'geoMark' && charData.isNodeStart) {
      insideGeoMark = true;
      geoMarkAttrs = charData.nodeAttrs;
      geoMarkContent = [];
      continue;
    }

    // Handle geo-mark end
    if (charData.nodeType === 'geoMark' && charData.isNodeEnd) {
      if (geoMarkAttrs && geoMarkContent.length > 0) {
        currentParagraph.content.push({
          type: 'geoMark',
          attrs: geoMarkAttrs,
          content: geoMarkContent
        });
      }
      insideGeoMark = false;
      geoMarkAttrs = null;
      geoMarkContent = [];
      continue;
    }

    // Handle newlines (paragraph breaks)
    if (charData.char === '\n') {
      if (currentParagraph.content.length > 0) {
        content.push(currentParagraph);
      }

      // Check if this is a heading
      if (charData.nodeType === 'heading' && charData.nodeAttrs) {
        currentParagraph = {
          type: 'heading',
          attrs: charData.nodeAttrs,
          content: []
        };
      } else {
        currentParagraph = { type: 'paragraph', content: [] };
      }
      currentMarks = [];
      continue;
    }

    // Build text node with marks
    const textNode: any = { type: 'text', text: charData.char };
    if (charData.marks.length > 0) {
      textNode.marks = charData.marks.map(m => ({ type: m }));
    }

    if (insideGeoMark) {
      geoMarkContent.push(textNode);
    } else {
      currentParagraph.content.push(textNode);
    }
  }

  // Add final paragraph if it has content
  if (currentParagraph.content.length > 0) {
    content.push(currentParagraph);
  }

  return {
    type: 'doc',
    content: content.length > 0 ? content : [{ type: 'paragraph', content: [] }]
  };
}

/**
 * Animation controller class
 */
export class TypingAnimator {
  private characters: TypedCharacter[];
  private currentIndex: number = 0;
  private isPaused: boolean = false;
  private isComplete: boolean = false;
  private config: TypingConfig;
  private animationFrame: number | null = null;
  private onUpdate: (state: AnimationState) => void;
  private onCommand: (command: string, data?: any) => void;

  constructor(
    config: TypingConfig = DEFAULT_TYPING_CONFIG,
    onUpdate: (state: AnimationState) => void,
    onCommand: (command: string, data?: any) => void
  ) {
    this.characters = flattenDocumentForTyping(LANDING_DOCUMENT_CONTENT);
    this.config = config;
    this.onUpdate = onUpdate;
    this.onCommand = onCommand;
  }

  start() {
    if (this.isComplete) {
      this.reset();
    }
    this.isPaused = false;
    this.animate();
  }

  pause() {
    this.isPaused = true;
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }
  }

  resume() {
    if (!this.isComplete) {
      this.isPaused = false;
      this.animate();
    }
  }

  reset() {
    this.currentIndex = 0;
    this.isComplete = false;
    this.isPaused = false;
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }
    this.updateState();
  }

  skip() {
    this.currentIndex = this.characters.length;
    this.isComplete = true;
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }
    this.updateState();
    this.onCommand('complete');
  }

  private animate() {
    if (this.isPaused || this.isComplete) {
      return;
    }

    const step = getNextAnimationStep(this.characters, this.currentIndex, this.config);

    if (step.command === 'complete') {
      this.isComplete = true;
      this.updateState();
      this.onCommand('complete');
      return;
    }

    // Execute command if any
    if (step.command) {
      this.onCommand(step.command, step.data);
    }

    // Move to next character
    this.currentIndex++;
    this.updateState();

    // Schedule next step
    setTimeout(() => {
      this.animationFrame = requestAnimationFrame(() => this.animate());
    }, step.delay);
  }

  private updateState() {
    const document = buildProgressiveDocument(this.characters, this.currentIndex);
    this.onUpdate({
      currentIndex: this.currentIndex,
      isPaused: this.isPaused,
      isComplete: this.isComplete,
      document
    });
  }

  getState(): AnimationState {
    return {
      currentIndex: this.currentIndex,
      isPaused: this.isPaused,
      isComplete: this.isComplete,
      document: buildProgressiveDocument(this.characters, this.currentIndex)
    };
  }
}
