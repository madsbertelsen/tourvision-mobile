/**
 * WebViewBridge - Manages communication with React Native WebView
 *
 * Consolidates ReactNativeWebView.postMessage() calls from main.ts:
 * - Lines 276-280 (fullscreenMapOpened)
 * - Lines 413-449 (marker click with isInWebView check)
 * - Lines 721-725 (fullscreenMapClosed)
 * - Lines 1424-1428 (ready message)
 * - Lines 1528-1532 (selection state)
 */

// Extend Window interface to include ReactNativeWebView
declare global {
  interface Window {
    ReactNativeWebView?: {
      postMessage(message: string): void;
    };
  }
}

export interface MarkerClickMessage {
  type: 'markerClicked';
  geoId: string;
  placeName: string;
  lat: number;
  lng: number;
}

export interface FullscreenMapMessage {
  type: 'fullscreenMapOpened' | 'fullscreenMapClosed';
}

export interface ReadyMessage {
  type: 'ready';
}

export interface SelectionStateMessage {
  type: 'selectionState';
  selectedGeoIds: string[];
  hasSelection: boolean;
}

export type WebViewMessage =
  | MarkerClickMessage
  | FullscreenMapMessage
  | ReadyMessage
  | SelectionStateMessage;

/**
 * WebViewBridge - Centralized communication with React Native WebView
 */
export class WebViewBridge {
  /**
   * Check if running in a WebView or iframe context
   * Extracted from main.ts:417
   */
  static isInWebView(): boolean {
    return !!window.ReactNativeWebView || window.parent !== window;
  }

  /**
   * Send a message to the parent (React Native WebView or iframe)
   * Handles both ReactNativeWebView and window.parent.postMessage
   *
   * @param message - The message object to send
   * @param logPrefix - Optional prefix for console logs
   */
  static postMessage(message: WebViewMessage, logPrefix: string = '[WebViewBridge]'): void {
    console.log(`${logPrefix} Sending message:`, message);

    if (window.ReactNativeWebView) {
      console.log(`${logPrefix} Using ReactNativeWebView.postMessage`);
      window.ReactNativeWebView.postMessage(JSON.stringify(message));
      console.log(`${logPrefix} Message sent via ReactNativeWebView`);
    } else if (window.parent !== window) {
      console.log(`${logPrefix} Using window.parent.postMessage`);
      window.parent.postMessage(message, '*');
      console.log(`${logPrefix} Message sent via window.parent`);
    } else {
      console.log(`${logPrefix} Not in WebView context, message not sent`);
    }
  }

  /**
   * Send fullscreen map opened message
   * Extracted from main.ts:276-280
   */
  static sendFullscreenMapOpened(): void {
    const message: FullscreenMapMessage = { type: 'fullscreenMapOpened' };
    this.postMessage(message, '[Fullscreen]');
  }

  /**
   * Send fullscreen map closed message
   * Extracted from main.ts:721-725
   */
  static sendFullscreenMapClosed(): void {
    const message: FullscreenMapMessage = { type: 'fullscreenMapClosed' };
    this.postMessage(message, '[Fullscreen]');
  }

  /**
   * Send marker clicked message
   * Extracted from main.ts:443-449
   *
   * @param geoId - Geo mark ID
   * @param placeName - Location place name
   * @param lat - Latitude
   * @param lng - Longitude
   */
  static sendMarkerClicked(geoId: string, placeName: string, lat: number, lng: number): void {
    const message: MarkerClickMessage = {
      type: 'markerClicked',
      geoId,
      placeName,
      lat,
      lng
    };
    this.postMessage(message, '[Fullscreen]');
  }

  /**
   * Send ready message
   * Extracted from main.ts:1424-1428
   */
  static sendReady(): void {
    const message: ReadyMessage = { type: 'ready' };
    this.postMessage(message, '[Main]');
  }

  /**
   * Send selection state message
   * Extracted from main.ts:1528-1532
   *
   * @param selectedGeoIds - Array of selected geo mark IDs
   * @param hasSelection - Whether there is a selection
   */
  static sendSelectionState(selectedGeoIds: string[], hasSelection: boolean): void {
    const message: SelectionStateMessage = {
      type: 'selectionState',
      selectedGeoIds,
      hasSelection
    };
    this.postMessage(message, '[Main]');
  }
}
