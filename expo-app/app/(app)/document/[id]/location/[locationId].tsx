import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Image,
  Dimensions,
  Alert
} from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useBookmark } from '@/hooks/useBookmark';
import { getDocument, saveTrip } from '@/utils/documents-storage';
import ProseMirrorNativeRenderer from '@/components/ProseMirrorNativeRenderer';
import { Platform } from 'react-native';

// Conditionally import map libraries based on platform
let Mapbox: any = null;
let LocationMapWeb: any = null;

if (Platform.OS !== 'web') {
  Mapbox = require('@rnmapbox/maps').default;
  // Set Mapbox access token
  Mapbox.setAccessToken(process.env.EXPO_PUBLIC_MAPBOX_TOKEN || '');
} else {
  // Import web map component for web platform
  LocationMapWeb = require('@/components/LocationMapWeb').default;
}

const MAP_HEIGHT = 400;

export default function LocationDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const insets = useSafeAreaInsets();
  const {
    id,
    locationId,
    name,
    lat,
    lng,
    description,
    photoName,
    colorIndex,
    contextDocument: contextDocParam,
    tripId
  } = params as {
    id: string;
    locationId?: string;
    name: string;
    lat: string;
    lng: string;
    description?: string;
    photoName?: string;
    colorIndex?: string;
    contextDocument?: string;
    tripId?: string;
  };

  const [contextDocument, setContextDocument] = useState<any>(null);
  const [transportProfile, setTransportProfile] = useState<string | null>(null);
  const [transportFrom, setTransportFrom] = useState<string | null>(null);
  const [availableLocations, setAvailableLocations] = useState<Array<{ id: string; name: string; lat: number; lng: number }>>([]);
  const [isSavingTransport, setIsSavingTransport] = useState(false);
  const [routeGeometry, setRouteGeometry] = useState<any>(null);
  const [routeDistance, setRouteDistance] = useState<number | null>(null);
  const [routeDuration, setRouteDuration] = useState<number | null>(null);
  const cameraRef = useRef<any>(null);

  // Use bookmark hook
  const { bookmarked, isToggling, toggle: handleToggleBookmark } = useBookmark({
    id,
    name,
    lat,
    lng,
    description,
    photoName,
  });

  // Load document data and extract documents - reload when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      const loadDocuments = async () => {
        // Load from document storage if tripId is available
        if (tripId) {
          try {
            const document = await getDocument(tripId);
            if (trip) {
              const geoId = locationId || id;

              // Load context document and transport settings from geo-mark in trip.document
              const findGeoMark = (node: any): any => {
                if (!node) return null;

                // Check if this node is a geo-mark node
                if (node.type === 'geoMark' && node.attrs?.geoId === geoId) {
                  return node.attrs;
                }

                // Recursively search children
                if (node.content) {
                  for (const child of node.content) {
                    const found = findGeoMark(child);
                    if (found) return found;
                  }
                }

                return null;
              };

              const geoMarkAttrs = trip.document ? findGeoMark(trip.document) : null;
              const foundContext = geoMarkAttrs?.visitDocument || null;
              if (foundContext) {
                setContextDocument(foundContext);
              } else if (contextDocParam) {
                // Fallback to params if not found in document document
                try {
                  const parsed = JSON.parse(contextDocParam);
                  setContextDocument(parsed);
                } catch (e) {
                  console.error('Failed to parse contextDocument from params:', e);
                  setContextDocument(null);
                }
              } else {
                setContextDocument(null);
              }

              // Load transport settings from geoMark
              setTransportProfile(geoMarkAttrs?.transportProfile || null);
              setTransportFrom(geoMarkAttrs?.transportFrom || null);

              // Extract all geo-marks from document document to populate available locations
              const extractAllGeoMarks = (node: any): Array<{ id: string; name: string; lat: number; lng: number }> => {
                const locations: Array<{ id: string; name: string; lat: number; lng: number }> = [];

                const traverse = (n: any) => {
                  if (!n) return;

                  // Check if this node is a geo-mark node
                  if (n.type === 'geoMark' && n.attrs?.geoId && n.attrs?.placeName && n.attrs?.lat && n.attrs?.lng) {
                    // Don't include current location
                    if (n.attrs.geoId !== geoId) {
                      locations.push({
                        id: n.attrs.geoId,
                        name: n.attrs.placeName,
                        lat: parseFloat(n.attrs.lat),
                        lng: parseFloat(n.attrs.lng)
                      });
                    }
                  }

                  // Recursively traverse children
                  if (n.content) {
                    n.content.forEach((child: any) => traverse(child));
                  }
                };

                traverse(node);
                return locations;
              };

              const locations = trip.document ? extractAllGeoMarks(trip.document) : [];
              setAvailableLocations(locations);
            }
          } catch (e) {
            console.error('Failed to load documents:', e);
          }
        } else if (contextDocParam) {
          // If no tripId, fallback to parsing from params
          try {
            const parsed = JSON.parse(contextDocParam);
            setContextDocument(parsed);
          } catch (e) {
            console.error('Failed to parse contextDocument from params:', e);
          }
        }
      };

      loadDocuments();
    }, [contextDocParam, tripId, locationId, id])
  );

  // Center camera on location when component mounts
  useEffect(() => {
    if (cameraRef.current && lat && lng) {
      setTimeout(() => {
        cameraRef.current?.setCamera({
          centerCoordinate: [parseFloat(lng), parseFloat(lat)],
          zoomLevel: 14,
          animationDuration: 1000,
        });
      }, 100);
    }
  }, [lat, lng]);

  // Fetch route when transport settings change
  useEffect(() => {
    const fetchRoute = async () => {
      if (!transportProfile || !transportFrom || !lat || !lng) {
        setRouteGeometry(null);
        setRouteDistance(null);
        setRouteDuration(null);
        return;
      }

      // Find the "from" location coordinates
      const fromLocation = availableLocations.find(loc => loc.id === transportFrom);
      if (!fromLocation) {
        console.warn('From location not found:', transportFrom);
        return;
      }

      try {
        // Format waypoints as lon,lat;lon,lat
        const waypoints = `${fromLocation.lng},${fromLocation.lat};${lng},${lat}`;
        const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3001';
        const url = `${apiUrl}/api/route?waypoints=${waypoints}&profile=${transportProfile}`;

        console.log('Fetching route:', url);

        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`Route API error: ${response.statusText}`);
        }

        const data = await response.json();
        console.log('Route data:', data);

        setRouteGeometry(data.geometry);
        setRouteDistance(data.distance);
        setRouteDuration(data.duration);

        // Adjust camera to show full route
        if (cameraRef.current && data.geometry) {
          setTimeout(() => {
            cameraRef.current?.fitBounds(
              [fromLocation.lng, fromLocation.lat],
              [parseFloat(lng), parseFloat(lat)],
              [50, 50, 50, 50], // padding
              1000 // animation duration
            );
          }, 100);
        }
      } catch (error) {
        console.error('Failed to fetch route:', error);
        setRouteGeometry(null);
        setRouteDistance(null);
        setRouteDuration(null);
      }
    };

    fetchRoute();
  }, [transportProfile, transportFrom, lat, lng, availableLocations]);

  // Photo URL from Google Places
  const photoUrl = photoName
    ? `https://places.googleapis.com/v1/${photoName}/media?maxHeightPx=600&key=${process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY}`
    : null;

  // Extract short name (first part before comma) for header
  const shortName = name.split(',')[0].trim();

  // Save transport settings to geoMark
  const handleSaveTransport = async () => {
    if (!tripId) return;

    setIsSavingTransport(true);
    try {
      const document = await getDocument(tripId);
      if (!trip || !trip.document) {
        Alert.alert('Error', 'Trip document not found');
        return;
      }

      const geoId = locationId || id;

      // Update geo-mark with new transport settings
      const updateGeoMarkTransport = (node: any): any => {
        if (!node) return node;

        // If this is a geo-mark node with matching geoId, update transport settings
        if (node.type === 'geoMark' && node.attrs?.geoId === geoId) {
          return {
            ...node,
            attrs: {
              ...node.attrs,
              transportProfile: transportProfile,
              transportFrom: transportFrom,
            },
          };
        }

        // Recursively update children
        if (node.content) {
          return {
            ...node,
            content: node.content.map((child: any) => updateGeoMarkTransport(child)),
          };
        }

        return node;
      };

      const updatedDocument = updateGeoMarkTransport(trip.document);

      await saveDocument({
        ...trip,
        document: updatedDocument,
      });

      Alert.alert('Success', 'Transport settings saved');
    } catch (error) {
      console.error('Failed to save transport settings:', error);
      Alert.alert('Error', 'Failed to save transport settings');
    } finally {
      setIsSavingTransport(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* Navigation Header */}
      <View style={[styles.navigationHeader, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={28} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.navigationTitle} numberOfLines={1}>{shortName}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.scrollView}>
        {/* Photo Banner */}
        {photoUrl && (
          <View style={styles.photoBanner}>
            <Image
              source={{ uri: photoUrl }}
              style={styles.photo}
              resizeMode="cover"
            />
            <View style={styles.photoOverlay}>
              <View style={styles.photoActions}>
                <TouchableOpacity
                  style={styles.iconButton}
                  onPress={handleToggleBookmark}
                  disabled={isToggling}
                >
                  <Ionicons
                    name={bookmarked ? 'bookmark' : 'bookmark-outline'}
                    size={24}
                    color="#fff"
                  />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.iconButton}
                  onPress={() => console.log('Share location:', { name, lat, lng })}
                >
                  <Ionicons name="share-outline" size={24} color="#fff" />
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}

      <View style={styles.content}>
        {/* Map View */}
        <View style={styles.mapContainer}>
          {Platform.OS === 'web' && LocationMapWeb ? (
            // Web map using react-map-gl and deck.gl
            <LocationMapWeb
              latitude={parseFloat(lat)}
              longitude={parseFloat(lng)}
              name={name}
              colorIndex={parseInt(colorIndex || '0')}
              transportFrom={transportFrom && availableLocations.find(loc => loc.id === transportFrom) ? {
                lat: availableLocations.find(loc => loc.id === transportFrom)!.lat,
                lng: availableLocations.find(loc => loc.id === transportFrom)!.lng,
                name: availableLocations.find(loc => loc.id === transportFrom)!.name
              } : null}
              routeGeometry={routeGeometry}
              routeDistance={routeDistance}
              routeDuration={routeDuration}
            />
          ) : Mapbox ? (
          <Mapbox.MapView
            style={styles.map}
            styleURL={Mapbox.StyleURL.Street}
            zoomEnabled={true}
            scrollEnabled={true}
            pitchEnabled={false}
            rotateEnabled={true}
          >
            <Mapbox.Camera
              ref={cameraRef}
              zoomLevel={14}
              centerCoordinate={[parseFloat(lng), parseFloat(lat)]}
              animationDuration={1000}
            />

            {/* Route Line */}
            {routeGeometry && (
              <Mapbox.ShapeSource
                id="routeSource"
                shape={routeGeometry}
              >
                <Mapbox.LineLayer
                  id="routeLine"
                  style={{
                    lineColor: '#f59e0b',
                    lineWidth: 4,
                    lineCap: 'round',
                    lineJoin: 'round',
                  }}
                />
              </Mapbox.ShapeSource>
            )}

            {/* From Location Marker */}
            {transportFrom && availableLocations.find(loc => loc.id === transportFrom) && (
              <Mapbox.PointAnnotation
                id={`from-location-${transportFrom}`}
                coordinate={[
                  availableLocations.find(loc => loc.id === transportFrom)!.lng,
                  availableLocations.find(loc => loc.id === transportFrom)!.lat
                ]}
              >
                <View style={styles.markerContainer}>
                  <Ionicons
                    name="location"
                    size={40}
                    color="#10b981"
                  />
                </View>
              </Mapbox.PointAnnotation>
            )}

            {/* Destination Location Marker */}
            <Mapbox.PointAnnotation
              id={`location-${id}`}
              coordinate={[parseFloat(lng), parseFloat(lat)]}
            >
              <View style={styles.markerContainer}>
                <Ionicons
                  name="location"
                  size={40}
                  color="#007AFF"
                />
              </View>
            </Mapbox.PointAnnotation>
          </Mapbox.MapView>
          ) : (
            // Fallback if Mapbox is not available
            <View style={[styles.map, styles.webMapPlaceholder]}>
              <Ionicons name="map" size={48} color="#9CA3AF" />
              <Text style={styles.webMapText}>Map not available</Text>
            </View>
          )}
        </View>

        {/* Transport Configuration */}
        {tripId && (
          <View style={styles.transportSection}>
            <View style={styles.transportHeader}>
              <Ionicons name="car" size={18} color="#f59e0b" />
              <Text style={styles.transportTitle}>Planned Transport</Text>
            </View>

            {/* Transportation Profile */}
            <View style={styles.transportRow}>
              <Text style={styles.transportLabel}>Mode</Text>
              <View style={styles.transportOptions}>
                <TouchableOpacity
                  style={[
                    styles.transportOption,
                    transportProfile === 'driving' && styles.transportOptionActive
                  ]}
                  onPress={() => setTransportProfile('driving')}
                >
                  <Ionicons
                    name="car"
                    size={20}
                    color={transportProfile === 'driving' ? '#fff' : '#6b7280'}
                  />
                  <Text
                    style={[
                      styles.transportOptionText,
                      transportProfile === 'driving' && styles.transportOptionTextActive
                    ]}
                  >
                    Drive
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.transportOption,
                    transportProfile === 'walking' && styles.transportOptionActive
                  ]}
                  onPress={() => setTransportProfile('walking')}
                >
                  <Ionicons
                    name="walk"
                    size={20}
                    color={transportProfile === 'walking' ? '#fff' : '#6b7280'}
                  />
                  <Text
                    style={[
                      styles.transportOptionText,
                      transportProfile === 'walking' && styles.transportOptionTextActive
                    ]}
                  >
                    Walk
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.transportOption,
                    transportProfile === 'cycling' && styles.transportOptionActive
                  ]}
                  onPress={() => setTransportProfile('cycling')}
                >
                  <Ionicons
                    name="bicycle"
                    size={20}
                    color={transportProfile === 'cycling' ? '#fff' : '#6b7280'}
                  />
                  <Text
                    style={[
                      styles.transportOptionText,
                      transportProfile === 'cycling' && styles.transportOptionTextActive
                    ]}
                  >
                    Bike
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Route From Location */}
            {transportProfile && (
              <View style={styles.transportRow}>
                <Text style={styles.transportLabel}>From</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.locationScroll}
                >
                  <TouchableOpacity
                    style={[
                      styles.locationOption,
                      !transportFrom && styles.locationOptionActive
                    ]}
                    onPress={() => setTransportFrom(null)}
                  >
                    <Text
                      style={[
                        styles.locationOptionText,
                        !transportFrom && styles.locationOptionTextActive
                      ]}
                    >
                      Not set
                    </Text>
                  </TouchableOpacity>

                  {availableLocations.map((loc) => (
                    <TouchableOpacity
                      key={loc.id}
                      style={[
                        styles.locationOption,
                        transportFrom === loc.id && styles.locationOptionActive
                      ]}
                      onPress={() => setTransportFrom(loc.id)}
                    >
                      <Text
                        style={[
                          styles.locationOptionText,
                          transportFrom === loc.id && styles.locationOptionTextActive
                        ]}
                      >
                        {loc.name.split(',')[0].trim()}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}

            {/* Route Info */}
            {routeDistance !== null && routeDuration !== null && (
              <View style={styles.routeInfo}>
                <View style={styles.routeInfoItem}>
                  <Ionicons name="navigate" size={16} color="#6b7280" />
                  <Text style={styles.routeInfoText}>
                    {(routeDistance / 1000).toFixed(1)} km
                  </Text>
                </View>
                <View style={styles.routeInfoItem}>
                  <Ionicons name="time" size={16} color="#6b7280" />
                  <Text style={styles.routeInfoText}>
                    {Math.round(routeDuration / 60)} min
                  </Text>
                </View>
              </View>
            )}

            {/* Save Button */}
            {transportProfile && (
              <TouchableOpacity
                style={styles.saveTransportButton}
                onPress={handleSaveTransport}
                disabled={isSavingTransport}
              >
                <Text style={styles.saveTransportButtonText}>
                  {isSavingTransport ? 'Saving...' : 'Save Transport Settings'}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}

            {/* Context-Specific Notes */}
            {(contextDocument || tripId) && (
              <View style={styles.documentSection}>
                <View style={styles.documentHeader}>
                  <View style={styles.documentHeaderLeft}>
                    <Ionicons name="document-text" size={18} color="#3B82F6" />
                    <Text style={styles.documentTitle}>Notes for this Visit</Text>
                  </View>
                  {tripId && (
                    <TouchableOpacity
                      onPress={() => {
                        const path = `/(app)/trip/${tripId}/location/${locationId || id}/edit-visit` as any;
                        router.push({
                          pathname: path,
                          params: {
                            locationId: locationId || id,
                            tripId,
                            name,
                            contextDocument: contextDocument ? JSON.stringify(contextDocument) : undefined,
                          },
                        });
                      }}
                      style={styles.editButton}
                    >
                      <Ionicons name="pencil" size={16} color="#3B82F6" />
                      <Text style={styles.editButtonText}>Edit</Text>
                    </TouchableOpacity>
                  )}
                </View>
                {contextDocument ? (
                  <ProseMirrorNativeRenderer content={contextDocument} />
                ) : (
                  <Text style={styles.emptyText}>No visit notes yet. Tap Edit to add some.</Text>
                )}
              </View>
            )}

            {/* Overview Section */}
            {description && (
              <View style={styles.section}>
                <Text style={styles.descriptionText}>{description}</Text>
                {description.length > 200 && (
                  <TouchableOpacity>
                    <Text style={styles.readMore}>Read more</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
      </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  navigationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    backgroundColor: '#fff',
  },
  backButton: {
    padding: 4,
    marginLeft: -4,
  },
  navigationTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#111827',
  },
  scrollView: {
    flex: 1,
  },
  photoBanner: {
    width: '100%',
    height: 250,
    position: 'relative',
  },
  photo: {
    width: '100%',
    height: '100%',
  },
  photoOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'flex-start',
    padding: 16,
  },
  photoActions: {
    flexDirection: 'row',
    gap: 12,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flex: 1,
  },
  mapContainer: {
    height: MAP_HEIGHT,
    backgroundColor: '#E5E5EA',
    marginBottom: 16,
  },
  map: {
    flex: 1,
  },
  webMapPlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
  },
  webMapText: {
    marginTop: 8,
    fontSize: 16,
    color: '#6B7280',
  },
  webMapCoords: {
    marginTop: 4,
    fontSize: 14,
    color: '#9CA3AF',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  markerContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  documentSection: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  documentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  documentHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  documentTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
  },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  editButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#3B82F6',
  },
  emptyText: {
    fontSize: 14,
    color: '#9ca3af',
    fontStyle: 'italic',
  },
  transportSection: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  transportHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  transportTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
  },
  transportRow: {
    marginBottom: 16,
  },
  transportLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: '#6b7280',
    marginBottom: 8,
  },
  transportOptions: {
    flexDirection: 'row',
    gap: 8,
  },
  transportOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#f3f4f6',
    borderWidth: 2,
    borderColor: '#e5e7eb',
  },
  transportOptionActive: {
    backgroundColor: '#f59e0b',
    borderColor: '#f59e0b',
  },
  transportOptionText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6b7280',
  },
  transportOptionTextActive: {
    color: '#fff',
  },
  locationScroll: {
    flexGrow: 0,
  },
  locationOption: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: '#f3f4f6',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    marginRight: 8,
  },
  locationOptionActive: {
    backgroundColor: '#f59e0b',
    borderColor: '#f59e0b',
  },
  locationOptionText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#6b7280',
  },
  locationOptionTextActive: {
    color: '#fff',
  },
  saveTransportButton: {
    backgroundColor: '#f59e0b',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  saveTransportButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  routeInfo: {
    flexDirection: 'row',
    gap: 16,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#fef3c7',
    borderRadius: 8,
    marginBottom: 8,
  },
  routeInfoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  routeInfoText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#92400e',
  },
});
