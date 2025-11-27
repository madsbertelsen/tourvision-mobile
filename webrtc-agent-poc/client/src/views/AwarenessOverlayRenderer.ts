/**
 * AwarenessOverlayRenderer - Renders collaborative awareness overlays on maps
 *
 * Consolidates awareness overlay logic from main.ts:
 * - Lines 315-329: getVisibleBounds (map bounds extraction)
 * - Lines 332-349: updateMapBoundsAwareness (awareness updates)
 * - Lines 352-418: addBoundsOverlay (create colored rectangles)
 * - Lines 421-423: easeInOutQuad (animation easing)
 * - Lines 426-454: updateBoundsOverlayImmediate (instant updates)
 * - Lines 457-494: animateBoundsOverlay (smooth transitions)
 * - Lines 497-525: updateBoundsOverlay (update with animation logic)
 * - Lines 528-545: removeBoundsOverlay (cleanup)
 *
 * Features:
 * - Renders colored rectangles showing other users' map viewport bounds
 * - Smooth animations using requestAnimationFrame with easeInOutQuad
 * - Tracks animation state and previous bounds for each client
 * - Updates awareness state with current user's map bounds
 */

import type mapboxgl from 'mapbox-gl';

export class AwarenessOverlayRenderer {
  private previousBounds: Map<number, any> = new Map();
  private activeAnimations: Map<number, number> = new Map();

  /**
   * Get visible bounds from a Mapbox map
   * Extracted from main.ts:315-329
   */
  private getVisibleBounds(map: mapboxgl.Map): any {
    // Simply return the map's viewport bounds
    // Since we create the fullscreen map WITHOUT padding, getBounds() returns
    // the correct full viewport bounds for all maps
    const bounds = map.getBounds();

    console.log('[Bounds] Map bounds:', {
      north: bounds.getNorth(),
      south: bounds.getSouth(),
      east: bounds.getEast(),
      west: bounds.getWest()
    });

    return bounds;
  }

  /**
   * Update awareness with current map camera state (bounds, center, zoom, pitch, bearing)
   * Extracted from main.ts:332-349
   */
  updateMapBoundsAwareness(awareness: any, map: mapboxgl.Map): void {
    const bounds = this.getVisibleBounds(map);
    const currentUser = awareness.getLocalState()?.user || {};

    // Get full camera state for accurate sync
    const center = map.getCenter();
    const zoom = map.getZoom();
    const pitch = map.getPitch();
    const bearing = map.getBearing();

    const boundsData = {
      // Bounds (for overlay rectangles on block maps)
      north: bounds.getNorth(),
      south: bounds.getSouth(),
      east: bounds.getEast(),
      west: bounds.getWest(),
      // Camera state (for accurate follow mode sync)
      center: { lng: center.lng, lat: center.lat },
      zoom,
      pitch,
      bearing,
    };

    awareness.setLocalStateField('user', {
      ...currentUser,
      mapBounds: boundsData,
    });

    console.log('[Awareness] Updated map camera:', { center: boundsData.center, zoom, pitch, bearing });
  }

  /**
   * Add bounds overlay to block maps
   * Extracted from main.ts:352-418
   */
  addBoundsOverlay(clientId: number, bounds: any, color: string): void {
    console.log('[Overlay] Adding bounds overlay for client', clientId, bounds);

    const mapContainers = document.querySelectorAll('.prosemirror-map');
    mapContainers.forEach((container) => {
      const map = (container as any)._mapInstance;
      if (!map) return;

      const sourceId = `bounds-overlay-${clientId}`;
      const layerId = `bounds-overlay-${clientId}`;
      const outlineId = `bounds-overlay-${clientId}-outline`;

      // Check if overlay already exists
      if (map.getSource(sourceId)) {
        this.updateBoundsOverlay(clientId, bounds, color);
        return;
      }

      // Create polygon coordinates (rectangle)
      const coordinates = [[
        [bounds.west, bounds.north],  // NW
        [bounds.east, bounds.north],  // NE
        [bounds.east, bounds.south],  // SE
        [bounds.west, bounds.south],  // SW
        [bounds.west, bounds.north],  // Close polygon
      ]];

      // Add GeoJSON source
      map.addSource(sourceId, {
        type: 'geojson',
        data: {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'Polygon',
            coordinates: coordinates,
          },
        },
      });

      // Add fill layer (semi-transparent rectangle)
      map.addLayer({
        id: layerId,
        type: 'fill',
        source: sourceId,
        paint: {
          'fill-color': color,
          'fill-opacity': 0.15,
        },
      });

      // Add outline layer (solid border)
      map.addLayer({
        id: outlineId,
        type: 'line',
        source: sourceId,
        paint: {
          'line-color': color,
          'line-width': 2,
          'line-opacity': 0.8,
        },
      });
    });

