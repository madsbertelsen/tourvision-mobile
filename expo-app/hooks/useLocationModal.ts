/**
 * useLocationModal - Hook for managing location modal state and handlers
 *
 * This hook manages:
 * - Opening/closing the modal
 * - Fetching location data from Nominatim
 * - Managing two-step flow (location selection → transport config)
 * - Fetching routes from Mapbox
 * - Creating geo-marks in the document
 */

import { useCallback, useEffect, useRef } from 'react';
import { useTripContext } from '@/app/(app)/document/[id]/_layout';
import { ProseMirrorWebViewRef } from '@/components/ProseMirrorWebView';

interface UseLocationModalProps {
  webViewRef: React.RefObject<ProseMirrorWebViewRef>;
  onLocationAdded?: () => void;
}

export function useLocationModal({ webViewRef, onLocationAdded }: UseLocationModalProps) {
  const { locations, setLocations, locationModal, setLocationModal } = useTripContext();

  // Handle opening the modal with text selection
  const handleShowGeoMarkEditor = useCallback((data: any, existingLocations: any[]) => {
    console.log('[LocationModal] handleShowGeoMarkEditor called with:', data);

    const searchQuery = data.selectedText || '';

    if (!searchQuery.trim()) {
      console.warn('[LocationModal] No text selected, cannot create location');
      return;
    }

    // Store selection range and position
    setLocationModal({
      selectionRange: { from: data.from, to: data.to },
      selectionTop: data.selectionTop || 200, // Use provided y-offset or default
      selectionLeft: data.selectionLeft || 0, // Use provided x-offset or default
      selectionWidth: data.selectionWidth || 0, // Use provided width or default
      visible: true,
      isLoadingLocation: true,
      locationSearchResults: [],
      selectedResultIndex: 0,
    });

    // Fetch location data from Nominatim
    fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(searchQuery)}&format=jsonv2&limit=5&addressdetails=1`,
      { headers: { 'User-Agent': 'TourVision-App' } }
    )
      .then(res => res.json())
      .then(results => {
        setLocationModal({
          locationSearchResults: results || [],
          isLoadingLocation: false,
          selectedLocation: results && results.length > 0 ? {
            placeName: results[0].display_name,
            lat: parseFloat(results[0].lat),
            lng: parseFloat(results[0].lon),
          } : null,
        });
      })
      .catch(error => {
        console.error('[LocationModal] Error fetching location:', error);
        setLocationModal({
          isLoadingLocation: false,
          selectedLocation: {
            placeName: searchQuery,
            lat: 48.8566, // Paris default
            lng: 2.3522,
          },
        });
      });
  }, [setLocationModal]);

  // Handle location result selection
  const handleSelectResult = useCallback((index: number) => {
    if (!locationModal.locationSearchResults || index >= locationModal.locationSearchResults.length) {
      return;
    }

    const result = locationModal.locationSearchResults[index];
    if (!result) {
      return;
    }

    setLocationModal({
      selectedResultIndex: index,
      selectedLocation: {
        placeName: result.display_name || 'Unknown location',
        lat: parseFloat(result.lat || '0'),
        lng: parseFloat(result.lon || '0'),
      },
    });
  }, [locationModal.locationSearchResults, setLocationModal]);

  // Handle continuing from Step 1 (location) to Step 2 (transport)
  const handleContinue = useCallback(() => {
    if (!locationModal.selectedLocation) {
      console.warn('[LocationModal] No location selected');
      return;
    }

    // Smart default: Set transport from to previous location if available
    const transportFrom = locations.length > 0 ? {
      lat: locations[locations.length - 1].lat,
      lng: locations[locations.length - 1].lng,
      name: locations[locations.length - 1].placeName
    } : null;

    setLocationModal({
      step: 'transport',
      transportConfig: {
        ...locationModal.transportConfig,
        from: transportFrom,
      },
    });
  }, [locationModal.selectedLocation, locationModal.transportConfig, locations, setLocationModal]);

  // Handle transport mode change
  const handleTransportModeChange = useCallback((mode: typeof locationModal.transportConfig.mode) => {
    setLocationModal({
      transportConfig: {
        ...locationModal.transportConfig,
        mode,
      },
    });
  }, [locationModal.transportConfig, setLocationModal]);

  // Handle waypoints change
  const handleWaypointsChange = useCallback((waypoints: Array<{ lat: number; lng: number }>) => {
    setLocationModal({
      transportConfig: {
        ...locationModal.transportConfig,
        waypoints,
      },
    });
  }, [locationModal.transportConfig, setLocationModal]);

  // Handle adding location to document
  const handleAddLocation = useCallback(() => {
    if (!locationModal.selectedLocation || !locationModal.selectionRange || !webViewRef.current) {
      console.warn('[LocationModal] Missing data for creating geo-mark');
      return;
    }

    // Create geo-mark data with transport information
    const geoMarkData = {
      geoId: `geo-${Date.now()}`,
      placeName: locationModal.selectedLocation.placeName,
      lat: locationModal.selectedLocation.lat,
      lng: locationModal.selectedLocation.lng,
      colorIndex: locations.length % 5,  // Match 5-color palette
      coordSource: 'nominatim',
      transportFrom: locationModal.transportConfig.from,
      transportProfile: locationModal.transportConfig.mode,
      routeGeometry: locationModal.transportConfig.routeGeometry,
      routeDistance: locationModal.transportConfig.routeDistance,
      routeDuration: locationModal.transportConfig.routeDuration,
      waypoints: null, // TODO: Add waypoints support later
    };

    console.log('[LocationModal] Creating geo-mark with data:', geoMarkData);

    // Send command to WebView to create geo-mark
    webViewRef.current.sendCommand('createGeoMark', { geoMarkData });

    // Add to locations tracking
    const newLocation = {
      geoId: geoMarkData.geoId,
      placeName: geoMarkData.placeName,
      lat: geoMarkData.lat,
      lng: geoMarkData.lng,
    };

    setLocations([...locations, newLocation]);

    // Reset modal state and close
    setLocationModal({
      visible: false,
      step: 'location',
      selectedLocation: null,
      selectionRange: null,
      transportConfig: {
        from: null,
        mode: 'walking',
        routeGeometry: null,
        routeDistance: null,
        routeDuration: null,
        waypoints: [],
      },
    });

    onLocationAdded?.();
  }, [locationModal, locations, setLocations, setLocationModal, webViewRef, onLocationAdded]);

  // Handle modal close
  const handleClose = useCallback(() => {
    setLocationModal({
      visible: false,
      step: 'location',
      selectedLocation: null,
      selectionRange: null,
      transportConfig: {
        from: null,
        mode: 'walking',
        routeGeometry: null,
        routeDistance: null,
        routeDuration: null,
        waypoints: [],
      },
    });
  }, [setLocationModal]);

  // Fetch route from Mapbox when transport config changes
  useEffect(() => {
    if (locationModal.step !== 'transport' ||
        !locationModal.transportConfig.from ||
        !locationModal.selectedLocation) {
      return;
    }

    const fetchRoute = async () => {
      setLocationModal({ isLoadingRoute: true });

      try {
        // Map transport mode to Mapbox profile
        const profileMap = {
          walking: 'walking',
          driving: 'driving-traffic',
          transit: 'driving', // No transit profile in Directions API
          cycling: 'cycling',
          flight: 'driving', // Use straight line for flight
        };

        const profile = profileMap[locationModal.transportConfig.mode];
        const from = locationModal.transportConfig.from;
        const to = locationModal.selectedLocation;

        // Build coordinates string with waypoints if they exist
        let coordinates;
        if (locationModal.transportConfig.waypoints.length > 0) {
          const waypointCoords = locationModal.transportConfig.waypoints
            .map(wp => `${wp.lng},${wp.lat}`)
            .join(';');
          coordinates = `${from.lng},${from.lat};${waypointCoords};${to.lng},${to.lat}`;
        } else {
          coordinates = `${from.lng},${from.lat};${to.lng},${to.lat}`;
        }

        const mapboxToken = process.env.EXPO_PUBLIC_MAPBOX_TOKEN;
        const url = `https://api.mapbox.com/directions/v5/mapbox/${profile}/${coordinates}?geometries=geojson&access_token=${mapboxToken}`;

        const response = await fetch(url);
        const data = await response.json();

        if (data.routes && data.routes[0]) {
          setLocationModal({
            isLoadingRoute: false,
            transportConfig: {
              ...locationModal.transportConfig,
              routeGeometry: data.routes[0].geometry,
              routeDistance: data.routes[0].distance,
              routeDuration: data.routes[0].duration,
            },
          });
        } else {
          throw new Error('No route found');
        }
      } catch (error) {
        console.error('[LocationModal] Error fetching route:', error);
        setLocationModal({ isLoadingRoute: false });
      }
    };

    fetchRoute();
  }, [
    locationModal.step,
    locationModal.transportConfig.from,
    locationModal.selectedLocation,
    locationModal.transportConfig.mode,
    locationModal.transportConfig.waypoints,
  ]);

  return {
    handleShowGeoMarkEditor,
    handleSelectResult,
    handleContinue,
    handleTransportModeChange,
    handleWaypointsChange,
    handleAddLocation,
    handleClose,
  };
}
