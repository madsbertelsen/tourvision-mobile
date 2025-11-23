/**
 * MarkerFactory - Creates marker DOM elements for Mapbox
 *
 * Extracted from main.ts:
 * - Lines 236-261 (location marker creation)
 * - Lines 284-303 (waypoint marker creation)
 */

export class MarkerFactory {
  /** Geo mark colors (matching LocationExtractor) */
  static readonly COLORS = [
    '#3B82F6', '#8B5CF6', '#10B981', '#F59E0B', '#EF4444',
    '#EC4899', '#06B6D4', '#84CC16', '#F97316', '#6366F1'
  ];

  /**
   * Create a location marker element
   *
   * @param colorIndex - Color index (0-9)
   * @returns HTMLElement for Mapbox marker
   */
  static createLocationMarker(colorIndex: number): HTMLElement {
    const bgColor = MarkerFactory.COLORS[colorIndex % MarkerFactory.COLORS.length];
    const el = document.createElement('div');
    el.style.cssText = `
      width: 32px;
      height: 32px;
      border-radius: 50%;
      background-color: ${bgColor};
      border: 3px solid white;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      touch-action: manipulation;
      user-select: none;
      pointer-events: auto;
      -webkit-tap-highlight-color: transparent;
    `;

    const inner = document.createElement('div');
    inner.style.cssText = 'width: 12px; height: 12px; border-radius: 50%; background-color: white; pointer-events: none;';
    el.appendChild(inner);

    return el;
  }

  /**
   * Create a waypoint marker element
   *
   * @param index - Waypoint index (0-based, displayed as 1-based)
   * @param color - Optional color (defaults to orange #F59E0B)
   * @returns HTMLElement for Mapbox marker
   */
  static createWaypointMarker(index: number, color: string = '#F59E0B'): HTMLElement {
    const el = document.createElement('div');
    el.className = 'waypoint-marker';
    el.style.cssText = `
      width: 28px;
      height: 28px;
      border-radius: 14px;
      background-color: ${color};
      border: 2px solid #fff;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      font-weight: 700;
      color: #fff;
      cursor: grab;
      box-shadow: 0 2px 4px rgba(0,0,0,0.3);
    `;
    el.textContent = String(index + 1); // Display 1-based index

    return el;
  }

  /**
   * Get color by index
   *
   * @param colorIndex - Color index
   * @returns Hex color string
   */
  static getColor(colorIndex: number): string {
    return MarkerFactory.COLORS[colorIndex % MarkerFactory.COLORS.length];
  }
}
