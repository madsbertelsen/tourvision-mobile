/**
 * ToolbarController - Manages toolbar button event listeners and state
 *
 * Extracted from main.ts to reduce file size and improve modularity.
 */

import type { EditorView } from 'prosemirror-view';
import type { VideoChatService } from '../services/VideoChatService';
import type { VoiceInputService } from '../services/VoiceInputService';
import type { GeoMarkingService } from '../services/GeoMarkingService';
import { TextSelection } from 'prosemirror-state';
import { showVoiceDraftSheet } from '../voice-draft-sheet';

/**
 * Dependencies required by the ToolbarController
 */
export interface ToolbarDependencies {
  view: EditorView;
  videoChatService: VideoChatService | null;
  voiceInputService: VoiceInputService | null;
  geoMarkingService: GeoMarkingService | null;
  createGeoMark: (view: EditorView) => Promise<void>;
  insertMapWithAutoGeoMark: (view: EditorView) => Promise<void>;
  hideVideoContainer: () => void;
  showJoinVideoModal: () => void;
  hideJoinVideoModal: () => void;
  getFormatButtonUpdateDisabled: () => boolean;
}

/**
 * ToolbarController manages all toolbar button interactions
 */
export class ToolbarController {
  private view: EditorView;
  private deps: ToolbarDependencies;

  constructor(deps: ToolbarDependencies) {
    this.view = deps.view;
    this.deps = deps;
  }

