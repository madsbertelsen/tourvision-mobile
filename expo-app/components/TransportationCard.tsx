import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Feather, MaterialIcons, Ionicons } from '@expo/vector-icons';

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

export default function TransportationCard({ transportation, onPress }: TransportationCardProps) {
  const mode = transportation?.mode || 'walking';
  const duration = transportation?.duration || '5 min';
  const cost = transportation?.cost;
  
  const icon = TRANSPORT_ICONS[mode] || TRANSPORT_ICONS.walking;
  const color = TRANSPORT_COLORS[mode] || TRANSPORT_COLORS.walking;
  
  const IconComponent = 
    icon.library === 'Feather' ? Feather : 
    icon.library === 'MaterialIcons' ? MaterialIcons : 
    Ionicons;

  return (
    <TouchableOpacity style={styles.container} onPress={onPress}>
      <View style={styles.lineContainer}>
        <View style={styles.line} />
      </View>
      
      <View style={styles.card}>
        <View style={[styles.iconContainer, { backgroundColor: `${color}15` }]}>
          <IconComponent name={icon.name} size={16} color={color} />
        </View>
        
        <View style={styles.info}>
          <Text style={styles.duration}>{duration}</Text>
          {cost !== undefined && (
            <Text style={styles.cost}>${cost.toFixed(2)}</Text>
          )}
        </View>
        
        <Feather name="chevron-right" size={16} color="#9CA3AF" />
      </View>
    </TouchableOpacity>
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
    left: 52,
    width: 2,
  },
  line: {
    flex: 1,
    backgroundColor: '#E5E7EB',
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    marginHorizontal: 52,
    marginVertical: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  iconContainer: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  info: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  duration: {
    fontSize: 13,
    fontWeight: '500',
    color: '#374151',
  },
  cost: {
    fontSize: 12,
    color: '#6B7280',
  },
});