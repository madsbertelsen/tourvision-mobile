import { useResponsive } from '@/hooks/useResponsive';
import { useTrip } from '@/hooks/useTrips';
import { Feather, Ionicons } from '@expo/vector-icons';
import { Tabs, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Platform, Text, TouchableOpacity, View } from 'react-native';

export default function TripTabLayout() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const responsive = useResponsive();
  const [isCollaborationOpen, setIsCollaborationOpen] = useState(false);
  const { data: trip } = useTrip(id as string);

  return (
    <Tabs
      screenOptions={{
        tabBarStyle: responsive.isMobile ? {
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          elevation: 10,
          backgroundColor: 'white',
          borderTopWidth: 1,
          borderTopColor: '#E5E5E5',
          height: Platform.OS === 'ios' ? 85 : 65,
          paddingBottom: Platform.OS === 'ios' ? 20 : 10,
        } : {
          display: 'none', // Hide tabs on desktop - we'll show side by side
        },
        headerStyle: {
          backgroundColor: 'white',
          borderBottomWidth: 1,
          borderBottomColor: '#E5E5E5',
        },
        headerTitleStyle: {
          fontSize: responsive.isMobile ? 16 : 18,
          fontWeight: '600',
        },
        headerLeft: () => (
          <TouchableOpacity onPress={() => router.push('/')} style={{ paddingLeft: 16 }}>
            <Feather name="arrow-left" size={24} color="#333" />
          </TouchableOpacity>
        ),
        headerRight: () => (
          <View style={{ flexDirection: 'row', paddingRight: 16, gap: 8 }}>
            {!responsive.isMobile && (
              <>
                <TouchableOpacity style={{ padding: 8 }}>
                  <Feather name="share-2" size={20} color="#333" />
                </TouchableOpacity>
                <TouchableOpacity style={{ padding: 8 }}>
                  <Feather name="edit-2" size={20} color="#333" />
                </TouchableOpacity>
              </>
            )}
            <TouchableOpacity 
              style={[
                { padding: 8 },
                isCollaborationOpen && { backgroundColor: '#EBF5FF', borderRadius: 8 }
              ]}
              onPress={() => setIsCollaborationOpen(!isCollaborationOpen)}
            >
              <Ionicons name="people-outline" size={20} color={isCollaborationOpen ? '#3B82F6' : '#333'} />
            </TouchableOpacity>
          </View>
        ),
        headerTitle: trip?.title || 'Loading...', // Dynamic title from trip data
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Itinerary',
          headerShown: true, // Show header with trip title
          headerTitle: trip?.title || 'Loading...',
          tabBarIcon: ({ color, focused }) => (
            <Feather name="file-text" size={22} color={focused ? '#3B82F6' : '#666'} />
          ),
          tabBarActiveTintColor: '#3B82F6',
          tabBarInactiveTintColor: '#666',
          tabBarLabelStyle: {
            fontSize: 12,
            fontWeight: focused => focused ? '600' : '400',
          },
        }}
      />
      <Tabs.Screen
        name="map"
        options={{
          title: 'Map',
          headerShown: true, // Show header with trip title
          headerTitle: trip?.title || 'Loading...',
          tabBarIcon: ({ color, focused }) => (
            <Feather name="map" size={22} color={focused ? '#3B82F6' : '#666'} />
          ),
          tabBarActiveTintColor: '#3B82F6',
          tabBarInactiveTintColor: '#666',
          tabBarLabelStyle: {
            fontSize: 12,
            fontWeight: focused => focused ? '600' : '400',
          },
        }}
      />
      <Tabs.Screen
        name="collaboration"
        options={{
          title: 'Chat',
          headerShown: true, // Show header with trip title
          headerTitle: trip?.title || 'Loading...',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name="chatbubbles-outline" size={22} color={focused ? '#3B82F6' : '#666'} />
          ),
          tabBarActiveTintColor: '#3B82F6',
          tabBarInactiveTintColor: '#666',
          tabBarLabelStyle: {
            fontSize: 12,
            fontWeight: focused => focused ? '600' : '400',
          },
        }}
      />
    </Tabs>
  );
}