  /**
   * Initialize all toolbar button event listeners
   */
  setup(): void {
    const { view } = this;

    const newDocBtn = document.getElementById('new-doc-btn');
    const createGeoMarkBtn = document.getElementById('create-geomark-btn') as HTMLButtonElement;
    const insertMapBtn = document.getElementById('insert-map-btn');

    // Video chat buttons
    const joinVideoBtn = document.getElementById('join-video-btn');
    const joinWithVideoBtn = document.getElementById('join-with-video-btn');
    const joinAudioOnlyBtn = document.getElementById('join-audio-only-btn');
    const cancelJoinVideoBtn = document.getElementById('cancel-join-video-btn');
    const toggleMuteBtn = document.getElementById('toggle-mute-btn');
    const toggleCameraBtn = document.getElementById('toggle-camera-btn');
    const leaveVideoBtn = document.getElementById('leave-video-btn');

    // Function to update button state based on selection
    const updateButtonState = () => {
      if (!createGeoMarkBtn) return;

      const { state } = view;
      const { from, to } = state.selection;
      const hasSelection = from !== to;

      createGeoMarkBtn.disabled = !hasSelection;
      createGeoMarkBtn.style.opacity = hasSelection ? '1' : '0.5';
      createGeoMarkBtn.style.cursor = hasSelection ? 'pointer' : 'not-allowed';
    };

    // Initial button state
    updateButtonState();

    // Update button state on selection change
    view.dom.addEventListener('mouseup', updateButtonState);
    view.dom.addEventListener('keyup', updateButtonState);

    // Button click handlers
    if (newDocBtn) {
      newDocBtn.addEventListener('click', () => {
        const newDocId = 'doc-' + Math.random().toString(36).substring(2, 15);
        console.log('[ToolbarController] Creating new document:', newDocId);
        window.location.href = `${window.location.origin}/doc/${newDocId}`;
      });
    }

    if (createGeoMarkBtn) {
      createGeoMarkBtn.addEventListener('click', () => this.deps.createGeoMark(view));
    }

    if (insertMapBtn) {
      insertMapBtn.addEventListener('click', async () => {
        const btn = insertMapBtn as HTMLButtonElement;
        const originalText = btn.textContent;
        btn.disabled = true;
        btn.textContent = 'Detecting locations...';
        btn.style.opacity = '0.6';

        try {
          await this.deps.insertMapWithAutoGeoMark(view);
        } finally {
          btn.disabled = false;
          btn.textContent = originalText;
          btn.style.opacity = '1';
        }
      });
    }

    // Voice input button
    const voiceBtn = document.getElementById('voice-btn') as HTMLButtonElement;
    const languageSelect = document.getElementById('language-select') as HTMLSelectElement;
    const transcriptOverlay = document.getElementById('transcript-overlay');
    const transcriptText = document.getElementById('transcript-text');

    if (voiceBtn && this.deps.voiceInputService) {
      const service = this.deps.voiceInputService;

      // Check browser support
      if (!service.isSupportedBrowser()) {
        voiceBtn.disabled = true;
        voiceBtn.title = 'Voice input not supported in this browser';
        console.warn('[ToolbarController] Voice input not supported');
      } else {
        // Press-and-hold behavior: Desktop (mousedown/mouseup)
        voiceBtn.addEventListener('mousedown', (e) => {
          e.preventDefault();
          service.start();
        });

        voiceBtn.addEventListener('mouseup', (e) => {
          e.preventDefault();
          service.stop();
        });

        // Press-and-hold behavior: Mobile (touchstart/touchend)
        const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
        if (isTouchDevice) {
          voiceBtn.addEventListener('touchstart', (e) => {
            e.preventDefault();
            service.start();
          }, { passive: false });

          voiceBtn.addEventListener('touchend', (e) => {
            e.preventDefault();
            service.stop();
          }, { passive: false });
        }

        // Handle user releasing outside button (mouse leaves while pressed)
        voiceBtn.addEventListener('mouseleave', () => {
          if (service.isActive()) {
            service.stop();
          }
        });

        // Service event handlers
        service.onStart = () => {
          voiceBtn.classList.add('recording');
          voiceBtn.setAttribute('aria-pressed', 'true');
          voiceBtn.title = 'Release to stop recording';
          if (transcriptOverlay) {
            transcriptOverlay.classList.add('visible');
          }
          if (transcriptText) {
            transcriptText.textContent = 'Listening...';
            transcriptText.style.color = '';
          }
          console.log('[ToolbarController] Voice recording started');
        };

        service.onTranscriptUpdate = (interim: string, final: string) => {
          if (transcriptText) {
            // Show final + interim text
            const display = final + (interim ? ` ${interim}` : '');
            transcriptText.textContent = display || 'Listening...';
          }
        };

        service.onFinalResult = async (text: string) => {
          console.log('[ToolbarController] Voice recognition complete, showing draft sheet:', text);

          // Hide transcript overlay
          if (transcriptOverlay) {
            transcriptOverlay.classList.remove('visible');
            if (transcriptText) {
              transcriptText.style.color = ''; // Reset color
            }
          }

          // Show draft sheet for user review
          // Location detection will be handled by VoiceDraftSheet
          showVoiceDraftSheet(text);
        };

        service.onEnd = () => {
          voiceBtn.classList.remove('recording');
          voiceBtn.setAttribute('aria-pressed', 'false');
          voiceBtn.title = 'Hold to record voice';

          // Note: Transcript overlay hiding is now handled by onFinalResult
          // after location detection completes, so we don't hide it here

          console.log('[ToolbarController] Voice recording ended');
        };

        service.onError = (error) => {
          console.error('[ToolbarController] Voice input error:', error);
          voiceBtn.classList.remove('recording');
          voiceBtn.setAttribute('aria-pressed', 'false');

          // Show user-friendly error message
          let message = 'Voice input error';
          if (error.error === 'not-allowed') {
            message = 'Microphone permission denied. Please allow microphone access.';
          } else if (error.error === 'no-speech') {
            message = 'No speech detected. Please try again.';
          } else if (error.error === 'network') {
            message = 'Network error. Voice recognition requires internet connection.';
          }

          if (transcriptText) {
            transcriptText.textContent = message;
            transcriptText.style.color = '#dc2626'; // Red error color
            setTimeout(() => {
              transcriptText.style.color = '';
              if (transcriptOverlay) {
                transcriptOverlay.classList.remove('visible');
              }
            }, 3000);
          }
        };
      }
    }

    // Language selector
    if (languageSelect && this.deps.voiceInputService) {
      const service = this.deps.voiceInputService;

      languageSelect.addEventListener('change', (e) => {
        const target = e.target as HTMLSelectElement;
        service.setLanguage(target.value as any);
        console.log('[ToolbarController] Language changed to:', target.value);
      });

      // Set initial value
      languageSelect.value = service.getLanguage();
    }

    // Format toolbar button handlers
    this.setupFormatButtons(view);

    // Video chat button handlers
    this.setupVideoChatButtons({
      joinVideoBtn,
      joinWithVideoBtn,
      joinAudioOnlyBtn,
      cancelJoinVideoBtn,
      toggleMuteBtn,
      toggleCameraBtn,
      leaveVideoBtn,
    });

    // Mobile/Touch selection handling
    this.setupMobileActionBar(view);

    console.log('[ToolbarController] Toolbar buttons set up');
  }

