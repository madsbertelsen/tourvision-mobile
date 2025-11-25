import { type Component, Show, createEffect, createSignal, For } from 'solid-js';
import { useParams, useNavigate } from '@solidjs/router';
import { getLocationsStore, type Location } from '../../stores/locations';
import { getDocumentStore } from '../../stores/document';
import { getEditorStore } from '../../stores/editor';
import { COLORS } from '../../lib/prosemirror-schema';
import { fetchRoute } from '../../lib/mapbox';
import styles from './LocationDetailSheet.module.scss';

type TransportMode = 'walking' | 'driving' | 'cycling';
type SheetMode = 'detail' | 'transport';

interface RouteData {
  distance: number;
  duration: number;
  geometry: any;
}

export const LocationDetailSheet: Component = () => {
  const params = useParams<{ docId: string; mapId: string; locId: string }>();
  const navigate = useNavigate();
  const locationsStore = getLocationsStore();
  const documentStore = getDocumentStore();
  const editorStore = getEditorStore();

  const [location, setLocation] = createSignal<Location | null>(null);
  const [sheetMode, setSheetMode] = createSignal<SheetMode>('detail');

  // Transport config state
  const [selectedSourceId, setSelectedSourceId] = createSignal<string | null>(null);
  const [transportMode, setTransportMode] = createSignal<TransportMode>('driving');
  const [routeData, setRouteData] = createSignal<RouteData | null>(null);
  const [isLoadingRoute, setIsLoadingRoute] = createSignal(false);

  // Track previous locId to detect actual location changes
  let previousLocId: string | undefined;

  // Track last fetch params to prevent duplicate requests
  let lastFetchKey = '';

  // Find location when locId changes
  createEffect(() => {
    const locId = params.locId;
    if (locId) {
      const found = locationsStore.getLocationById(locId);
      setLocation(found || null);

      // Only reset mode when switching to a different location
      const isNewLocation = locId !== previousLocId;
      if (isNewLocation) {
        console.log('[LocationDetailSheet] Location changed:', locId, found);
        previousLocId = locId;

        // Reset state
        setSelectedSourceId(null);
        setRouteData(null);
        lastFetchKey = ''; // Reset fetch key to allow re-fetching

        // If location has transport configured, show transport view and pre-select
        if (found?.transportFrom) {
          setSheetMode('transport');
          setSelectedSourceId(found.transportFrom);
          if (found.transportProfile) {
            setTransportMode(found.transportProfile as TransportMode);
          }
        } else {
          // Reset to detail mode when no transport configured
          setSheetMode('detail');
        }
      }
    } else {
      setLocation(null);
      previousLocId = undefined;
    }
  });

  // Fetch route when source or mode changes
  createEffect(() => {
    const sourceId = selectedSourceId();
    const destId = params.locId;
    const mode = transportMode();
    const currentSheetMode = sheetMode();

    if (!sourceId || !destId || currentSheetMode !== 'transport') {
      return;
    }

    // Create a key to prevent duplicate fetches
    const fetchKey = `${sourceId}-${destId}-${mode}`;
    if (fetchKey === lastFetchKey) {
      return; // Already fetched this route
    }
    lastFetchKey = fetchKey;

    // Get locations without creating reactive dependency
    const sourceLocation = locationsStore.getLocationById(sourceId);
    const dest = locationsStore.getLocationById(destId);
    if (!sourceLocation || !dest) return;

    console.log('[LocationDetailSheet] Fetching route:', fetchKey);
    setIsLoadingRoute(true);
    fetchRoute(
      sourceLocation.lng,
      sourceLocation.lat,
      dest.lng,
      dest.lat,
      mode
    ).then((route) => {
      if (route) {
        setRouteData({
          distance: route.distance,
          duration: route.duration,
          geometry: route.geometry
        });

        // Update the geo-mark in the document with transport settings
        // FullscreenMap will derive and render the route from document state
        editorStore.updateGeoMarkTransport(destId, sourceId, mode);
      } else {
        setRouteData(null);
      }
      setIsLoadingRoute(false);
    });
  });

  const handleClose = () => {
    // Navigate back to map without location
    navigate(`/${params.docId}/map/${params.mapId}`);
  };

  const handleEditLocation = () => {
    // TODO: Implement edit location
    console.log('[LocationDetailSheet] Edit location:', location()?.geoId);
  };

  const handleConfigureTransport = () => {
    setSheetMode('transport');
  };

  const handleBackToDetail = () => {
    setSheetMode('detail');
  };

  const handleSourceSelect = (sourceId: string) => {
    setSelectedSourceId(sourceId);
  };

  const handleModeSelect = (mode: TransportMode) => {
    setTransportMode(mode);
  };

  // Get other locations (not the current one) for source selection
  const otherLocations = () => {
    const currentId = location()?.geoId;
    return locationsStore.state.locations.filter(loc => loc.geoId !== currentId);
  };

  const getLocationColor = () => {
    const loc = location();
    if (!loc) return '#6B7280';
    return COLORS[loc.colorIndex % COLORS.length];
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.round(seconds / 60);
    if (mins < 60) return `${mins} min`;
    const hours = Math.floor(mins / 60);
    const remainMins = mins % 60;
    return `${hours}h ${remainMins}m`;
  };

  const formatDistance = (meters: number) => {
    if (meters < 1000) return `${Math.round(meters)} m`;
    return `${(meters / 1000).toFixed(1)} km`;
  };

  return (
    <Show when={params.locId && location()}>
      <div class={styles.sheet}>
        <div class={styles.content}>
          {/* Detail Mode */}
          <Show when={sheetMode() === 'detail'}>
            {/* Header */}
            <div class={styles.header}>
              <div
                class={styles.colorDot}
                style={{ 'background-color': getLocationColor() }}
              />
              <h2 class={styles.title}>
                {location()?.displayText || location()?.placeName}
              </h2>
              <button class={styles.closeBtn} onClick={handleClose} title="Close">
                ✕
              </button>
            </div>

            {/* Place Name (if different from display text) */}
            <Show when={location()?.placeName && location()?.placeName !== location()?.displayText}>
              <div class={styles.section}>
                <div class={styles.sectionRow}>
                  <span class={styles.icon}>📍</span>
                  <span class={styles.sectionLabel}>Place</span>
                </div>
                <p class={styles.sectionValue}>{location()?.placeName}</p>
              </div>
            </Show>

            {/* Coordinates */}
            <div class={styles.section}>
              <div class={styles.sectionRow}>
                <span class={styles.icon}>🧭</span>
                <span class={styles.sectionLabel}>Coordinates</span>
              </div>
              <p class={styles.sectionValue}>
                {location()?.lat.toFixed(6)}, {location()?.lng.toFixed(6)}
              </p>
            </div>

            {/* Transport info (if available) */}
            <Show when={location()?.transportFrom}>
              <div class={styles.section}>
                <div class={styles.sectionRow}>
                  <span class={styles.icon}>🚗</span>
                  <span class={styles.sectionLabel}>Transport</span>
                </div>
                <p class={styles.sectionValue}>
                  From: {location()?.transportFrom}
                  {location()?.transportProfile && ` (${location()?.transportProfile})`}
                </p>
              </div>
            </Show>

            {/* Action buttons */}
            <div class={styles.actions}>
              <button
                class={styles.linkButton}
                onClick={handleConfigureTransport}
              >
                <span class={styles.icon}>🚗</span>
                <span>Configure Transport</span>
                <span class={styles.chevron}>›</span>
              </button>

              <button
                class={styles.secondaryButton}
                onClick={handleEditLocation}
              >
                <span class={styles.icon}>✏️</span>
                <span>Edit Location</span>
              </button>
            </div>
          </Show>

          {/* Transport Config Mode */}
          <Show when={sheetMode() === 'transport'}>
            {/* Header with back button */}
            <div class={styles.header}>
              <button class={styles.backBtn} onClick={handleBackToDetail} title="Back">
                ‹
              </button>
              <h2 class={styles.title}>Transport Configuration</h2>
              <button class={styles.closeBtn} onClick={handleClose} title="Close">
                ✕
              </button>
            </div>

            {/* Destination */}
            <div class={styles.section}>
              <div class={styles.sectionRow}>
                <span class={styles.icon}>📍</span>
                <span class={styles.sectionLabel}>Destination</span>
              </div>
              <p class={styles.sectionValue}>
                {location()?.displayText || location()?.placeName}
              </p>
            </div>

            {/* Source location selector */}
            <div class={styles.section}>
              <div class={styles.sectionRow}>
                <span class={styles.icon}>🚩</span>
                <span class={styles.sectionLabel}>Travel From</span>
              </div>
              <Show
                when={otherLocations().length > 0}
                fallback={<p class={styles.emptyMessage}>No other locations to select</p>}
              >
                <div class={styles.sourceOptions}>
                  <For each={otherLocations()}>
                    {(loc) => (
                      <button
                        class={`${styles.sourceOption} ${selectedSourceId() === loc.geoId ? styles.sourceOptionActive : ''}`}
                        onClick={() => handleSourceSelect(loc.geoId)}
                      >
                        <div
                          class={styles.sourceDot}
                          style={{ 'background-color': COLORS[loc.colorIndex % COLORS.length] }}
                        />
                        <span class={styles.sourceLabel}>
                          {loc.displayText || loc.placeName}
                        </span>
                      </button>
                    )}
                  </For>
                </div>
              </Show>
            </div>

            {/* Transport mode selector - only show if source selected */}
            <Show when={selectedSourceId()}>
              <div class={styles.section}>
                <div class={styles.sectionRow}>
                  <span class={styles.icon}>🚗</span>
                  <span class={styles.sectionLabel}>Transportation Method</span>
                </div>
                <div class={styles.transportModes}>
                  <button
                    class={`${styles.modeOption} ${transportMode() === 'walking' ? styles.modeOptionActive : ''}`}
                    onClick={() => handleModeSelect('walking')}
                  >
                    <span class={styles.modeIcon}>🚶</span>
                    <span class={styles.modeLabel}>Walking</span>
                  </button>
                  <button
                    class={`${styles.modeOption} ${transportMode() === 'driving' ? styles.modeOptionActive : ''}`}
                    onClick={() => handleModeSelect('driving')}
                  >
                    <span class={styles.modeIcon}>🚗</span>
                    <span class={styles.modeLabel}>Driving</span>
                  </button>
                  <button
                    class={`${styles.modeOption} ${transportMode() === 'cycling' ? styles.modeOptionActive : ''}`}
                    onClick={() => handleModeSelect('cycling')}
                  >
                    <span class={styles.modeIcon}>🚴</span>
                    <span class={styles.modeLabel}>Cycling</span>
                  </button>
                </div>
              </div>

              {/* Loading state */}
              <Show when={isLoadingRoute()}>
                <div class={styles.loadingContainer}>
                  <span class={styles.spinner} />
                  <span>Calculating route...</span>
                </div>
              </Show>

              {/* Route stats */}
              <Show when={routeData() && !isLoadingRoute()}>
                <div class={styles.section}>
                  <div class={styles.sectionRow}>
                    <span class={styles.icon}>📊</span>
                    <span class={styles.sectionLabel}>Route Details</span>
                  </div>
                  <div class={styles.routeStats}>
                    <div class={styles.routeStat}>
                      <span class={styles.statIcon}>⏱️</span>
                      <span class={styles.statLabel}>Duration</span>
                      <span class={styles.statValue}>{formatDuration(routeData()!.duration)}</span>
                    </div>
                    <div class={styles.routeStat}>
                      <span class={styles.statIcon}>📏</span>
                      <span class={styles.statLabel}>Distance</span>
                      <span class={styles.statValue}>{formatDistance(routeData()!.distance)}</span>
                    </div>
                  </div>
                </div>
              </Show>
            </Show>
          </Show>
        </div>
      </div>
    </Show>
  );
};
