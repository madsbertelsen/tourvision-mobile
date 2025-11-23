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
  transportFrom?: string;
  transportProfile?: 'walking' | 'driving' | 'cycling';
  waypoints?: Array<{ lat: number; lng: number }>;
}

type TransportMode = 'walking' | 'driving' | 'cycling';

interface RouteInfo {
  distance: number; // meters
  duration: number; // seconds
}

let isSheetOpen = false;
let touchStartY = 0;
let touchCurrentY = 0;
let isDragging = false;
let currentLocation: LocationData | null = null;
let allLocations: LocationData[] = [];
let selectedSourceId: string | null = null;
let selectedTransportMode: TransportMode = 'driving';
let routeInfo: RouteInfo | null = null;
let isTransportExpanded = false;

// Dependencies injected from main.ts
let editorView: any = null;
let mapboxToken: string = '';
let notifyChange: (() => void) | null = null;

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
 * Set dependencies (call from main.ts on initialization)
 */
export function setLocationSheetDependencies(view: any, token: string, changeCallback?: () => void) {
  editorView = view;
  mapboxToken = token;
  notifyChange = changeCallback || null;
  console.log('[LocationSheet] Dependencies set');
}

/**
 * Show location sheet with location data
 */
export function showLocationSheet(location: LocationData, locations: LocationData[] = []) {
  const backdrop = document.getElementById('location-sheet-backdrop');
  const sheet = document.getElementById('location-sheet');
  const content = document.getElementById('location-sheet-body');

  if (!backdrop || !sheet || !content) {
    console.error('[LocationSheet] Required elements not found');
    return;
  }

  console.log('[LocationSheet] Showing sheet for:', location);

  // Store current location and all locations
  currentLocation = location;
  allLocations = locations.filter(loc => loc.geoId !== location.geoId); // Exclude current location

  // Initialize state
  selectedSourceId = location.transportFrom || null;
  selectedTransportMode = location.transportProfile || 'driving';
  isTransportExpanded = false;
  routeInfo = null;

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

  // Transport Configuration section
  sections.push(`
    <div class="location-section">
      <button id="transport-config-btn" class="transport-config-btn">
        <span class="location-section-icon">🚗</span>
        <span>Configure Transport</span>
        <span class="chevron">›</span>
      </button>
      <div id="transport-config-content" class="transport-config-content" style="display: none;">
        <!-- Transport UI will be rendered here -->
      </div>
    </div>
  `);

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

  // Attach event listeners
  attachTransportEventListeners();
}

/**
 * Attach event listeners for transport configuration
 */
