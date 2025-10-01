import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  SafeAreaView,
  Switch
} from 'react-native';
import { Stack, usePathname, useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { MapViewSimpleWrapper } from '@/components/MapViewSimpleWrapper';
import { MockProvider, useMockContext } from '@/contexts/MockContext';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

function MockLayoutContent() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useLocalSearchParams();
  const {
    visibleLocations,
    focusedLocation,
    setFocusedLocation,
    followMode,
    setFollowMode
  } = useMockContext();

  // Determine if we're on a location detail page
  const isLocationDetail = pathname.includes('/location/');
  const locationName = params.name as string || 'Location';

  // Map height - 40% of screen
  const mapHeight = screenHeight * 0.4;

  // Helper to get color index
  const getColorIndex = (color?: string): number => {
    if (!color) return 0;
    const MARKER_COLORS = [
      '#3B82F6', '#8B5CF6', '#10B981', '#F59E0B', '#EF4444',
      '#EC4899', '#06B6D4', '#84CC16', '#F97316', '#6366F1'
    ];
    const index = MARKER_COLORS.indexOf(color);
    return index >= 0 ? index : 0;
  };

  // Removed bounds change handler - no longer needed

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.mainContainer}>
        {/* Map - Always visible at top */}
        <View style={styles.mapContainer}>
          <MapViewSimpleWrapper
            locations={visibleLocations.map((loc, idx) => ({
              id: loc.id || `loc-${idx}`,
              name: loc.name,
              lat: loc.lat,
              lng: loc.lng,
              colorIndex: loc.colorIndex || getColorIndex(loc.color),
            }))}
            height={mapHeight}
            center={{ lat: 0, lng: 0 }}
            zoom={2}
          />
        </View>

        {/* Dynamic content area with header */}
        <View style={styles.contentContainer}>
          {/* Dynamic Header */}
          <View style={styles.header}>
            {isLocationDetail ? (
              <View style={styles.headerWithBack}>
                <TouchableOpacity
                  style={styles.backButton}
                  onPress={() => {
                    // Simply clear focused location and go back
                    // The map component will handle restoration internally
                    setFocusedLocation(null);
                    router.back();
                  }}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Ionicons name="arrow-back" size={24} color="#111827" />
                </TouchableOpacity>
                <Text style={styles.headerTitleWithBack}>{locationName}</Text>
                <View style={styles.backButton} />
              </View>
            ) : (
              <>
                <View style={styles.headerTitleRow}>
                  <Text style={styles.headerTitle}>Travel Assistant</Text>
                  <View style={styles.followToggle}>
                    <Ionicons
                      name={followMode ? "navigate" : "navigate-outline"}
                      size={16}
                      color={followMode ? "#3B82F6" : "#6b7280"}
                    />
                    <Text style={[styles.followLabel, followMode && styles.followLabelActive]}>
                      Follow
                    </Text>
                    <Switch
                      value={followMode}
                      onValueChange={setFollowMode}
                      trackColor={{ false: '#d1d5db', true: '#93c5fd' }}
                      thumbColor={followMode ? '#3B82F6' : '#f3f4f6'}
                      ios_backgroundColor="#d1d5db"
                      style={styles.switch}
                    />
                  </View>
                </View>
                <Text style={styles.headerSubtitle}>
                  Share a travel URL or ask about any destination
                </Text>
              </>
            )}
          </View>

          {/* Content area - changes based on route */}
          <View style={styles.slotContainer}>
            <Stack
              screenOptions={{
                headerShown: false, // We have our own header
                animation: 'slide_from_right',
              }}
            >
              <Stack.Screen
                name="index"
                options={{
                  title: 'Chat',
                }}
              />
              <Stack.Screen
                name="location/[id]"
                options={{
                  title: 'Location Detail',
                  presentation: 'card',
                }}
              />
            </Stack>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

export default function MockLayout() {
  return (
    <MockProvider>
      <MockLayoutContent />
    </MockProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  mainContainer: {
    flex: 1,
    flexDirection: 'column',
  },
  mapContainer: {
    width: screenWidth,
    height: screenHeight * 0.4,
    backgroundColor: '#f3f4f6',
  },
  contentContainer: {
    flex: 1,
    flexDirection: 'column',
    backgroundColor: 'rgba(255, 255, 255, 0.98)',
  },
  header: {
    padding: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  followToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  followLabel: {
    fontSize: 13,
    color: '#6b7280',
    fontWeight: '500',
  },
  followLabelActive: {
    color: '#3B82F6',
  },
  switch: {
    transform: [{ scaleX: 0.9 }, { scaleY: 0.9 }],
  },
  headerWithBack: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#111827',
  },
  headerTitleWithBack: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    flex: 1,
    textAlign: 'center',
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 4,
  },
  slotContainer: {
    flex: 1,
  },
});