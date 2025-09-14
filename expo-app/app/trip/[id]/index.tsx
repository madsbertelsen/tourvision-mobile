import CollaborationPanel from '@/components/CollaborationPanel';
import MapView from '@/components/dom/MapViewDOM.tsx';
import { useResponsive } from '@/hooks/useResponsive';
import { useItinerary } from '@/hooks/useItineraries';
import { Feather, MaterialIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming
} from 'react-native-reanimated';
import type { Tables } from '@/lib/database.types';

// Helper function to parse itinerary document into structured data
const parseItineraryDocument = (itinerary: Tables<'itineraries'>) => {
  const doc = itinerary.document as any;
  if (!doc?.content) return null;
  
  const days: any[] = [];
  let currentDayIndex = 0;
  
  doc.content.forEach((node: any) => {
    if (node.type === 'dayNode') {
      const dayDate = node.attrs?.date ? new Date(node.attrs.date) : new Date();
      const places: any[] = [];
      
      if (node.content) {
        node.content.forEach((child: any, idx: number) => {
          if (child.type === 'destinationNode') {
            places.push({
              id: `place-${currentDayIndex}-${idx}`,
              name: child.attrs?.name || 'Unknown Place',
              time: child.attrs?.duration || '2 hours',
              period: idx === 0 ? 'Morning' : idx === 1 ? 'Afternoon' : 'Evening',
              description: child.attrs?.description || '',
              lat: child.attrs?.coordinates?.lat || 0,
              lng: child.attrs?.coordinates?.lng || 0,
              colorIndex: idx,
              cost: child.attrs?.cost || 'Free',
            });
          }
        });
      }
      
      days.push({
        day: currentDayIndex + 1,
        title: node.attrs?.title || `Day ${currentDayIndex + 1}`,
        date: dayDate.toLocaleDateString('en-US', { 
          month: 'long', 
          day: 'numeric', 
          year: 'numeric' 
        }),
        places,
        totalCost: places.length > 0 ? '€' + (places.length * 15) + '.00' : 'Free',
        totalPlaces: places.length,
      });
      
      currentDayIndex++;
    }
  });
  
  // Calculate date range
  const startDate = days[0]?.date || new Date().toISOString();
  const endDate = days[days.length - 1]?.date || new Date().toISOString();
  
  return {
    id: itinerary.id,
    title: itinerary.title,
    description: itinerary.description || '',
    dateRange: {
      start: startDate,
      end: endDate,
    },
    days,
    totalCost: '€' + (days.reduce((sum, day) => sum + day.places.length * 15, 0)) + '.00',
    totalPlaces: days.reduce((sum, day) => sum + day.places.length, 0),
  };
};

// Sample fallback data
const SAMPLE_ITINERARY = {
  id: 'paris-adventure',
  title: 'Paris Adventure - 5 days',
  description: '5 days exploring the City of Light',
  dateRange: {
    start: '2025-09-13',
    end: '2025-09-17',
  },
  days: [
    {
      day: 1,
      title: 'Historic Paris',
      date: 'September 13, 2025',
      places: [
        {
          id: 'eiffel-tower',
          name: 'Eiffel Tower',
          time: '9:00 AM - 11:00 AM',
          period: 'Morning',
          description: 'Iconic iron lattice tower',
          lat: 48.8584,
          lng: 2.2945,
          colorIndex: 0,
          cost: '€28.30',
        },
        {
          id: 'arc-triomphe',
          name: 'Arc de Triomphe',
          time: '2:00 PM - 3:30 PM',
          period: 'Afternoon',
          description: 'Triumphal arch honoring those who fought for France',
          lat: 48.8738,
          lng: 2.2950,
          colorIndex: 1,
          cost: '€13.00',
        },
        {
          id: 'seine-cruise',
          name: 'Seine River Cruise',
          time: '6:00 PM - 8:00 PM',
          period: 'Evening',
          description: 'Scenic boat tour along Paris\'s famous river',
          lat: 48.8606,
          lng: 2.3376,
          colorIndex: 2,
          cost: '€15.00',
        },
      ],
      totalCost: '€56.30',
      totalPlaces: 3,
    },
    {
      day: 2,
      title: 'Art & Culture',
      date: 'September 14, 2025',
      places: [
        {
          id: 'louvre',
          name: 'Louvre Museum',
          time: '9:00 AM - 1:00 PM',
          period: 'Morning',
          description: 'World\'s largest art museum',
          lat: 48.8606,
          lng: 2.3376,
          colorIndex: 0,
          cost: '€17.00',
        },
        {
          id: 'orsay',
          name: 'Musée d\'Orsay',
          time: '2:30 PM - 5:00 PM',
          period: 'Afternoon',
          description: 'Impressionist and post-impressionist masterpieces',
          lat: 48.8600,
          lng: 2.3266,
          colorIndex: 1,
          cost: '€16.00',
        },
        {
          id: 'latin-quarter',
          name: 'Latin Quarter',
          time: '6:00 PM - 9:00 PM',
          period: 'Evening',
          description: 'Historic student quarter with cafés and bookshops',
          lat: 48.8513,
          lng: 2.3459,
          colorIndex: 2,
          cost: 'Free',
        },
      ],
      totalCost: '€33.00',
      totalPlaces: 3,
    },
  ],
  totalCost: '€89.30',
  totalPlaces: 6,
};

