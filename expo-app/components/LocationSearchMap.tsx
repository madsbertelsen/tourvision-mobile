import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, ScrollView } from 'react-native';
// @ts-ignore
import Map from 'react-map-gl/mapbox';
import 'mapbox-gl/dist/mapbox-gl.css';
import { Marker, Source, Layer } from 'react-map-gl/mapbox';

interface LocationSearchResult {
  lat: string;
  lon: string;
  display_name: string;
}

interface LocationSearchMapProps {
  results: LocationSearchResult[];
  selectedIndex?: number;
  onSelectResult?: (index: number) => void;
  existingLocations?: Array<{
    geoId: string;
    placeName: string;
    lat: number;
    lng: number;
  }>;
  routeFrom?: { lat: number; lng: number; name: string } | null;
  routeTo?: { placeName: string; lat: number; lng: number } | null;
  routeGeometry?: any;
  showRoute?: boolean;
  waypoints?: Array<{ lat: number; lng: number }>;
  onWaypointsChange?: (waypoints: Array<{ lat: number; lng: number }>) => void;
}

// Animation utility functions
const easeInOutCubic = (t: number): number => {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
};

const lerp = (start: number, end: number, t: number): number => {
  return start + (end - start) * t;
};

const lerpLatLng = (startLat: number, startLng: number, endLat: number, endLng: number, t: number): [number, number] => {
  // Handle longitude wrapping across 180° meridian
  let deltaLng = endLng - startLng;
  if (deltaLng > 180) deltaLng -= 360;
  if (deltaLng < -180) deltaLng += 360;

  const lat = lerp(startLat, endLat, t);
  let lng = startLng + deltaLng * t;

  // Normalize longitude to [-180, 180]
  if (lng > 180) lng -= 360;
  if (lng < -180) lng += 360;

  return [lat, lng];
};

const lerpZoom = (startZoom: number, endZoom: number, t: number): number => {
  return lerp(startZoom, endZoom, t);
};

const lerpZoomParabolic = (startZoom: number, peakZoom: number, endZoom: number, t: number): number => {
  // Parabola passing through (0, startZoom), (0.5, peakZoom), (1, endZoom)
  const a = 2 * (startZoom + endZoom) - 4 * peakZoom;
  const b = -3 * startZoom + 4 * peakZoom - endZoom;
  const c = startZoom;

  return a * t * t + b * t + c;
};

// Calculate distance between two points (simple Euclidean distance in lat/lng space)
const calculateDistance = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
  const latDiff = lat2 - lat1;
  const lngDiff = lng2 - lng1;
  return Math.sqrt(latDiff * latDiff + lngDiff * lngDiff);
};

// Calculate peak zoom level that shows both start and end points
const calculatePeakZoom = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
  // Calculate bounding box
  const minLat = Math.min(lat1, lat2);
  const maxLat = Math.max(lat1, lat2);
  const minLng = Math.min(lng1, lng2);
  const maxLng = Math.max(lng1, lng2);

  // Calculate spans
  const latSpan = maxLat - minLat;
  const lngSpan = maxLng - minLng;

  // Add padding (20% on each side = 40% total)
  const paddedLatSpan = latSpan * 1.4;
  const paddedLngSpan = lngSpan * 1.4;

  // Use maximum span to determine zoom
  const maxSpan = Math.max(paddedLatSpan, paddedLngSpan);

  // Approximate zoom level calculation
  // At zoom 0, the world is ~360° wide
  // Each zoom level halves the visible area
  // Target: maxSpan fits in viewport
  let zoom;
  if (maxSpan < 0.01) zoom = 14;
  else if (maxSpan < 0.05) zoom = 12;
  else if (maxSpan < 0.2) zoom = 10;
  else if (maxSpan < 1) zoom = 8;
  else if (maxSpan < 5) zoom = 6;
  else if (maxSpan < 20) zoom = 4;
  else if (maxSpan < 80) zoom = 2;
  else zoom = 1;

  return zoom;
};

