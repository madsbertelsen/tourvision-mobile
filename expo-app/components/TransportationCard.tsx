import React, { useState, Suspense } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Feather, MaterialIcons, Ionicons } from '@expo/vector-icons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import MapView from './dom/MapViewDOM';

export interface TransportationData {
  mode: 'walking' | 'metro' | 'bus' | 'taxi' | 'uber' | 'bike' | 'car' | 'train';
  duration: string;
  distance?: string;
  cost?: number;
  route?: string;
  routeUrl?: string;
  routeGeometry?: {
    type: 'LineString';
    coordinates: number[][];
  };
}

interface TransportationCardProps {
  transportation?: TransportationData;
  onPress: () => void;
  fromLocation?: { lat: number; lng: number; name?: string };
  toLocation?: { lat: number; lng: number; name?: string };
}

const TRANSPORT_ICONS: Record<string, { name: any; library: 'Feather' | 'MaterialIcons' | 'Ionicons' }> = {
  walking: { name: 'walk', library: 'Ionicons' },
  metro: { name: 'subway', library: 'MaterialIcons' },
  bus: { name: 'bus', library: 'Ionicons' },
  taxi: { name: 'local-taxi', library: 'MaterialIcons' },
  uber: { name: 'car', library: 'Ionicons' },
  bike: { name: 'bicycle', library: 'Ionicons' },
  car: { name: 'car', library: 'Ionicons' },
  train: { name: 'train', library: 'Ionicons' },
};

const TRANSPORT_COLORS: Record<string, string> = {
  walking: '#10B981',
  metro: '#EF4444',
  bus: '#3B82F6',
  taxi: '#F59E0B',
  uber: '#000000',
  bike: '#8B5CF6',
  car: '#6B7280',
  train: '#059669',
};