function attachTransportEventListeners() {
  const configBtn = document.getElementById('transport-config-btn');
  if (configBtn) {
    configBtn.addEventListener('click', toggleTransportConfig);
  }
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
 * Toggle transport configuration visibility
 */
function toggleTransportConfig() {
  isTransportExpanded = !isTransportExpanded;
  const content = document.getElementById('transport-config-content');
  const btn = document.getElementById('transport-config-btn');
  const chevron = btn?.querySelector('.chevron');

  if (!content || !currentLocation) return;

  if (isTransportExpanded) {
    content.style.display = 'block';
    if (chevron) chevron.textContent = '∨';
    renderTransportConfig(content);
  } else {
    content.style.display = 'none';
    if (chevron) chevron.textContent = '›';
  }
}

/**
 * Render transport configuration UI
 */
function renderTransportConfig(container: HTMLElement) {
  if (!currentLocation) return;

  const html = `
    <div class="transport-config">
      <!-- Source Location Selector -->
      <div class="transport-section">
        <div class="transport-section-label">Travel From</div>
        <div class="transport-source-scroll">
          ${allLocations.length === 0 ? `
            <div class="transport-empty">No other locations available</div>
          ` : allLocations.map(loc => `
            <button
              class="source-location-chip ${selectedSourceId === loc.geoId ? 'selected' : ''}"
              data-geo-id="${escapeHtml(loc.geoId)}"
              onclick="window.locationSheet_selectSource('${escapeHtml(loc.geoId)}')"
            >
              <div class="source-location-dot" style="background-color: ${loc.color};"></div>
              <span class="source-location-name">${escapeHtml(loc.placeName)}</span>
            </button>
          `).join('')}
        </div>
      </div>

      <!-- Transport Mode Selector -->
      <div class="transport-section">
        <div class="transport-section-label">Transport Mode</div>
        <div class="transport-mode-buttons">
          <button
            class="transport-mode-btn ${selectedTransportMode === 'walking' ? 'selected' : ''}"
            onclick="window.locationSheet_selectMode('walking')"
          >
            <span class="transport-mode-icon">🚶</span>
            <span class="transport-mode-label">Walking</span>
          </button>
          <button
            class="transport-mode-btn ${selectedTransportMode === 'driving' ? 'selected' : ''}"
            onclick="window.locationSheet_selectMode('driving')"
          >
            <span class="transport-mode-icon">🚗</span>
            <span class="transport-mode-label">Driving</span>
          </button>
          <button
            class="transport-mode-btn ${selectedTransportMode === 'cycling' ? 'selected' : ''}"
            onclick="window.locationSheet_selectMode('cycling')"
          >
            <span class="transport-mode-icon">🚴</span>
            <span class="transport-mode-label">Cycling</span>
          </button>
        </div>
      </div>

      <!-- Route Info -->
      ${selectedSourceId ? `
        <div class="transport-section">
          <div id="transport-route-info" class="transport-route-info">
            ${routeInfo ? `
              <div class="route-stat">
                <div class="route-stat-label">Duration</div>
                <div class="route-stat-value">${formatDuration(routeInfo.duration)}</div>
              </div>
              <div class="route-stat">
                <div class="route-stat-label">Distance</div>
                <div class="route-stat-value">${formatDistance(routeInfo.distance)}</div>
              </div>
            ` : `
              <div class="route-loading">Loading route...</div>
            `}
          </div>
        </div>
      ` : ''}
    </div>
  `;

  container.innerHTML = html;

  // Fetch route if source is selected
  if (selectedSourceId && !routeInfo) {
    fetchRouteInfo(selectedSourceId, selectedTransportMode);
  }
}

/**
 * Select source location
 */
function selectSource(geoId: string) {
  selectedSourceId = geoId;
  routeInfo = null;
  const content = document.getElementById('transport-config-content');
  if (content) {
    renderTransportConfig(content);
  }
}

/**
 * Select transport mode
 */
function selectMode(mode: TransportMode) {
  selectedTransportMode = mode;
  routeInfo = null;
  const content = document.getElementById('transport-config-content');
  if (content) {
    renderTransportConfig(content);
  }
}

/**
 * Fetch route info from Mapbox Directions API
 */
async function fetchRouteInfo(sourceGeoId: string, mode: TransportMode) {
  if (!currentLocation || !mapboxToken) {
    console.error('[LocationSheet] Missing dependencies for route fetch');
    return;
  }

  const sourceLocation = allLocations.find(loc => loc.geoId === sourceGeoId);
  if (!sourceLocation) return;

  try {
    const profile = mode === 'walking' ? 'walking' :
                    mode === 'cycling' ? 'cycling' :
                    'driving-traffic';

    const url = `https://api.mapbox.com/directions/v5/mapbox/${profile}/${sourceLocation.lng},${sourceLocation.lat};${currentLocation.lng},${currentLocation.lat}?geometries=geojson&overview=full&access_token=${mapboxToken}`;

    console.log('[LocationSheet] Fetching route...');
    const response = await fetch(url);
    const data = await response.json();

    if (data.routes && data.routes.length > 0) {
      const route = data.routes[0];
      routeInfo = {
        distance: route.distance,
        duration: route.duration
      };

      console.log('[LocationSheet] Route fetched:', routeInfo);

      // Update UI
      const content = document.getElementById('transport-config-content');
      if (content) {
        renderTransportConfig(content);
      }

      // Save to geo-mark
      saveTransportConfig(sourceGeoId, mode);
    }
  } catch (error) {
    console.error('[LocationSheet] Error fetching route:', error);
  }
}

/**
 * Save transport configuration to geo-mark
 */
function saveTransportConfig(sourceGeoId: string, mode: TransportMode) {
  if (!currentLocation || !editorView) return;

  console.log('[LocationSheet] Saving transport config:', { sourceGeoId, mode });

  // Update via postMessage (same pattern as main.ts)
  const message = {
    type: 'updateGeoMark',
    geoId: currentLocation.geoId,
    updatedAttrs: {
      transportFrom: sourceGeoId,
      transportProfile: mode
    }
  };

  if (window.ReactNativeWebView) {
    window.ReactNativeWebView.postMessage(JSON.stringify(message));
  } else if (window.parent !== window) {
    window.parent.postMessage(message, '*');
  }

  // Also update locally if we have direct access to editorView
  updateGeoMarkLocally(currentLocation.geoId, {
    transportFrom: sourceGeoId,
    transportProfile: mode
  });
}

/**
 * Update geo-mark locally (same logic as main.ts)
 */
function updateGeoMarkLocally(geoId: string, updatedAttrs: any) {
  if (!editorView) return;

  let found = false;
  editorView.state.doc.descendants((node: any, pos: number) => {
    if (found) return false;

    if (node.isText && node.marks.length > 0) {
      const geoMark = node.marks.find((m: any) => m.type.name === 'geoMark');
      if (geoMark && geoMark.attrs.geoId === geoId) {
        const updatedMark = editorView.state.schema.marks.geoMark.create({
          ...geoMark.attrs,
          ...updatedAttrs
        });

        const tr = editorView.state.tr.removeMark(
          pos,
          pos + node.nodeSize,
          editorView.state.schema.marks.geoMark
        ).addMark(
          pos,
          pos + node.nodeSize,
          updatedMark
        );

        editorView.dispatch(tr);
        console.log('[LocationSheet] Geo-mark updated locally');

        // Notify change listeners (triggers route re-render)
        if (notifyChange) {
          notifyChange();
        }

        found = true;
        return false;
      }
    }
  });
}

/**
 * Format duration (seconds to minutes)
 */
function formatDuration(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  return `${minutes} min`;
}

/**
 * Format distance (meters to km)
 */
function formatDistance(meters: number): string {
  const km = (meters / 1000).toFixed(1);
  return `${km} km`;
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

// Expose functions to window for onclick handlers
declare global {
  interface Window {
    locationSheet_selectSource: (geoId: string) => void;
    locationSheet_selectMode: (mode: TransportMode) => void;
  }
}

window.locationSheet_selectSource = selectSource;
window.locationSheet_selectMode = selectMode;