// Calculate appropriate animation duration based on distance
const calculateDuration = (startLat: number, startLng: number, endLat: number, endLng: number, startZoom: number, endZoom: number): number => {
  // Calculate geographic distance
  const geoDistance = calculateDistance(startLat, startLng, endLat, endLng);

  // Calculate zoom distance (how much we're zooming in/out)
  const zoomDistance = Math.abs(endZoom - startZoom);

  // Combine both factors: geographic movement and zoom change
  // Weight geographic distance more heavily
  const totalDistance = geoDistance * 100 + zoomDistance * 5;

  // Scale to duration: ~300ms per unit of combined distance
  const baseDuration = 800;
  const scaledDuration = baseDuration + (totalDistance * 300);

  // Reduce duration by 30% since arc allows faster high-altitude travel
  const arcAdjustedDuration = scaledDuration * 0.7;

  // Clamp between min and max (increased for slower animation)
  const minDuration = 1200;
  const maxDuration = 4000;

  return Math.min(maxDuration, Math.max(minDuration, arcAdjustedDuration));
};

// Find closest point on a line segment to a given point
const closestPointOnSegment = (
  px: number, py: number, // point
  x1: number, y1: number, // segment start
  x2: number, y2: number  // segment end
): { x: number; y: number; distance: number } => {
  const dx = x2 - x1;
  const dy = y2 - y1;

  if (dx === 0 && dy === 0) {
    // Segment is a point
    const dist = Math.sqrt((px - x1) ** 2 + (py - y1) ** 2);
    return { x: x1, y: y1, distance: dist };
  }

  // Calculate parameter t that represents the closest point on the line
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)));

  const closestX = x1 + t * dx;
  const closestY = y1 + t * dy;
  const distance = Math.sqrt((px - closestX) ** 2 + (py - closestY) ** 2);

  return { x: closestX, y: closestY, distance };
};

// Find closest point on entire route to cursor
const findClosestPointOnRoute = (
  cursorLng: number,
  cursorLat: number,
  routeCoordinates: number[][]
): { lng: number; lat: number; distance: number } | null => {
  if (!routeCoordinates || routeCoordinates.length < 2) return null;

  let minDistance = Infinity;
  let closestPoint = null;

  for (let i = 0; i < routeCoordinates.length - 1; i++) {
    const [lng1, lat1] = routeCoordinates[i];
    const [lng2, lat2] = routeCoordinates[i + 1];

    const result = closestPointOnSegment(cursorLng, cursorLat, lng1, lat1, lng2, lat2);

    if (result.distance < minDistance) {
      minDistance = result.distance;
      closestPoint = { lng: result.x, lat: result.y, distance: result.distance };
    }
  }

  return closestPoint;
};

