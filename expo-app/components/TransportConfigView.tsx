import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

type TransportMode = 'walking' | 'driving' | 'transit' | 'cycling' | 'flight';

interface TransportConfigViewProps {
  locationName: string;
  selectedMode: TransportMode;
  onSelectMode: (mode: TransportMode) => void;
  onAddToDocument: () => void;
  onBack: () => void;
}

const TRANSPORT_MODES: Array<{
  mode: TransportMode;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  description: string;
}> = [
  {
    mode: 'walking',
    label: 'Walking',
    icon: 'walk',
    description: 'On foot',
  },
  {
    mode: 'driving',
    label: 'Driving',
    icon: 'car',
    description: 'By car',
  },
  {
    mode: 'transit',
    label: 'Transit',
    icon: 'bus',
    description: 'Public transport',
  },
  {
    mode: 'cycling',
    label: 'Cycling',
    icon: 'bicycle',
    description: 'By bike',
  },
  {
    mode: 'flight',
    label: 'Flight',
    icon: 'airplane',
    description: 'By plane',
  },
];

export default function TransportConfigView({
  locationName,
  selectedMode,
  onSelectMode,
  onAddToDocument,
  onBack,
}: TransportConfigViewProps) {
  return (
    <View style={styles.container}>
      {/* Header with back button */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#374151" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Transportation</Text>
        <View style={styles.headerSpacer} />
      </View>

      {/* Selected location summary */}
      <View style={styles.locationSummary}>
        <View style={styles.locationIcon}>
          <Ionicons name="location" size={20} color="#3B82F6" />
        </View>
        <View style={styles.locationInfo}>
          <Text style={styles.locationLabel}>Destination</Text>
          <Text style={styles.locationName} numberOfLines={2}>
            {locationName}
          </Text>
        </View>
      </View>

      {/* Transport modes */}
      <ScrollView style={styles.modesScroll} contentContainerStyle={styles.modesContainer}>
        <Text style={styles.sectionLabel}>How will you get there?</Text>

        {TRANSPORT_MODES.map((transport) => (
          <TouchableOpacity
            key={transport.mode}
            style={[
              styles.modeCard,
              selectedMode === transport.mode && styles.modeCardSelected,
            ]}
            onPress={() => onSelectMode(transport.mode)}
          >
            <View style={[
              styles.modeIconContainer,
              selectedMode === transport.mode && styles.modeIconContainerSelected,
            ]}>
              <Ionicons
                name={transport.icon}
                size={24}
                color={selectedMode === transport.mode ? '#3B82F6' : '#6B7280'}
              />
            </View>

            <View style={styles.modeTextContainer}>
              <Text style={[
                styles.modeLabel,
                selectedMode === transport.mode && styles.modeLabelSelected,
              ]}>
                {transport.label}
              </Text>
              <Text style={styles.modeDescription}>{transport.description}</Text>
            </View>

            {selectedMode === transport.mode && (
              <View style={styles.checkmarkContainer}>
                <Ionicons name="checkmark-circle" size={24} color="#3B82F6" />
              </View>
            )}
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Add to document button */}
      <View style={styles.footer}>
        <TouchableOpacity style={styles.addButton} onPress={onAddToDocument}>
          <Ionicons name="add-circle" size={20} color="#FFFFFF" />
          <Text style={styles.addButtonText}>Add to Document</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
  },
  headerSpacer: {
    width: 32, // Match back button width for centering
  },
  locationSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#EFF6FF',
    borderBottomWidth: 1,
    borderBottomColor: '#DBEAFE',
    gap: 12,
  },
  locationIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  locationInfo: {
    flex: 1,
  },
  locationLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  locationName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1E40AF',
  },
  modesScroll: {
    flex: 1,
  },
  modesContainer: {
    padding: 16,
    gap: 12,
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  modeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#E5E7EB',
    gap: 12,
  },
  modeCardSelected: {
    borderColor: '#3B82F6',
    backgroundColor: '#EFF6FF',
  },
  modeIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeIconContainerSelected: {
    backgroundColor: '#DBEAFE',
  },
  modeTextContainer: {
    flex: 1,
  },
  modeLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 2,
  },
  modeLabelSelected: {
    color: '#1E40AF',
  },
  modeDescription: {
    fontSize: 13,
    color: '#6B7280',
  },
  checkmarkContainer: {
    padding: 4,
  },
  footer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    backgroundColor: '#3B82F6',
    borderRadius: 12,
    gap: 8,
  },
  addButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
