import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface LocationResult {
  lat: string;
  lon: string;
  display_name: string;
  address?: {
    city?: string;
    country?: string;
    state?: string;
  };
}

interface LocationResultsListProps {
  results: LocationResult[];
  isLoading: boolean;
  onSelectResult: (result: LocationResult, index: number) => void;
  selectedIndex: number;
}

export default function LocationResultsList({
  results,
  isLoading,
  onSelectResult,
  selectedIndex,
}: LocationResultsListProps) {
  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#3B82F6" />
        <Text style={styles.loadingText}>Searching locations...</Text>
      </View>
    );
  }

  if (results.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Ionicons name="location-outline" size={48} color="#D1D5DB" />
        <Text style={styles.emptyText}>No locations found</Text>
        <Text style={styles.emptySubtext}>Try a different search term</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
      {results.map((result, index) => (
        <TouchableOpacity
          key={`${result.lat}-${result.lon}-${index}`}
          style={[
            styles.resultCard,
            selectedIndex === index && styles.resultCardSelected,
          ]}
          onPress={() => onSelectResult(result, index)}
        >
          {/* Number badge */}
          <View style={[
            styles.numberBadge,
            selectedIndex === index && styles.numberBadgeSelected,
          ]}>
            <Text style={[
              styles.numberText,
              selectedIndex === index && styles.numberTextSelected,
            ]}>
              {index + 1}
            </Text>
          </View>

          {/* Location info */}
          <View style={styles.resultContent}>
            <Text style={[
              styles.resultTitle,
              selectedIndex === index && styles.resultTitleSelected,
            ]} numberOfLines={2}>
              {result.display_name}
            </Text>

            {result.address && (
              <View style={styles.addressContainer}>
                {result.address.city && (
                  <Text style={styles.addressText}>
                    {result.address.city}
                  </Text>
                )}
                {result.address.country && (
                  <Text style={styles.addressText}>
                    • {result.address.country}
                  </Text>
                )}
              </View>
            )}

            {/* Coordinates */}
            <Text style={styles.coordinates}>
              {parseFloat(result.lat).toFixed(4)}, {parseFloat(result.lon).toFixed(4)}
            </Text>
          </View>

          {/* Arrow icon */}
          <View style={styles.arrowContainer}>
            <Ionicons
              name="chevron-forward"
              size={20}
              color={selectedIndex === index ? '#3B82F6' : '#9CA3AF'}
            />
          </View>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    gap: 12,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#6B7280',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    marginTop: 16,
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
  },
  emptySubtext: {
    marginTop: 4,
    fontSize: 14,
    color: '#9CA3AF',
  },
  resultCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#E5E7EB',
    gap: 12,
  },
  resultCardSelected: {
    borderColor: '#3B82F6',
    backgroundColor: '#EFF6FF',
  },
  numberBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  numberBadgeSelected: {
    backgroundColor: '#3B82F6',
  },
  numberText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#6B7280',
  },
  numberTextSelected: {
    color: '#FFFFFF',
  },
  resultContent: {
    flex: 1,
  },
  resultTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  resultTitleSelected: {
    color: '#1E40AF',
  },
  addressContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginBottom: 4,
  },
  addressText: {
    fontSize: 13,
    color: '#6B7280',
  },
  coordinates: {
    fontSize: 11,
    color: '#9CA3AF',
    fontFamily: 'monospace',
  },
  arrowContainer: {
    padding: 4,
  },
});
