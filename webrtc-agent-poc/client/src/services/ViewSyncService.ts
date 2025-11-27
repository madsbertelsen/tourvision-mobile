/**
 * ViewSyncService - Collaborative view synchronization
 *
 * Handles follow mode where users can follow another user's view state:
 * - Scroll position in the editor
 * - Fullscreen map open/close state
 * - Map pan/zoom bounds
 */

export interface ViewState {
  scrollTop: number;
  scrollLeft: number;
  fullscreenMapOpen: boolean;
  isPresenting: boolean;
  followingUserId: number | null;
}

// Simple throttle utility
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

export class ViewSyncService {
  private awareness: any;
  private editorContainer: HTMLElement | null = null;
  private followingUserId: number | null = null;
  private isUpdatingFromRemote = false; // Prevent feedback loops
  private fullscreenMapView: any = null; // Will be set externally

  constructor(awareness: any) {
    this.awareness = awareness;
    console.log('[ViewSyncService] Initialized');
  }

  /**
   * Set the editor container for scroll tracking
   */
  setEditorContainer(container: HTMLElement): void {
    this.editorContainer = container;

    // Listen to scroll events and broadcast (throttled)
    const throttledScroll = throttle(() => {
      if (this.isUpdatingFromRemote) return;
      this.broadcastViewState();
    }, 100);

    container.addEventListener('scroll', throttledScroll);
    console.log('[ViewSyncService] Editor container set, scroll listener added');
  }

  /**
   * Set reference to FullscreenMapView for map sync
   */
  setFullscreenMapView(mapView: any): void {
    this.fullscreenMapView = mapView;
    console.log('[ViewSyncService] FullscreenMapView reference set');
  }

  /**
   * Broadcast current view state to awareness
   */
  broadcastViewState(): void {
    const currentUser = this.awareness.getLocalState()?.user;
    if (!currentUser) return;

    const scrollTop = this.editorContainer?.scrollTop ?? 0;
    const scrollLeft = this.editorContainer?.scrollLeft ?? 0;

    this.awareness.setLocalStateField('user', {
      ...currentUser,
      viewState: {
        ...currentUser.viewState,
        scrollTop,
        scrollLeft,
      }
    });
  }

  /**
   * Broadcast map bounds to awareness
   */
  broadcastMapBounds(bounds: any): void {
    if (this.isUpdatingFromRemote) return;

    const currentUser = this.awareness.getLocalState()?.user;
    if (!currentUser) return;

    // Convert bounds to serializable format
    const boundsData = bounds ? {
      north: bounds.getNorth(),
      south: bounds.getSouth(),
      east: bounds.getEast(),
      west: bounds.getWest(),
    } : null;

    this.awareness.setLocalStateField('user', {
      ...currentUser,
      mapBounds: boundsData,
    });

    console.log('[ViewSyncService] Broadcasted map bounds:', boundsData);
  }

  /**
   * Start or stop following a user
   */
  followUser(userId: number | null): void {
    const previousUserId = this.followingUserId;
    this.followingUserId = userId;

    console.log('[ViewSyncService] Follow user changed:', previousUserId, '->', userId);

    // If starting to follow, immediately apply their current state
    if (userId !== null) {
      const state = this.awareness.getStates().get(userId);
      if (state?.user) {
        console.log('[ViewSyncService] Applying initial state from followed user');

        // Apply view state (pass map bounds for fullscreen map)
        if (state.user.viewState) {
          this.applyRemoteViewState(state.user.viewState, state.user.mapBounds);
        }

        // Apply map bounds if fullscreen is already open (for ongoing pan/zoom sync)
        if (state.user.mapBounds && state.user.viewState?.fullscreenMapOpen) {
          this.applyRemoteMapBounds(state.user.mapBounds);
        }

        // Apply map style if fullscreen is open
        if (state.user.mapStyle && state.user.viewState?.fullscreenMapOpen) {
          // Slight delay to ensure map is initialized after fullscreen opens
          setTimeout(() => {
            this.applyRemoteMapStyle(state.user.mapStyle);
          }, 200);
        }
      }
    }
  }

  /**
   * Get the ID of the user being followed
   */
  getFollowingUserId(): number | null {
    return this.followingUserId;
  }