export default function TransportationCard({ transportation, onPress, fromLocation, toLocation }: TransportationCardProps) {
  const mode = transportation?.mode || 'walking';
  const duration = transportation?.duration || '5 min';
  const cost = transportation?.cost;
  const distance = transportation?.distance;
  const route = transportation?.route;
  
  // Debug log
  if (transportation?.routeGeometry) {
    console.log('TransportationCard has route geometry:', {
      mode,
      hasGeometry: true,
      coordinatesLength: transportation.routeGeometry.coordinates?.length
    });
  }
  
  const [isExpanded, setIsExpanded] = useState(false);
  const contentHeight = useSharedValue(0);
  const chevronRotation = useSharedValue(0);
  
  const icon = TRANSPORT_ICONS[mode] || TRANSPORT_ICONS.walking;
  const color = TRANSPORT_COLORS[mode] || TRANSPORT_COLORS.walking;
  
  const IconComponent = 
    icon.library === 'Feather' ? Feather : 
    icon.library === 'MaterialIcons' ? MaterialIcons : 
    Ionicons;
  
  const toggleExpansion = () => {
    setIsExpanded(!isExpanded);
    // Increase height if we have map to show
    const expandedHeight = fromLocation && toLocation ? 280 : 100;
    contentHeight.value = withSpring(isExpanded ? 0 : expandedHeight);
    chevronRotation.value = withSpring(isExpanded ? 0 : 90);
  };
  
  const expandedContentStyle = useAnimatedStyle(() => ({
    maxHeight: contentHeight.value,
    opacity: contentHeight.value > 0 ? 1 : 0,
  }));
  
  const chevronStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${chevronRotation.value}deg` }],
  }));

  return (
    <View style={styles.container}>
      <View style={styles.lineContainer}>
        <View style={styles.lineTop} />
        <View style={[styles.lineDot, { backgroundColor: color }]} />
        <View style={styles.lineBottom} />
      </View>
      
      <View style={styles.card}>
        <TouchableOpacity style={styles.cardContent} onPress={toggleExpansion} activeOpacity={0.9}>
          <View style={[styles.iconContainer, { backgroundColor: `${color}10` }]}>
            <IconComponent name={icon.name} size={14} color={color} />
          </View>
          
          <View style={styles.info}>
            <Text style={styles.duration}>{duration}</Text>
            {cost !== undefined && cost > 0 && (
              <View style={styles.costBadge}>
                <Text style={styles.cost}>${cost.toFixed(2)}</Text>
              </View>
            )}
          </View>
          
          <TouchableOpacity onPress={onPress} style={styles.editButton}>
            <Feather name="edit-3" size={13} color="#9CA3AF" />
          </TouchableOpacity>
          
          <Animated.View style={[styles.chevronContainer, chevronStyle]}>
            <Feather name="chevron-right" size={14} color="#9CA3AF" />
          </Animated.View>
        </TouchableOpacity>
        
        <Animated.View style={expandedContentStyle}>
          <View style={styles.expandedContent}>
            {fromLocation && toLocation && (
              <View style={styles.mapContainer}>
                <Suspense fallback={
                  <View style={styles.mapLoading}>
                    <ActivityIndicator size="small" color="#6366F1" />
                  </View>
                }>
                  <MapView 
                    key={`map-${mode}-${transportation?.routeGeometry?.coordinates?.length || 0}`}
                    locations={[
                      {
                        id: 'from',
                        name: fromLocation.name || 'Start',
                        lat: fromLocation.lat,
                        lng: fromLocation.lng,
                        description: 'Start',
                        colorIndex: 0,
                      },
                      {
                        id: 'to',
                        name: toLocation.name || 'End',
                        lat: toLocation.lat,
                        lng: toLocation.lng,
                        description: 'End',
                        colorIndex: 1,
                      }
                    ]}
                    style={{ width: '100%', height: 200 }}
                    showRoute={!!transportation?.routeGeometry}
                    routeGeometry={transportation?.routeGeometry}
                    routeColor={TRANSPORT_COLORS[mode] || '#6366F1'}
                  />
                </Suspense>
              </View>
            )}
            <View style={styles.detailsSection}>
              {distance && (
                <View style={styles.detailRow}>
                  <View style={styles.detailIconSmall}>
                    <Feather name="map-pin" size={11} color="#6B7280" />
                  </View>
                  <Text style={styles.detailText}>{distance}</Text>
                </View>
              )}
              {route && (
                <View style={styles.detailRow}>
                  <View style={styles.detailIconSmall}>
                    <Feather name="navigation-2" size={11} color="#6B7280" />
                  </View>
                  <Text style={styles.detailText}>{route}</Text>
                </View>
              )}
              {!distance && !route && !fromLocation && (
                <Text style={styles.emptyText}>Tap edit to add route details</Text>
              )}
            </View>
          </View>
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: -8,
    zIndex: 1,
  },
  lineContainer: {
    position: 'absolute',
    top: -8,
    bottom: -8,
    left: 34,
    width: 2,
    alignItems: 'center',
  },
  lineTop: {
    flex: 1,
    width: 2,
    backgroundColor: '#E5E7EB',
  },
  lineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginVertical: -3,
    borderWidth: 1.5,
    borderColor: 'white',
  },
  lineBottom: {
    flex: 1,
    width: 2,
    backgroundColor: '#E5E7EB',
  },
  card: {
    backgroundColor: 'white',
    marginLeft: 54,
    marginRight: 16,
    marginVertical: 6,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 3,
    elevation: 1,
    overflow: 'hidden',
  },
  cardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  iconContainer: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  info: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  duration: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
    letterSpacing: -0.1,
  },
  costBadge: {
    backgroundColor: '#F0FDF4',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#D4F4DD',
  },
  cost: {
    fontSize: 12,
    color: '#059669',
    fontWeight: '600',
  },
  editButton: {
    padding: 6,
    marginHorizontal: 2,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
  },
  chevronContainer: {
    padding: 4,
  },
  expandedContent: {
    backgroundColor: '#F8FAFC',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  mapContainer: {
    height: 200,
    backgroundColor: '#F9FAFB',
    borderRadius: 10,
    overflow: 'hidden',
    marginHorizontal: 12,
    marginTop: 8,
  },
  mapLoading: {
    height: 200,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
  },
  detailsSection: {
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 14,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
  },
  detailIconSmall: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'white',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  detailText: {
    fontSize: 13,
    color: '#4B5563',
    flex: 1,
    lineHeight: 18,
  },
  emptyText: {
    fontSize: 12,
    color: '#9CA3AF',
    fontStyle: 'italic',
    marginTop: 4,
  },
});