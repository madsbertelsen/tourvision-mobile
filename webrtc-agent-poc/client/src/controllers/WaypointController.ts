/**
 * WaypointController - Manages waypoint markers and operations
 *
 * Consolidates waypoint logic from main.ts:
 * - Lines 260-263 (buildWaypointsString helper)
 * - Lines 266-339 (renderWaypointMarkers and drag handling)
 * - Lines 622-664, 792-823 (duplicate waypoint adding logic)
 */

import type mapboxgl from 'mapbox-gl';
import type { EditorView } from 'prosemirror-view';
import { MarkerFactory } from '../services/MarkerFactory';

export interface WaypointControllerCallbacks {
  notifyChange?: () => void;
}

export class WaypointController {
  private editorView: EditorView | null = null;
  private waypointMarkers: Map<string, mapboxgl.Marker[]> = new Map();
  private callbacks: WaypointControllerCallbacks;

  constructor(callbacks: WaypointControllerCallbacks = {}) {
    this.callbacks = callbacks;
  }

  /**
   * Set the editor view instance
   */
  setView(view: EditorView): void {
    this.editorView = view;
  }

  /**
   * Build waypoints string for Mapbox Directions API
   * Format: ";lng1,lat1;lng2,lat2"
   *
   * Extracted from main.ts:260-263
   */
  buildWaypointsString(waypoints: Array<{ lat: number; lng: number }> = []): string {
    if (!waypoints || waypoints.length === 0) return '';
    return ';' + waypoints.map(wp => `${wp.lng},${wp.lat}`).join(';');
  }

  /**
   * Render waypoint markers on a map
   * Extracted from main.ts:270-339
   *
   * @param map - Mapbox map instance
   * @param destGeoId - The geo-mark that owns these waypoints (destination of route)
   * @param waypoints - Array of waypoint coordinates
   * @param color - Color for waypoint markers
   */
  renderWaypointMarkers(
    map: mapboxgl.Map,
    destGeoId: string,
    waypoints: Array<{ lat: number; lng: number }>,
    color: string
  ): void {
    // Remove existing markers for this destination
    const markerKey = `waypoints-${destGeoId}`;
    const existingMarkers = this.waypointMarkers.get(markerKey) || [];
    existingMarkers.forEach(marker => marker.remove());

    // Create new markers
    const markers = waypoints.map((waypoint, index) => {
      // Create marker element using MarkerFactory
      const el = MarkerFactory.createWaypointMarker(index, color);

      // Create marker
      const marker = new (window as any).mapboxgl.Marker({
        element: el,
        draggable: true
      })
        .setLngLat([waypoint.lng, waypoint.lat])
        .addTo(map);

      // Handle drag end
      marker.on('dragend', () => {
        this.handleWaypointDrag(marker, index, destGeoId);
      });

      return marker;
    });

    this.waypointMarkers.set(markerKey, markers);
  }

  /**
   * Handle waypoint drag event
   * Updates the geo-mark with new waypoint coordinates
   *
   * @param marker - The dragged marker
   * @param index - Waypoint index
   * @param destGeoId - Destination geo-mark ID
   */
  private handleWaypointDrag(marker: any, index: number, destGeoId: string): void {
    const lngLat = marker.getLngLat();
    console.log('[Waypoint] Dragged to:', lngLat, 'index:', index, 'destGeoId:', destGeoId);

    // Update the waypoint in the destination geo-mark
    if (!this.editorView) {
      console.error('[Waypoint] Editor view is null');
      return;
    }

    let waypointUpdated = false;

    this.editorView.state.doc.descendants((node, pos) => {
      if (waypointUpdated) return false;

      if (node.isText && node.marks.length > 0) {
        const geoMark = node.marks.find(m => m.type.name === 'geoMark');
        if (geoMark && geoMark.attrs.geoId === destGeoId) {
          console.log('[Waypoint] Found destination geo-mark, updating waypoint', index);
          const currentWaypoints = [...(geoMark.attrs.waypoints || [])];
          currentWaypoints[index] = { lat: lngLat.lat, lng: lngLat.lng };

          const updatedMark = this.editorView!.state.schema.marks.geoMark.create({
            ...geoMark.attrs,
            waypoints: currentWaypoints
          });

          const tr = this.editorView!.state.tr
            .removeMark(pos, pos + node.nodeSize, this.editorView!.state.schema.marks.geoMark)
            .addMark(pos, pos + node.nodeSize, updatedMark);

          this.editorView!.dispatch(tr);
          console.log('[Waypoint] Updated waypoint', index, 'to:', { lat: lngLat.lat, lng: lngLat.lng });

          // Notify change listeners
          this.callbacks.notifyChange?.();

          waypointUpdated = true;
          return false;
        }
      }
    });

    if (!waypointUpdated) {
      console.error('[Waypoint] Failed to find destination geo-mark:', destGeoId);
    }
  }

