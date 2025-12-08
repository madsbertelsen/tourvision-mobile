/**
 * VoiceInputService - Web Speech API wrapper for voice-to-text input
 *
 * Features:
 * - Browser-native SpeechRecognition API
 * - Multi-language support
 * - Live transcript updates
 * - Error handling and browser compatibility checks
 *
 * Pattern extracted from GeocodingService.ts and VideoChatService.ts
 */

import type { SupportedLanguage } from '../types/voice';

export interface VoiceInputConfig {
  continuous: boolean;      // false for single phrase mode
  interimResults: boolean;  // true for live updates
  maxAlternatives: number;  // Number of alternative transcriptions
}

// Type declarations for Web Speech API
interface SpeechRecognitionEvent extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionResultList {
  length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
  isFinal: boolean;
  [index: number]: SpeechRecognitionAlternative;
  length: number;
}

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
  message?: string;
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  onstart: ((this: SpeechRecognition, ev: Event) => any) | null;
  onresult: ((this: SpeechRecognition, ev: SpeechRecognitionEvent) => any) | null;
  onerror: ((this: SpeechRecognition, ev: SpeechRecognitionErrorEvent) => any) | null;
  onend: ((this: SpeechRecognition, ev: Event) => any) | null;
  start(): void;
  stop(): void;
}

declare var SpeechRecognition: {
  prototype: SpeechRecognition;
  new(): SpeechRecognition;
};

declare var webkitSpeechRecognition: {
  prototype: SpeechRecognition;
  new(): SpeechRecognition;
};

export class VoiceInputService {
  private recognition: SpeechRecognition | null = null;
  private isListening: boolean = false;
  private currentLanguage: SupportedLanguage = 'en-US';
  private finalTranscript: string = '';
  private interimTranscript: string = '';

  // Event callbacks (set by ToolbarController)
  public onTranscriptUpdate?: (interim: string, final: string) => void;
  public onFinalResult?: (text: string) => void;
  public onError?: (error: SpeechRecognitionErrorEvent) => void;
  public onStart?: () => void;
  public onEnd?: () => void;

  constructor(config: Partial<VoiceInputConfig> = {}) {
    // Check browser support
    if (!this.isSupportedBrowser()) {
      console.warn('[VoiceInputService] Web Speech API not supported');
      return;
    }

    // Initialize SpeechRecognition (Chrome uses webkitSpeechRecognition)
    const SpeechRecognitionAPI = (window as any).SpeechRecognition
      || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognitionAPI) {
      console.warn('[VoiceInputService] SpeechRecognition API not found');
      return;
    }

    this.recognition = new SpeechRecognitionAPI();
    this.recognition.continuous = config.continuous ?? false;
    this.recognition.interimResults = config.interimResults ?? true;
    this.recognition.maxAlternatives = config.maxAlternatives ?? 1;
    this.recognition.lang = this.currentLanguage;

    this.setupEventHandlers();
    console.log('[VoiceInputService] Initialized with config:', config);
  }

  /**
   * Check if browser supports Web Speech API
   */
  isSupportedBrowser(): boolean {
    return 'SpeechRecognition' in window || 'webkitSpeechRecognition' in window;
  }

  /**
   * Set language for speech recognition
   */
  setLanguage(lang: SupportedLanguage): void {
    this.currentLanguage = lang;
    if (this.recognition) {
      this.recognition.lang = lang;
    }
    console.log('[VoiceInputService] Language set to:', lang);
  }

  /**
   * Get current language
   */
  getLanguage(): SupportedLanguage {
    return this.currentLanguage;
  }

  /**
   * Start listening (called on mousedown/touchstart)
   */
  start(): void {
    if (!this.recognition) {
      this.onError?.({
        error: 'not-allowed',
        message: 'Speech recognition not supported'
      } as any);
      return;
    }

    if (this.isListening) {
      console.warn('[VoiceInputService] Already listening');
      return;
    }

    try {
      this.finalTranscript = '';
      this.interimTranscript = '';
      this.recognition.start();
      console.log('[VoiceInputService] Started listening');
    } catch (error) {
      console.error('[VoiceInputService] Start error:', error);
      this.onError?.(error as any);
    }
  }

  /**
   * Stop listening (called on mouseup/touchend)
   */
  stop(): void {
    if (!this.recognition || !this.isListening) {
      return;
    }

    try {
      this.recognition.stop();
      console.log('[VoiceInputService] Stopped listening');
    } catch (error) {
      console.error('[VoiceInputService] Stop error:', error);
    }
  }

  /**
   * Check if currently listening
   */
  isActive(): boolean {
    return this.isListening;
  }

  /**
   * Set up SpeechRecognition event handlers
   */
  private setupEventHandlers(): void {
    if (!this.recognition) return;

    this.recognition.onstart = () => {
      this.isListening = true;
      this.onStart?.();
      console.log('[VoiceInputService] Recording started');
    };

    this.recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = '';
      let final = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;

        if (event.results[i].isFinal) {
          final += transcript;
          this.finalTranscript += transcript;
        } else {
          interim += transcript;
        }
      }

      this.interimTranscript = interim;

      // Notify listeners of live updates
      this.onTranscriptUpdate?.(interim, this.finalTranscript);

      console.log('[VoiceInputService] Interim:', interim, 'Final:', final);
    };

    this.recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      console.error('[VoiceInputService] Recognition error:', event.error);
      this.isListening = false;
      this.onError?.(event);
    };

    this.recognition.onend = () => {
      this.isListening = false;

      // Emit final result if we have transcript
      if (this.finalTranscript.trim()) {
        this.onFinalResult?.(this.finalTranscript.trim());
      }

      this.onEnd?.();
      console.log('[VoiceInputService] Recording ended, final:', this.finalTranscript);
    };
  }
}

// Export singleton instance (pattern from GeocodingService.ts:101)
export const voiceInputService = new VoiceInputService();
