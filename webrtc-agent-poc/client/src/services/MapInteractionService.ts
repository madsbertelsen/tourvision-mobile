/**
 * MapInteractionService - Collaborative map finger/gesture tracking
 *
 * Broadcasts finger position on fullscreen map to remote users via Y.js awareness.
 * Uses geographic coordinates (lat/lng) so position is correct regardless of viewport.
 */

import type { MapInteractionState } from '../types';

// Throttle utility - limits function calls to once per `wait` ms
function throttle<T extends (...args: any[]) => void>(fn: T, wait: number): T {
  let lastTime = 0;
  let timeout: ReturnType<typeof setTimeout> | null = null;

  return ((...args: Parameters<T>) => {
    const now = Date.now();
    const remaining = wait - (now - lastTime);

    if (remaining <= 0) {
      if (timeout) {
        clearTimeout(timeout);
        timeout = null;
      }
      lastTime = now;
      fn(...args);
    } else if (!timeout) {
      timeout = setTimeout(() => {
        lastTime = Date.now();
        timeout = null;
        fn(...args);
      }, remaining);
    }
  }) as T;
}

export type RemoteInteractionCallback = (
  clientId: number,
  userName: string,
  userColor: string,
  state: MapInteractionState | null
) => void;

export class MapInteractionService {
  private awareness: any;
  private map: any = null; // Mapbox GL map instance
  private isUpdatingFromRemote = false;
  private remoteInteractionCallbacks: RemoteInteractionCallback[] = [];
  private throttledBroadcast: (lngLat: { lng: number; lat: number }, gestureType: MapInteractionState['gestureType']) => void;
  private staleCheckInterval: ReturnType<typeof setInterval> | null = null;

  // Track which remote users have active interactions
  private activeRemoteUsers = new Map<number, MapInteractionState>();

  constructor(awareness: any) {
    this.awareness = awareness;

    // Throttle broadcasts to ~50ms (20 FPS)
    this.throttledBroadcast = throttle(
      (lngLat: { lng: number; lat: number }, gestureType: MapInteractionState['gestureType']) => {
        this.broadcastFingerPositionImpl(lngLat, gestureType);
      },
      50
    );

    // Listen for awareness changes from remote users
    awareness.on('change', () => {
      if (this.isUpdatingFromRemote) return;
      this.handleAwarenessChange();
    });

    // Periodically check for stale interactions (user stopped interacting)
    this.staleCheckInterval = setInterval(() => {
      this.checkStaleInteractions();
    }, 200);

    console.log('[MapInteractionService] Initialized');
  }

  /**
   * Set the Mapbox map instance for coordinate conversion
   */
  setMap(map: any): void {
    this.map = map;
    console.log('[MapInteractionService] Map instance set');
  }

  /**
   * Broadcast finger position during map interaction
   * Called from pointer/touch event handlers
   */
  broadcastFingerPosition(lngLat: { lng: number; lat: number }, gestureType: MapInteractionState['gestureType']): void {
    this.throttledBroadcast(lngLat, gestureType);
  }

  /**
   * Broadcast that gesture has ended
   */
  broadcastGestureEnd(): void {
    const currentUser = this.awareness.getLocalState()?.user;
    if (!currentUser) return;

    this.awareness.setLocalStateField('user', {
      ...currentUser,
      mapInteraction: {
        fingerPosition: undefined,
        gestureType: 'idle',
        timestamp: Date.now(),
      } as MapInteractionState,
    });

    console.log('[MapInteractionService] Gesture ended');
  }

  /**
   * Register callback to be notified of remote user interactions
   */
  onRemoteInteraction(callback: RemoteInteractionCallback): void {
    this.remoteInteractionCallbacks.push(callback);
  }

  /**
   * Remove a previously registered callback
   */
  offRemoteInteraction(callback: RemoteInteractionCallback): void {
    const index = this.remoteInteractionCallbacks.indexOf(callback);
    if (index !== -1) {
      this.remoteInteractionCallbacks.splice(index, 1);
    }
  }

  /**
   * Get screen coordinates for a remote user's finger position
   * Returns null if map not set or position invalid
   */
  getScreenPosition(lngLat: { lng: number; lat: number }): { x: number; y: number } | null {
    if (!this.map) return null;

    try {
      const point = this.map.project([lngLat.lng, lngLat.lat]);
      return { x: point.x, y: point.y };
    } catch {
      return null;
    }
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    if (this.staleCheckInterval) {
      clearInterval(this.staleCheckInterval);
      this.staleCheckInterval = null;
    }
    this.remoteInteractionCallbacks = [];
    this.activeRemoteUsers.clear();
    console.log('[MapInteractionService] Destroyed');
  }

  // === Private methods ===

  private broadcastFingerPositionImpl(lngLat: { lng: number; lat: number }, gestureType: MapInteractionState['gestureType']): void {
    const currentUser = this.awareness.getLocalState()?.user;
    if (!currentUser) return;

    this.awareness.setLocalStateField('user', {
      ...currentUser,
      mapInteraction: {
        fingerPosition: {
          lat: lngLat.lat,
          lng: lngLat.lng,
        },
        gestureType,
        timestamp: Date.now(),
      } as MapInteractionState,
    });
  }

  private handleAwarenessChange(): void {
    const states = this.awareness.getStates();
    const localClientId = this.awareness.clientID;

    states.forEach((state: any, clientId: number) => {
      // Skip local user
      if (clientId === localClientId) return;

      const user = state?.user;
      if (!user) return;

      const mapInteraction = user.mapInteraction as MapInteractionState | undefined;
      const previousInteraction = this.activeRemoteUsers.get(clientId);

      // Check if interaction state changed
      if (mapInteraction && mapInteraction.gestureType && mapInteraction.gestureType !== 'idle') {
        // Active interaction
        this.activeRemoteUsers.set(clientId, mapInteraction);
        this.notifyCallbacks(clientId, user.name, user.color, mapInteraction);
      } else if (previousInteraction) {
        // Interaction ended
        this.activeRemoteUsers.delete(clientId);
        this.notifyCallbacks(clientId, user.name, user.color, null);
      }
    });

    // Check for disconnected users
    const connectedClientIds = new Set(states.keys());
    this.activeRemoteUsers.forEach((_, clientId) => {
      if (!connectedClientIds.has(clientId)) {
        this.activeRemoteUsers.delete(clientId);
        // Can't notify with user info since they're gone
      }
    });
  }

  private checkStaleInteractions(): void {
    const now = Date.now();
    const STALE_THRESHOLD = 500; // 500ms

    const states = this.awareness.getStates();
    const localClientId = this.awareness.clientID;

    this.activeRemoteUsers.forEach((interaction, clientId) => {
      if (now - interaction.timestamp > STALE_THRESHOLD) {
        // Interaction is stale (user probably stopped but didn't send end event)
        this.activeRemoteUsers.delete(clientId);

        const state = states.get(clientId);
        if (state?.user) {
          this.notifyCallbacks(clientId, state.user.name, state.user.color, null);
        }
      }
    });
  }

  private notifyCallbacks(clientId: number, userName: string, userColor: string, state: MapInteractionState | null): void {
    this.remoteInteractionCallbacks.forEach(callback => {
      try {
        callback(clientId, userName, userColor, state);
      } catch (error) {
        console.error('[MapInteractionService] Callback error:', error);
      }
    });
  }
}
