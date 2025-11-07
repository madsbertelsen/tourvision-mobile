import DocumentsSidebar from '@/components/DocumentsSidebar';
import { AppProvider } from '@/contexts/AppContext';
import { PresentationProvider } from '@/contexts/presentation-context';
import { useRouter } from 'expo-router';
import { Drawer } from 'expo-router/drawer';
import React from 'react';
import {
  View,
  useWindowDimensions,
} from 'react-native';

// Custom drawer content
function CustomDrawerContent(props: any) {
  const router = useRouter();

  const handleTripSelect = (tripId: string, initialMessage?: string) => {
    // Navigate to document detail page using proper dynamic route syntax
    router.push({
      pathname: '/(app)/document/[id]' as any,
      params: {
        id: tripId,
        ...(initialMessage ? { initialMessage } : {})
      }
    });
    // Close drawer on mobile
    props.navigation.closeDrawer();
  };

  const handleLocationSelect = (tripId: string, locationId: string, location: any) => {
    // Navigate to location detail page using proper dynamic route syntax
    router.push({
      pathname: '/(app)/document/[id]/location/[locationId]' as any,
      params: {
        id: tripId,
        locationId: locationId,
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
      <DocumentsSidebar
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
        name="document/[id]"
        options={{
          title: 'Document Detail',
          drawerLabel: () => null, // Hide from drawer menu
          headerShown: false, // Hide header for nested stack
        }}
      />
      <Drawer.Screen
        name="create-location"
        options={{
          title: 'Create Location',
          drawerLabel: () => null, // Hide from drawer menu
          headerShown: false, // Screen has its own header
        }}
      />
      <Drawer.Screen
        name="prosemirror-test"
        options={{
          title: 'ProseMirror Test',
          drawerLabel: () => null, // Hide from drawer menu
          headerShown: false, // Screen has its own header
        }}
      />
      <Drawer.Screen
        name="link-preview-test"
        options={{
          title: 'Link Preview Test',
          drawerLabel: () => null, // Hide from drawer menu
          headerShown: false, // Screen has its own header
        }}
      />
      <Drawer.Screen
        name="prompt-trip"
        options={{
          title: 'Generate Trip',
          drawerLabel: () => null, // Hide from drawer menu
          headerShown: false, // Screen has its own header
        }}
      />
      <Drawer.Screen
        name="generate-trip"
        options={{
          title: 'New Document',
          drawerLabel: () => null, // Hide from drawer menu
          headerShown: false, // Screen has its own header
        }}
      />
      <Drawer.Screen
        name="test-modal-top"
        options={{
          title: 'Test Modal',
          drawerLabel: () => null, // Hide from drawer menu
          headerShown: false,
          presentation: 'transparentModal',
          animation: 'slide_from_bottom',
        }}
      />
    </Drawer>
  );
}

export default function MockLayout() {
  return (
    <AppProvider>
      <PresentationProvider>
        <MockLayoutContent />
      </PresentationProvider>
    </AppProvider>
  );
}

