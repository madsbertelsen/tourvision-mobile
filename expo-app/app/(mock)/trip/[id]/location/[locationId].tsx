import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Linking,
  Platform,
  Image,
  Dimensions
} from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useBookmark } from '@/hooks/useBookmark';
import Mapbox from '@rnmapbox/maps';
import { getTrip } from '@/utils/trips-storage';
import ProseMirrorNativeRenderer from '@/components/ProseMirrorNativeRenderer';

// Set Mapbox access token
Mapbox.setAccessToken(process.env.EXPO_PUBLIC_MAPBOX_TOKEN || '');

const { width: SCREEN_WIDTH } = Dimensions.get('window');
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

  const [locationDocument, setLocationDocument] = useState<any>(null);
  const [contextDocument, setContextDocument] = useState<any>(null);
  const cameraRef = useRef<Mapbox.Camera>(null);

  // Use bookmark hook
  const { bookmarked, isToggling, toggle: handleToggleBookmark } = useBookmark({
    id,
    name,
    lat,
    lng,
    description,
    photoName,
  });

  // Load trip data and extract documents - reload when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      const loadDocuments = async () => {
        // Load from trip storage if tripId is available
        if (tripId) {
          try {
            const trip = await getTrip(tripId);
            if (trip) {
              const geoId = locationId || id;

              // Load location document from trip.locations
              const location = trip.locations?.find(
                (loc) => loc.geoId === geoId || loc.id === geoId
              );
              if (location?.document) {
                setLocationDocument(location.document);
              } else {
                setLocationDocument(null);
              }

              // Load context document from geo-mark in trip.document
              const findContextDocument = (node: any): any => {
                if (!node) return null;

                // Check text nodes for geo-mark marks
                if (node.type === 'text' && node.marks) {
                  const geoMarkMark = node.marks.find(
                    (mark: any) => mark.type === 'geoMark' && mark.attrs?.geoId === geoId
                  );
                  if (geoMarkMark?.attrs?.contextDocument) {
                    return geoMarkMark.attrs.contextDocument;
                  }
                }

                // Recursively search children
                if (node.content) {
                  for (const child of node.content) {
                    const found = findContextDocument(child);
                    if (found) return found;
                  }
                }

                return null;
              };

              const foundContext = trip.document ? findContextDocument(trip.document) : null;
              if (foundContext) {
                setContextDocument(foundContext);
              } else if (contextDocParam) {
                // Fallback to params if not found in trip document
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

  // Format coordinates for display
  const formatCoordinate = (coord: string, type: 'lat' | 'lng') => {
    const value = parseFloat(coord);
    if (isNaN(value)) return coord;

    if (type === 'lat') {
      return `${Math.abs(value).toFixed(6)}° ${value >= 0 ? 'N' : 'S'}`;
    } else {
      return `${Math.abs(value).toFixed(6)}° ${value >= 0 ? 'E' : 'W'}`;
    }
  };

  // Open in maps app
  const openInMaps = () => {
    const scheme = Platform.select({
      ios: 'maps:',
      android: 'geo:',
    });
    const latLng = `${lat},${lng}`;
    const label = encodeURIComponent(name);

    const url = Platform.select({
      ios: `${scheme}${latLng}?q=${label}`,
      android: `${scheme}${latLng}?q=${label}`,
      web: `https://www.google.com/maps/search/?api=1&query=${label}&query_place_id=${latLng}`
    });

    if (url) {
      Linking.openURL(url);
    }
  };

  // Photo URL from Google Places
  const photoUrl = photoName
    ? `https://places.googleapis.com/v1/${photoName}/media?maxHeightPx=600&key=${process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY}`
    : null;

  return (
    <View style={styles.container}>
      {/* Navigation Header */}
      <View style={[styles.navigationHeader, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={28} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.navigationTitle}>Location</Text>
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
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.locationName}>{name}</Text>
          <View style={styles.subtitle}>
            <Ionicons name="location-sharp" size={14} color="#6b7280" />
            <Text style={styles.subtitleText}>Attraction</Text>
          </View>
          {!photoUrl && (
            <TouchableOpacity
              style={styles.headerBookmark}
              onPress={handleToggleBookmark}
              disabled={isToggling}
            >
              <Ionicons
                name={bookmarked ? 'bookmark' : 'bookmark-outline'}
                size={24}
                color={bookmarked ? '#3B82F6' : '#6b7280'}
              />
            </TouchableOpacity>
          )}
        </View>

        {/* Map View */}
        <View style={styles.mapContainer}>
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

            {/* Location Marker */}
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
        </View>
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
                        const path = `/(mock)/trip/${tripId}/location/${locationId || id}/edit-visit` as any;
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

            {/* General Location Notes */}
            {tripId && (
              <View style={styles.documentSection}>
                <View style={styles.documentHeader}>
                  <View style={styles.documentHeaderLeft}>
                    <Ionicons name="information-circle" size={18} color="#10b981" />
                    <Text style={styles.documentTitle}>General Information</Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => {
                      const path = `/(mock)/trip/${tripId}/location/${locationId || id}/edit-info` as any;
                      router.push({
                        pathname: path,
                        params: {
                          locationId: locationId || id,
                          tripId,
                          name,
                          lat,
                          lng,
                          description,
                          photoName,
                          colorIndex,
                        },
                      });
                    }}
                    style={styles.editButton}
                  >
                    <Ionicons name="pencil" size={16} color="#10b981" />
                    <Text style={styles.editButtonText}>Edit</Text>
                  </TouchableOpacity>
                </View>
                {locationDocument ? (
                  <ProseMirrorNativeRenderer content={locationDocument} />
                ) : (
                  <Text style={styles.emptyText}>No general information yet. Tap Edit to add some.</Text>
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

            {/* Action Buttons */}
            <View style={styles.actionButtonsContainer}>
              <TouchableOpacity style={styles.actionButtonPrimary} onPress={openInMaps}>
                <Ionicons name="navigate" size={20} color="#fff" />
                <Text style={styles.actionButtonPrimaryText}>Directions</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.actionButtonSecondary}>
                <Ionicons name="call-outline" size={20} color="#3B82F6" />
                <Text style={styles.actionButtonSecondaryText}>Call</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.actionButtonSecondary}>
                <Ionicons name="globe-outline" size={20} color="#3B82F6" />
                <Text style={styles.actionButtonSecondaryText}>Website</Text>
              </TouchableOpacity>
            </View>

            {/* Coordinates Info */}
            <View style={styles.infoSection}>
              <View style={styles.infoRow}>
                <Ionicons name="location-outline" size={20} color="#6b7280" />
                <View style={styles.infoContent}>
                  <Text style={styles.infoLabel}>Coordinates</Text>
                  <Text style={styles.infoValue}>
                    {formatCoordinate(lat, 'lat')}, {formatCoordinate(lng, 'lng')}
                  </Text>
                </View>
              </View>
            </View>

        {/* Mentioned in trip */}
        <View style={styles.mentionedSection}>
          <Ionicons name="map-outline" size={16} color="#6b7280" />
          <Text style={styles.mentionedText}>
            Part of your trip itinerary
          </Text>
        </View>
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
    fontSize: 17,
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
  header: {
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  locationName: {
    fontSize: 26,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 4,
  },
  subtitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  subtitleText: {
    fontSize: 13,
    color: '#6b7280',
  },
  headerBookmark: {
    position: 'absolute',
    top: 20,
    right: 16,
  },
  section: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  descriptionText: {
    fontSize: 15,
    color: '#111827',
    lineHeight: 22,
  },
  readMore: {
    fontSize: 15,
    color: '#3B82F6',
    fontWeight: '500',
    marginTop: 8,
  },
  actionButtonsContainer: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  actionButtonPrimary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#3B82F6',
    borderRadius: 8,
    paddingVertical: 12,
    gap: 8,
  },
  actionButtonPrimaryText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  actionButtonSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f3f4f6',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: 6,
  },
  actionButtonSecondaryText: {
    color: '#3B82F6',
    fontSize: 15,
    fontWeight: '600',
  },
  infoSection: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  infoContent: {
    flex: 1,
  },
  infoLabel: {
    fontSize: 13,
    color: '#6b7280',
    marginBottom: 2,
  },
  infoValue: {
    fontSize: 15,
    color: '#111827',
  },
  mentionedSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#f9fafb',
  },
  mentionedText: {
    fontSize: 13,
    color: '#6b7280',
  },
  mapContainer: {
    height: MAP_HEIGHT,
    backgroundColor: '#E5E5EA',
    marginBottom: 16,
  },
  map: {
    flex: 1,
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
});
