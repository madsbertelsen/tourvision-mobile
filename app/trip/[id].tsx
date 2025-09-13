import React, { useState, useMemo, lazy, Suspense, useRef, useCallback, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  ActivityIndicator,
  Platform,
  FlatList,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Feather, MaterialIcons } from '@expo/vector-icons';
import { Picker } from '@react-native-picker/picker';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { 
  useAnimatedStyle, 
  useSharedValue, 
  withSpring,
  withTiming,
  runOnJS,
  interpolate,
} from 'react-native-reanimated';

const { width, height } = Dimensions.get('window');

// Lazy load the map component for web
const MapViewWrapper = lazy(() =>
  Platform.OS === 'web'
    ? import('@/components/dom/MapViewDOM').then((mod) => ({
        default: mod.default,
      }))
    : Promise.resolve({ default: () => <View style={styles.mapPlaceholder}><Text>Map view not available on native</Text></View> })
);

// Sample Paris itinerary data
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
      id: 'day-1',
      day: 1,
      title: 'Iconic Landmarks',
      date: 'September 13, 2025',
      places: [
        {
          id: 'eiffel-tower',
          name: 'Eiffel Tower',
          time: '9:00 AM - 12:00 PM',
          period: 'Morning',
          description: 'Iconic iron lattice tower with panoramic city views',
          lat: 48.8584,
          lng: 2.2945,
          colorIndex: 0,
          cost: '€28.50',
        },
        {
          id: 'louvre',
          name: 'Louvre Museum',
          time: '1:00 PM - 5:00 PM',
          period: 'Afternoon',
          description: "World's largest art museum and historic monument",
          lat: 48.8606,
          lng: 2.3376,
          colorIndex: 1,
          cost: '€17.00',
        },
        {
          id: 'seine-cruise',
          name: 'Seine River Cruise',
          time: '6:00 PM - 9:00 PM',
          period: 'Evening',
          description: "Scenic boat tour along Paris's famous river",
          lat: 48.8611,
          lng: 2.2894,
          colorIndex: 2,
          cost: '€15.00',
        },
      ],
      totalCost: '€60.50',
      totalPlaces: 3,
    },
    {
      id: 'day-2',
      day: 2,
      title: 'Art & Culture',
      date: 'September 14, 2025',
      places: [
        {
          id: 'versailles',
          name: 'Versailles',
          time: '9:00 AM - 12:00 PM',
          period: 'Morning',
          description: 'Opulent royal palace with stunning gardens',
          lat: 48.8049,
          lng: 2.1204,
          colorIndex: 0,
          cost: '€20.00',
        },
        {
          id: 'montmartre',
          name: 'Montmartre',
          time: '2:00 PM - 5:00 PM',
          period: 'Afternoon',
          description: 'Historic hilltop district with artistic heritage',
          lat: 48.8867,
          lng: 2.3431,
          colorIndex: 1,
          cost: 'Free',
        },
        {
          id: 'sacre-coeur',
          name: 'Sacré-Cœur',
          time: '5:30 PM - 7:00 PM',
          period: 'Evening',
          description: 'Beautiful basilica with stunning city views',
          lat: 48.8867,
          lng: 2.3431,
          colorIndex: 2,
          cost: 'Free',
        },
      ],
      totalCost: '€20.00',
      totalPlaces: 3,
    },
  ],
  totalCost: '€80.50',
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
      const moveDistance = Math.abs(currentY);
      const threshold = CARD_HEIGHT * 0.5;
      
      if (moveDistance > threshold) {
        // Calculate new index based on direction and distance
        const direction = currentY > 0 ? 1 : -1;
        const steps = Math.round(moveDistance / CARD_HEIGHT);
        const newIndex = Math.max(0, Math.min(totalItems - 1, index + (direction * steps)));
        
        if (newIndex !== index) {
          runOnJS(handleDragEnd)(index, newIndex);
        }
      }
      
      // Reset position
      translateX.value = withSpring(0);
      translateY.value = withSpring(0);
      scale.value = withSpring(1);
      opacity.value = withTiming(1);
      isDragging.value = false;
    })
    .activateAfterLongPress(500); // Long press to activate drag
  
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
  
  const cardStyle = useAnimatedStyle(() => {
    return {
      backgroundColor: isDragging.value 
        ? withTiming('#F0F9FF')
        : withTiming('white'),
    };
  });
  
  return (
    <GestureDetector gesture={gesture}>
      <Animated.View style={[animatedStyle]}>
        <Animated.View
          style={[
            styles.placeCard,
            cardStyle,
          ]}
        >
          <View style={styles.placeHeader}>
            <View style={[styles.placeMarker, { backgroundColor: markerColor }]}>
              <Text style={styles.placeMarkerText}>{displayIndex}</Text>
            </View>
            <View style={styles.placeInfo}>
              <Text style={styles.placeName}>{place.name}</Text>
              <View style={styles.placeMetadata}>
                <Feather name="clock" size={12} color="#666" />
                <Text style={styles.placeTime}>{place.time}</Text>
                {place.cost && place.cost !== 'Free' && (
                  <>
                    <Text style={styles.metaSeparator}>•</Text>
                    <Text style={styles.placeCost}>{place.cost}</Text>
                  </>
                )}
              </View>
            </View>
          </View>
          <Text style={styles.placeDescription}>{place.description}</Text>
        </Animated.View>
      </Animated.View>
    </GestureDetector>
  );
};

