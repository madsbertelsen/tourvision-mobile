/**
 * Helper functions for transportation elements
 * These are pure functions that can be used on both client and server
 */

export type TransportMode = 'walking' | 'driving' | 'cycling';

export function getModeIcon(mode: TransportMode): string {
  switch (mode) {
    case 'walking':
      return '🚶';
    case 'driving':
      return '🚗';
    case 'cycling':
      return '🚴';
    default:
      return '→';
  }
}

export function getModeColor(mode: TransportMode): string {
  switch (mode) {
    case 'walking':
      return '#10b981'; // green
    case 'driving':
      return '#3b82f6'; // blue
    case 'cycling':
      return '#f59e0b'; // amber
    default:
      return '#6b7280'; // gray
  }
}

export function formatDuration(minutes?: number): string {
  if (!minutes) return '';
  
  if (minutes < 60) {
    return `${minutes} min`;
  }
  
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  
  if (remainingMinutes === 0) {
    return `${hours}h`;
  }
  
  return `${hours}h ${remainingMinutes}min`;
}

export function formatDistance(meters?: number): string {
  if (!meters) return '';
  
  if (meters < 1000) {
    return `${Math.round(meters)}m`;
  }
  
  return `${(meters / 1000).toFixed(1)}km`;
}

/**
 * Detect transportation mode from context
 */
export function detectTransportMode(text: string, distance?: number): TransportMode {
  const lowerText = text.toLowerCase();
  
  // Check for explicit mentions
  if (lowerText.includes('walk') || lowerText.includes('stroll') || lowerText.includes('on foot')) {
    return 'walking';
  }
  if (lowerText.includes('drive') || lowerText.includes('car') || lowerText.includes('taxi') || lowerText.includes('uber')) {
    return 'driving';
  }
  if (lowerText.includes('bike') || lowerText.includes('cycle') || lowerText.includes('bicycle')) {
    return 'cycling';
  }
  
  // Default based on distance
  if (distance) {
    if (distance < 2000) { // Less than 2km
      return 'walking';
    } else if (distance > 10000) { // More than 10km
      return 'driving';
    }
  }
  
  // Default to walking for short city distances
  return 'walking';
}

/**
 * Calculate rough distance between coordinates
 */
export function calculateDistance(
  from: [number, number],
  to: [number, number]
): number {
  const R = 6371000; // Earth's radius in meters
  const φ1 = from[1] * Math.PI / 180;
  const φ2 = to[1] * Math.PI / 180;
  const Δφ = (to[1] - from[1]) * Math.PI / 180;
  const Δλ = (to[0] - from[0]) * Math.PI / 180;

  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
          Math.cos(φ1) * Math.cos(φ2) *
          Math.sin(Δλ/2) * Math.sin(Δλ/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

  return R * c;
}

/**
 * Estimate duration based on mode and distance
 */
export function estimateDuration(mode: TransportMode, distance: number): number {
  // Average speeds in m/min
  const speeds = {
    walking: 80,    // ~5 km/h
    cycling: 250,   // ~15 km/h
    driving: 500,   // ~30 km/h (city driving)
  };
  
  return Math.round(distance / speeds[mode]);
}