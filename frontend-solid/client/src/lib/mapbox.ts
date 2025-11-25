import mapboxgl from 'mapbox-gl';
import type { Location } from './prosemirror-schema';
import { COLORS } from './prosemirror-schema';

// Initialize Mapbox token
export function initMapbox(token: string) {
  mapboxgl.accessToken = token;
}

// Create a marker element
export function createMarkerElement(colorIndex: number): HTMLDivElement {
  const bgColor = COLORS[colorIndex % COLORS.length];

  const el = document.createElement('div');
  el.style.width = '32px';
  el.style.height = '32px';
  el.style.borderRadius = '50%';
  el.style.backgroundColor = bgColor;
  el.style.border = '3px solid white';
  el.style.boxShadow = '0 2px 8px rgba(0,0,0,0.3)';
  el.style.cursor = 'pointer';
  el.style.display = 'flex';
  el.style.alignItems = 'center';
  el.style.justifyContent = 'center';

  const inner = document.createElement('div');
  inner.style.width = '12px';
  inner.style.height = '12px';
  inner.style.borderRadius = '50%';
  inner.style.backgroundColor = 'white';

  el.appendChild(inner);
  return el;
}

// Add markers to map
export function addMarkersToMap(
  map: mapboxgl.Map,
  locations: Location[]
): mapboxgl.Marker[] {
  const markers: mapboxgl.Marker[] = [];

  locations.forEach((location) => {
    const el = createMarkerElement(location.colorIndex);

    const marker = new mapboxgl.Marker(el)
      .setLngLat([location.lng, location.lat])
      .setPopup(new mapboxgl.Popup().setText(location.placeName))
      .addTo(map);

    markers.push(marker);
  });

  return markers;
}

// Fit map bounds to locations
export function fitMapToLocations(
  map: mapboxgl.Map,
  locations: Location[],
  options: { padding?: number; maxZoom?: number; duration?: number; animate?: boolean } = {}
) {
  const { padding = 50, maxZoom = 15, duration = 1000, animate = true } = options;

  if (locations.length === 0) return;

  if (locations.length === 1) {
    const method = animate ? 'flyTo' : 'jumpTo';
    map[method]({
      center: [locations[0].lng, locations[0].lat],
      zoom: 12,
      duration: animate ? duration : 0
    });
  } else {
    const lngs = locations.map((l) => l.lng);
    const lats = locations.map((l) => l.lat);

    const bounds = new mapboxgl.LngLatBounds(
      [Math.min(...lngs), Math.min(...lats)],
      [Math.max(...lngs), Math.max(...lats)]
    );

    map.fitBounds(bounds, {
      padding,
      maxZoom,
      duration: animate ? duration : 0
    });
  }
}

// Fetch route from Mapbox Directions API
export async function fetchRoute(
  fromLng: number,
  fromLat: number,
  toLng: number,
  toLat: number,
  profile: 'walking' | 'cycling' | 'driving' = 'walking',
  waypoints?: Array<{ lng: number; lat: number }>,
  token?: string
): Promise<any | null> {
  try {
    const accessToken = token || mapboxgl.accessToken;
    if (!accessToken) {
      console.error('[Mapbox] No access token available');
      return null;
    }

    let coordinates: string;
    if (waypoints && waypoints.length > 0) {
      const waypointCoords = waypoints.map((wp) => `${wp.lng},${wp.lat}`).join(';');
      coordinates = `${fromLng},${fromLat};${waypointCoords};${toLng},${toLat}`;
    } else {
      coordinates = `${fromLng},${fromLat};${toLng},${toLat}`;
    }

    const mapboxProfile =
      profile === 'walking' ? 'walking' :
      profile === 'cycling' ? 'cycling' :
      'driving-traffic';

    const url = `https://api.mapbox.com/directions/v5/mapbox/${mapboxProfile}/${coordinates}?geometries=geojson&access_token=${accessToken}`;

    const response = await fetch(url);
    const data = await response.json();

    if (data.routes && data.routes.length > 0) {
      return data.routes[0];
    }

    return null;
  } catch (error) {
    console.error('[Mapbox] Error fetching route:', error);
    return null;
  }
}

// Add route layer to map
export function addRouteToMap(
  map: mapboxgl.Map,
  routeId: string,
  geometry: any,
  color: string
) {
  // Remove existing route if it exists
  if (map.getLayer(routeId)) {
    map.removeLayer(routeId);
  }
  if (map.getSource(routeId)) {
    map.removeSource(routeId);
  }

  map.addSource(routeId, {
    type: 'geojson',
    data: {
      type: 'Feature',
      properties: {},
      geometry
    }
  });

  map.addLayer({
    id: routeId,
    type: 'line',
    source: routeId,
    layout: {
      'line-join': 'round',
      'line-cap': 'round'
    },
    paint: {
      'line-color': color,
      'line-width': 3,
      'line-opacity': 0.75
    }
  });
}

// Remove route layer from map
export function removeRouteFromMap(map: mapboxgl.Map, routeId: string) {
  if (map.getLayer(routeId)) {
    map.removeLayer(routeId);
  }
  if (map.getSource(routeId)) {
    map.removeSource(routeId);
  }
}
