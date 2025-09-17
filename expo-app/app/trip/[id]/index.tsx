import CollaborationPanel from '@/components/CollaborationPanel';
import MapView from '@/components/dom/MapViewDOM.tsx';
import TransportationCard, { TransportationData } from '@/components/TransportationCard';
import TransportationEditModal from '@/components/TransportationEditModal';
import TripMemberList from '@/components/TripMemberList';
import AttendanceSelector from '@/components/AttendanceSelector';
import BranchingIndicator from '@/components/BranchingIndicator';
import { useAttendance } from '@/hooks/useAttendance';
import { useResponsive } from '@/hooks/useResponsive';
import { useTrip } from '@/hooks/useTrips';
import { supabase } from '@/lib/supabase/client';
import { Feather, MaterialIcons, Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
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

// Helper function to parse trip document into structured data
const parseTripDocument = (trip: Tables<'trips'>) => {
  const doc = trip.itinerary_document as any;
  if (!doc?.content) return null;

  const days: any[] = [];
  let currentDay: any = null;
  let currentDayIndex = 0;
  let placeIndex = 0;
  let globalPlaceIndex = 0; // Track place index across all days for unique colors

  // Process flattened structure where all nodes are at the same level
  doc.content.forEach((node: any) => {
    if (node.type === 'dayTransition' || node.type === 'dayNode') {
      // Save the previous day if it exists
      if (currentDay) {
        days.push(currentDay);
      }

      // Start a new day
      const dayDate = node.attrs?.date ? new Date(node.attrs.date) : new Date();
      currentDay = {
        day: currentDayIndex + 1,
        title: node.attrs?.title || `Day ${currentDayIndex + 1}`,
        date: dayDate.toLocaleDateString('en-US', {
          month: 'long',
          day: 'numeric',
          year: 'numeric'
        }),
        places: [],
        transportations: [],
        totalCost: 'Free',
        totalPlaces: 0,
      };
      currentDayIndex++;
      placeIndex = 0; // Reset local place index for each day

    } else if (node.type === 'destinationNode' && currentDay) {
      // Add destination to current day
      const destId = node.attrs?.destinationId || `${currentDayIndex - 1}-${placeIndex}`;
      currentDay.places.push({
        id: `place-${currentDayIndex - 1}-${placeIndex}`,
        destinationId: destId,
        name: node.attrs?.name || 'Unknown Place',
        time: node.attrs?.duration || '2 hours',
        period: placeIndex === 0 ? 'Morning' : placeIndex === 1 ? 'Afternoon' : 'Evening',
        description: node.attrs?.description || '',
        lat: node.attrs?.coordinates?.lat || 0,
        lng: node.attrs?.coordinates?.lng || 0,
        colorIndex: globalPlaceIndex, // Use global index for unique colors
        cost: node.attrs?.cost || 'Free',
      });
      placeIndex++;
      globalPlaceIndex++; // Increment global index

    } else if (node.type === 'transportationNode' && currentDay) {
      // Add transportation to current day
      currentDay.transportations.push({
        transportId: node.attrs?.transportId,
        mode: node.attrs?.mode || 'walking',
        fromDestination: node.attrs?.fromDestination,
        toDestination: node.attrs?.toDestination,
        duration: node.attrs?.duration || '5 min',
        distance: node.attrs?.distance,
        cost: node.attrs?.cost?.amount,
        route: node.attrs?.route,
        routeUrl: node.attrs?.routeUrl,
        routeGeometry: node.attrs?.routeGeometry,
      });
    }
  });

  // Don't forget to add the last day
  if (currentDay) {
    days.push(currentDay);
  }

  // Update total costs and places for each day
  days.forEach(day => {
    day.totalPlaces = day.places.length;
    day.totalCost = day.places.length > 0 ? '€' + (day.places.length * 15) + '.00' : 'Free';
  });

  // Calculate date range
  const startDate = days[0]?.date || new Date().toISOString();
  const endDate = days[days.length - 1]?.date || new Date().toISOString();

  return {
    id: trip.id,
    title: trip.title,
    description: trip.description || '',
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

const MARKER_COLOR = '#3B82F6'; // Blue 500 for all markers

interface PlaceCardProps {
  place: any;
  index: number;
  onDragEnd?: (fromIndex: number, toIndex: number) => void;
  totalItems: number;
  tripId: string;
  dayIndex: number;
}

const PlaceCard = ({
  place,
  index,
  onDragEnd,
  totalItems,
  tripId,
  dayIndex
}: PlaceCardProps) => {
  const markerColor = MARKER_COLOR; // Use blue for all markers
  
  // State for card expansion
  const [isExpanded, setIsExpanded] = useState(false);
  
  // Shared values for animations
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);
  const isDragging = useSharedValue(false);
  const startY = useSharedValue(0);
  
  // Animation values for expansion
  const contentHeight = useSharedValue(0);
  const chevronRotation = useSharedValue(0);
  
  // Calculate card height (approximate)
  const CARD_HEIGHT = 120;
  
  // Toggle expansion
  const toggleExpansion = () => {
    setIsExpanded(!isExpanded);
    contentHeight.value = withSpring(isExpanded ? 0 : 150);
    chevronRotation.value = withSpring(isExpanded ? 0 : 180);
  };
  
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
  
  const expandedContentStyle = useAnimatedStyle(() => {
    return {
      maxHeight: contentHeight.value,
      opacity: contentHeight.value / 150,
      overflow: 'hidden',
    };
  });
  
  const chevronStyle = useAnimatedStyle(() => {
    return {
      transform: [{ rotate: `${chevronRotation.value}deg` }],
    };
  });
  
  return (
    <GestureDetector gesture={gesture}>
      <Animated.View style={[styles.placeCard, animatedStyle, {overflow: 'visible'}]}>
        <TouchableOpacity onPress={toggleExpansion} activeOpacity={0.9} style={{overflow: 'visible'}}>
          <View style={styles.placeHeader}>
            <View style={[styles.placeMarker, { backgroundColor: markerColor }]} />
            <View style={styles.placeInfo}>
              <Text style={styles.placeName}>{place.name}</Text>
              {!isExpanded && (
                <Text style={styles.placeDescriptionCompact} numberOfLines={1}>
                  {place.description}
                </Text>
              )}
            </View>
            <Animated.View style={[styles.expandIndicator, chevronStyle]}>
              <Feather name="chevron-down" size={18} color="#9CA3AF" />
            </Animated.View>
          </View>
        </TouchableOpacity>
        
        <Animated.View style={[expandedContentStyle, {overflow: 'visible'}]}>
          <View style={styles.expandedContent}>
            <Text style={styles.placeDescription}>{place.description}</Text>
            <View style={styles.placeDetails}>
              <View style={styles.detailRow}>
                <View style={styles.detailIcon}>
                  <Feather name="clock" size={13} color="#6B7280" />
                </View>
                <Text style={styles.detailText}>{place.time}</Text>
              </View>
              <View style={styles.detailRow}>
                <View style={styles.detailIcon}>
                  <MaterialIcons name="attach-money" size={13} color="#6B7280" />
                </View>
                <Text style={[styles.detailText, styles.detailCost]}>{place.cost}</Text>
              </View>
              {place.period && (
                <View style={styles.detailRow}>
                  <View style={styles.detailIcon}>
                    <Feather name="sun" size={13} color="#6B7280" />
                  </View>
                  <Text style={styles.detailText}>{place.period}</Text>
                </View>
              )}
            </View>

            {/* Attendance Selector */}
            <View style={styles.attendanceSection}>
              <AttendanceSelector
                tripId={tripId}
                destinationId={place.destinationId}
                destinationName={place.name}
                dayIndex={dayIndex}
                compact={true}
              />
            </View>

          </View>
        </Animated.View>
      </Animated.View>
    </GestureDetector>
  );
};

const DaySection = ({ day, tripId, onPlacesReorder, onTransportationEdit }: any) => {
  const [places, setPlaces] = useState(day.places);
  const [transportations, setTransportations] = useState(day.transportations || []);
  const [transportationModal, setTransportationModal] = useState<{
    visible: boolean;
    fromIndex: number;
    toIndex: number;
    data?: TransportationData;
  }>({ visible: false, fromIndex: 0, toIndex: 1 });
  
  // Sync local state when day props change
  useEffect(() => {
    setPlaces(day.places);
  }, [day.places]);
  
  useEffect(() => {
    setTransportations(day.transportations || []);
  }, [day.transportations]);
  
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
  
  const handleTransportationSave = (transportation: TransportationData) => {
    const fromPlace = places[transportationModal.fromIndex];
    const toPlace = places[transportationModal.toIndex];
    if (fromPlace && toPlace) {
      // Update local transportations state immediately
      const newTransport = {
        transportId: `transport-${fromPlace.destinationId}-${toPlace.destinationId}`,
        mode: transportation.mode,
        fromDestination: fromPlace.destinationId,
        toDestination: toPlace.destinationId,
        duration: transportation.duration,
        distance: transportation.distance,
        cost: transportation.cost,
        route: transportation.route,
        routeUrl: transportation.routeUrl,
        routeGeometry: transportation.routeGeometry,
      };
      
      setTransportations(prev => {
        const updated = [...prev];
        const existingIndex = updated.findIndex((t: any) => 
          t.fromDestination === fromPlace.destinationId && 
          t.toDestination === toPlace.destinationId
        );
        
        if (existingIndex >= 0) {
          updated[existingIndex] = newTransport;
        } else {
          updated.push(newTransport);
        }
        return updated;
      });
      
      // Also update parent component
      if (onTransportationEdit) {
        onTransportationEdit(
          day.day - 1,
          fromPlace.destinationId,
          toPlace.destinationId,
          transportation
        );
      }
    }
  };

  const getTransportation = (fromIndex: number, toIndex: number) => {
    const fromPlace = places[fromIndex];
    const toPlace = places[toIndex];
    if (!fromPlace || !toPlace) return undefined;
    
    // Check local transportations state first, then fall back to day.transportations
    const transport = transportations.find((t: any) => 
      t.fromDestination === fromPlace.destinationId && 
      t.toDestination === toPlace.destinationId
    ) || day.transportations?.find((t: any) => 
      t.fromDestination === fromPlace.destinationId && 
      t.toDestination === toPlace.destinationId
    );
    
    if (transport) {
      console.log('getTransportation returning transport with geometry:', {
        mode: transport.mode,
        hasGeometry: !!transport.routeGeometry,
        geometryLength: transport.routeGeometry?.coordinates?.length
      });
      return {
        mode: transport.mode,
        duration: transport.duration,
        distance: transport.distance,
        cost: transport.cost,
        route: transport.route,
        routeUrl: transport.routeUrl,
        routeGeometry: transport.routeGeometry,
      } as TransportationData;
    }
    
    return undefined;
  };

  const renderItem = ({ item, index }: { item: any; index: number }) => {
    const nextPlace = places[index + 1];
    const currentPlace = item;

    // Debug logging
    console.log('Rendering item:', {
      index,
      currentPlace: currentPlace?.name,
      currentDestinationId: currentPlace?.destinationId,
      nextPlace: nextPlace?.name,
      nextDestinationId: nextPlace?.destinationId,
      dayNumber: day.day,
    });

    // Show alternative after Hotel Casa Fuster (index 1) before Gothic Quarter
    // Simplified condition for debugging
    const showAlternative = index === 1 && day.day === 1;

    console.log('Show alternative?', showAlternative);

    return (
      <>
        <PlaceCard
          place={item}
          index={index}
          onDragEnd={handleDragEnd}
          totalItems={places.length}
          tripId={tripId}
          dayIndex={day.day - 1}
        />
        {/* Show branching after Hotel Casa Fuster before Gothic Quarter */}
        {showAlternative && (
          <BranchingIndicator
            tripId={tripId}
            currentDestinationId={currentPlace?.destinationId || ''}
            nextDestinationId={nextPlace?.destinationId || ''}
            dayIndex={0}
          />
        )}
        {index < places.length - 1 && (
          <TransportationCard
            transportation={getTransportation(index, index + 1)}
            onPress={() => setTransportationModal({
              visible: true,
              fromIndex: index,
              toIndex: index + 1,
              data: getTransportation(index, index + 1),
            })}
            fromLocation={{
              lat: places[index].lat,
              lng: places[index].lng,
              name: places[index].name,
            }}
            toLocation={{
              lat: places[index + 1].lat,
              lng: places[index + 1].lng,
              name: places[index + 1].name,
            }}
          />
        )}
      </>
    );
  };

  return (
    <View style={styles.daySection}>
      <View style={styles.stickyDayHeader}>
        <Text style={styles.dayTitle}>{day.title}</Text>
        <Text style={styles.dayDate}>{day.date}</Text>
      </View>
      
      <FlatList
        data={places}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        scrollEnabled={false}
      />
      
      <TransportationEditModal
        visible={transportationModal.visible}
        onClose={() => setTransportationModal({ ...transportationModal, visible: false })}
        onSave={handleTransportationSave}
        initialData={transportationModal.data}
        fromPlace={places[transportationModal.fromIndex]?.name || ''}
        toPlace={places[transportationModal.toIndex]?.name || ''}
        fromLocation={places[transportationModal.fromIndex] ? {
          lat: places[transportationModal.fromIndex].lat,
          lng: places[transportationModal.fromIndex].lng,
        } : undefined}
        toLocation={places[transportationModal.toIndex] ? {
          lat: places[transportationModal.toIndex].lat,
          lng: places[transportationModal.toIndex].lng,
        } : undefined}
      />
    </View>
  );
};

export default function TripDetail() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const responsive = useResponsive();
  const queryClient = useQueryClient();
  const { data: tripData, isLoading, error } = useTrip(id as string);
  const [trip, setTrip] = useState<any>(null);
  const [isCollaborationOpen, setIsCollaborationOpen] = useState(false);
  const [showPersonalView, setShowPersonalView] = useState(false);
  const [showMembers, setShowMembers] = useState(false);

  // Use attendance hook
  const {
    members,
    myAttendance,
    getMyStatus,
    loading: attendanceLoading
  } = useAttendance(id as string);
  
  useEffect(() => {
    if (tripData) {
      const parsedTrip = parseTripDocument(tripData);
      if (parsedTrip) {
        setTrip(parsedTrip);
      } else {
        // Fallback to sample data if parsing fails
        setTrip(SAMPLE_ITINERARY);
      }
    } else if (!isLoading && !error) {
      // If no trip and not loading, use sample data
      setTrip(SAMPLE_ITINERARY);
    }
  }, [tripData, isLoading, error]);
  
  // Handle reordering of places within a day
  const handlePlacesReorder = useCallback(async (dayIndex: number, newPlaces: any[]) => {
    if (!tripData || !trip) return;
    
    // Update local state immediately for responsive UI
    setTrip(prevTrip => {
      const newTrip = { ...prevTrip };
      newTrip.days = [...prevTrip.days];
      newTrip.days[dayIndex] = {
        ...prevTrip.days[dayIndex],
        places: newPlaces
      };
      return newTrip;
    });
    
    // Reconstruct the document with the new order
    const doc = tripData.itinerary_document as any;
    if (!doc?.content) return;
    
    // Create a new document with updated places
    const newContent = [...doc.content];
    let currentDayIdx = 0;
    
    for (let i = 0; i < newContent.length; i++) {
      if (newContent[i].type === 'dayNode') {
        if (currentDayIdx === dayIndex) {
          // Update this day's destinations
          const dayNode = { ...newContent[i] };
          const newDayContent = [];
          
          // Reconstruct the day's content with reordered places
          for (const place of newPlaces) {
            newDayContent.push({
              type: 'destinationNode',
              attrs: {
                destinationId: place.destinationId, // Preserve the destinationId!
                name: place.name,
                description: place.description,
                duration: place.time,
                cost: place.cost,
                coordinates: {
                  lat: place.lat,
                  lng: place.lng
                }
              }
            });
          }
          
          dayNode.content = newDayContent;
          newContent[i] = dayNode;
          break;
        }
        currentDayIdx++;
      }
    }
    
    const updatedDocument = {
      ...doc,
      content: newContent
    };
    
    // Save to database
    try {
      const { error } = await supabase
        .from('trips')
        .update({ itinerary_document: updatedDocument })
        .eq('id', tripData.id);
        
      if (error) {
        console.error('Failed to save reordered itinerary:', error);
        // Could show an error toast here
      } else {
        // Invalidate the cache for this specific trip
        queryClient.invalidateQueries({ queryKey: ['trip', id] });
        // Also invalidate the trips list cache to ensure consistency
        queryClient.invalidateQueries({ queryKey: ['trips'] });
      }
    } catch (err) {
      console.error('Error saving reordered itinerary:', err);
    }
  }, [tripData, trip, queryClient, id]);
  
  // Handle transportation edit
  const handleTransportationEdit = useCallback(async (
    dayIndex: number,
    fromDestinationId: string,
    toDestinationId: string,
    transportation: TransportationData
  ) => {
    if (!tripData || !trip) return;
    
    console.log('handleTransportationEdit called with:', {
      dayIndex,
      fromDestinationId,
      toDestinationId,
      transportation,
      hasGeometry: !!transportation.routeGeometry
    });
    
    // Update local state immediately
    setTrip(prevTrip => {
      const newTrip = { ...prevTrip };
      newTrip.days = [...prevTrip.days];
      const day = { ...newTrip.days[dayIndex] };
      
      // Update or add transportation
      if (!day.transportations) {
        day.transportations = [];
      }
      
      const existingIndex = day.transportations.findIndex((t: any) => 
        t.fromDestination === fromDestinationId && t.toDestination === toDestinationId
      );
      
      const transportData = {
        transportId: `transport-${fromDestinationId}-${toDestinationId}`,
        mode: transportation.mode,
        fromDestination: fromDestinationId,
        toDestination: toDestinationId,
        duration: transportation.duration,
        distance: transportation.distance,
        cost: transportation.cost,
        route: transportation.route,
        routeUrl: transportation.routeUrl,
        routeGeometry: transportation.routeGeometry,
      };
      
      console.log('Transport data to save:', transportData);
      
      if (existingIndex >= 0) {
        day.transportations[existingIndex] = transportData;
      } else {
        day.transportations.push(transportData);
      }
      
      newTrip.days[dayIndex] = day;
      return newTrip;
    });
    
    // Save to database
    const doc = tripData.itinerary_document as any;
    if (!doc?.content) return;
    
    const newContent = [...doc.content];
    let currentDayIdx = 0;
    
    for (let i = 0; i < newContent.length; i++) {
      if (newContent[i].type === 'dayNode') {
        if (currentDayIdx === dayIndex) {
          const dayNode = { ...newContent[i] };
          const newDayContent = [];
          
          // Rebuild day content with transportation nodes
          const places = trip.days[dayIndex].places;
          for (let j = 0; j < places.length; j++) {
            const place = places[j];
            
            // Add destination node
            newDayContent.push({
              type: 'destinationNode',
              attrs: {
                destinationId: place.destinationId,
                name: place.name,
                description: place.description,
                duration: place.time,
                cost: place.cost,
                coordinates: {
                  lat: place.lat,
                  lng: place.lng
                }
              }
            });
            
            // Add transportation node if not last place
            if (j < places.length - 1) {
              const nextPlace = places[j + 1];
              const transport = trip.days[dayIndex].transportations?.find((t: any) => 
                t.fromDestination === place.destinationId && 
                t.toDestination === nextPlace.destinationId
              );
              
              if (transport) {
                newDayContent.push({
                  type: 'transportationNode',
                  attrs: {
                    transportId: transport.transportId,
                    mode: transport.mode,
                    fromDestination: transport.fromDestination,
                    toDestination: transport.toDestination,
                    duration: transport.duration,
                    distance: transport.distance,
                    cost: transport.cost ? {
                      amount: transport.cost,
                      currency: 'USD'
                    } : undefined,
                    route: transport.route,
                    routeUrl: transport.routeUrl,
                    routeGeometry: transport.routeGeometry,
                  }
                });
              }
            }
          }
          
          dayNode.content = newDayContent;
          newContent[i] = dayNode;
          break;
        }
        currentDayIdx++;
      }
    }
    
    const updatedDocument = {
      ...doc,
      content: newContent
    };
    
    try {
      const { error } = await supabase
        .from('trips')
        .update({ itinerary_document: updatedDocument })
        .eq('id', tripData.id);
        
      if (error) {
        console.error('Failed to save transportation:', error);
      } else {
        queryClient.invalidateQueries({ queryKey: ['trip', id] });
      }
    } catch (err) {
      console.error('Error saving transportation:', err);
    }
  }, [tripData, trip, queryClient, id]);

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

  // Get all transportation routes for the map
  const allTransportationRoutes = useMemo(() => {
    if (!trip?.days) return [];
    
    const routes = [];
    for (const day of trip.days) {
      console.log('Processing day:', day.day, 'transportations:', day.transportations);
      if (day.transportations && day.places) {
        for (const transport of day.transportations) {
          console.log('Processing transport:', transport);
          // Find the from and to places
          const fromPlace = day.places.find(p => p.destinationId === transport.fromDestination);
          const toPlace = day.places.find(p => p.destinationId === transport.toDestination);
          
          console.log('Found places:', { fromPlace, toPlace, hasGeometry: !!transport.routeGeometry });
          
          if (fromPlace && toPlace && transport.routeGeometry) {
            // Get color based on transport mode
            const modeColors = {
              walking: '#10B981',
              metro: '#EF4444',
              bus: '#3B82F6',
              taxi: '#F59E0B',
              uber: '#000000',
              bike: '#8B5CF6',
              car: '#6B7280',
              train: '#059669',
            };
            
            const route = {
              id: transport.transportId,
              mode: transport.mode,
              geometry: transport.routeGeometry,
              color: modeColors[transport.mode] || '#6366F1',
              fromPlace: fromPlace.name,
              toPlace: toPlace.name,
              duration: transport.duration,
            };
            console.log('Adding route:', route);
            routes.push(route);
          }
        }
      }
    }
    console.log('Total routes collected:', routes.length, routes);
    return routes;
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
        <Text style={styles.loadingText}>Loading trip...</Text>
      </View>
    );
  }
  
  if (error || !trip) {
    return (
      <View style={styles.errorContainer}>
        <Feather name="alert-circle" size={48} color="#EF4444" />
        <Text style={styles.errorText}>Failed to load trip</Text>
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
                tripId={id as string}
                onPlacesReorder={handlePlacesReorder}
                onTransportationEdit={handleTransportationEdit}
              />
            ))}
          </ScrollView>
        </View>
        
        <View style={styles.desktopMap}>
          <Suspense fallback={<ActivityIndicator size="large" color="#3B82F6" />}>
            <MapView 
              locations={allLocations}
              transportationRoutes={allTransportationRoutes}
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
      {/* Member List and View Toggle */}
      <View style={styles.headerControls}>
        <TripMemberList
          tripId={id as string}
          compact={true}
          onMemberPress={() => setShowMembers(true)}
        />

        <View style={styles.viewToggle}>
          <TouchableOpacity
            style={[styles.viewToggleButton, !showPersonalView && styles.viewToggleActive]}
            onPress={() => setShowPersonalView(false)}
          >
            <Ionicons name="people" size={16} color={!showPersonalView ? '#3B82F6' : '#6B7280'} />
            <Text style={[styles.viewToggleText, !showPersonalView && styles.viewToggleTextActive]}>
              Everyone
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.viewToggleButton, showPersonalView && styles.viewToggleActive]}
            onPress={() => setShowPersonalView(true)}
          >
            <Ionicons name="person" size={16} color={showPersonalView ? '#3B82F6' : '#6B7280'} />
            <Text style={[styles.viewToggleText, showPersonalView && styles.viewToggleTextActive]}>
              My View
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView style={styles.textContent}>
        {filteredDays.map((day) => (
          <DaySection
            key={day.day}
            day={day}
            tripId={id as string}
            onPlacesReorder={handlePlacesReorder}
            onTransportationEdit={handleTransportationEdit}
          />
        ))}
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
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 16,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
    position: Platform.OS === 'web' ? 'sticky' : 'relative',
    top: 0,
    zIndex: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 2,
    elevation: 1,
  },
  dayTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4,
    letterSpacing: -0.3,
  },
  dayDate: {
    fontSize: 14,
    color: '#6B7280',
    fontWeight: '500',
  },
  daySummary: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 20,
    marginBottom: 24,
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  summaryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  summaryText: {
    fontSize: 14,
    color: '#475569',
    fontWeight: '600',
  },
  summaryDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: '#9CA3AF',
    marginHorizontal: 12,
  },
  placeCard: {
    backgroundColor: 'white',
    marginLeft: 70,
    marginRight: 16,
    marginVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  placeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    paddingLeft: 20,
    position: 'relative',
  },
  placeMarker: {
    position: 'absolute',
    left: -30,
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  placeInfo: {
    flex: 1,
    paddingRight: 8,
  },
  placeName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 2,
    letterSpacing: -0.1,
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
    color: '#4B5563',
    lineHeight: 20,
    marginBottom: 10,
  },
  placeDescriptionCompact: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 2,
    lineHeight: 18,
  },
  dragIndicator: {
    position: 'absolute',
    right: 16,
    top: '50%',
    marginTop: -10,
  },
  expandIndicator: {
    padding: 6,
    borderRadius: 20,
    backgroundColor: '#F1F5F9',
  },
  expandedContent: {
    paddingTop: 0,
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  placeDetails: {
    marginTop: 14,
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 12,
    gap: 10,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  detailIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'white',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  detailText: {
    fontSize: 13,
    color: '#6B7280',
    fontWeight: '500',
  },
  detailCost: {
    color: '#10B981',
    fontWeight: '600',
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
  attendanceSection: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  headerControls: {
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  viewToggle: {
    flexDirection: 'row',
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
    padding: 4,
    marginTop: 12,
  },
  viewToggleButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    gap: 6,
  },
  viewToggleActive: {
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  viewToggleText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#6B7280',
  },
  viewToggleTextActive: {
    color: '#3B82F6',
  },
});