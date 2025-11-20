import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useMapContext } from '../_layout';
import { useDocumentNextContext } from '../../_layout';

export default function EditLocationRoute() {
  const { locationId } = useLocalSearchParams();
  const router = useRouter();
  const { setGeoMarkUpdate } = useDocumentNextContext();
  const {
    locations,
    bottomSheetRef,
  } = useMapContext();

  // Find the location by ID
  const location = locations.find(loc => loc.geoId === locationId);

  // Form state
  const [displayText, setDisplayText] = useState(location?.displayText || '');
  const [placeName, setPlaceName] = useState(location?.placeName || '');
  const [description, setDescription] = useState(location?.description || '');
  const [lat, setLat] = useState(location?.lat.toString() || '');
  const [lng, setLng] = useState(location?.lng.toString() || '');

  useEffect(() => {
    // Make sure bottom sheet is expanded
    bottomSheetRef.current?.expand();
  }, [bottomSheetRef]);

  if (!location) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>Location not found</Text>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={20} color="#007AFF" />
          <Text style={styles.backButtonText}>Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const handleBack = () => {
    router.back();
  };

  const handleSave = () => {
    // Validate coordinates
    const newLat = parseFloat(lat);
    const newLng = parseFloat(lng);

    if (isNaN(newLat) || isNaN(newLng)) {
      Alert.alert('Invalid Coordinates', 'Please enter valid latitude and longitude values');
      return;
    }

    // Update the location via context
    setGeoMarkUpdate({
      geoId: location.geoId,
      updatedAttrs: {
        displayText: displayText.trim() || location.placeName,
        placeName: placeName.trim() || location.placeName,
        description: description.trim() || undefined,
        lat: newLat,
        lng: newLng,
      }
    });

    // Navigate back
    router.back();
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      {/* Header with back button */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBack} style={styles.backButtonInline}>
          <Ionicons name="chevron-back" size={24} color="#007AFF" />
        </TouchableOpacity>
        <View style={[
          styles.colorDot,
          { backgroundColor: location.color }
        ]} />
        <Text style={styles.title}>Edit Location</Text>
      </View>

      {/* Form fields */}
      <View style={styles.section}>
        <View style={styles.sectionRow}>
          <Ionicons name="text-outline" size={20} color="#6B7280" />
          <Text style={styles.sectionLabel}>Display Name</Text>
        </View>
        <TextInput
          style={styles.input}
          value={displayText}
          onChangeText={setDisplayText}
          placeholder={location.placeName}
          placeholderTextColor="#9CA3AF"
        />
      </View>

      <View style={styles.section}>
        <View style={styles.sectionRow}>
          <Ionicons name="location-outline" size={20} color="#6B7280" />
          <Text style={styles.sectionLabel}>Full Address</Text>
        </View>
        <TextInput
          style={[styles.input, styles.multilineInput]}
          value={placeName}
          onChangeText={setPlaceName}
          placeholder="Enter full address"
          placeholderTextColor="#9CA3AF"
          multiline
          numberOfLines={2}
        />
      </View>

      <View style={styles.section}>
        <View style={styles.sectionRow}>
          <Ionicons name="document-text-outline" size={20} color="#6B7280" />
          <Text style={styles.sectionLabel}>Description</Text>
        </View>
        <TextInput
          style={[styles.input, styles.multilineInput]}
          value={description}
          onChangeText={setDescription}
          placeholder="Add notes about this location"
          placeholderTextColor="#9CA3AF"
          multiline
          numberOfLines={3}
        />
      </View>

      <View style={styles.section}>
        <View style={styles.sectionRow}>
          <Ionicons name="navigate-outline" size={20} color="#6B7280" />
          <Text style={styles.sectionLabel}>Coordinates</Text>
        </View>
        <View style={styles.coordinatesRow}>
          <View style={styles.coordinateField}>
            <Text style={styles.coordinateLabel}>Latitude</Text>
            <TextInput
              style={styles.coordinateInput}
              value={lat}
              onChangeText={setLat}
              placeholder="0.000000"
              placeholderTextColor="#9CA3AF"
              keyboardType="numeric"
            />
          </View>
          <View style={styles.coordinateField}>
            <Text style={styles.coordinateLabel}>Longitude</Text>
            <TextInput
              style={styles.coordinateInput}
              value={lng}
              onChangeText={setLng}
              placeholder="0.000000"
              placeholderTextColor="#9CA3AF"
              keyboardType="numeric"
            />
          </View>
        </View>
      </View>

      {/* Action buttons */}
      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.button, styles.primaryButton]}
          onPress={handleSave}
        >
          <Ionicons name="checkmark" size={20} color="#fff" />
          <Text style={styles.primaryButtonText}>Save Changes</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, styles.secondaryButton]}
          onPress={handleBack}
        >
          <Text style={styles.secondaryButtonText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentContainer: {
    paddingBottom: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  backButtonInline: {
    marginRight: 12,
  },
  colorDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 12,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: '#111827',
    flex: 1,
  },
  section: {
    marginBottom: 20,
  },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#6B7280',
    marginLeft: 8,
  },
  input: {
    backgroundColor: '#F9FAFB',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    fontSize: 16,
    color: '#111827',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  multilineInput: {
    minHeight: 60,
    textAlignVertical: 'top',
  },
  coordinatesRow: {
    flexDirection: 'row',
    gap: 12,
  },
  coordinateField: {
    flex: 1,
  },
  coordinateLabel: {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 4,
  },
  coordinateInput: {
    backgroundColor: '#F9FAFB',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    fontSize: 14,
    color: '#111827',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  actions: {
    marginTop: 20,
    gap: 12,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 10,
    gap: 8,
  },
  primaryButton: {
    backgroundColor: '#007AFF',
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  secondaryButtonText: {
    color: '#6B7280',
    fontSize: 16,
    fontWeight: '600',
  },
  errorText: {
    fontSize: 16,
    color: '#EF4444',
    textAlign: 'center',
    marginTop: 20,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
    gap: 4,
  },
  backButtonText: {
    fontSize: 16,
    color: '#007AFF',
  },
});