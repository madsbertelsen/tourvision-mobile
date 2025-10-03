import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  SafeAreaView
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
    followMode
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
              photoName: loc.photoName,
            }))}
            height={mapHeight}
            center={{ lat: 0, lng: 0 }}
            zoom={2}
          />
        </View>

        {/* Dynamic content area */}
        <View style={styles.contentContainer}>
          {/* Dynamic Header - only show for location detail pages */}
          {isLocationDetail && (
            <View style={styles.header}>
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
            </View>
          )}

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
    backgroundColor: '#ffffff',
  },
  header: {
    padding: 16,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
    zIndex: 10,
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
  headerTitleWithBack: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    flex: 1,
    textAlign: 'center',
  },
  slotContainer: {
    flex: 1,
  },
});