    // Store initial bounds for future animations
    this.previousBounds.set(clientId, bounds);
  }

  /**
   * Easing function for smooth animation (easeInOutQuad)
   * Extracted from main.ts:421-423
   */
  private easeInOutQuad(t: number): number {
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  }

  /**
   * Update bounds overlay immediately (no animation)
   * Extracted from main.ts:426-454
   */
  private updateBoundsOverlayImmediate(clientId: number, bounds: any): void {
    const mapContainers = document.querySelectorAll('.prosemirror-map');
    mapContainers.forEach((container) => {
      const map = (container as any)._mapInstance;
      if (!map) return;

      const sourceId = `bounds-overlay-${clientId}`;
      const source = map.getSource(sourceId);

      if (source) {
        const coordinates = [[
          [bounds.west, bounds.north],
          [bounds.east, bounds.north],
          [bounds.east, bounds.south],
          [bounds.west, bounds.south],
          [bounds.west, bounds.north],
        ]];

        (source as any).setData({
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'Polygon',
            coordinates: coordinates,
          },
        });
      }
    });
  }

  /**
   * Animate bounds overlay transition
   * Extracted from main.ts:457-494
   */
  private animateBoundsOverlay(
    clientId: number,
    oldBounds: any,
    newBounds: any,
    color: string,
    duration: number = 300
  ): void {
    // Cancel any existing animation for this client
    const existingAnimation = this.activeAnimations.get(clientId);
    if (existingAnimation) {
      cancelAnimationFrame(existingAnimation);
    }

    const startTime = Date.now();

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = this.easeInOutQuad(progress);

      // Interpolate bounds
      const interpolatedBounds = {
        north: oldBounds.north + (newBounds.north - oldBounds.north) * eased,
        south: oldBounds.south + (newBounds.south - oldBounds.south) * eased,
        east: oldBounds.east + (newBounds.east - oldBounds.east) * eased,
        west: oldBounds.west + (newBounds.west - oldBounds.west) * eased,
      };

      // Update the overlay with interpolated coordinates
      this.updateBoundsOverlayImmediate(clientId, interpolatedBounds);

      if (progress < 1) {
        // Continue animation
        const frameId = requestAnimationFrame(animate);
        this.activeAnimations.set(clientId, frameId);
      } else {
        // Animation complete
        this.activeAnimations.delete(clientId);
        this.previousBounds.set(clientId, newBounds);
      }
    };

    animate();
  }

  /**
   * Update existing bounds overlay (with animation)
   * Extracted from main.ts:497-525
   */
  updateBoundsOverlay(clientId: number, bounds: any, color: string): void {
    // Check if we have previous bounds for animation
    const oldBounds = this.previousBounds.get(clientId);

    // Check if source exists
    const mapContainers = document.querySelectorAll('.prosemirror-map');
    let sourceExists = false;
    mapContainers.forEach((container) => {
      const map = (container as any)._mapInstance;
      if (map && map.getSource(`bounds-overlay-${clientId}`)) {
        sourceExists = true;
      }
    });

    if (!sourceExists) {
      // Source doesn't exist, create it
      this.addBoundsOverlay(clientId, bounds, color);
      return;
    }

    if (oldBounds) {
      // We have previous bounds, animate the transition
      this.animateBoundsOverlay(clientId, oldBounds, bounds, color);
    } else {
      // No previous bounds, update immediately
      this.updateBoundsOverlayImmediate(clientId, bounds);
      this.previousBounds.set(clientId, bounds);
    }
  }

  /**
   * Remove bounds overlay from block maps
   * Extracted from main.ts:528-545
   */
  removeBoundsOverlay(clientId: number): void {
    console.log('[Overlay] Removing bounds overlay for client', clientId);

    const mapContainers = document.querySelectorAll('.prosemirror-map');
    mapContainers.forEach((container) => {
      const map = (container as any)._mapInstance;
      if (!map) return;

      const sourceId = `bounds-overlay-${clientId}`;
      const layerId = `bounds-overlay-${clientId}`;
      const outlineId = `bounds-overlay-${clientId}-outline`;

      // Remove layers first, then source
      if (map.getLayer(outlineId)) map.removeLayer(outlineId);
      if (map.getLayer(layerId)) map.removeLayer(layerId);
      if (map.getSource(sourceId)) map.removeSource(sourceId);
    });

    // Clean up tracking state
    this.previousBounds.delete(clientId);
    const existingAnimation = this.activeAnimations.get(clientId);
    if (existingAnimation) {
      cancelAnimationFrame(existingAnimation);
      this.activeAnimations.delete(clientId);
    }
  }
}
