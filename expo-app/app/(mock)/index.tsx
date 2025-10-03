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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getTrips, createTrip, deleteTrip, type SavedTrip } from '@/utils/trips-storage';

export default function TripListScreen() {
  const router = useRouter();
  const [trips, setTrips] = useState<SavedTrip[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [urlInput, setUrlInput] = useState('');

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
    } catch (error) {
      console.error('Error loading trips:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateTrip = async () => {
    try {
      setIsCreating(true);
      const newTrip = await createTrip('New Trip');
      // Navigate to the new trip
      router.push(`/(mock)/trip/${newTrip.id}`);
    } catch (error) {
      console.error('Error creating trip:', error);
      Alert.alert('Error', 'Failed to create trip');
    } finally {
      setIsCreating(false);
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
      // Navigate to the new trip with the URL as initial message
      router.push({
        pathname: `/(mock)/trip/${newTrip.id}`,
        params: { initialMessage: urlInput.trim() }
      });
      setUrlInput(''); // Clear input
    } catch (error) {
      console.error('Error creating trip:', error);
      Alert.alert('Error', 'Failed to create trip');
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteTrip = async (tripId: string) => {
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

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color="#3B82F6" />
          <Text style={styles.loadingText}>Loading trips...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>My Trips</Text>
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
            <Ionicons name="link-outline" size={64} color="#9CA3AF" />
            <Text style={styles.emptyTitle}>No trips yet</Text>
            <Text style={styles.emptyDescription}>
              Paste a travel guide URL above to extract locations and create your first trip
            </Text>
          </View>
        ) : (
          trips.map((trip) => (
            <TouchableOpacity
              key={trip.id}
              style={styles.tripCard}
              onPress={() => router.push(`/(mock)/trip/${trip.id}`)}
              activeOpacity={0.7}
            >
              <View style={styles.tripCardContent}>
                <View style={styles.tripCardHeader}>
                  <Text style={styles.tripTitle}>{trip.title}</Text>
                  <TouchableOpacity
                    style={styles.deleteButton}
                    onPress={(e) => {
                      e.stopPropagation();
                      handleDeleteTrip(trip.id);
                    }}
                  >
                    <Ionicons name="trash-outline" size={20} color="#EF4444" />
                  </TouchableOpacity>
                </View>

                <Text style={styles.tripPreview} numberOfLines={2}>
                  {getPreviewText(trip)}
                </Text>

                <View style={styles.tripFooter}>
                  <View style={styles.tripStats}>
                    <Ionicons name="chatbubble-outline" size={14} color="#6B7280" />
                    <Text style={styles.tripStatsText}>{trip.messages.length}</Text>
                    <Ionicons name="location-outline" size={14} color="#6B7280" style={{ marginLeft: 12 }} />
                    <Text style={styles.tripStatsText}>{trip.locations.length}</Text>
                  </View>
                  <Text style={styles.tripDate}>{formatDate(trip.updatedAt)}</Text>
                </View>
              </View>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#6B7280',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#111827',
  },
  urlInputSection: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    gap: 12,
  },
  urlInputContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingHorizontal: 12,
  },
  urlInputIcon: {
    marginRight: 8,
  },
  urlInput: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 15,
    color: '#111827',
  },
  clearButton: {
    padding: 4,
  },
  submitButton: {
    backgroundColor: '#3B82F6',
    width: 48,
    height: 48,
    borderRadius: 12,
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
    padding: 16,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#111827',
    marginTop: 16,
  },
  emptyDescription: {
    fontSize: 15,
    color: '#6B7280',
    marginTop: 8,
    textAlign: 'center',
  },
  emptyCreateButton: {
    marginTop: 24,
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: '#EFF6FF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#3B82F6',
  },
  emptyCreateButtonText: {
    color: '#3B82F6',
    fontSize: 16,
    fontWeight: '600',
  },
  tripCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  tripCardContent: {
    padding: 16,
  },
  tripCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  tripTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    flex: 1,
  },
  deleteButton: {
    padding: 4,
  },
  tripPreview: {
    fontSize: 14,
    color: '#6B7280',
    lineHeight: 20,
    marginBottom: 12,
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
    fontSize: 13,
    color: '#6B7280',
    marginLeft: 4,
  },
  tripDate: {
    fontSize: 13,
    color: '#9CA3AF',
  },
});
