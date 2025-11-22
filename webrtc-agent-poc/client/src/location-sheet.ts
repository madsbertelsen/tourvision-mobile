/**
 * Location Sheet - Responsive bottom sheet / side panel for location details
 */

import './location-sheet.css';

interface LocationData {
  geoId: string;
  displayText: string;
  placeName: string;
  lat: number;
  lng: number;
  colorIndex: number;
  color: string;
  description?: string;
}

let isSheetOpen = false;
let touchStartY = 0;
let touchCurrentY = 0;
let isDragging = false;

/**
 * Initialize location sheet functionality
 */
export function initializeLocationSheet() {
  const backdrop = document.getElementById('location-sheet-backdrop');
  const sheet = document.getElementById('location-sheet');
  const closeBtn = document.getElementById('location-sheet-close-btn');

  if (!backdrop || !sheet || !closeBtn) {
    console.error('[LocationSheet] Required elements not found');
    return;
  }

  // Close on backdrop click
  backdrop.addEventListener('click', () => {
    hideLocationSheet();
  });

  // Close on button click
  closeBtn.addEventListener('click', () => {
    hideLocationSheet();
  });

  // Close on Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isSheetOpen) {
      hideLocationSheet();
    }
  });

  // Touch gestures for mobile swipe-to-close
  if (isMobileDevice()) {
    sheet.addEventListener('touchstart', handleTouchStart, { passive: true });
    sheet.addEventListener('touchmove', handleTouchMove, { passive: false });
    sheet.addEventListener('touchend', handleTouchEnd, { passive: true });
  }

  console.log('[LocationSheet] Initialized');
}

/**
 * Show location sheet with location data
 */
export function showLocationSheet(location: LocationData) {
  const backdrop = document.getElementById('location-sheet-backdrop');
  const sheet = document.getElementById('location-sheet');
  const content = document.getElementById('location-sheet-body');

  if (!backdrop || !sheet || !content) {
    console.error('[LocationSheet] Required elements not found');
    return;
  }

  console.log('[LocationSheet] Showing sheet for:', location);

  // Render location content
  renderLocationContent(location, content);

  // Update color dot
  const colorDot = document.getElementById('location-color-dot');
  if (colorDot) {
    colorDot.style.backgroundColor = location.color;
  }

  // Update title
  const title = document.getElementById('location-sheet-title');
  if (title) {
    title.textContent = location.displayText || location.placeName;
  }

  // Show with animation
  requestAnimationFrame(() => {
    backdrop.classList.add('visible');
    sheet.classList.add('visible');
    isSheetOpen = true;

    // Prevent body scroll on mobile
    if (isMobileDevice()) {
      document.body.style.overflow = 'hidden';
    }
  });
}

/**
 * Hide location sheet
 */
export function hideLocationSheet() {
  const backdrop = document.getElementById('location-sheet-backdrop');
  const sheet = document.getElementById('location-sheet');

  if (!backdrop || !sheet) {
    return;
  }

  console.log('[LocationSheet] Hiding sheet');

  backdrop.classList.remove('visible');
  sheet.classList.remove('visible');
  isSheetOpen = false;

  // Restore body scroll
  document.body.style.overflow = '';
}

/**
 * Render location content in the sheet
 */
function renderLocationContent(location: LocationData, container: HTMLElement) {
  const sections = [];

  // Place Name section
  sections.push(`
    <div class="location-section">
      <div class="location-section-label">
        <span class="location-section-icon">📍</span>
        <span>Place Name</span>
      </div>
      <div class="location-section-value">
        ${escapeHtml(location.placeName || 'Unknown')}
      </div>
    </div>
  `);

  // Coordinates section
  const formattedLat = location.lat.toFixed(6);
  const formattedLng = location.lng.toFixed(6);
  sections.push(`
    <div class="location-section">
      <div class="location-section-label">
        <span class="location-section-icon">🧭</span>
        <span>Coordinates</span>
      </div>
      <div class="location-section-value location-coordinates">
        ${formattedLat}, ${formattedLng}
      </div>
    </div>
  `);

  // Description section (if present)
  if (location.description) {
    sections.push(`
      <div class="location-section">
        <div class="location-section-label">
          <span class="location-section-icon">📄</span>
          <span>Description</span>
        </div>
        <div class="location-section-value">
          ${escapeHtml(location.description)}
        </div>
      </div>
    `);
  }

  // Geo ID section (for debugging)
  sections.push(`
    <div class="location-section">
      <div class="location-section-label">
        <span class="location-section-icon">🔑</span>
        <span>Location ID</span>
      </div>
      <div class="location-section-value location-coordinates">
        ${escapeHtml(location.geoId)}
      </div>
    </div>
  `);

  container.innerHTML = sections.join('');
}

/**
 * Touch gesture handlers for swipe-to-close
 */
function handleTouchStart(e: TouchEvent) {
  const sheet = document.getElementById('location-sheet');
  if (!sheet) return;

  // Only allow dragging if at top of scroll
  if (sheet.scrollTop === 0) {
    touchStartY = e.touches[0].clientY;
    isDragging = true;
  }
}

function handleTouchMove(e: TouchEvent) {
  if (!isDragging) return;

  const sheet = document.getElementById('location-sheet');
  if (!sheet) return;

  touchCurrentY = e.touches[0].clientY;
  const deltaY = touchCurrentY - touchStartY;

  // Only allow downward swipe
  if (deltaY > 0) {
    e.preventDefault();
    // Apply transform for visual feedback
    const translateY = Math.min(deltaY, window.innerHeight * 0.5);
    sheet.style.transform = `translateY(${translateY}px)`;
  }
}

function handleTouchEnd() {
  if (!isDragging) return;

  const sheet = document.getElementById('location-sheet');
  if (!sheet) return;

  const deltaY = touchCurrentY - touchStartY;
  const threshold = 100; // pixels

  if (deltaY > threshold) {
    // Swipe threshold exceeded - close sheet
    hideLocationSheet();
  } else {
    // Reset position
    sheet.style.transform = '';
  }

  isDragging = false;
  touchStartY = 0;
  touchCurrentY = 0;
}

/**
 * Check if device is mobile
 */
function isMobileDevice(): boolean {
  return window.innerWidth < 768 || ('ontouchstart' in window);
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
