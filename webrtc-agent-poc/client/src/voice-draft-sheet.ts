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
import { isOllamaAvailable, generatePlan } from './services/OllamaAgentService';
import { clarifyIntent } from './services/IntentClarificationService';
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

  // Initialize draft data
  currentDraft = {
    transcript: transcript.trim(),
    detectedLocations: [],
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

  // Start background location detection
  startLocationDetection(currentDraft.transcript);
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
// LOCATION DETECTION
// ============================================

async function startLocationDetection(text: string): Promise<void> {
  console.log('[VoiceDraftSheet] Starting location detection and agent analysis for:', text);

  if (!geocodingService) {
    console.error('[VoiceDraftSheet] GeocodingService not available');
    currentDraft.isProcessing = false;
    renderDraftContent();
    return;
  }

  try {
    // Extract document context for agent analysis
    const context = getDocumentContext();

    // Extract location names using regex (same pattern as GeoMarkingService)
    const locationNames = extractLocationNames(text);
    console.log('[VoiceDraftSheet] Extracted location names:', locationNames);

    // Initialize detected locations with 'detecting' status
    if (locationNames.length > 0) {
      currentDraft.detectedLocations = locationNames.map(name => ({
        locationName: name,
        status: 'detecting' as const,
        ranges: findLocationRanges(text, name)
      }));
    }

    // Render with detecting status
    renderDraftContent();

    // Run location detection and agent analysis in parallel
    const [locationResult, agentResult] = await Promise.allSettled([
      // Location detection
      (async () => {
        if (locationNames.length === 0) {
          console.log('[VoiceDraftSheet] No locations detected');
          return;
        }

        // Geocode each location in parallel
        const geocodePromises = locationNames.map(async (locationName, index) => {
          try {
            console.log(`[VoiceDraftSheet] Geocoding: ${locationName}`);

            const result = await geocodingService!.geocode(locationName);

            if (result && result.lat !== undefined && result.lng !== undefined) {
              // Success - update location as found
              const colorIndex = index % GEO_MARK_COLORS.length;
              const geoId = `geo-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

              currentDraft.detectedLocations[index] = {
                ...currentDraft.detectedLocations[index],
                status: 'found',
                lat: Number(result.lat),
                lng: Number(result.lng),
                geoId,
                colorIndex
              };

              console.log(`[VoiceDraftSheet] ✅ Found: ${locationName} at (${result.lat}, ${result.lng})`);
            } else {
              // Not found
              currentDraft.detectedLocations[index] = {
                ...currentDraft.detectedLocations[index],
                status: 'error',
                errorMessage: 'Location not found'
              };

              console.log(`[VoiceDraftSheet] ❌ Not found: ${locationName}`);
            }
          } catch (error) {
            console.error(`[VoiceDraftSheet] Error geocoding ${locationName}:`, error);

            currentDraft.detectedLocations[index] = {
              ...currentDraft.detectedLocations[index],
              status: 'error',
              errorMessage: 'Geocoding failed'
            };
          }

          // Re-render after each location completes
          renderDraftContent();
        });

        await Promise.all(geocodePromises);
        console.log('[VoiceDraftSheet] Location detection complete');
      })(),

      // Agent analysis
      analyzeWithAgent(text, context)
    ]);

    // Handle agent analysis result
    if (agentResult.status === 'fulfilled' && agentResult.value) {
      currentDraft.agentPlan = agentResult.value;
      console.log('[VoiceDraftSheet] Agent plan ready:', agentResult.value);

      // If LLM returned no tools, add default insertText
      if (currentDraft.agentPlan.tools.length === 0) {
        console.warn('[VoiceDraftSheet] LLM returned empty tools array, adding default insertText');
        currentDraft.agentPlan.tools = [{
          name: 'insertText',
          parameters: { text }
        }];
        currentDraft.agentPlan.reasoning = 'Ready to insert your text';
      }
    } else {
      // Fallback: create simple insertText plan
      currentDraft.agentPlan = {
        status: 'ready',
        reasoning: 'Ready to insert your text',
        tools: [{
          name: 'insertText',
          parameters: { text }
        }]
      };
      console.log('[VoiceDraftSheet] Using fallback insertText plan');
    }

    currentDraft.isProcessing = false;
    renderDraftContent();

    console.log('[VoiceDraftSheet] All analysis complete');
  } catch (error) {
    console.error('[VoiceDraftSheet] Error during analysis:', error);
    currentDraft.isProcessing = false;
    renderDraftContent();
  }
}

function extractLocationNames(text: string): string[] {
  // Same regex pattern as GeoMarkingService
  const locationPattern = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g;
  const matches = text.match(locationPattern) || [];

  // Filter out common words (blacklist)
  const blacklist = [
    'The', 'A', 'An', 'I', 'He', 'She', 'It', 'We', 'They',
    'Visit', 'Go', 'Travel', 'See', 'Explore', 'Discover',
    'My', 'Your', 'Our', 'This', 'That', 'These', 'Those'
  ];

  const filtered = matches.filter(name => !blacklist.includes(name));

  // Remove duplicates and limit to 5 locations
  const unique = Array.from(new Set(filtered));
  return unique.slice(0, 5);
}

function findLocationRanges(text: string, locationName: string): Array<{ from: number; to: number }> {
  const ranges: Array<{ from: number; to: number }> = [];
  let startIndex = 0;

  while ((startIndex = text.indexOf(locationName, startIndex)) !== -1) {
    ranges.push({
      from: startIndex,
      to: startIndex + locationName.length
    });
    startIndex += locationName.length;
  }

  return ranges;
}

// ============================================
// RENDER CONTENT
// ============================================

function renderDraftContent(): void {
  const contentDiv = document.getElementById('voice-draft-content');
  if (!contentDiv) return;

  const { transcript, detectedLocations, isProcessing, agentPlan } = currentDraft;

  let html = '';

  // Draft text with highlighted locations (shown first)
  html += '<div class="voice-draft-text">';
  html += highlightLocationsInText(transcript, detectedLocations);
  html += '</div>';

  // Location list
  if (detectedLocations.length > 0) {
    html += `
      <div class="voice-draft-locations-section">
        <div class="voice-draft-section-title">Detected Locations</div>
        <div class="voice-draft-location-list">
    `;

    detectedLocations.forEach(location => {
      html += renderLocationItem(location);
    });

    html += `
        </div>
      </div>
    `;
  } else if (!isProcessing) {
    html += `
      <div class="voice-draft-empty">
        No locations detected in this text.
      </div>
    `;
  }

  // Processing indicator
  if (isProcessing) {
    html += `
      <div class="voice-draft-processing">
        <div class="voice-draft-processing-spinner"></div>
        <span>Analyzing context and detecting locations...</span>
      </div>
    `;
  }

  // Conversational Message Section (use agent reasoning if available)
  const message = agentPlan?.reasoning || generateConfirmationMessage();
  html += `
    <div class="voice-draft-assistant-message">
      <div class="voice-draft-assistant-avatar">🤖</div>
      <div class="voice-draft-assistant-bubble">
        ${escapeHtml(message)}
      </div>
    </div>
  `;

  // Tool Plan Preview
  if (agentPlan?.tools && agentPlan.tools.length > 0 && !isProcessing) {
    html += renderToolPlan(agentPlan.tools);
  }

  contentDiv.innerHTML = html;
}

function generateConfirmationMessage(): string {
  const { transcript, detectedLocations, isProcessing } = currentDraft;

  // Part 1: Transcript readback
  const transcriptPart = `You said: "${transcript}"`;

  // Part 2: Location status
  let locationPart = '';

  if (isProcessing) {
    // Still detecting
    locationPart = `I'm detecting locations...`;
  } else {
    // Detection complete
    const foundLocations = detectedLocations.filter(loc => loc.status === 'found');
    const errorLocations = detectedLocations.filter(loc => loc.status === 'error');

    if (foundLocations.length === 0) {
      locationPart = `I didn't find any locations.`;
    } else if (foundLocations.length === 1) {
      const name = foundLocations[0].locationName;
      locationPart = `I found 1 location: ${name}.`;
    } else {
      const names = foundLocations.map(loc => loc.locationName).join(', ');
      const lastComma = names.lastIndexOf(',');
      const formattedNames = lastComma > 0
        ? names.substring(0, lastComma) + ' and' + names.substring(lastComma + 1)
        : names;
      locationPart = `I found ${foundLocations.length} locations: ${formattedNames}.`;
    }

    // Add error note if some failed
    if (errorLocations.length > 0) {
      const errorNames = errorLocations.map(loc => loc.locationName).join(', ');
      locationPart += ` I couldn't find: ${errorNames}.`;
    }
  }

  return `${transcriptPart} ${locationPart}`;
}

function highlightLocationsInText(text: string, locations: DetectedLocation[]): string {
  // Build array of all ranges with their metadata
  const allRanges: Array<{ from: number; to: number; location: DetectedLocation }> = [];

  locations.forEach(location => {
    location.ranges.forEach(range => {
      allRanges.push({ ...range, location });
    });
  });

  // Sort by position
  allRanges.sort((a, b) => a.from - b.from);

  // Build highlighted HTML
  let result = '';
  let lastIndex = 0;

  allRanges.forEach(({ from, to, location }) => {
    // Add text before this range
    if (from > lastIndex) {
      result += escapeHtml(text.substring(lastIndex, from));
    }

    // Add highlighted text
    const statusClass = `location-${location.status}`;
    const style = location.status === 'found' && location.colorIndex !== undefined
      ? `style="background-color: ${GEO_MARK_COLORS[location.colorIndex]}33;"`
      : '';

    result += `<span class="voice-draft-highlight ${statusClass}" ${style}>`;
    result += escapeHtml(text.substring(from, to));
    result += '</span>';

    lastIndex = to;
  });

  // Add remaining text
  if (lastIndex < text.length) {
    result += escapeHtml(text.substring(lastIndex));
  }

  return result;
}

function renderLocationItem(location: DetectedLocation): string {
  const { locationName, status, lat, lng, colorIndex, errorMessage } = location;

  let statusHtml = '';
  let detailsHtml = '';

  if (status === 'detecting') {
    statusHtml = '<div class="voice-draft-location-status detecting"></div>';
    detailsHtml = '<div class="voice-draft-location-coords">Detecting...</div>';
  } else if (status === 'found') {
    const color = colorIndex !== undefined ? GEO_MARK_COLORS[colorIndex] : '#ccc';
    statusHtml = `<div class="voice-draft-location-status found" style="background-color: ${color};"></div>`;
    detailsHtml = `<div class="voice-draft-location-coords">${Number(lat)?.toFixed(4)}, ${Number(lng)?.toFixed(4)}</div>`;
  } else if (status === 'error') {
    statusHtml = '<div class="voice-draft-location-status error"></div>';
    detailsHtml = `<div class="voice-draft-location-error-msg">${errorMessage || 'Error'}</div>`;
  }

  return `
    <div class="voice-draft-location-item">
      ${statusHtml}
      <div class="voice-draft-location-details">
        <div class="voice-draft-location-name">${escapeHtml(locationName)}</div>
        ${detailsHtml}
      </div>
    </div>
  `;
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
      const preview = tool.parameters.text.substring(0, 50);
      const hasMore = tool.parameters.text.length > 50 ? '...' : '';
      html += `<div class="voice-draft-tool-icon">➕</div>`;
      html += `<div class="voice-draft-tool-desc">Insert text: "${escapeHtml(preview)}${hasMore}"</div>`;
    } else if (tool.name === 'insertMap') {
      html += `<div class="voice-draft-tool-icon">🗺️</div>`;
      html += `<div class="voice-draft-tool-desc">Insert map (will auto-discover geo-marks from context)</div>`;
    } else if (tool.name === 'createGeoMark') {
      html += `<div class="voice-draft-tool-icon">📍</div>`;
      html += `<div class="voice-draft-tool-desc">Mark "${escapeHtml(tool.parameters.text)}" as ${escapeHtml(tool.parameters.placeName)}</div>`;
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
 * Analyze voice input with Ollama agent
 */
async function analyzeWithAgent(
  transcript: string,
  context: string
): Promise<AgentPlan | null> {
  try {
    // Check Ollama availability
    const available = await isOllamaAvailable();
    if (!available) {
      console.warn('[VoiceDraftSheet] Ollama unavailable, using fallback');
      return null;
    }

    if (!editorView) {
      console.error('[VoiceDraftSheet] EditorView not available');
      return null;
    }

    // Phase 1: Intent Clarification
    console.log('[VoiceDraftSheet] Phase 1: Clarifying intent...');
    const intentResult = await clarifyIntent(transcript, context, editorView);

    // If ambiguous, show question to user and wait for response
    if (intentResult.type === 'ambiguous') {
      console.log('[VoiceDraftSheet] Intent is ambiguous, showing question to user');
      showAmbiguityQuestion(intentResult.question, transcript, context);
      return null; // Will be handled by user response
    }

    // Phase 2: Generate Plan
    console.log('[VoiceDraftSheet] Phase 2: Generating plan from clarified intent...');
    const plan = await generatePlan(
      intentResult.intent,
      currentDraft.detectedLocations
    );

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

  // Radio button options
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
  html += '</div>';

  bodyElement.innerHTML = html;

  // Attach confirm button handler
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

/**
 * Handle user's response to ambiguity question
 */
async function handleAmbiguityResponse(
  selectedValue: string,
  transcript: string,
  context: string
): Promise<void> {
  console.log('[VoiceDraftSheet] User selected:', selectedValue);

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
