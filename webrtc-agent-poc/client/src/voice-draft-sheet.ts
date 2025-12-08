/**
 * Voice Draft Sheet - Bottom sheet for reviewing voice input before insertion
 *
 * Displays transcribed text with detected locations highlighted.
 * User can approve (insert), cancel (discard), or re-record.
 * Location detection runs in background while user reviews.
 */

import './voice-draft-sheet.css';
import type { EditorView } from 'prosemirror-view';
import type { Schema } from 'prosemirror-model';
import type { GeocodingService } from './services/GeocodingService';
import type { VoiceInputService } from './services/VoiceInputService';
import type { AgentPlan, ExecutionContext, ToolCall, IntentResult, AmbiguityQuestion } from './types/agent';
import { TextSelection } from 'prosemirror-state';
import { getAgentDataChannelService } from './services/AgentDataChannelService';
import { executePlan } from './services/ToolExecutor';

// ============================================
// INTERFACES
// ============================================

interface DetectedLocation {
  locationName: string;
  geoId?: string;
  lat?: number;
  lng?: number;
  colorIndex?: number;
  status: 'detecting' | 'found' | 'error';
  ranges: Array<{ from: number; to: number }>; // Text positions for highlighting
  errorMessage?: string;
}

interface VoiceDraftData {
  transcript: string;
  detectedLocations: DetectedLocation[];
  isProcessing: boolean;
  agentPlan?: AgentPlan; // NEW: Agent's execution plan
}

// ============================================
// STATE
// ============================================

let isSheetOpen = false;
let touchStartY = 0;
let touchCurrentY = 0;
let isDragging = false;

let currentDraft: VoiceDraftData = {
  transcript: '',
  detectedLocations: [],
  isProcessing: false,
  agentPlan: undefined
};

// Dependencies (injected from main.ts)
let editorView: EditorView | null = null;
let schema: Schema | null = null;
let geocodingService: GeocodingService | null = null;
let voiceInputService: VoiceInputService | null = null;
let onChangeCallback: (() => void) | null = null;

// Color palette for geo-marks (matching GeoMarkingService)
const GEO_MARK_COLORS = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8',
  '#F7DC6F', '#BB8FCE', '#85C1E2', '#F8B739', '#52B788'
];

// ============================================
// INITIALIZATION
// ============================================

export function initializeVoiceDraftSheet(): void {
  console.log('[VoiceDraftSheet] Initializing voice draft sheet');

  const backdrop = document.getElementById('voice-draft-backdrop');
  const sheet = document.getElementById('voice-draft-sheet');
  const closeBtn = document.getElementById('voice-draft-close-btn');
  const cancelBtn = document.getElementById('voice-draft-cancel-btn');
  const rerecordBtn = document.getElementById('voice-draft-rerecord-btn');
  const approveBtn = document.getElementById('voice-draft-approve-btn');

  if (!backdrop || !sheet || !closeBtn || !cancelBtn || !rerecordBtn || !approveBtn) {
    console.error('[VoiceDraftSheet] Missing required DOM elements');
    return;
  }

  // Close on backdrop click
  backdrop.addEventListener('click', () => {
    console.log('[VoiceDraftSheet] Backdrop clicked');
    hideVoiceDraftSheet();
  });

  // Close on close button click
  closeBtn.addEventListener('click', () => {
    console.log('[VoiceDraftSheet] Close button clicked');
    hideVoiceDraftSheet();
  });

  // Close on Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isSheetOpen) {
      console.log('[VoiceDraftSheet] Escape key pressed');
      hideVoiceDraftSheet();
    }
  });

  // Action buttons
  cancelBtn.addEventListener('click', handleCancel);
  rerecordBtn.addEventListener('click', handleReRecord);
  approveBtn.addEventListener('click', handleApprove);

  // Touch gestures for mobile swipe-to-close
  if (isMobileDevice()) {
    sheet.addEventListener('touchstart', handleTouchStart, { passive: true });
    sheet.addEventListener('touchmove', handleTouchMove, { passive: false });
    sheet.addEventListener('touchend', handleTouchEnd, { passive: true });
  }

  console.log('[VoiceDraftSheet] Initialization complete');
}

