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
import { TextSelection } from 'prosemirror-state';

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
  isProcessing: false
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
    isProcessing: false
  };
}

// ============================================
// LOCATION DETECTION
// ============================================

async function startLocationDetection(text: string): Promise<void> {
  console.log('[VoiceDraftSheet] Starting location detection for:', text);

  if (!geocodingService) {
    console.error('[VoiceDraftSheet] GeocodingService not available');
    currentDraft.isProcessing = false;
    renderDraftContent();
    return;
  }

  try {
    // Extract location names using regex (same pattern as GeoMarkingService)
    const locationNames = extractLocationNames(text);
    console.log('[VoiceDraftSheet] Extracted location names:', locationNames);

    if (locationNames.length === 0) {
      console.log('[VoiceDraftSheet] No locations detected');
      currentDraft.isProcessing = false;
      renderDraftContent();
      return;
    }

    // Initialize detected locations with 'detecting' status
    currentDraft.detectedLocations = locationNames.map(name => ({
      locationName: name,
      status: 'detecting' as const,
      ranges: findLocationRanges(text, name)
    }));

    // Render with detecting status
    renderDraftContent();

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
            lat: result.lat,
            lng: result.lng,
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

    // Wait for all geocoding to complete
    await Promise.all(geocodePromises);

    currentDraft.isProcessing = false;
    renderDraftContent();

    console.log('[VoiceDraftSheet] Location detection complete');
  } catch (error) {
    console.error('[VoiceDraftSheet] Error during location detection:', error);
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

  const { transcript, detectedLocations, isProcessing } = currentDraft;

  let html = '';

  // Processing indicator
  if (isProcessing) {
    html += `
      <div class="voice-draft-processing">
        <div class="voice-draft-processing-spinner"></div>
        <span>Detecting locations...</span>
      </div>
    `;
  }

  // Draft text with highlighted locations
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

  contentDiv.innerHTML = html;
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
    detailsHtml = `<div class="voice-draft-location-coords">${lat?.toFixed(4)}, ${lng?.toFixed(4)}</div>`;
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

function handleApprove(): void {
  console.log('[VoiceDraftSheet] Approve clicked');

  if (!editorView || !schema) {
    console.error('[VoiceDraftSheet] EditorView or Schema not available');
    return;
  }

  const { transcript, detectedLocations } = currentDraft;
  const { state } = editorView;
  const { from } = state.selection;

  try {
    // Start transaction
    let tr = state.tr;

    // Insert plain text at cursor position
    tr = tr.insertText(transcript + ' ', from);
    const textEnd = from + transcript.length + 1;

    // Apply geo-marks to successfully geocoded locations
    const foundLocations = detectedLocations.filter(loc => loc.status === 'found');

    foundLocations.forEach(location => {
      const { locationName, geoId, lat, lng, colorIndex } = location;

      if (geoId && lat !== undefined && lng !== undefined && colorIndex !== undefined) {
        // Apply geo-mark to each occurrence of this location
        location.ranges.forEach(range => {
          const markFrom = from + range.from;
          const markTo = from + range.to;

          // Create geo-mark
          const geoMark = schema.marks.geoMark.create({
            geoId,
            placeName: locationName,
            lat,
            lng,
            colorIndex,
            coordSource: 'nominatim',
            createdAt: new Date().toISOString(),
            createdBy: 'voice-input'
          });

          // Apply mark to range
          tr = tr.addMark(markFrom, markTo, geoMark);
        });

        console.log(`[VoiceDraftSheet] Applied geo-mark: ${locationName} (${geoId})`);
      }
    });

    // Move cursor to end of inserted text
    tr = tr.setSelection(TextSelection.create(tr.doc, textEnd));

    // Dispatch transaction
    editorView.dispatch(tr);
    editorView.focus();

    console.log('[VoiceDraftSheet] ✅ Text and geo-marks inserted successfully');

    // Trigger change callback (refresh maps, etc.)
    if (onChangeCallback) {
      onChangeCallback();
    }

    // Close sheet
    hideVoiceDraftSheet();
  } catch (error) {
    console.error('[VoiceDraftSheet] Error inserting text and geo-marks:', error);
    alert('Failed to insert text. Please try again.');
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