  /**
   * Set up format buttons (H1, H2, Geo Mark, Map)
   */
  private setupFormatButtons(view: EditorView): void {
    const heading1Btn = document.getElementById('heading1-btn');
    const heading2Btn = document.getElementById('heading2-btn');
    const formatGeoMarkBtn = document.getElementById('format-geomark-btn');
    const formatMapBtn = document.getElementById('format-map-btn');

    const setBlockType = (nodeType: string, attrs?: Record<string, unknown>) => {
      const { state, dispatch } = view;
      const { $from, $to } = state.selection;
      const range = $from.blockRange($to);

      console.log(`[setBlockType] Called with nodeType: ${nodeType}, selection: ${$from.pos}-${$to.pos}, range: ${range ? `${range.start}-${range.end}` : 'null'}`);

      if (!range) {
        console.log(`[setBlockType] No block range found, returning false`);
        return false;
      }

      const type = state.schema.nodes[nodeType];
      if (!type) {
        console.log(`[setBlockType] Node type ${nodeType} not found`);
        return false;
      }

      const tr = state.tr.setBlockType(range.start, range.end, type, attrs);
      dispatch(tr);
      view.focus();
      console.log(`[setBlockType] Changed to ${nodeType}`);
      return true;
    };

    const updateFormatButtonStates = () => {
      // Skip update during finger tap animations
      if (this.deps.getFormatButtonUpdateDisabled()) {
        console.log('[FormatButtons] Update skipped - formatButtonUpdateDisabled is true');
        return;
      }

      // In show-toolbar mode (mobile demo), don't show active states
      if (document.body.classList.contains('show-toolbar')) {
        heading1Btn?.classList.remove('active');
        heading2Btn?.classList.remove('active');
        return;
      }

      const { state } = view;
      const { $from } = state.selection;
      const parentNode = $from.parent;
      const nodeName = parentNode.type.name;

      // Remove active class from all format buttons
      heading1Btn?.classList.remove('active');
      heading2Btn?.classList.remove('active');

      // Add active class to current block type
      if (nodeName === 'heading') {
        const level = parentNode.attrs.level;
        if (level === 1) {
          heading1Btn?.classList.add('active');
        } else if (level === 2) {
          heading2Btn?.classList.add('active');
        }
      }
    };

    // Initial state and listen for changes
    updateFormatButtonStates();
    view.dom.addEventListener('mouseup', updateFormatButtonStates);
    view.dom.addEventListener('keyup', updateFormatButtonStates);
    document.addEventListener('format-changed', updateFormatButtonStates);

    if (heading1Btn) {
      heading1Btn.addEventListener('click', () => {
        setBlockType('heading', { level: 1 });
        updateFormatButtonStates();
      });
    }

    if (heading2Btn) {
      heading2Btn.addEventListener('click', () => {
        setBlockType('heading', { level: 2 });
        updateFormatButtonStates();
      });
    }

    if (formatGeoMarkBtn) {
      formatGeoMarkBtn.addEventListener('click', () => {
        this.deps.createGeoMark(view);
      });
    }

    if (formatMapBtn) {
      formatMapBtn.addEventListener('click', () => {
        this.deps.insertMapWithAutoGeoMark(view);
      });
    }
  }