interface DaySection {
  day: any;
  onPlacesReorder: (dayIndex: number, places: any[]) => void;
  dayIndex: number;
}

const DaySection = ({ day, onPlacesReorder, dayIndex }: DaySection) => {
  const [places, setPlaces] = useState(day.places);
  
  // Update places when day prop changes
  useEffect(() => {
    setPlaces(day.places);
  }, [day.places]);
  
  const handleDragEnd = useCallback((fromIndex: number, toIndex: number) => {
    const newPlaces = [...places];
    const [movedItem] = newPlaces.splice(fromIndex, 1);
    newPlaces.splice(toIndex, 0, movedItem);
    setPlaces(newPlaces);
    onPlacesReorder(dayIndex, newPlaces);
  }, [places, dayIndex, onPlacesReorder]);
  
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

export default function TripDetailsScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const [viewMode, setViewMode] = useState<'split' | 'text' | 'map'>('split');
  const [selectedDay, setSelectedDay] = useState<string>('all');
  const [trip, setTrip] = useState(SAMPLE_ITINERARY);

  // Handle reordering of places within a day
  const handlePlacesReorder = useCallback((dayIndex: number, newPlaces: any[]) => {
    setTrip(prev => {
      const newTrip = { ...prev };
      newTrip.days = [...prev.days];
      newTrip.days[dayIndex] = {
        ...prev.days[dayIndex],
        places: newPlaces,
      };
      return newTrip;
    });
  }, []);

  // Get all locations for the map
  const allLocations = useMemo(() => {
    if (selectedDay === 'all') {
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
    } else {
      const dayIndex = parseInt(selectedDay) - 1;
      const day = trip.days[dayIndex];
      if (!day) return [];
      
      return day.places.map((place) => ({
        id: place.id,
        name: place.name,
        lat: place.lat,
        lng: place.lng,
        description: `${place.period} • ${place.time}`,
        colorIndex: place.colorIndex,
      }));
    }
  }, [trip, selectedDay]);

  const filteredDays = useMemo(() => {
    return selectedDay === 'all' 
      ? trip.days 
      : trip.days.filter(d => d.day.toString() === selectedDay);
  }, [trip, selectedDay]);

  const renderTextContent = () => (
    <ScrollView style={styles.textContent}>
      <View style={styles.itineraryHeader}>
        <Text style={styles.itineraryTitle}>{trip.title}</Text>
        <Text style={styles.itineraryDescription}>{trip.description}</Text>
      </View>

      {filteredDays.map((day, index) => (
        <DaySection 
          key={day.id} 
          day={day} 
          dayIndex={trip.days.indexOf(day)}
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
  );

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Feather name="arrow-left" size={24} color="#333" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Trip Details</Text>
        </View>
        <View style={styles.headerRight}>
          <TouchableOpacity style={styles.headerButton}>
            <Feather name="share-2" size={20} color="#333" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerButton}>
            <Feather name="edit-2" size={20} color="#333" />
          </TouchableOpacity>
        </View>
      </View>

      {/* View Mode Tabs */}
      <View style={styles.viewModeTabs}>
        <TouchableOpacity
          style={[styles.viewModeTab, viewMode === 'text' && styles.viewModeTabActive]}
          onPress={() => setViewMode('text')}
        >
          <Feather name="file-text" size={16} color={viewMode === 'text' ? '#3B82F6' : '#666'} />
          <Text style={[styles.viewModeTabText, viewMode === 'text' && styles.viewModeTabTextActive]}>
            Text
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.viewModeTab, viewMode === 'map' && styles.viewModeTabActive]}
          onPress={() => setViewMode('map')}
        >
          <Feather name="map" size={16} color={viewMode === 'map' ? '#3B82F6' : '#666'} />
          <Text style={[styles.viewModeTabText, viewMode === 'map' && styles.viewModeTabTextActive]}>
            Map
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.viewModeTab, viewMode === 'split' && styles.viewModeTabActive]}
          onPress={() => setViewMode('split')}
        >
          <Feather name="columns" size={16} color={viewMode === 'split' ? '#3B82F6' : '#666'} />
          <Text style={[styles.viewModeTabText, viewMode === 'split' && styles.viewModeTabTextActive]}>
            Split
          </Text>
        </TouchableOpacity>
      </View>

      {/* Day Filter */}
      <View style={styles.dayFilter}>
        <Text style={styles.dayFilterLabel}>View Day:</Text>
        <View style={styles.pickerContainer}>
          <Picker
            selectedValue={selectedDay}
            onValueChange={setSelectedDay}
            style={styles.picker}
          >
            <Picker.Item label="All Days" value="all" />
            {trip.days.map((day) => (
              <Picker.Item key={day.id} label={`Day ${day.day}`} value={day.day.toString()} />
            ))}
          </Picker>
        </View>
      </View>

      {/* Content Area */}
      <View style={styles.content}>
        {viewMode === 'text' && renderTextContent()}
        
        {viewMode === 'map' && (
          <View style={styles.mapContainer}>
            <Suspense fallback={<ActivityIndicator size="large" color="#3B82F6" />}>
              <MapViewWrapper 
                locations={allLocations}
                style={{ width: '100%', height: '100%' }}
              />
            </Suspense>
          </View>
        )}
        
        {viewMode === 'split' && (
          <>
            <View style={styles.splitTextContainer}>
              {renderTextContent()}
            </View>
            <View style={styles.splitMapContainer}>
              <Suspense fallback={<ActivityIndicator size="large" color="#3B82F6" />}>
                <MapViewWrapper 
                  locations={allLocations}
                  style={{ width: '100%', height: '100%' }}
                />
              </Suspense>
            </View>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAFAFA',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 50,
    paddingBottom: 15,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5E5',
  },
  backButton: {
    padding: 8,
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  headerRight: {
    flexDirection: 'row',
    gap: 8,
  },
  headerButton: {
    padding: 8,
  },
  viewModeTabs: {
    flexDirection: 'row',
    backgroundColor: 'white',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5E5',
  },
  viewModeTab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginRight: 12,
    borderRadius: 8,
  },
  viewModeTabActive: {
    backgroundColor: '#EBF5FF',
  },
  viewModeTabText: {
    fontSize: 14,
    color: '#666',
    marginLeft: 6,
  },
  viewModeTabTextActive: {
    color: '#3B82F6',
    fontWeight: '600',
  },
  dayFilter: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5E5',
  },
  dayFilterLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginRight: 12,
  },
  pickerContainer: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#E5E5E5',
    borderRadius: 8,
    overflow: 'hidden',
  },
  picker: {
    height: 36,
  },
  content: {
    flex: 1,
    flexDirection: 'row',
  },
  textContent: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  splitTextContainer: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  splitMapContainer: {
    flex: 1,
    backgroundColor: '#E5E5E5',
  },
  mapContainer: {
    flex: 1,
    backgroundColor: '#E5E5E5',
  },
  mapPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  itineraryHeader: {
    padding: 20,
    backgroundColor: 'white',
    marginBottom: 10,
  },
  itineraryTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  itineraryDescription: {
    fontSize: 16,
    color: '#666',
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
  placeCardDragging: {
    opacity: 0.95,
    borderColor: '#3B82F6',
    borderWidth: 2,
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 8,
  },
  placeCardDragOver: {
    backgroundColor: '#F0F9FF',
    borderColor: '#3B82F6',
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
});