const MARKER_COLORS = [
  '#3B82F6', // Blue
  '#10B981', // Emerald
  '#F59E0B', // Amber
  '#EF4444', // Red
  '#8B5CF6', // Violet
  '#EC4899', // Pink
  '#06B6D4', // Cyan
  '#84CC16', // Lime
];

interface PlaceCardProps {
  place: any;
  index: number;
  onDragEnd?: (fromIndex: number, toIndex: number) => void;
  totalItems: number;
}

const PlaceCard = ({ 
  place, 
  index,
  onDragEnd,
  totalItems
}: PlaceCardProps) => {
  const markerColor = MARKER_COLORS[place.colorIndex % MARKER_COLORS.length];
  const displayIndex = typeof index === 'number' ? index + 1 : 1;
  
  // Shared values for animations
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);
  const isDragging = useSharedValue(false);
  const startY = useSharedValue(0);
  
  // Calculate card height (approximate)
  const CARD_HEIGHT = 120;
  
  const handleDragEnd = useCallback((fromIdx: number, toIdx: number) => {
    if (onDragEnd) {
      onDragEnd(fromIdx, toIdx);
    }
  }, [onDragEnd]);
  
  // Create composed gesture
  const gesture = Gesture.Pan()
    .onBegin(() => {
      'worklet';
      isDragging.value = true;
      scale.value = withSpring(1.05);
      opacity.value = withTiming(0.9);
      startY.value = translateY.value;
    })
    .onUpdate((event) => {
      'worklet';
      translateY.value = startY.value + event.translationY;
      translateX.value = event.translationX * 0.1; // Slight horizontal movement
    })
    .onEnd(() => {
      'worklet';
      const currentY = translateY.value;
      const cardMovement = currentY / CARD_HEIGHT;
      const roundedMovement = Math.round(cardMovement);
      
      // Calculate new index
      let newIndex = index + roundedMovement;
      newIndex = Math.max(0, Math.min(totalItems - 1, newIndex));
      
      if (newIndex !== index) {
        runOnJS(handleDragEnd)(index, newIndex);
      }
      
      // Reset animations
      translateX.value = withSpring(0);
      translateY.value = withSpring(0);
      scale.value = withSpring(1);
      opacity.value = withTiming(1);
      isDragging.value = false;
    });
  
  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [
        { translateX: translateX.value },
        { translateY: translateY.value },
        { scale: scale.value },
      ],
      opacity: opacity.value,
      zIndex: isDragging.value ? 1000 : 0,
    };
  });
  
  return (
    <GestureDetector gesture={gesture}>
      <Animated.View style={[styles.placeCard, animatedStyle]}>
        <View style={styles.placeHeader}>
          <View style={[styles.placeMarker, { backgroundColor: markerColor }]}>
            <Text style={styles.placeMarkerText}>{displayIndex}</Text>
          </View>
          <View style={styles.placeInfo}>
            <Text style={styles.placeName}>{place.name}</Text>
            <View style={styles.placeMetadata}>
              <Feather name="clock" size={12} color="#666" />
              <Text style={styles.placeTime}>{place.time}</Text>
              <Text style={styles.metaSeparator}>•</Text>
              <Text style={styles.placeCost}>{place.cost}</Text>
            </View>
          </View>
          <View style={styles.dragIndicator}>
            <Feather name="menu" size={20} color="#999" />
          </View>
        </View>
        <Text style={styles.placeDescription}>{place.description}</Text>
      </Animated.View>
    </GestureDetector>
  );
};

