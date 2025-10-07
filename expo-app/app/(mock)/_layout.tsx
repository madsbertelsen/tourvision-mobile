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

  return (
    <View style={{ flex: 1 }}>
      <TripsSidebar
        selectedTripId={null}
        onTripSelect={handleTripSelect}
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
        }}
      />
      <Drawer.Screen
        name="location/[id]"
        options={{
          title: 'Location Detail',
          drawerLabel: () => null, // Hide from drawer menu
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

