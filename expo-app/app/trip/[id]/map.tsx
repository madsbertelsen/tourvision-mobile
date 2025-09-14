import MapView from '@/components/dom/MapViewDOM.tsx';
import { Suspense, useMemo } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

// Sample data - in production this would come from context or props
const SAMPLE_ITINERARY = {
  days: [
    {
      day: 1,
      places: [
        {
          id: 'eiffel-tower',
          name: 'Eiffel Tower',
          time: '9:00 AM - 11:00 AM',
          period: 'Morning',
          lat: 48.8584,
          lng: 2.2945,
          colorIndex: 0,
        },
        {
          id: 'arc-triomphe',
          name: 'Arc de Triomphe',
          time: '2:00 PM - 3:30 PM',
          period: 'Afternoon',
          lat: 48.8738,
          lng: 2.2950,
          colorIndex: 1,
        },
        {
          id: 'seine-cruise',
          name: 'Seine River Cruise',
          time: '6:00 PM - 8:00 PM',
          period: 'Evening',
          lat: 48.8606,
          lng: 2.3376,
          colorIndex: 2,
        },
      ],
    },
    {
      day: 2,
      places: [
        {
          id: 'louvre',
          name: 'Louvre Museum',
          time: '9:00 AM - 1:00 PM',
          period: 'Morning',
          lat: 48.8606,
          lng: 2.3376,
          colorIndex: 0,
        },
        {
          id: 'orsay',
          name: 'Musée d\'Orsay',
          time: '2:30 PM - 5:00 PM',
          period: 'Afternoon',
          lat: 48.8600,
          lng: 2.3266,
          colorIndex: 1,
        },
        {
          id: 'latin-quarter',
          name: 'Latin Quarter',
          time: '6:00 PM - 9:00 PM',
          period: 'Evening',
          lat: 48.8513,
          lng: 2.3459,
          colorIndex: 2,
        },
      ],
    },
  ],
};

export default function MapTab() {
  // Get all locations for the map
  const allLocations = useMemo(() => {
    return SAMPLE_ITINERARY.days.flatMap((day) =>
      day.places.map((place) => ({
        id: place.id,
        name: place.name,
        lat: place.lat,
        lng: place.lng,
        description: `${place.period} • ${place.time}`,
        colorIndex: place.colorIndex,
      }))
    );
  }, []);

  return (
    <View style={styles.container}>
      <Suspense fallback={
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#3B82F6" />
        </View>
      }>
        <MapView 
          locations={allLocations}
          style={{ width: '100%', height: '100%' }}
        />
      </Suspense>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#E5E5E5',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});