const DaySection = ({ day, onPlacesReorder }: any) => {
  const [places, setPlaces] = useState(day.places);
  
  const handleDragEnd = useCallback((fromIndex: number, toIndex: number) => {
    const newPlaces = [...places];
    const [movedItem] = newPlaces.splice(fromIndex, 1);
    newPlaces.splice(toIndex, 0, movedItem);
    
    // Update colorIndex based on new position
    const updatedPlaces = newPlaces.map((place, idx) => ({
      ...place,
      colorIndex: idx
    }));
    
    setPlaces(updatedPlaces);
    if (onPlacesReorder) {
      onPlacesReorder(day.day - 1, updatedPlaces);
    }
  }, [places, day.day, onPlacesReorder]);
  
  const renderItem = ({ item, index }: { item: any; index: number }) => {
    return (
      <PlaceCard 
        place={item} 
        index={index}
        onDragEnd={handleDragEnd}
        totalItems={places.length}
      />
    );
  };

  return (
    <View style={styles.daySection}>
      <View style={styles.stickyDayHeader}>
        <Text style={styles.dayTitle}>Day {day.day}: {day.title}</Text>
        <Text style={styles.dayDate}>{day.date}</Text>
      </View>
      
      <FlatList
        data={places}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        scrollEnabled={false}
      />
      
      <View style={styles.dayFooter}>
        <View style={styles.dayStats}>
          <Feather name="map-pin" size={14} color="#666" />
          <Text style={styles.dayStatText}>{day.totalPlaces} places</Text>
          <Text style={styles.metaSeparator}>•</Text>
          <MaterialIcons name="attach-money" size={14} color="#666" />
          <Text style={styles.dayStatText}>{day.totalCost}</Text>
        </View>
      </View>
    </View>
  );
};

