import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  TextInput,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getTrips, createTrip, deleteTrip, type SavedTrip } from '@/utils/trips-storage';
import { useAuth } from '@/lib/supabase/auth-context';
import { router } from 'expo-router';

interface TripsSidebarProps {
  selectedTripId?: string | null;
  onTripSelect: (tripId: string, initialMessage?: string) => void;
  onLocationSelect?: (tripId: string, locationId: string, location: any) => void;
  onTripsChange?: () => void;
}

export default function TripsSidebar({ selectedTripId, onTripSelect, onLocationSelect, onTripsChange }: TripsSidebarProps) {
  const { signOut } = useAuth();
  const [trips, setTrips] = useState<SavedTrip[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const [expandedTrips, setExpandedTrips] = useState<Set<string>>(new Set());

  // Load trips on mount
  useEffect(() => {
    loadTrips();
  }, []);

  const loadTrips = async () => {
    try {
      setIsLoading(true);
      const loadedTrips = await getTrips();
      // Sort by updatedAt descending (most recent first)
      loadedTrips.sort((a, b) => b.updatedAt - a.updatedAt);
      setTrips(loadedTrips);
      onTripsChange?.();
    } catch (error) {
      console.error('Error loading trips:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmitUrl = async () => {
    if (!urlInput.trim()) {
      Alert.alert('Please enter a URL', 'Enter a travel guide or blog URL to get started');
      return;
    }

    try {
      setIsCreating(true);
      const newTrip = await createTrip('New Trip');
      // Select the new trip with the URL as initial message
      onTripSelect(newTrip.id, urlInput.trim());
      setUrlInput(''); // Clear input
      await loadTrips();
    } catch (error) {
      console.error('Error creating trip:', error);
      Alert.alert('Error', 'Failed to create trip');
    } finally {
      setIsCreating(false);
    }
  };

  const handleCreateBlankTrip = async () => {
    try {
      setIsCreating(true);
      const newTrip = await createTrip('New Trip');
      // Select the new trip without initial message
      onTripSelect(newTrip.id);
      await loadTrips();
    } catch (error) {
      console.error('Error creating trip:', error);
      Alert.alert('Error', 'Failed to create trip');
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteTrip = async (tripId: string, e?: any) => {
    e?.stopPropagation();

    Alert.alert(
      'Delete Trip',
      'Are you sure you want to delete this trip?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteTrip(tripId);
              await loadTrips();
            } catch (error) {
              console.error('Error deleting trip:', error);
              Alert.alert('Error', 'Failed to delete trip');
            }
          },
        },
      ]
    );
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;

    return date.toLocaleDateString();
  };

  const getPreviewText = (trip: SavedTrip) => {
    if (trip.messages.length === 0) return 'No messages yet';

    const lastMessage = trip.messages[trip.messages.length - 1];
    if (typeof lastMessage.content === 'string') {
      // Strip HTML tags for preview
      const text = lastMessage.content.replace(/<[^>]*>/g, '');
      return text.length > 100 ? text.substring(0, 100) + '...' : text;
    }

    return 'Tap to continue conversation';
  };

  // Extract locations from the latest itinerary document
  const extractLocationsFromTrip = (trip: SavedTrip) => {
    if (!trip.itineraries || trip.itineraries.length === 0) {
      return [];
    }

    const latestItinerary = trip.itineraries[trip.itineraries.length - 1];
    if (!latestItinerary.document || !latestItinerary.document.content) {
      return [];
    }

    const locations: Array<{
      id: string;
      name: string;
      lat: number;
      lng: number;
      description?: string;
      colorIndex?: number;
      photoName?: string;
    }> = [];

    const traverse = (node: any) => {
      if (node.type === 'geoMark' && node.attrs?.lat && node.attrs?.lng) {
        const lat = parseFloat(node.attrs.lat);
        const lng = parseFloat(node.attrs.lng);
        if (!isNaN(lat) && !isNaN(lng)) {
          locations.push({
            id: node.attrs.geoId || `loc-${locations.length}`,
            name: node.attrs.placeName || 'Location',
            lat,
            lng,
            description: node.attrs.description,
            colorIndex: node.attrs.colorIndex,
            photoName: node.attrs.photoName,
          });
        }
      }
      if (node.content) {
        node.content.forEach(traverse);
      }
    };

    if (latestItinerary.document.content) {
      latestItinerary.document.content.forEach(traverse);
    }

    return locations;
  };

  const toggleTripExpanded = (tripId: string) => {
    setExpandedTrips(prev => {
      const newSet = new Set(prev);
      if (newSet.has(tripId)) {
        newSet.delete(tripId);
      } else {
        newSet.add(tripId);
      }
      return newSet;
    });
  };

  const handleLogout = async () => {
    console.log('[TripsSidebar] handleLogout called');

    // On web, use window.confirm instead of Alert.alert
    if (Platform.OS === 'web') {
      const confirmed = window.confirm('Are you sure you want to log out?');
      console.log('[TripsSidebar] Web confirm result:', confirmed);
      if (!confirmed) {
        console.log('[TripsSidebar] Logout cancelled');
        return;
      }

      try {
        console.log('[TripsSidebar] User confirmed logout');
        await signOut();
        console.log('[TripsSidebar] Sign out successful, navigating to login...');
        router.push('/(auth)/login');
      } catch (error: any) {
        console.error('[TripsSidebar] Logout error:', error);
        window.alert('Failed to log out: ' + (error.message || 'Unknown error'));
      }
    } else {
      // Native Alert.alert for mobile
      Alert.alert(
        'Log Out',
        'Are you sure you want to log out?',
        [
          {
            text: 'Cancel',
            style: 'cancel',
            onPress: () => console.log('[TripsSidebar] Logout cancelled')
          },
          {
            text: 'Log Out',
            style: 'destructive',
            onPress: async () => {
              try {
                console.log('[TripsSidebar] User confirmed logout');
                await signOut();
                console.log('[TripsSidebar] Sign out successful, navigating to login...');
                router.push('/(auth)/login');
              } catch (error: any) {
                console.error('[TripsSidebar] Logout error:', error);
                Alert.alert('Error', error.message || 'Failed to log out');
              }
            },
          },
        ]
      );
    }
  };

  if (isLoading) {
    return (
      <View style={styles.container}>
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color="#3B82F6" />
          <Text style={styles.loadingText}>Loading trips...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>My Trips</Text>
      </View>

      {/* New Trip Button */}
      <View style={styles.newTripSection}>
        <TouchableOpacity
          style={styles.newTripButton}
          onPress={handleCreateBlankTrip}
          disabled={isCreating}
        >
          {isCreating ? (
            <ActivityIndicator size="small" color="#3B82F6" />
          ) : (
            <>
              <Ionicons name="add-circle-outline" size={20} color="#3B82F6" />
              <Text style={styles.newTripButtonText}>New Trip</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* URL Input Section */}
      <View style={styles.urlInputSection}>
        <View style={styles.urlInputContainer}>
          <Ionicons name="link-outline" size={20} color="#6B7280" style={styles.urlInputIcon} />
          <TextInput
            style={styles.urlInput}
            placeholder="Paste a travel guide URL to get started..."
            value={urlInput}
            onChangeText={setUrlInput}
            onSubmitEditing={handleSubmitUrl}
            returnKeyType="go"
            autoCapitalize="none"
            autoCorrect={false}
            editable={!isCreating}
          />
          {urlInput.length > 0 && !isCreating && (
            <TouchableOpacity onPress={() => setUrlInput('')} style={styles.clearButton}>
              <Ionicons name="close-circle" size={20} color="#9CA3AF" />
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity
          style={[styles.submitButton, !urlInput.trim() && styles.submitButtonDisabled]}
          onPress={handleSubmitUrl}
          disabled={!urlInput.trim() || isCreating}
        >
          {isCreating ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Ionicons name="arrow-forward" size={20} color="#fff" />
          )}
        </TouchableOpacity>
      </View>

      {/* Trip List */}
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {trips.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="link-outline" size={48} color="#9CA3AF" />
            <Text style={styles.emptyTitle}>No trips yet</Text>
            <Text style={styles.emptyDescription}>
              Paste a travel guide URL above to get started
            </Text>
          </View>
        ) : (
          trips.map((trip) => {
            const locations = extractLocationsFromTrip(trip);
            const isExpanded = expandedTrips.has(trip.id);

            return (
              <View key={trip.id} style={styles.tripCardContainer}>
                <TouchableOpacity
                  style={[
                    styles.tripCard,
                    selectedTripId === trip.id && styles.tripCardSelected
                  ]}
                  onPress={() => onTripSelect(trip.id)}
                  activeOpacity={0.7}
                >
                  <View style={styles.tripCardContent}>
                    <View style={styles.tripCardHeader}>
                      <View style={styles.tripCardTitleRow}>
                        {locations.length > 0 && (
                          <TouchableOpacity
                            style={styles.expandButton}
                            onPress={(e) => {
                              e.stopPropagation();
                              toggleTripExpanded(trip.id);
                            }}
                          >
                            <Ionicons
                              name={isExpanded ? "chevron-down" : "chevron-forward"}
                              size={16}
                              color="#6B7280"
                            />
                          </TouchableOpacity>
                        )}
                        <Text style={styles.tripTitle} numberOfLines={1}>{trip.title}</Text>
                      </View>
                      <TouchableOpacity
                        style={styles.deleteButton}
                        onPress={(e) => handleDeleteTrip(trip.id, e)}
                      >
                        <Ionicons name="trash-outline" size={18} color="#EF4444" />
                      </TouchableOpacity>
                    </View>

                    <Text style={styles.tripPreview} numberOfLines={2}>
                      {getPreviewText(trip)}
                    </Text>

                    <View style={styles.tripFooter}>
                      <View style={styles.tripStats}>
                        <Ionicons name="chatbubble-outline" size={12} color="#6B7280" />
                        <Text style={styles.tripStatsText}>{trip.messages.length}</Text>
                        <Ionicons name="location-outline" size={12} color="#6B7280" style={{ marginLeft: 8 }} />
                        <Text style={styles.tripStatsText}>{locations.length}</Text>
                      </View>
                      <Text style={styles.tripDate}>{formatDate(trip.updatedAt)}</Text>
                    </View>
                  </View>
                </TouchableOpacity>

                {/* Nested locations */}
                {isExpanded && locations.length > 0 && (
                  <View style={styles.locationsContainer}>
                    {locations.map((location) => (
                      <TouchableOpacity
                        key={location.id}
                        style={styles.locationItem}
                        onPress={() => onLocationSelect?.(trip.id, location.id, location)}
                        activeOpacity={0.7}
                      >
                        <View style={styles.locationDot} />
                        <Ionicons name="location" size={14} color="#6B7280" style={{ marginRight: 6 }} />
                        <Text style={styles.locationName} numberOfLines={1}>{location.name}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>
            );
          })
        )}
      </ScrollView>

      {/* Logout Button at Bottom */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.logoutButton}
          onPress={handleLogout}
        >
          <Ionicons name="log-out-outline" size={20} color="#EF4444" />
          <Text style={styles.logoutButtonText}>Log Out</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
    width: 320,
    borderRightWidth: 1,
    borderRightColor: '#E5E7EB',
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#6B7280',
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#111827',
  },
  newTripSection: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  newTripButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EFF6FF',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    gap: 8,
  },
  newTripButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#3B82F6',
  },
  urlInputSection: {
    flexDirection: 'column',
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    gap: 8,
  },
  urlInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingHorizontal: 10,
  },
  urlInputIcon: {
    marginRight: 6,
  },
  urlInput: {
    flex: 1,
    paddingVertical: 10,
    fontSize: 14,
    color: '#111827',
  },
  clearButton: {
    padding: 4,
  },
  submitButton: {
    backgroundColor: '#3B82F6',
    height: 40,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  submitButtonDisabled: {
    backgroundColor: '#9CA3AF',
    opacity: 0.5,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 12,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginTop: 12,
  },
  emptyDescription: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 6,
    textAlign: 'center',
    paddingHorizontal: 16,
  },
  tripCard: {
    backgroundColor: '#fff',
    borderRadius: 10,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  tripCardSelected: {
    borderWidth: 2,
    borderColor: '#3B82F6',
  },
  tripCardContent: {
    padding: 12,
  },
  tripCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  tripTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
    flex: 1,
  },
  deleteButton: {
    padding: 4,
  },
  tripPreview: {
    fontSize: 13,
    color: '#6B7280',
    lineHeight: 18,
    marginBottom: 8,
  },
  tripFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  tripStats: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  tripStatsText: {
    fontSize: 12,
    color: '#6B7280',
    marginLeft: 3,
  },
  tripDate: {
    fontSize: 11,
    color: '#9CA3AF',
  },
  tripCardContainer: {
    marginBottom: 10,
  },
  tripCardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  expandButton: {
    padding: 4,
    marginRight: 4,
  },
  locationsContainer: {
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    marginTop: 4,
    marginLeft: 8,
    padding: 8,
    borderLeftWidth: 2,
    borderLeftColor: '#E5E7EB',
  },
  locationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 6,
    marginBottom: 2,
  },
  locationDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#9CA3AF',
    marginRight: 8,
  },
  locationName: {
    flex: 1,
    fontSize: 13,
    color: '#374151',
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#EF4444',
    backgroundColor: '#FEF2F2',
  },
  logoutButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#EF4444',
  },
});
