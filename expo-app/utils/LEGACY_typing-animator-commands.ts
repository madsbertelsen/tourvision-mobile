/**
 * Typing animation system using editor commands
 * Simulates AI typing by emitting command sequences to ProseMirror
 */

import { LANDING_DOCUMENT_CONTENT } from './landing-document-content';
import { generateCommandSequence, EditorCommand, calculateAnimationDuration, getAnimationProgress } from './command-sequence-generator';

export interface AnimationState {
  currentIndex: number;
  isPaused: boolean;
  isComplete: boolean;
  currentCommand: EditorCommand | null;
  totalCommands: number;
}

export interface TypingConfig {
  baseSpeed: number; // Base characters per second
  speedVariation: number; // Random variation in speed (0-1)
  pauseAfterPunctuation: number; // Extra pause after . ! ? (ms)
  pauseAfterNewline: number; // Extra pause after paragraphs (ms)
  pauseAfterGeoMark: number; // Extra pause after inserting geo-mark (ms)
}

export const DEFAULT_TYPING_CONFIG: TypingConfig = {
  baseSpeed: 30, // 30 characters per second
  speedVariation: 0.3,
  pauseAfterPunctuation: 200,
  pauseAfterNewline: 400,
  pauseAfterGeoMark: 500,
};

/**
 * Animation controller class
 */
export class TypingAnimatorCommands {
  private commands: EditorCommand[];
  private currentIndex: number = 0;
  private isPaused: boolean = false;
  private isComplete: boolean = false;
  private config: TypingConfig;
  private timeoutId: number | null = null;
  private onUpdate: (state: AnimationState) => void;
  private onCommand: (command: EditorCommand) => void;

  constructor(
    config: TypingConfig = DEFAULT_TYPING_CONFIG,
    onUpdate: (state: AnimationState) => void,
    onCommand: (command: EditorCommand) => void
  ) {
    this.config = config;
    this.onUpdate = onUpdate;
    this.onCommand = onCommand;

    // Generate command sequence from landing document
    this.commands = generateCommandSequence(LANDING_DOCUMENT_CONTENT, config);
    console.log('[TypingAnimator] Generated', this.commands.length, 'commands');
    console.log('[TypingAnimator] Total duration:', (calculateAnimationDuration(this.commands) / 1000).toFixed(1), 'seconds');
  }

  start() {
    if (this.isComplete) {
      this.reset();
    }
    this.isPaused = false;
    this.executeNextCommand();
  }

  pause() {
    this.isPaused = true;
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
  }

  resume() {
    if (!this.isComplete) {
      this.isPaused = false;
      this.executeNextCommand();
    }
  }

  reset() {
    this.currentIndex = 0;
    this.isComplete = false;
    this.isPaused = false;
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
    this.updateState();
  }

  skip() {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }

    // Execute all remaining commands instantly
    const startIndex = this.currentIndex;
    for (let i = startIndex; i < this.commands.length; i++) {
      const cmd = this.commands[i];
      this.onCommand(cmd);
    }

    this.currentIndex = this.commands.length;
    this.isComplete = true;
    this.updateState();
    this.onCommand({ type: 'wait', delay: 0 }); // Signal completion
  }

  private executeNextCommand() {
    if (this.isPaused || this.isComplete) {
      return;
    }

    if (this.currentIndex >= this.commands.length) {
      this.isComplete = true;
      this.updateState();
      this.onCommand({ type: 'wait', delay: 0 }); // Signal completion
      return;
    }

    const command = this.commands[this.currentIndex];

    // Execute command
    this.onCommand(command);

    // Move to next command
    this.currentIndex++;
    this.updateState();

    // Schedule next command
    const delay = command.delay || 0;
    this.timeoutId = setTimeout(() => {
      this.executeNextCommand();
    }, delay) as any;
  }

  private updateState() {
    this.onUpdate({
      currentIndex: this.currentIndex,
      isPaused: this.isPaused,
      isComplete: this.isComplete,
      currentCommand: this.currentIndex < this.commands.length ? this.commands[this.currentIndex] : null,
      totalCommands: this.commands.length,
    });
  }

  getState(): AnimationState {
    return {
      currentIndex: this.currentIndex,
      isPaused: this.isPaused,
      isComplete: this.isComplete,
      currentCommand: this.currentIndex < this.commands.length ? this.commands[this.currentIndex] : null,
      totalCommands: this.commands.length,
    };
  }

  getProgress(): number {
    return getAnimationProgress(this.currentIndex, this.commands.length);
  }
}