export default function LocationSearchMap({
  results,
  selectedIndex = 0,
  onSelectResult,
  existingLocations = [],
  routeFrom,
  routeTo,
  routeGeometry,
  showRoute = false,
  waypoints = [],
  onWaypointsChange
}: LocationSearchMapProps) {
  const mapRef = useRef<any>(null);
  const animationRef = useRef<any>(null);
  const scrollViewRef = useRef<any>(null);

  // Auto-play state
  const [isAutoPlaying, setIsAutoPlaying] = useState(false);
  const [autoPlayProgress, setAutoPlayProgress] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const autoPlayTimerRef = useRef<any>(null);
  const autoPlayIntervalRef = useRef<any>(null);

  // Waypoint state
  const [hoverPoint, setHoverPoint] = useState<{ lng: number; lat: number } | null>(null);

  // Core animation function
  const animateMapTo = (targetLat: number, targetLng: number, targetZoom: number, duration?: number) => {
    if (!mapRef.current) return;

    // Cancel any existing animation
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }

    // Get current state
    const startCenter = mapRef.current.getCenter();
    const startLat = startCenter.lat;
    const startLng = startCenter.lng;
    const startZoom = mapRef.current.getZoom();

    // Calculate peak zoom (arc height) that shows both endpoints
    const peakZoom = calculatePeakZoom(startLat, startLng, targetLat, targetLng);

    // Calculate duration based on distance if not provided
    const animDuration = duration ?? calculateDuration(startLat, startLng, targetLat, targetLng, startZoom, targetZoom);

    const startTime = Date.now();
    setIsAnimating(true);

    const animate = () => {
      if (!mapRef.current) return;

      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / animDuration, 1);

      // Three-phase sequential animation (NO overlap):
      // Phase 1 (0-30%): Zoom out at start position
      // Phase 2 (30-70%): Pan at peak zoom (high altitude)
      // Phase 3 (70-100%): Zoom in at target position
      let lat, lng, zoom;

      if (progress < 0.3) {
        // Phase 1: Zoom out at start position
        const phaseProgress = progress / 0.3;
        const phaseEased = easeInOutCubic(phaseProgress);

        lat = startLat;
        lng = startLng;
        zoom = lerpZoom(startZoom, peakZoom, phaseEased);
      } else if (progress < 0.7) {
        // Phase 2: Pan at peak zoom (high altitude)
        const phaseProgress = (progress - 0.3) / 0.4;
        const phaseEased = easeInOutCubic(phaseProgress);

        [lat, lng] = lerpLatLng(startLat, startLng, targetLat, targetLng, phaseEased);
        zoom = peakZoom; // Keep zoom constant at peak
      } else {
        // Phase 3: Zoom in at target position
        const phaseProgress = (progress - 0.7) / 0.3;
        const phaseEased = easeInOutCubic(phaseProgress);

        lat = targetLat;
        lng = targetLng;
        zoom = lerpZoom(peakZoom, targetZoom, phaseEased);
      }

      // Update map
      mapRef.current.setCenter([lng, lat]);
      mapRef.current.setZoom(zoom);

      // Continue animation or finish
      if (progress < 1) {
        animationRef.current = requestAnimationFrame(animate);
      } else {
        animationRef.current = null;
        setIsAnimating(false);
      }
    };

    animationRef.current = requestAnimationFrame(animate);
  };

  // Auto-scroll to center the selected card
  useEffect(() => {
    if (results.length > 0 && scrollViewRef.current) {
      // Card width (minWidth) + gap
      const cardWidth = 220 + 12;
      // With paddingLeft: 240, first card is already centered at scroll position 0
      const scrollX = selectedIndex * cardWidth;

      scrollViewRef.current.scrollTo({
        x: scrollX,
        animated: true
      });
    }
  }, [selectedIndex, results.length]);

  // Rotate globe while loading
  useEffect(() => {
    if (results.length === 0 && mapRef.current) {
      let lastTime = Date.now();

      // Start rotating the globe with smooth timing
      const rotate = () => {
        if (!mapRef.current || results.length > 0) return;

        const now = Date.now();
        const delta = now - lastTime;
        lastTime = now;

        // Rotate at ~30 degrees per second
        const degreesPerMs = 30 / 1000;
        const rotation = delta * degreesPerMs;

        const center = mapRef.current.getCenter();
        let newLng = center.lng + rotation;

        // Normalize longitude
        if (newLng > 180) newLng -= 360;
        if (newLng < -180) newLng += 360;

        mapRef.current.setCenter([newLng, center.lat]);
        animationRef.current = requestAnimationFrame(rotate);
      };

      animationRef.current = requestAnimationFrame(rotate);

      return () => {
        if (animationRef.current) {
          cancelAnimationFrame(animationRef.current);
        }
      };
    }
  }, [results.length]);

  useEffect(() => {
    if (results.length > 0 && mapRef.current) {
      // Stop rotation
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }

      // Calculate center point of all results
      const lats = results.map(r => parseFloat(r.lat));
      const lngs = results.map(r => parseFloat(r.lon));

      const centerLat = (Math.min(...lats) + Math.max(...lats)) / 2;
      const centerLng = (Math.min(...lngs) + Math.max(...lngs)) / 2;

      // Calculate appropriate zoom level based on spread
      const latSpread = Math.max(...lats) - Math.min(...lats);
      const lngSpread = Math.max(...lngs) - Math.min(...lngs);
      const maxSpread = Math.max(latSpread, lngSpread);

      // Estimate zoom level (rough approximation)
      let targetZoom;
      if (maxSpread < 0.01) targetZoom = 14;  // Very close
      else if (maxSpread < 0.1) targetZoom = 11;  // City
      else if (maxSpread < 1) targetZoom = 8;     // Region
      else if (maxSpread < 5) targetZoom = 6;     // Country
      else targetZoom = 4;                         // Continent

      // Animate to show all results (auto-calculate duration based on distance)
      animateMapTo(centerLat, centerLng, targetZoom);
    }
  }, [results]);

  // Animate to selected location when card changes
  useEffect(() => {
    if (results.length > 0 && mapRef.current && selectedIndex >= 0 && selectedIndex < results.length) {
      const selected = results[selectedIndex];
      // Auto-calculate duration based on distance traveled
      animateMapTo(parseFloat(selected.lat), parseFloat(selected.lon), 12);
    }
  }, [selectedIndex, results]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);

  // Auto-play effect - only start countdown after animation completes
  useEffect(() => {
    if (!isAutoPlaying || results.length <= 1 || isAnimating) {
      // Don't start countdown if still animating
      setAutoPlayProgress(0);
      return;
    }

    // Reset progress
    setAutoPlayProgress(0);

    // Animate progress from 0 to 1 over 3 seconds
    const startTime = Date.now();
    const duration = 3000;

    const updateProgress = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      setAutoPlayProgress(progress);

      if (progress < 1) {
        autoPlayTimerRef.current = requestAnimationFrame(updateProgress);
      }
    };

    autoPlayTimerRef.current = requestAnimationFrame(updateProgress);

    // Advance to next after 3 seconds
    autoPlayIntervalRef.current = setTimeout(() => {
      const nextIndex = (selectedIndex + 1) % results.length;
      if (onSelectResult) {
        onSelectResult(nextIndex);
      }
    }, duration);

    return () => {
      if (autoPlayTimerRef.current) {
        cancelAnimationFrame(autoPlayTimerRef.current);
      }
      if (autoPlayIntervalRef.current) {
        clearTimeout(autoPlayIntervalRef.current);
      }
    };
  }, [isAutoPlaying, selectedIndex, results.length, onSelectResult, isAnimating]);

  const handleSelectResult = (index: number) => {
    setIsAutoPlaying(false); // Pause on manual selection
    if (onSelectResult) {
      onSelectResult(index);
    }
  };

  // Handle mouse move to show hover point on route
  const handleMouseMove = (event: any) => {
    if (!showRoute || !routeGeometry || !routeGeometry.coordinates) {
      setHoverPoint(null);
      return;
    }

    const { lngLat } = event;
    const closestPoint = findClosestPointOnRoute(lngLat.lng, lngLat.lat, routeGeometry.coordinates);

    // Only show hover point if cursor is close enough (within ~0.01 degrees, roughly 1km)
    if (closestPoint && closestPoint.distance < 0.01) {
      setHoverPoint({ lng: closestPoint.lng, lat: closestPoint.lat });
    } else {
      setHoverPoint(null);
    }
  };

  // Handle click to add waypoint
  const handleMapClick = (event: any) => {
    if (!hoverPoint || !onWaypointsChange) return;

    // Add waypoint at hover position
    const newWaypoints = [...waypoints, { lat: hoverPoint.lat, lng: hoverPoint.lng }];
    onWaypointsChange(newWaypoints);
  };

  return (
    <View style={styles.container}>
      <Map
        ref={mapRef}
        mapboxAccessToken={process.env.EXPO_PUBLIC_MAPBOX_TOKEN}
        mapStyle="mapbox://styles/mapbox/light-v11"
        style={{ width: '100%', height: '100%' }}
        initialViewState={{
          latitude: 0,
          longitude: 0,
          zoom: 1
        }}
        onMouseMove={handleMouseMove}
        onClick={handleMapClick}
        interactiveLayerIds={showRoute ? ['route-line'] : []}
      >
        {/* Show existing locations as gray markers for context */}
        {existingLocations.map((location) => (
          <Marker
            key={location.geoId}
            latitude={location.lat}
            longitude={location.lng}
            anchor="center"
          >
            <View style={styles.existingMarker}>
              <View style={styles.existingMarkerInner} />
            </View>
          </Marker>
        ))}

        {/* Show route line if in transport configuration mode */}
        {showRoute && routeGeometry && routeGeometry.coordinates && (
          <Source
            id="route"
            type="geojson"
            data={{
              type: 'Feature',
              geometry: routeGeometry,
              properties: {}
            }}
          >
            <Layer
              id="route-line"
              type="line"
              paint={{
                'line-color': '#3b82f6',
                'line-width': 4,
                'line-opacity': 0.8
              }}
              layout={{
                'line-join': 'round',
                'line-cap': 'round'
              }}
            />
          </Source>
        )}

        {/* Show route start marker */}
        {showRoute && routeFrom && (
          <Marker
            latitude={routeFrom.lat}
            longitude={routeFrom.lng}
            anchor="center"
          >
            <View style={styles.routeStartMarker}>
              <Text style={styles.routeMarkerText}>A</Text>
            </View>
          </Marker>
        )}

        {/* Show route end marker */}
        {showRoute && routeTo && (
          <Marker
            latitude={routeTo.lat}
            longitude={routeTo.lng}
            anchor="center"
          >
            <View style={styles.routeEndMarker}>
              <Text style={styles.routeMarkerText}>B</Text>
            </View>
          </Marker>
        )}

        {/* Show waypoint markers */}
        {showRoute && waypoints.map((waypoint, index) => (
          <Marker
            key={`waypoint-${index}`}
            latitude={waypoint.lat}
            longitude={waypoint.lng}
            anchor="center"
          >
            <View style={styles.waypointMarker}>
              <Text style={styles.waypointText}>{index + 1}</Text>
            </View>
          </Marker>
        ))}

        {/* Show hover point (white circle) when cursor is near route */}
        {showRoute && hoverPoint && (
          <Marker
            latitude={hoverPoint.lat}
            longitude={hoverPoint.lng}
            anchor="center"
          >
            <View style={styles.hoverPointMarker} />
          </Marker>
        )}

        {/* Show all search results as markers (only visible in Step 1) */}
        {!showRoute && results.length > 0 && results.map((result, index) => (
          <Marker
            key={index}
            latitude={parseFloat(result.lat)}
            longitude={parseFloat(result.lon)}
            anchor="center"
          >
            <View
              style={[
                styles.marker,
                index === selectedIndex && styles.selectedMarker
              ]}
            >
              <View style={styles.markerInner} />
            </View>
          </Marker>
        ))}
      </Map>

      {/* Results carousel - DISABLED: Now shown in bottom sheet overlay in parent component */}
      {false && results.length > 0 && !showRoute && (
      <View style={styles.carouselContainer}>
        <ScrollView
          ref={scrollViewRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.carouselContent}
        >
          {results.map((result, index) => (
            <TouchableOpacity
              key={index}
              style={[
                styles.carouselItem,
                index === selectedIndex && styles.selectedCarouselItem
              ]}
              onPress={() => handleSelectResult(index)}
            >
              <View style={styles.carouselNumber}>
                <Text style={styles.carouselNumberText}>{index + 1}</Text>
              </View>
              <Text
                style={styles.carouselText}
                numberOfLines={2}
              >
                {result.display_name.split(',').slice(0, 2).join(',')}
              </Text>
              {/* Circular countdown indicator */}
              {index === selectedIndex && isAutoPlaying && results.length > 1 && (
                <View style={styles.countdownContainer}>
                  <View
                    style={[
                      styles.countdownCircle,
                      {
                        background: `conic-gradient(#3B82F6 ${autoPlayProgress * 360}deg, #e5e7eb 0deg)` as any
                      }
                    ]}
                  />
                </View>
              )}
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    height: '100%',
    position: 'relative',
  },
  placeholder: {
    width: '100%',
    height: '100%',
    backgroundColor: '#f0f0f0',
  },
  marker: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#3B82F6',
    borderWidth: 3,
    borderColor: 'white',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  selectedMarker: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#2563EB',
    borderWidth: 4,
  },
  markerInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'white',
  },
  carouselContainer: {
    position: 'absolute',
    bottom: 16,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
  },
  carouselContent: {
    gap: 12,
    paddingLeft: 240,
    paddingRight: 240,
  },
  carouselItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 12,
    padding: 12,
    gap: 10,
    minWidth: 220,
    maxWidth: 280,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  selectedCarouselItem: {
    backgroundColor: '#eff6ff',
    borderColor: '#3B82F6',
  },
  carouselNumber: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#3B82F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  carouselNumberText: {
    fontSize: 14,
    fontWeight: '700',
    color: 'white',
  },
  carouselText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
    color: '#374151',
    lineHeight: 18,
  },
  countdownContainer: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 32,
    height: 32,
  },
  countdownCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  // Existing location markers (gray, for context)
  existingMarker: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#9ca3af',
    borderWidth: 2,
    borderColor: 'white',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    opacity: 0.7,
  },
  existingMarkerInner: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'white',
  },
  // Route markers
  routeStartMarker: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#10b981',
    borderWidth: 3,
    borderColor: 'white',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
  },
  routeEndMarker: {
    width: 45,
    height: 45,
    borderRadius: 22.5,
    backgroundColor: '#3b82f6',
    borderWidth: 3,
    borderColor: 'white',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
  },
  routeMarkerText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: 'white',
  },
  waypointMarker: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f59e0b',
    borderWidth: 3,
    borderColor: 'white',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
  },
  waypointText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: 'white',
  },
  hoverPointMarker: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'white',
    borderWidth: 3,
    borderColor: '#3b82f6',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
  },
});