export function setVoiceDraftSheetDependencies(
  view: EditorView,
  schemaObj: Schema,
  geocoding: GeocodingService,
  voiceInput: VoiceInputService,
  changeCallback?: () => void
): void {
  editorView = view;
  schema = schemaObj;
  geocodingService = geocoding;
  voiceInputService = voiceInput;
  onChangeCallback = changeCallback || null;

  console.log('[VoiceDraftSheet] Dependencies set');
}

// ============================================
// SHOW / HIDE SHEET
// ============================================

export function showVoiceDraftSheet(transcript: string): void {
  console.log('[VoiceDraftSheet] Showing draft sheet with transcript:', transcript);

  if (!transcript.trim()) {
    console.warn('[VoiceDraftSheet] Empty transcript, not showing sheet');
    return;
  }

  // Initialize draft data (NO location detection)
  currentDraft = {
    transcript: transcript.trim(),
    detectedLocations: [],  // Empty - LLM will populate via createGeoMark
    isProcessing: true
  };

  // Show sheet
  const backdrop = document.getElementById('voice-draft-backdrop');
  const sheet = document.getElementById('voice-draft-sheet');

  if (!backdrop || !sheet) {
    console.error('[VoiceDraftSheet] Cannot find sheet elements');
    return;
  }

  backdrop.classList.add('visible');
  sheet.classList.add('visible');
  isSheetOpen = true;

  // Render initial content
  renderDraftContent();

  // ONLY run agent analysis (no parallel location detection)
  analyzeWithAgent(transcript, getDocumentContext()).then(agentPlan => {
    if (agentPlan) {
      currentDraft.agentPlan = agentPlan;
    }
    currentDraft.isProcessing = false;
    renderDraftContent();
  });
}

export function hideVoiceDraftSheet(): void {
  console.log('[VoiceDraftSheet] Hiding draft sheet');

  const backdrop = document.getElementById('voice-draft-backdrop');
  const sheet = document.getElementById('voice-draft-sheet');

  if (!backdrop || !sheet) return;

  backdrop.classList.remove('visible');
  sheet.classList.remove('visible');
  isSheetOpen = false;

  // Reset draft data
  currentDraft = {
    transcript: '',
    detectedLocations: [],
    isProcessing: false,
    agentPlan: undefined
  };
}

// ============================================
// RENDER CONTENT
// ============================================

function renderDraftContent(): void {
  const contentDiv = document.getElementById('voice-draft-content');
  if (!contentDiv) return;

  const { transcript, isProcessing, agentPlan } = currentDraft;

  let html = '';

  // Draft text (NO location highlighting - we don't know which are locations yet)
  html += '<div class="voice-draft-text">';
  html += escapeHtml(transcript);  // Plain text, no highlights
  html += '</div>';

  // NO "Detected Locations" section - LLM will handle this

  // Processing indicator
  if (isProcessing) {
    html += `
      <div class="voice-draft-processing">
        <div class="voice-draft-processing-spinner"></div>
        <span>Analyzing...</span>
      </div>
    `;
  }

  // Assistant message (LLM reasoning)
  if (agentPlan?.reasoning) {
    html += `
      <div class="voice-draft-assistant-message">
        <div class="voice-draft-assistant-avatar">🤖</div>
        <div class="voice-draft-assistant-bubble">
          ${escapeHtml(agentPlan.reasoning)}
        </div>
      </div>
    `;
  }

  // Tool Plan Preview
  if (agentPlan?.tools && agentPlan.tools.length > 0 && !isProcessing) {
    html += renderToolPlan(agentPlan.tools);
  }

  contentDiv.innerHTML = html;
}