  /**
   * Apply remote user's view state (called from awareness listener)
   * @param remoteViewState The view state to apply
   * @param mapBounds Optional map camera state to use when opening fullscreen (for follow mode)
   */
  applyRemoteViewState(remoteViewState: ViewState, mapBounds?: {
    north: number; south: number; east: number; west: number;
    center?: { lng: number; lat: number };
    zoom?: number;
    pitch?: number;
    bearing?: number
  }): void {
    this.isUpdatingFromRemote = true;

    // Apply scroll position
    if (this.editorContainer) {
      this.editorContainer.scrollTop = remoteViewState.scrollTop;
      this.editorContainer.scrollLeft = remoteViewState.scrollLeft;
    }

    // Apply fullscreen map state - only toggle if state changed
    const isFullscreenOpen = document.getElementById('fullscreen-overlay')?.classList.contains('visible') ?? false;

    if (remoteViewState.fullscreenMapOpen && !isFullscreenOpen) {
      // Open fullscreen with target bounds
      console.log('[ViewSyncService] Opening fullscreen map');
      (window as any).showFullscreenMap?.(mapBounds);
    } else if (!remoteViewState.fullscreenMapOpen && isFullscreenOpen) {
      // Close fullscreen
      console.log('[ViewSyncService] Closing fullscreen map');
      (window as any).hideFullscreenMap?.();
    }
    // If both are same state, do nothing (avoid recreating map)

    // Reset flag after a short delay to allow scroll events to settle
    setTimeout(() => {
      this.isUpdatingFromRemote = false;
    }, 50);
  }

  /**
   * Apply remote user's map camera state (center, zoom, pitch, bearing)
   */
  applyRemoteMapBounds(cameraData: {
    north: number; south: number; east: number; west: number;
    center?: { lng: number; lat: number };
    zoom?: number;
    pitch?: number;
    bearing?: number
  }): void {
    if (!cameraData || !this.fullscreenMapView) return;

    this.isUpdatingFromRemote = true;

    // Sync the fullscreen map to the followed user's camera state
    this.fullscreenMapView.fitBounds(cameraData);

    setTimeout(() => {
      this.isUpdatingFromRemote = false;
    }, 100);
  }

  /**
   * Apply remote user's map style
   */
  applyRemoteMapStyle(styleName: string): void {
    if (!styleName || !this.fullscreenMapView) return;

    // Only apply if different from current style
    const currentStyle = this.fullscreenMapView.getCurrentStyle();
    if (currentStyle === styleName) {
      return;
    }

    console.log('[ViewSyncService] Applying remote map style:', styleName);
    this.isUpdatingFromRemote = true;

    // Apply style without broadcasting (to avoid feedback loop)
    this.fullscreenMapView.setMapStyle(styleName, false);

    setTimeout(() => {
      this.isUpdatingFromRemote = false;
    }, 100);
  }

  /**
   * Notify when fullscreen map opens/closes
   */
  setFullscreenMapOpen(isOpen: boolean): void {
    const currentUser = this.awareness.getLocalState()?.user;
    if (!currentUser) return;

    this.awareness.setLocalStateField('user', {
      ...currentUser,
      viewState: {
        ...currentUser.viewState,
        fullscreenMapOpen: isOpen,
      }
    });

    console.log('[ViewSyncService] Fullscreen map state broadcasted:', isOpen);
  }

  /**
   * Get current local view state
   */
  getLocalViewState(): ViewState {
    return {
      scrollTop: this.editorContainer?.scrollTop ?? 0,
      scrollLeft: this.editorContainer?.scrollLeft ?? 0,
      fullscreenMapOpen: false, // Will be set by awareness
      isPresenting: false,
      followingUserId: this.followingUserId,
    };
  }

  /**
   * Check if currently following anyone
   */
  isFollowing(): boolean {
    return this.followingUserId !== null;
  }

  /**
   * Check if remote update is in progress (prevents feedback loops)
   */
  isUpdating(): boolean {
    return this.isUpdatingFromRemote;
  }

  /**
   * Handle when followed user disconnects
   */
  handleUserDisconnect(clientId: number): void {
    if (this.followingUserId === clientId) {
      console.log('[ViewSyncService] Followed user disconnected, stopping follow');
      this.followingUserId = null;
    }
  }

  /**
   * Reset service state
   */
  reset(): void {
    this.followingUserId = null;
    this.isUpdatingFromRemote = false;
    console.log('[ViewSyncService] Reset');
  }

  // Legacy methods for compatibility
  togglePresenting(): boolean {
    return false;
  }

  isPresenting(): boolean {
    return false;
  }

  updateViewState(viewState: Partial<ViewState>): void {
    // No-op for compatibility
  }
}
