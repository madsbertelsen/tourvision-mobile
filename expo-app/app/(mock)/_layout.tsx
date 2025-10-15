import { MockProvider } from '@/contexts/MockContext';
import { Drawer } from 'expo-router/drawer';
import { useRouter } from 'expo-router';
import React from 'react';
import {
  View,
  useWindowDimensions,
} from 'react-native';
import TripsSidebar from '@/components/TripsSidebar';

// Custom drawer content
function CustomDrawerContent(props: any) {
  const router = useRouter();

  const handleTripSelect = (tripId: string, initialMessage?: string) => {
    // Navigate to trip detail page
    router.push({
      pathname: `/(mock)/trip/${tripId}`,
      params: initialMessage ? { initialMessage } : undefined
    });
    // Close drawer on mobile
    props.navigation.closeDrawer();
  };

  const handleLocationSelect = (tripId: string, locationId: string, location: any) => {
    // Navigate to location detail page
    router.push({
      pathname: `/(mock)/trip/${tripId}/location/${locationId}`,
      params: {
        id: locationId,
        name: location.name,
        lat: location.lat.toString(),
        lng: location.lng.toString(),
        description: location.description || '',
        colorIndex: location.colorIndex?.toString() || '0',
        photoName: location.photoName || '',
      }
    });
    // Close drawer on mobile
    props.navigation.closeDrawer();
  };

  return (
    <View style={{ flex: 1 }}>
      <TripsSidebar
        selectedTripId={null}
        onTripSelect={handleTripSelect}
        onLocationSelect={handleLocationSelect}
      />
    </View>
  );
}

function MockLayoutContent() {
  const { width: windowWidth } = useWindowDimensions();
  const isLargeScreen = windowWidth >= 1024;

  return (
    <Drawer
      drawerContent={(props) => <CustomDrawerContent {...props} />}
      screenOptions={{
        drawerStyle: {
          width: 320,
        },
        drawerType: isLargeScreen ? 'permanent' : 'front',
        headerShown: true,
        headerTitle: 'TourVision',
        headerStyle: {
          backgroundColor: '#fff',
        },
        headerTintColor: '#111827',
      }}
    >
      <Drawer.Screen
        name="index"
        options={{
          title: 'Trips',
          drawerLabel: 'Trips',
        }}
      />
      <Drawer.Screen
        name="trip/[id]"
        options={{
          title: 'Trip Detail',
          drawerLabel: () => null, // Hide from drawer menu
          headerShown: false, // Hide header for nested stack
        }}
      />
      <Drawer.Screen
        name="location/[id]"
        options={{
          title: 'Location Detail',
          drawerLabel: () => null, // Hide from drawer menu
        }}
      />
      <Drawer.Screen
        name="create-location"
        options={{
          title: 'Create Location',
          drawerLabel: () => null, // Hide from drawer menu
          headerShown: false, // Screen has its own header
          presentation: 'modal',
        }}
      />
    </Drawer>
  );
}

export default function MockLayout() {
  return (
    <MockProvider>
      <MockLayoutContent />
    </MockProvider>
  );
}