function renderToolPlan(tools: ToolCall[]): string {
  let html = '<div class="voice-draft-tool-plan">';
  html += '<h4 class="voice-draft-plan-title">📋 Plan:</h4>';

  tools.forEach((tool) => {
    const statusClass = tool.status ? ` ${tool.status}` : '';
    html += `<div class="voice-draft-tool-item${statusClass}">`;

    // Tool icon and description based on tool type
    if (tool.name === 'replaceText') {
      html += `<div class="voice-draft-tool-icon">📝</div>`;
      html += `<div class="voice-draft-tool-desc">Replace "${escapeHtml(tool.parameters.targetText)}" → "${escapeHtml(tool.parameters.replacementText)}"</div>`;
    } else if (tool.name === 'insertText') {
      // Support both html (new) and text (old) parameters
      const content = tool.parameters.html || tool.parameters.text || '';
      // Strip HTML tags for preview
      const textOnly = content.replace(/<[^>]*>/g, '');
      const preview = textOnly.substring(0, 50);
      const hasMore = textOnly.length > 50 ? '...' : '';
      html += `<div class="voice-draft-tool-icon">➕</div>`;
      html += `<div class="voice-draft-tool-desc">Insert text: "${escapeHtml(preview)}${hasMore}"</div>`;
    } else if (tool.name === 'insertMap') {
      html += `<div class="voice-draft-tool-icon">🗺️</div>`;
      html += `<div class="voice-draft-tool-desc">Insert map (will auto-discover geo-marks from context)</div>`;
    } else if (tool.name === 'createGeoMark') {
      html += `<div class="voice-draft-tool-icon">📍</div>`;
      html += `<div class="voice-draft-tool-desc">Mark "${escapeHtml(tool.parameters.text)}" as ${escapeHtml(tool.parameters.placeName)}</div>`;
    } else if (tool.name === 'setTransportation') {
      const modeIcons: { [key: string]: string } = {
        'cycling': '🚴',
        'driving': '🚗',
        'walking': '🚶',
        'flying': '✈️'
      };
      const icon = modeIcons[tool.parameters.mode] || '🚶';
      html += `<div class="voice-draft-tool-icon">${icon}</div>`;
      html += `<div class="voice-draft-tool-desc">Set ${escapeHtml(tool.parameters.mode)} from ${escapeHtml(tool.parameters.fromLocation)} to ${escapeHtml(tool.parameters.toLocation)}</div>`;
    } else {
      // Unknown tool
      html += `<div class="voice-draft-tool-icon">🔧</div>`;
      html += `<div class="voice-draft-tool-desc">Execute ${escapeHtml(tool.name)}</div>`;
    }

    html += '</div>';
  });

  html += '</div>';
  return html;
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ============================================
// ACTION HANDLERS
// ============================================

function handleCancel(): void {
  console.log('[VoiceDraftSheet] Cancel clicked');
  hideVoiceDraftSheet();
}

function handleReRecord(): void {
  console.log('[VoiceDraftSheet] Re-record clicked');

  // Close sheet
  hideVoiceDraftSheet();

  // Restart voice recording after delay (allow sheet to close)
  setTimeout(() => {
    if (voiceInputService) {
      console.log('[VoiceDraftSheet] Starting new voice recording');
      voiceInputService.start();
    }
  }, 300);
}

async function handleApprove(): Promise<void> {
  console.log('[VoiceDraftSheet] Approve clicked - executing agent plan');

  if (!editorView || !schema) {
    console.error('[VoiceDraftSheet] EditorView or Schema not available');
    return;
  }

  if (!currentDraft.agentPlan) {
    console.error('[VoiceDraftSheet] No agent plan available');
    return;
  }

  try {
    // Update plan status
    currentDraft.agentPlan.status = 'executing';
    renderDraftContent();

    // Execute tool plan
    const context: ExecutionContext = {
      editorView,
      schema,
      detectedLocations: currentDraft.detectedLocations
    };

    const results = await executePlan(currentDraft.agentPlan, context);

    // Check execution results
    const allSuccess = results.every(r => r.success);

    if (allSuccess) {
      console.log('[VoiceDraftSheet] ✅ All tools executed successfully');
      currentDraft.agentPlan.status = 'complete';
      currentDraft.agentPlan.executionResults = results;

      // Trigger change callback (refresh maps, etc.)
      if (onChangeCallback) {
        onChangeCallback();
      }

      // Focus editor
      editorView.focus();

      // Close sheet after brief delay
      setTimeout(() => {
        hideVoiceDraftSheet();
      }, 300);
    } else {
      // Some tools failed
      const errors = results.filter(r => !r.success).map(r => r.error).join('; ');
      console.error('[VoiceDraftSheet] ❌ Tool execution failed:', errors);

      currentDraft.agentPlan.status = 'failed';
      currentDraft.agentPlan.error = errors;
      currentDraft.agentPlan.executionResults = results;

      renderDraftContent();
      alert(`Failed to execute plan: ${errors}`);
    }
  } catch (error) {
    console.error('[VoiceDraftSheet] Error executing plan:', error);

    currentDraft.agentPlan.status = 'failed';
    currentDraft.agentPlan.error = error.message || 'Unknown error';

    renderDraftContent();
    alert('Failed to execute plan. Please try again.');
  }
}

// ============================================
// TOUCH GESTURES (Mobile)
// ============================================

function handleTouchStart(e: TouchEvent): void {
  touchStartY = e.touches[0].clientY;
  isDragging = false;
}

function handleTouchMove(e: TouchEvent): void {
  if (!isDragging && Math.abs(e.touches[0].clientY - touchStartY) > 5) {
    isDragging = true;
  }

  if (isDragging) {
    touchCurrentY = e.touches[0].clientY;
    const deltaY = touchCurrentY - touchStartY;

    // Only allow downward swipe to close
    if (deltaY > 0) {
      const sheet = document.getElementById('voice-draft-sheet');
      if (sheet) {
        sheet.style.transform = `translateY(${deltaY}px)`;
      }
    }

    e.preventDefault();
  }
}

function handleTouchEnd(): void {
  if (!isDragging) return;

  const deltaY = touchCurrentY - touchStartY;
  const sheet = document.getElementById('voice-draft-sheet');

  if (!sheet) return;

  // Close if swiped down more than 100px
  if (deltaY > 100) {
    hideVoiceDraftSheet();
  } else {
    // Reset position
    sheet.style.transform = '';
  }

  isDragging = false;
}

// ============================================
// UTILITIES
// ============================================

function isMobileDevice(): boolean {
  return window.innerWidth < 768;
}

/**
 * Get document context around cursor (300 chars before)
 */
function getDocumentContext(): string {
  if (!editorView) return '';

  const { state } = editorView;
  const cursorPos = state.selection.from;
  const contextStart = Math.max(0, cursorPos - 300);

  return state.doc.textBetween(contextStart, cursorPos, ' ');
}

/**
 * Analyze transcript with agent via WebRTC data channel
 * Delegates to agent tab which has access to localhost services (Ollama, Nominatim)
 */
async function analyzeWithAgent(
  transcript: string,
  context: string
): Promise<AgentPlan | null> {
  try {
    const agentService = getAgentDataChannelService();
    if (!agentService) {
      console.error('[VoiceDraftSheet] AgentDataChannelService not initialized');
      return null;
    }

    if (!agentService.isAgentConnected()) {
      console.warn('[VoiceDraftSheet] Agent not connected - waiting for connection...');
      // TODO: Could add retry logic or wait for connection
      return null;
    }

    console.log('[VoiceDraftSheet] Sending transcript to agent via WebRTC data channel...');
    const plan = await agentService.analyzeTranscript(transcript, context);

    return plan;
  } catch (error) {
    console.error('[VoiceDraftSheet] Agent analysis failed:', error);
    return null;
  }
}

/**
 * Show ambiguity question to user with multiple choice options
 */
function showAmbiguityQuestion(
  question: AmbiguityQuestion,
  transcript: string,
  context: string
): void {
  console.log('[VoiceDraftSheet] Showing ambiguity question:', question);

  // Update draft with ambiguity question
  currentDraft.isProcessing = false;

  // Render question UI in the draft body
  const bodyElement = document.querySelector('.voice-draft-body');
  if (!bodyElement) {
    console.error('[VoiceDraftSheet] Draft body element not found');
    return;
  }

  // Build question HTML
  let html = '<div class="voice-draft-ambiguity">';
  html += '<div class="voice-draft-assistant-message">';
  html += '<div class="voice-draft-assistant-avatar">🤔</div>';
  html += '<div class="voice-draft-assistant-bubble">';
  html += question.question;
  html += '</div>';
  html += '</div>';

  // Check if this is a spelling request
  if (question.requiresSpelling) {
    // Show spelling prompt UI
    html += '<div class="voice-draft-spelling-prompt">';
    html += '<p style="margin: 12px 0 8px 0; font-size: 14px; color: #495057;">Please spell the location name letter by letter:</p>';
    html += `<button class="voice-draft-action-btn primary" id="start-spelling-btn" style="margin: 8px 0;">
      🎤 Start Spelling
    </button>`;
    html += '<div id="spelling-transcript" style="display:none; margin-top: 12px; padding: 12px; background: #f8f9fa; border-radius: 6px; font-size: 14px;"></div>';
    html += '</div>';

    // Add re-record button
    html += '<div style="margin-top: 16px;">';
    html += `<button class="voice-draft-action-btn" id="spelling-rerecord-btn">
      🔄 Re-record Instead
    </button>`;
    html += '</div>';
  } else {
    // Radio button options (existing UI)
    html += '<div class="voice-draft-options">';
    question.options.forEach((option, index) => {
      html += `
        <label class="voice-draft-option">
          <input
            type="radio"
            name="ambiguity-choice"
            value="${option.value}"
            ${index === 0 ? 'checked' : ''}
          />
          <span>${option.label}</span>
        </label>
      `;
    });
    html += '</div>';

    // Confirm button
    html += `
      <button
        class="voice-draft-action-btn primary"
        id="voice-draft-confirm-choice"
        style="margin-top: 16px;"
      >
        Confirm Choice
      </button>
    `;
  }

  html += '</div>';

  bodyElement.innerHTML = html;

  // Attach event handlers
  if (question.requiresSpelling) {
    // Spelling mode handlers
    const startBtn = document.getElementById('start-spelling-btn');
    if (startBtn) {
      startBtn.addEventListener('click', () => {
        handleStartSpelling(transcript, context);
      });
    }

    const rerecordBtn = document.getElementById('spelling-rerecord-btn');
    if (rerecordBtn) {
      rerecordBtn.addEventListener('click', handleReRecord);
    }
  } else {
    // Attach confirm button handler (existing code)
    const confirmBtn = document.getElementById('voice-draft-confirm-choice');
    if (confirmBtn) {
      confirmBtn.addEventListener('click', () => {
        const selectedOption = document.querySelector<HTMLInputElement>(
          'input[name="ambiguity-choice"]:checked'
        );
        if (selectedOption) {
          handleAmbiguityResponse(selectedOption.value, transcript, context);
        }
      });
    }
  }
}

/**
 * Handle user's response to ambiguity question
 */
async function handleAmbiguityResponse(
  selectedValue: string,
  transcript: string,
  context: string
): Promise<void> {
  console.log('[VoiceDraftSheet] User selected:', selectedValue);

  // Handle spelling mode activation
  if (selectedValue === 'spell') {
    console.log('[VoiceDraftSheet] User chose to spell location');
    // TODO: Activate voice spelling mode
    // For now, just show a message
    alert('Voice spelling mode coming soon! Please use re-record for now.');
    return;
  }

  if (selectedValue === 're-record') {
    handleReRecord();
    return;
  }

  // Show processing state
  currentDraft.isProcessing = true;
  renderDraftContent();

  try {
    // For now, create a simple plan based on user's choice
    // In future, could add additional LLM call with user's clarification
    const intent = selectedValue === 'insert'
      ? `Insert the text: "${transcript}"`
      : `Insert the text with a map showing locations: "${transcript}"`;

    const plan = await generatePlan(
      {
        intent,
        confidence: 'high',
        reasoning: `User clarified: ${selectedValue}`
      },
      currentDraft.detectedLocations
    );

    if (plan) {
      currentDraft.agentPlan = plan;

      // Ensure we have at least insertText tool
      if (plan.tools.length === 0) {
        console.warn('[VoiceDraftSheet] No tools after clarification, adding insertText');
        plan.tools = [{
          name: 'insertText',
          parameters: { text: transcript }
        }];
      }
    } else {
      // Fallback
      currentDraft.agentPlan = {
        status: 'ready',
        reasoning: `User clarified: ${selectedValue}`,
        tools: [{
          name: 'insertText',
          parameters: { text: transcript }
        }]
      };
    }

    currentDraft.isProcessing = false;
    renderDraftContent();
  } catch (error) {
    console.error('[VoiceDraftSheet] Error handling ambiguity response:', error);
    currentDraft.isProcessing = false;
    renderDraftContent();
  }
}

// ============================================
// VOICE SPELLING MODE
// ============================================

/**
 * Extract single letter from voice transcript
 * Handles various ways users might say letters:
 * - Direct: "R", "O", "S"
 * - Phonetic: "Romeo", "Oscar", "Sierra"
 * - Spelled out: "are", "oh", "ess"
 */
function extractLetterFromTranscript(transcript: string): string | null {
  const text = transcript.trim().toLowerCase();

  // Direct single letter
  if (text.length === 1 && /[a-z]/.test(text)) {
    return text.toUpperCase();
  }

  // Phonetic alphabet patterns (NATO)
  const phoneticMap: { [key: string]: string } = {
    'alpha': 'A', 'bravo': 'B', 'charlie': 'C', 'delta': 'D',
    'echo': 'E', 'foxtrot': 'F', 'golf': 'G', 'hotel': 'H',
    'india': 'I', 'juliett': 'J', 'juliet': 'J', 'kilo': 'K', 'lima': 'L',
    'mike': 'M', 'november': 'N', 'oscar': 'O', 'papa': 'P',
    'quebec': 'Q', 'romeo': 'R', 'sierra': 'S', 'tango': 'T',
    'uniform': 'U', 'victor': 'V', 'whiskey': 'W', 'xray': 'X', 'x-ray': 'X',
    'yankee': 'Y', 'zulu': 'Z'
  };

  if (phoneticMap[text]) {
    return phoneticMap[text];
  }

  // "Letter X" or "capital X"
  const letterMatch = text.match(/(?:letter|capital)?\s*([a-z])/);
  if (letterMatch) {
    return letterMatch[1].toUpperCase();
  }

  // Spelled out letter names: "are" → "R", "ess" → "S"
  const spellMap: { [key: string]: string } = {
    'a': 'A', 'ay': 'A', 'are': 'R', 'bee': 'B', 'cee': 'C', 'see': 'C',
    'dee': 'D', 'e': 'E', 'ee': 'E', 'eff': 'F', 'gee': 'G', 'aitch': 'H',
    'i': 'I', 'eye': 'I', 'jay': 'J', 'kay': 'K', 'el': 'L', 'elle': 'L',
    'em': 'M', 'en': 'N', 'oh': 'O', 'pee': 'P', 'queue': 'Q', 'cue': 'Q',
    'ess': 'S', 'tee': 'T', 'tea': 'T', 'you': 'U', 'vee': 'V', 'double-you': 'W',
    'doubleyou': 'W', 'ex': 'X', 'why': 'Y', 'wye': 'Y', 'zee': 'Z', 'zed': 'Z'
  };

  if (spellMap[text]) {
    return spellMap[text];
  }

  return null;
}

/**
 * Extract spelled word from voice transcript
 * Handles: "R O S K I L D E" or "are oh ess kay eye el dee ee"
 */
function extractSpelledWord(transcript: string): string {
  const text = transcript.trim().toLowerCase();

  // Split by spaces/punctuation
  const parts = text.split(/[\s,.-]+/);

  let result = '';

  for (const part of parts) {
    const letter = extractLetterFromTranscript(part);
    if (letter) {
      result += letter;
    }
  }

  return result;
}

/**
 * Handle voice spelling mode
 * User speaks letters one by one, we extract and search
 */
async function handleStartSpelling(
  originalTranscript: string,
  context: string
): Promise<void> {
  if (!voiceInputService) {
    console.error('[VoiceSpelling] VoiceInputService not available');
    return;
  }

  console.log('[VoiceSpelling] Starting spelling mode for transcript:', originalTranscript);

  // Get transcript display element
  const transcriptDiv = document.getElementById('spelling-transcript');
  if (!transcriptDiv) {
    console.error('[VoiceSpelling] Spelling transcript div not found');
    return;
  }

  // Show listening UI
  transcriptDiv.style.display = 'block';
  transcriptDiv.innerHTML = '<p>🎤 Listening... speak each letter clearly (e.g., "R", "O", "S")</p>';

  // Disable start button
  const startBtn = document.getElementById('start-spelling-btn');
  if (startBtn) {
    (startBtn as HTMLButtonElement).disabled = true;
    startBtn.textContent = '⏺️ Listening...';
  }

  // Set up voice input handlers
  const handleInterim = (transcript: string) => {
    // Show interim transcript
    if (transcriptDiv) {
      transcriptDiv.innerHTML = `<p>Hearing: <em>${escapeHtml(transcript)}</em></p>`;
    }
  };

  const handleFinal = async (transcript: string) => {
    console.log('[VoiceSpelling] Final transcript:', transcript);

    // Extract letters from the transcript
    const spelledWord = extractSpelledWord(transcript);
    console.log('[VoiceSpelling] Extracted word:', spelledWord);

    if (spelledWord.length < 2) {
      if (transcriptDiv) {
        transcriptDiv.innerHTML = '<p style="color: #dc3545;">⚠️ Could not understand. Please try again.</p>';
      }

      // Re-enable button
      if (startBtn) {
        (startBtn as HTMLButtonElement).disabled = false;
        startBtn.innerHTML = '🎤 Start Spelling';
      }

      return;
    }

    // Show extracted word
    if (transcriptDiv) {
      transcriptDiv.innerHTML = `<p>You spelled: <strong>${escapeHtml(spelledWord)}</strong></p><p>Searching for locations...</p>`;
    }

    // Search for matching locations
    if (!geocodingService) {
      console.error('[VoiceSpelling] GeocodingService not available');
      return;
    }

    const nearbyLoc = currentDraft.detectedLocations.find(loc =>
      loc.status === 'found' && loc.lat && loc.lng
    );

    const suggestions = await geocodingService.searchByPrefix(
      spelledWord,
      nearbyLoc ? { lat: nearbyLoc.lat!, lng: nearbyLoc.lng! } : undefined
    );

    if (suggestions.length > 0) {
      // Show suggestions
      showSpellingSuggestions(suggestions, originalTranscript, context, spelledWord);
    } else {
      if (transcriptDiv) {
        transcriptDiv.innerHTML = `<p style="color: #dc3545;">⚠️ No locations found for "<strong>${escapeHtml(spelledWord)}</strong>".</p><p>Please try again or re-record.</p>`;
      }

      // Re-enable button
      if (startBtn) {
        (startBtn as HTMLButtonElement).disabled = false;
        startBtn.innerHTML = '🎤 Try Again';
      }
    }

    // Clean up listeners
    voiceInputService.off('interim', handleInterim);
    voiceInputService.off('final', handleFinal);
  };

  // Attach listeners
  voiceInputService.on('interim', handleInterim);
  voiceInputService.on('final', handleFinal);

  // Start listening
  await voiceInputService.start();
}

/**
 * Show spelling suggestions after geocoding search
 */
function showSpellingSuggestions(
  suggestions: Array<{ name: string; lat: number; lng: number; relevance: number }>,
  originalTranscript: string,
  context: string,
  spelledWord: string
): void {
  const transcriptDiv = document.getElementById('spelling-transcript');
  if (!transcriptDiv) return;

  let html = `<p>You spelled: <strong>${escapeHtml(spelledWord)}</strong></p>`;
  html += '<p style="margin-top: 12px; font-weight: 600;">Did you mean:</p>';
  html += '<div class="spelling-suggestions" style="display: flex; flex-direction: column; gap: 8px; margin-top: 8px;">';

  suggestions.forEach((suggestion, index) => {
    const confidence = suggestion.relevance > 0.8 ? 'high' : 'medium';
    const checkmark = index === 0 && suggestion.relevance > 0.8 ? ' ✓' : '';

    // Encode parameters for onclick handler
    const encodedName = escapeHtml(suggestion.name).replace(/'/g, '&apos;');
    const encodedTranscript = escapeHtml(originalTranscript).replace(/'/g, '&apos;');
    const encodedContext = escapeHtml(context).replace(/'/g, '&apos;');
    const encodedSpelled = escapeHtml(spelledWord).replace(/'/g, '&apos;');

    html += `<button
      class="suggestion-item ${confidence}"
      style="padding: 12px; background: ${confidence === 'high' ? '#d4edda' : 'white'}; border: 1px solid ${confidence === 'high' ? '#28a745' : '#dee2e6'}; border-radius: 6px; text-align: left; cursor: pointer; font-size: 14px; transition: all 0.15s ease;"
      onclick="window.__handleSpellingSuggestionClick('${encodedName}', ${suggestion.lat}, ${suggestion.lng}, '${encodedTranscript}', '${encodedContext}', '${encodedSpelled}')"
      onmouseover="this.style.background='${confidence === 'high' ? '#c3e6cb' : '#e9ecef'}'"
      onmouseout="this.style.background='${confidence === 'high' ? '#d4edda' : 'white'}'"
    >
      ${escapeHtml(suggestion.name)}${checkmark}
    </button>`;
  });

  html += '</div>';
  transcriptDiv.innerHTML = html;
}

/**
 * Handle user clicking a spelling suggestion
 * This needs to be globally accessible for onclick handlers
 */
async function handleSpellingSuggestionClick(
  correctedName: string,
  lat: number,
  lng: number,
  originalTranscript: string,
  context: string,
  spelledWord: string
): Promise<void> {
  console.log('[VoiceSpelling] User selected:', correctedName);

  const transcriptDiv = document.getElementById('spelling-transcript');
  if (transcriptDiv) {
    transcriptDiv.innerHTML = `<p>✅ Selected: <strong>${escapeHtml(correctedName)}</strong></p><p>Updating analysis...</p>`;
  }

  // Update the transcript by replacing the mistranscribed word with the correct one
  // For simplicity, we'll just use the corrected name directly
  // TODO: In a more sophisticated version, we could try to find and replace the specific mistranscribed word
  const correctedTranscript = originalTranscript; // For now, keep original transcript structure

  // Add the corrected location to detected locations
  const geoId = `geo-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const colorIndex = currentDraft.detectedLocations.length % GEO_MARK_COLORS.length;

  // Find if there's an error location that matches the spelled word (case-insensitive)
  const errorLocationIndex = currentDraft.detectedLocations.findIndex(
    loc => loc.status === 'error' && loc.locationName.toLowerCase().includes(spelledWord.toLowerCase())
  );

  if (errorLocationIndex >= 0) {
    // Update the existing error location
    currentDraft.detectedLocations[errorLocationIndex] = {
      ...currentDraft.detectedLocations[errorLocationIndex],
      locationName: correctedName,
      lat: Number(lat),
      lng: Number(lng),
      geoId,
      colorIndex,
      status: 'found'
    };
  } else {
    // Add as new location
    currentDraft.detectedLocations.push({
      locationName: correctedName,
      lat: Number(lat),
      lng: Number(lng),
      geoId,
      colorIndex,
      status: 'found',
      ranges: [] // We'll skip highlighting for now
    });
  }

  // Re-run agent analysis with updated detected locations
  currentDraft.isProcessing = true;
  renderDraftContent();

  try {
    const agentResult = await analyzeWithAgent(correctedTranscript, context);

    if (agentResult) {
      currentDraft.agentPlan = agentResult;

      // Ensure we have at least insertText tool
      if (agentResult.tools.length === 0) {
        console.warn('[VoiceSpelling] No tools after correction, adding insertText');
        agentResult.tools = [{
          name: 'insertText',
          parameters: { text: correctedTranscript }
        }];
      }
    } else {
      // Fallback
      currentDraft.agentPlan = {
        status: 'ready',
        reasoning: `Location corrected to ${correctedName}`,
        tools: [{
          name: 'insertText',
          parameters: { text: correctedTranscript }
        }]
      };
    }

    currentDraft.isProcessing = false;
    renderDraftContent();
  } catch (error) {
    console.error('[VoiceSpelling] Error after spelling correction:', error);
    currentDraft.isProcessing = false;
    renderDraftContent();
  }
}

// Make handleSpellingSuggestionClick globally accessible for onclick handlers
(window as any).__handleSpellingSuggestionClick = handleSpellingSuggestionClick;