export default function ItineraryTab() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const responsive = useResponsive();
  const { data: itinerary, isLoading, error } = useItinerary(id as string);
  const [trip, setTrip] = useState<any>(null);
  const [isCollaborationOpen, setIsCollaborationOpen] = useState(false);
  
  useEffect(() => {
    if (itinerary) {
      const parsedTrip = parseItineraryDocument(itinerary);
      if (parsedTrip) {
        setTrip(parsedTrip);
      } else {
        // Fallback to sample data if parsing fails
        setTrip(SAMPLE_ITINERARY);
      }
    } else if (!isLoading && !error) {
      // If no itinerary and not loading, use sample data
      setTrip(SAMPLE_ITINERARY);
    }
  }, [itinerary, isLoading, error]);
  
  // Handle reordering of places within a day
  const handlePlacesReorder = useCallback((dayIndex: number, newPlaces: any[]) => {
    setTrip(prevTrip => {
      const newTrip = { ...prevTrip };
      newTrip.days = [...prevTrip.days];
      newTrip.days[dayIndex] = {
        ...prevTrip.days[dayIndex],
        places: newPlaces
      };
      return newTrip;
    });
  }, []);

  // Get all locations for the map
  const allLocations = useMemo(() => {
    if (!trip?.days) return [];
    return trip.days.flatMap((day) =>
      day.places.map((place) => ({
        id: place.id,
        name: place.name,
        lat: place.lat,
        lng: place.lng,
        description: `${place.period} • ${place.time}`,
        colorIndex: place.colorIndex,
      }))
    );
  }, [trip]);

  const filteredDays = useMemo(() => {
    if (!trip?.days) return [];
    return trip.days;
  }, [trip]);
  
  // Early returns after all hooks
  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#3B82F6" />
        <Text style={styles.loadingText}>Loading itinerary...</Text>
      </View>
    );
  }
  
  if (error || !trip) {
    return (
      <View style={styles.errorContainer}>
        <Feather name="alert-circle" size={48} color="#EF4444" />
        <Text style={styles.errorText}>Failed to load itinerary</Text>
        <Text style={styles.errorSubtext}>Please try again later</Text>
        <TouchableOpacity 
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Text style={styles.backButtonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Desktop: Show side-by-side layout
  if (!responsive.isMobile) {
    return (
      <View style={styles.desktopContainer}>
        <View style={styles.desktopItinerary}>
          <ScrollView style={styles.textContent}>
            {filteredDays.map((day) => (
              <DaySection 
                key={day.day} 
                day={day}
                onPlacesReorder={handlePlacesReorder}
              />
            ))}
            
            <View style={styles.proTipCard}>
              <View style={styles.proTipHeader}>
                <Feather name="zap" size={16} color="#F59E0B" />
                <Text style={styles.proTipTitle}>Pro Tip</Text>
              </View>
              <Text style={styles.proTipText}>
                Book skip-the-line tickets in advance for popular attractions to save time!
              </Text>
            </View>
          </ScrollView>
        </View>
        
        <View style={styles.desktopMap}>
          <Suspense fallback={<ActivityIndicator size="large" color="#3B82F6" />}>
            <MapView 
              locations={allLocations}
              style={{ width: '100%', height: '100%' }}
            />
          </Suspense>
        </View>
        
        {/* Collaboration Panel */}
        <CollaborationPanel 
          isOpen={isCollaborationOpen}
          onClose={() => setIsCollaborationOpen(false)}
        />
      </View>
    );
  }

  // Mobile: Show itinerary only (map is in separate tab)
  return (
    <View style={styles.container}>
      <ScrollView style={styles.textContent}>
        {filteredDays.map((day) => (
          <DaySection 
            key={day.day} 
            day={day}
            onPlacesReorder={handlePlacesReorder}
          />
        ))}
        
        <View style={styles.proTipCard}>
          <View style={styles.proTipHeader}>
            <Feather name="zap" size={16} color="#F59E0B" />
            <Text style={styles.proTipTitle}>Pro Tip</Text>
          </View>
          <Text style={styles.proTipText}>
            Book skip-the-line tickets in advance for popular attractions to save time!
          </Text>
        </View>
      </ScrollView>
      
      {/* Collaboration Panel */}
      <CollaborationPanel 
        isOpen={isCollaborationOpen}
        onClose={() => setIsCollaborationOpen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  desktopContainer: {
    flex: 1,
    flexDirection: 'row',
  },
  desktopItinerary: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  desktopMap: {
    flex: 1,
    backgroundColor: '#E5E5E5',
  },
  textContent: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  daySection: {
    marginBottom: 10,
  },
  stickyDayHeader: {
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#E5E5E5',
    position: Platform.OS === 'web' ? 'sticky' : 'relative',
    top: 0,
    zIndex: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  dayTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 4,
  },
  dayDate: {
    fontSize: 14,
    color: '#666',
  },
  placeCard: {
    backgroundColor: 'white',
    marginHorizontal: 20,
    marginVertical: 8,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E5E5',
    position: 'relative',
  },
  placeHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  placeMarker: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  placeMarkerText: {
    color: 'white',
    fontSize: 14,
    fontWeight: 'bold',
  },
  placeInfo: {
    flex: 1,
  },
  placeName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  placeMetadata: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  placeTime: {
    fontSize: 12,
    color: '#666',
    marginLeft: 4,
  },
  metaSeparator: {
    marginHorizontal: 8,
    color: '#999',
  },
  placeCost: {
    fontSize: 12,
    color: '#10B981',
    fontWeight: '600',
  },
  placeDescription: {
    fontSize: 14,
    color: '#444',
    lineHeight: 20,
  },
  dragIndicator: {
    position: 'absolute',
    right: 16,
    top: '50%',
    marginTop: -10,
  },
  dayFooter: {
    backgroundColor: '#F9FAFB',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5E5',
  },
  dayStats: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dayStatText: {
    fontSize: 14,
    color: '#666',
    marginLeft: 4,
  },
  proTipCard: {
    backgroundColor: '#FEF3C7',
    margin: 20,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  proTipHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  proTipTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#92400E',
    marginLeft: 8,
  },
  proTipText: {
    fontSize: 14,
    color: '#78350F',
    lineHeight: 20,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#666',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    padding: 20,
  },
  errorText: {
    marginTop: 16,
    fontSize: 18,
    fontWeight: '600',
    color: '#EF4444',
  },
  errorSubtext: {
    marginTop: 8,
    fontSize: 14,
    color: '#666',
  },
  backButton: {
    marginTop: 20,
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: '#3B82F6',
    borderRadius: 8,
  },
  backButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
});