  /**
   * Set up video chat button handlers
   */
  private setupVideoChatButtons(buttons: {
    joinVideoBtn: HTMLElement | null;
    joinWithVideoBtn: HTMLElement | null;
    joinAudioOnlyBtn: HTMLElement | null;
    cancelJoinVideoBtn: HTMLElement | null;
    toggleMuteBtn: HTMLElement | null;
    toggleCameraBtn: HTMLElement | null;
    leaveVideoBtn: HTMLElement | null;
  }): void {
    const {
      joinVideoBtn,
      joinWithVideoBtn,
      joinAudioOnlyBtn,
      cancelJoinVideoBtn,
      toggleMuteBtn,
      toggleCameraBtn,
      leaveVideoBtn,
    } = buttons;

    const showMediaError = (error: unknown, isVideoCall: boolean) => {
      const err = error as Error;
      let message = 'Failed to access camera/microphone.';

      if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        message = `No ${isVideoCall ? 'camera or microphone' : 'microphone'} found.\n\n` +
          'Please check:\n' +
          '• Your device has a camera/microphone\n' +
          '• Browser has permission to access it\n\n' +
          'On iOS: Settings → Safari → Camera/Microphone\n' +
          'On Android: Tap lock icon → Site settings';
      } else if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        message = 'Camera/microphone access was denied.\n\n' +
          'Please allow access in your browser settings.';
      } else if (err.name === 'NotReadableError') {
        message = 'Camera/microphone is already in use by another app.';
      }

