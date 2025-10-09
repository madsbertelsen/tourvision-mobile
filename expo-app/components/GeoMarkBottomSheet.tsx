import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import BottomSheet, { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { Picker } from '@react-native-picker/picker';

interface GeoMarkData {
  placeName: string;
  lat: string;
  lng: string;
  transportFrom: string;
  transportProfile: string;
  description: string;
  colorIndex: number;
}

interface LocationSuggestion {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
}

interface GeoMarkBottomSheetProps {
  isVisible: boolean;
  initialData?: Partial<GeoMarkData>;
  existingLocations?: Array<{ geoId: string; placeName: string }>;
  onSave: (data: GeoMarkData) => void;
  onCancel: () => void;
}

const COLORS = [
  '#3B82F6', '#8B5CF6', '#10B981', '#F59E0B', '#EF4444',
  '#EC4899', '#06B6D4', '#84CC16', '#F97316', '#6366F1'
];

const TRANSPORT_MODES = [
  { value: '', label: 'None', emoji: '' },
  { value: 'walking', label: 'Walking', emoji: '🚶' },
  { value: 'driving', label: 'Driving', emoji: '🚗' },
  { value: 'cycling', label: 'Cycling', emoji: '🚴' },
  { value: 'transit', label: 'Public Transit', emoji: '🚇' },
];

export function GeoMarkBottomSheet({
  isVisible,
  initialData = {},
  existingLocations = [],
  onSave,
  onCancel,
}: GeoMarkBottomSheetProps) {
  const bottomSheetRef = React.useRef<BottomSheet>(null);
  const snapPoints = useMemo(() => ['75%', '90%'], []);

  const [formData, setFormData] = useState<GeoMarkData>({
    placeName: initialData?.placeName || '',
    lat: initialData?.lat || '',
    lng: initialData?.lng || '',
    transportFrom: initialData?.transportFrom || '',
    transportProfile: initialData?.transportProfile || 'walking',
    description: initialData?.description || '',
    colorIndex: initialData?.colorIndex ?? 0,
  });

  const [suggestions, setSuggestions] = useState<LocationSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Update form data when initialData changes
  useEffect(() => {
    if (initialData) {
      setFormData({
        placeName: initialData.placeName || '',
        lat: initialData.lat || '',
        lng: initialData.lng || '',
        transportFrom: initialData.transportFrom || '',
        transportProfile: initialData.transportProfile || 'walking',
        description: initialData.description || '',
        colorIndex: initialData.colorIndex ?? 0,
      });
    }
  }, [initialData]);

  // Fetch location suggestions from Nominatim
  useEffect(() => {
    const searchQuery = initialData?.placeName;
    if (!searchQuery || searchQuery.trim().length < 2) {
      return;
    }

    const fetchSuggestions = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(searchQuery)}&format=jsonv2&limit=5`,
          {
            headers: {
              'User-Agent': 'TourVision-App',
            },
          }
        );

        if (!response.ok) {
          throw new Error('Failed to fetch location suggestions');
        }

        const data = await response.json();
        setSuggestions(data);
      } catch (err) {
        console.error('Error fetching Nominatim suggestions:', err);
        setError('Unable to fetch location suggestions');
      } finally {
        setIsLoading(false);
      }
    };

    fetchSuggestions();
  }, [initialData?.placeName]);

  // Handle bottom sheet visibility
  useEffect(() => {
    if (isVisible) {
      bottomSheetRef.current?.expand();
    } else {
      bottomSheetRef.current?.close();
    }
  }, [isVisible]);

  const handleSuggestionClick = useCallback((suggestion: LocationSuggestion) => {
    setFormData((prev) => ({
      ...prev,
      placeName: suggestion.display_name,
      lat: suggestion.lat,
      lng: suggestion.lon,
    }));
    setSuggestions([]);
  }, []);

  const handleSave = useCallback(() => {
    onSave(formData);
  }, [formData, onSave]);

  const handleColorSelect = useCallback((index: number) => {
    setFormData((prev) => ({ ...prev, colorIndex: index }));
  }, []);

  if (!isVisible) return null;

  return (
    <BottomSheet
      ref={bottomSheetRef}
      index={0}
      snapPoints={snapPoints}
      enablePanDownToClose
      onClose={onCancel}
    >
      <BottomSheetScrollView style={styles.container}>
        <Text style={styles.title}>Add Location</Text>

        {/* Place Name */}
        <View style={styles.formGroup}>
          <Text style={styles.label}>Place Name</Text>
          <TextInput
            style={styles.input}
            value={formData.placeName}
            onChangeText={(text) => setFormData({ ...formData, placeName: text })}
            placeholder="e.g. Eiffel Tower"
            autoFocus
          />

          {/* Location Suggestions */}
          {isLoading && (
            <View style={styles.suggestionsLoading}>
              <ActivityIndicator size="small" color="#6B7280" />
              <Text style={styles.suggestionsLoadingText}>Searching for locations...</Text>
            </View>
          )}

          {error && (
            <View style={styles.suggestionsError}>
              <Text style={styles.suggestionsErrorText}>{error}</Text>
            </View>
          )}

          {!isLoading && !error && suggestions.length > 0 && (
            <View style={styles.suggestionsList}>
              <Text style={styles.suggestionsHeader}>Select a location:</Text>
              {suggestions.map((suggestion) => (
                <TouchableOpacity
                  key={suggestion.place_id}
                  style={styles.suggestionItem}
                  onPress={() => handleSuggestionClick(suggestion)}
                >
                  <Text style={styles.suggestionName}>{suggestion.display_name}</Text>
                  <Text style={styles.suggestionCoords}>
                    {parseFloat(suggestion.lat).toFixed(4)}, {parseFloat(suggestion.lon).toFixed(4)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {!isLoading && !error && suggestions.length === 0 && formData.placeName && !formData.lat && !formData.lng && (
            <View style={styles.suggestionsEmpty}>
              <Text style={styles.suggestionsEmptyText}>
                No locations found. Please enter coordinates manually.
              </Text>
            </View>
          )}
        </View>

        {/* Coordinates */}
        <View style={styles.formRow}>
          <View style={[styles.formGroup, styles.formGroupHalf]}>
            <Text style={styles.label}>Latitude</Text>
            <TextInput
              style={styles.input}
              value={formData.lat}
              onChangeText={(text) => setFormData({ ...formData, lat: text })}
              placeholder="48.8584"
              keyboardType="decimal-pad"
            />
          </View>
          <View style={[styles.formGroup, styles.formGroupHalf]}>
            <Text style={styles.label}>Longitude</Text>
            <TextInput
              style={styles.input}
              value={formData.lng}
              onChangeText={(text) => setFormData({ ...formData, lng: text })}
              placeholder="2.2945"
              keyboardType="decimal-pad"
            />
          </View>
        </View>

        {/* Transportation Mode */}
        <View style={styles.formGroup}>
          <Text style={styles.label}>Transportation Mode</Text>
          <View style={styles.pickerContainer}>
            <Picker
              selectedValue={formData.transportProfile}
              onValueChange={(value) => setFormData({ ...formData, transportProfile: value })}
              style={styles.picker}
            >
              {TRANSPORT_MODES.map((mode) => (
                <Picker.Item
                  key={mode.value}
                  label={`${mode.emoji} ${mode.label}`.trim()}
                  value={mode.value}
                />
              ))}
            </Picker>
          </View>
        </View>

        {/* Coming From (if transport mode selected) */}
        {formData.transportProfile && (
          <View style={styles.formGroup}>
            <Text style={styles.label}>Coming from</Text>
            <View style={styles.pickerContainer}>
              <Picker
                selectedValue={formData.transportFrom}
                onValueChange={(value) => setFormData({ ...formData, transportFrom: value })}
                style={styles.picker}
              >
                <Picker.Item label="Select previous location..." value="" />
                {existingLocations.map((loc) => (
                  <Picker.Item
                    key={loc.geoId}
                    label={loc.placeName}
                    value={loc.geoId}
                  />
                ))}
              </Picker>
            </View>
          </View>
        )}

        {/* Description */}
        <View style={styles.formGroup}>
          <Text style={styles.label}>Description</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={formData.description}
            onChangeText={(text) => setFormData({ ...formData, description: text })}
            placeholder="Additional notes..."
            multiline
            numberOfLines={3}
          />
        </View>

        {/* Color Picker */}
        <View style={styles.formGroup}>
          <Text style={styles.label}>Color</Text>
          <View style={styles.colorPicker}>
            {COLORS.map((color, index) => (
              <TouchableOpacity
                key={index}
                style={[
                  styles.colorOption,
                  { backgroundColor: color },
                  formData.colorIndex === index && styles.colorOptionSelected,
                ]}
                onPress={() => handleColorSelect(index)}
              />
            ))}
          </View>
        </View>

        {/* Actions */}
        <View style={styles.formActions}>
          <TouchableOpacity style={styles.cancelButton} onPress={onCancel}>
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
            <Text style={styles.saveButtonText}>Save</Text>
          </TouchableOpacity>
        </View>
      </BottomSheetScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 20,
  },
  formGroup: {
    marginBottom: 16,
  },
  formGroupHalf: {
    flex: 1,
  },
  formRow: {
    flexDirection: 'row',
    gap: 12,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 6,
    padding: 12,
    fontSize: 14,
    color: '#111827',
    backgroundColor: '#fff',
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  pickerContainer: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 6,
    backgroundColor: '#fff',
  },
  picker: {
    height: 50,
  },
  suggestionsLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
    padding: 12,
    backgroundColor: '#F3F4F6',
    borderRadius: 6,
  },
  suggestionsLoadingText: {
    fontSize: 13,
    color: '#6B7280',
  },
  suggestionsError: {
    marginTop: 8,
    padding: 12,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 6,
  },
  suggestionsErrorText: {
    fontSize: 13,
    color: '#DC2626',
  },
  suggestionsEmpty: {
    marginTop: 8,
    padding: 12,
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 6,
  },
  suggestionsEmptyText: {
    fontSize: 13,
    color: '#D97706',
  },
  suggestionsList: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 6,
    backgroundColor: '#fff',
    maxHeight: 200,
  },
  suggestionsHeader: {
    padding: 12,
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    backgroundColor: '#F9FAFB',
  },
  suggestionItem: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  suggestionName: {
    fontSize: 14,
    color: '#1F2937',
    fontWeight: '500',
    marginBottom: 4,
  },
  suggestionCoords: {
    fontSize: 12,
    color: '#6B7280',
    fontFamily: 'Courier',
  },
  colorPicker: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  colorOption: {
    width: 32,
    height: 32,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  colorOptionSelected: {
    borderColor: '#1F2937',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  formActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
    marginBottom: 24,
  },
  cancelButton: {
    flex: 1,
    padding: 12,
    borderRadius: 6,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
  },
  saveButton: {
    flex: 1,
    padding: 12,
    borderRadius: 6,
    backgroundColor: '#3B82F6',
    alignItems: 'center',
  },
  saveButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#fff',
  },
});