  /**
   * Add a waypoint to a destination geo-mark
   * Extracted from duplicate code at main.ts:622-664, 792-823
   *
   * @param destGeoId - Destination geo-mark ID
   * @param lat - Waypoint latitude
   * @param lng - Waypoint longitude
   * @returns true if waypoint was added, false otherwise
   */
  addWaypoint(destGeoId: string, lat: number, lng: number): boolean {
    if (!this.editorView) {
      console.error('[Waypoint] Editor view is null');
      return false;
    }

    let waypointAdded = false;

    this.editorView.state.doc.descendants((node, pos) => {
      if (waypointAdded) return false;

      if (node.isText && node.marks.length > 0) {
        const geoMark = node.marks.find(m => m.type.name === 'geoMark');
        if (geoMark && geoMark.attrs.geoId === destGeoId) {
          console.log('[Routes] Found destination geo-mark, adding waypoint');

          // Get current waypoints or create empty array
          const currentWaypoints = geoMark.attrs.waypoints || [];
          const newWaypoints = [...currentWaypoints, { lat, lng }];

          // Create updated mark
          const updatedMark = this.editorView!.state.schema.marks.geoMark.create({
            ...geoMark.attrs,
            waypoints: newWaypoints
          });

          // Apply update
          const tr = this.editorView!.state.tr
            .removeMark(pos, pos + node.nodeSize, this.editorView!.state.schema.marks.geoMark)
            .addMark(pos, pos + node.nodeSize, updatedMark);

          this.editorView!.dispatch(tr);
          console.log('[Routes] Waypoint added:', { lat, lng });

          // Notify change listeners
          this.callbacks.notifyChange?.();

          waypointAdded = true;
          return false;
        }
      }
    });

    if (!waypointAdded) {
      console.warn('[Routes] Could not find geo-mark to add waypoint');
    }

    return waypointAdded;
  }

  /**
   * Update an existing waypoint's position
   *
   * @param destGeoId - Destination geo-mark ID
   * @param waypointIndex - Index of the waypoint to update
   * @param lat - New latitude
   * @param lng - New longitude
   * @returns true if waypoint was updated, false otherwise
   */
  updateWaypoint(destGeoId: string, waypointIndex: number, lat: number, lng: number): boolean {
    if (!this.editorView) {
      console.error('[Waypoint] Editor view is null');
      return false;
    }

    let waypointUpdated = false;

    this.editorView.state.doc.descendants((node, pos) => {
      if (waypointUpdated) return false;

      if (node.isText && node.marks.length > 0) {
        const geoMark = node.marks.find(m => m.type.name === 'geoMark');
        if (geoMark && geoMark.attrs.geoId === destGeoId) {
          console.log('[Waypoint] Found destination geo-mark, updating waypoint', waypointIndex);
          const currentWaypoints = [...(geoMark.attrs.waypoints || [])];

          if (waypointIndex < currentWaypoints.length) {
            // Update the existing waypoint
            currentWaypoints[waypointIndex] = { lat, lng };

            const updatedMark = this.editorView!.state.schema.marks.geoMark.create({
              ...geoMark.attrs,
              waypoints: currentWaypoints
            });

            const tr = this.editorView!.state.tr
              .removeMark(pos, pos + node.nodeSize, this.editorView!.state.schema.marks.geoMark)
              .addMark(pos, pos + node.nodeSize, updatedMark);

            this.editorView!.dispatch(tr);
            console.log('[Waypoint] Updated waypoint', waypointIndex, 'to:', { lat, lng });

            // Notify change listeners
            this.callbacks.notifyChange?.();

            waypointUpdated = true;
            return false;
          }
        }
      }
    });

    if (!waypointUpdated) {
      console.warn('[Waypoint] Could not find waypoint to update:', destGeoId, waypointIndex);
    }

    return waypointUpdated;
  }

  /**
   * Remove all waypoint markers from the map
   */
  clearAllMarkers(): void {
    this.waypointMarkers.forEach(markers => {
      markers.forEach(marker => marker.remove());
    });
    this.waypointMarkers.clear();
  }

  /**
   * Remove waypoint markers for a specific destination
   *
   * @param destGeoId - Destination geo-mark ID
   */
  clearMarkersForDestination(destGeoId: string): void {
    const markerKey = `waypoints-${destGeoId}`;
    const markers = this.waypointMarkers.get(markerKey);
    if (markers) {
      markers.forEach(marker => marker.remove());
      this.waypointMarkers.delete(markerKey);
    }
  }
}