      alert(message);
    };

    if (joinVideoBtn) {
      joinVideoBtn.addEventListener('click', () => {
        if (this.deps.videoChatService?.isInCall()) {
          this.deps.videoChatService.leave();
          this.deps.hideVideoContainer();
        } else {
          this.deps.showJoinVideoModal();
        }
      });
    }

    if (joinWithVideoBtn) {
      joinWithVideoBtn.addEventListener('click', async () => {
        this.deps.hideJoinVideoModal();
        try {
          await this.deps.videoChatService?.join(false);
        } catch (error) {
          console.error('[ToolbarController] Failed to join video call:', error);
          showMediaError(error, true);
        }
      });
    }

    if (joinAudioOnlyBtn) {
      joinAudioOnlyBtn.addEventListener('click', async () => {
        this.deps.hideJoinVideoModal();
        try {
          await this.deps.videoChatService?.join(true);
        } catch (error) {
          console.error('[ToolbarController] Failed to join audio call:', error);
          showMediaError(error, false);
        }
      });
    }

    if (cancelJoinVideoBtn) {
      cancelJoinVideoBtn.addEventListener('click', () => {
        this.deps.hideJoinVideoModal();
      });
    }

    if (toggleMuteBtn) {
      toggleMuteBtn.addEventListener('click', () => {
        if (this.deps.videoChatService) {
          const isMuted = this.deps.videoChatService.toggleMute();
          toggleMuteBtn.classList.toggle('muted', isMuted);
          toggleMuteBtn.title = isMuted ? 'Unmute Microphone' : 'Mute Microphone';
        }
      });
    }

    if (toggleCameraBtn) {
      toggleCameraBtn.addEventListener('click', () => {
        if (this.deps.videoChatService) {
          const isVideoOff = this.deps.videoChatService.toggleVideo();
          toggleCameraBtn.classList.toggle('muted', isVideoOff);
          toggleCameraBtn.title = isVideoOff ? 'Turn Camera On' : 'Turn Camera Off';
        }
      });
    }

    if (leaveVideoBtn) {
      leaveVideoBtn.addEventListener('click', () => {
        if (this.deps.videoChatService) {
          this.deps.videoChatService.leave();
          this.deps.hideVideoContainer();
        }
      });
    }

    // Close join modal when clicking backdrop
    const joinVideoModal = document.getElementById('join-video-modal');
    if (joinVideoModal) {
      joinVideoModal.addEventListener('click', (e) => {
        if (e.target === joinVideoModal) {
          this.deps.hideJoinVideoModal();
        }
      });
    }

    // Leave video call when page unloads
    window.addEventListener('beforeunload', () => {
      if (this.deps.videoChatService?.isInCall()) {
        this.deps.videoChatService.leave();
      }
    });
  }

  /**
   * Set up mobile action bar for touch devices
   */
  private setupMobileActionBar(view: EditorView): void {
    const mobileActionBar = document.getElementById('mobile-action-bar');
    const mobileGeoMarkBtn = document.getElementById('mobile-geomark-btn');
    const mobileMapBtn = document.getElementById('mobile-map-btn');
    const mobileH1Btn = document.getElementById('mobile-h1-btn');
    const mobileH2Btn = document.getElementById('mobile-h2-btn');

    // iOS detection for touch-optimized behavior
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
    const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0 || isIOS;
    const isMobile = window.innerWidth <= 768 || isTouchDevice;
    console.log('[Selection] iOS:', isIOS, 'Touch device:', isTouchDevice, 'Mobile:', isMobile, 'Width:', window.innerWidth);

    const showMobileActionBar = () => {
      if (!mobileActionBar || !isTouchDevice) return;
      mobileActionBar.classList.add('visible');
      document.body.classList.add('has-selection');
      console.log('[MobileActionBar] Shown');
    };

    const hideMobileActionBar = () => {
      if (!mobileActionBar) return;
      mobileActionBar.classList.remove('visible');
      document.body.classList.remove('has-selection');
      console.log('[MobileActionBar] Hidden');
    };

    // Mobile: Use selectionchange event
    if (isMobile) {
      document.addEventListener('selectionchange', () => {
        const selection = window.getSelection();
        if (!selection || selection.isCollapsed) {
          hideMobileActionBar();
          document.body.classList.remove('has-selection');
          return;
        }

        try {
          const range = selection.getRangeAt(0);
          if (!view.dom.contains(range.commonAncestorContainer)) {
            return;
          }
          document.body.classList.add('has-selection');
          showMobileActionBar();
        } catch (e) {
          return;
        }
      });
    }

    // Helper to add both click and touchend handlers
    const addButtonHandler = (btn: HTMLElement | null, handler: () => void | Promise<void>) => {
      if (!btn) return;

      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        handler();
      });

      if (isTouchDevice) {
        btn.addEventListener('touchend', (e) => {
          e.preventDefault();
          e.stopPropagation();
          handler();
        }, { passive: false });
      }
    };

    const setBlockType = (nodeType: string, attrs?: Record<string, unknown>) => {
      const { state, dispatch } = view;
      const { $from, $to } = state.selection;
      const range = $from.blockRange($to);
      if (!range) return false;
      const type = state.schema.nodes[nodeType];
      if (!type) return false;
      dispatch(state.tr.setBlockType(range.start, range.end, type, attrs));
      view.focus();
      return true;
    };

    addButtonHandler(mobileGeoMarkBtn, async () => {
      hideMobileActionBar();
      await this.deps.createGeoMark(view);
    });

    addButtonHandler(mobileMapBtn, async () => {
      hideMobileActionBar();
      await this.deps.insertMapWithAutoGeoMark(view);
    });

    addButtonHandler(mobileH1Btn, () => {
      hideMobileActionBar();
      setBlockType('heading', { level: 1 });
      view.focus();
    });

    addButtonHandler(mobileH2Btn, () => {
      hideMobileActionBar();
      setBlockType('heading', { level: 2 });
      view.focus();
    });
  }
}

/**
 * Initialize the toolbar controller
 */
export function setupToolbarButtons(deps: ToolbarDependencies): ToolbarController {
  const controller = new ToolbarController(deps);
  controller.setup();
  return controller;
}
