// Shared map styling configuration for consistent appearance across all map components

export const MAP_STYLE_URL = "mapbox://styles/mapbox/light-v11"; // Bright/gray Mapbox style

export const MARKER_STYLES = {
  container: {
    alignItems: 'center' as const,
  },
  marker: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 3,
  },
  label: {
    marginTop: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    maxWidth: 120,
  },
  labelText: {
    fontSize: 11,
    color: '#333',
  },
};

export const ROUTE_STYLES = {
  lineWidth: 4,
  lineOpacity: 0.7,
  lineCap: 'round' as const,
  lineJoin: 'round' as const,
};

// Color palette for locations
export const LOCATION_COLORS = [
  '#3B82F6', // Blue
  '#8B5CF6', // Purple
  '#10B981', // Emerald
  '#F59E0B', // Amber
  '#EF4444', // Red
  '#EC4899', // Pink
  '#06B6D4', // Cyan
  '#84CC16', // Lime
  '#F97316', // Orange
  '#6366F1', // Indigo
];