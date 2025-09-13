import React, { useState, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
} from 'react-native';
import { TipTapEditorWrapper } from '@/components/TipTapEditorWrapper';
import { MapViewWrapper } from '@/components/MapViewWrapper';
import { useItineraryStore } from '@/stores/itinerary-store';
import { JSONContent } from '@tiptap/react';
import { geocodeLocation } from '@/utils/geocoding';

export default function ItineraryScreen() {
  const {
    currentItinerary,
    setItinerary,
    updateDocument,
    addDestination,
    removeDestination,
    viewMode,
    setViewMode,
    calculateTotalCost,
    syncDestinationsFromDocument,
  } = useItineraryStore();
  const [newDestination, setNewDestination] = useState({
    name: '',
    description: '',
  });

  const handleDocumentChange = useCallback((content: JSONContent) => {
    updateDocument(content);
  }, [updateDocument]);

  const handleAddDestination = useCallback(async () => {
    if (!newDestination.name) {
      Alert.alert('Error', 'Please enter a destination name');
      return;
    }

    // Try to geocode the location
    const coords = await geocodeLocation(newDestination.name);
    
    addDestination({
      id: Date.now().toString(),
      name: newDestination.name,
      description: newDestination.description,
      location: coords || {
        lat: 48.8566, // Default to Paris if geocoding fails
        lng: 2.3522,
      },
    });

    setNewDestination({ name: '', description: '' });
  }, [newDestination, addDestination]);

  const handleMapClick = useCallback((lat: number, lng: number) => {
    Alert.prompt(
      'Add Destination',
      'Enter a name for this location:',
      (name) => {
        if (name) {
          addDestination({
            id: Date.now().toString(),
            name,
            location: { lat, lng },
          });
        }
      }
    );
  }, [addDestination]);

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Create Itinerary</Text>
        <View style={styles.viewModeContainer}>
          <TouchableOpacity
            style={[styles.viewModeButton, viewMode === 'text' && styles.viewModeButtonActive]}
            onPress={() => setViewMode('text')}
          >
            <Text style={[styles.viewModeButtonText, viewMode === 'text' && styles.viewModeButtonTextActive]}>
              📝 Text
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.viewModeButton, viewMode === 'map' && styles.viewModeButtonActive]}
            onPress={() => setViewMode('map')}
          >
            <Text style={[styles.viewModeButtonText, viewMode === 'map' && styles.viewModeButtonTextActive]}>
              🗺️ Map
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.viewModeButton, viewMode === 'split' && styles.viewModeButtonActive]}
            onPress={() => setViewMode('split')}
          >
            <Text style={[styles.viewModeButtonText, viewMode === 'split' && styles.viewModeButtonTextActive]}>
              ↔️ Split
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.section}>
        <TextInput
          style={styles.input}
          placeholder="Itinerary Title"
          value={currentItinerary.title}
          onChangeText={(text) => setItinerary({ title: text })}
        />
        <TextInput
          style={[styles.input, styles.textArea]}
          placeholder="Description"
          value={currentItinerary.description}
          onChangeText={(text) => setItinerary({ description: text })}
          multiline
          numberOfLines={3}
        />
      </View>

      {/* Show map in map or split view */}
      {(viewMode === 'map' || viewMode === 'split') && (
        <View style={[styles.section, viewMode === 'map' && styles.fullHeight]}>
          <View style={styles.mapHeader}>
            <Text style={styles.sectionTitle}>Map View</Text>
            {currentItinerary.totalCost > 0 && (
              <Text style={styles.totalCost}>
                Total: ${calculateTotalCost()}
              </Text>
            )}
          </View>
          <MapViewWrapper
            locations={currentItinerary.destinations.map((d, index) => ({
              id: d.id,
              name: d.name,
              lat: d.location?.lat || 0,
              lng: d.location?.lng || 0,
              description: d.description,
              colorIndex: d.colorIndex || index,
            }))}
            onMapClick={handleMapClick}
            height={viewMode === 'map' ? 600 : 300}
          />
        </View>
      )}

      {/* Only show destination management in text view */}
      {viewMode === 'text' && (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Destinations</Text>
        <View style={styles.destinationForm}>
          <TextInput
            style={styles.input}
            placeholder="Destination name"
            value={newDestination.name}
            onChangeText={(text) => setNewDestination({ ...newDestination, name: text })}
          />
          <TextInput
            style={styles.input}
            placeholder="Description (optional)"
            value={newDestination.description}
            onChangeText={(text) => setNewDestination({ ...newDestination, description: text })}
          />
          <TouchableOpacity style={styles.addButton} onPress={handleAddDestination}>
            <Text style={styles.addButtonText}>Add Destination</Text>
          </TouchableOpacity>
        </View>

        {currentItinerary.destinations.map((destination) => (
          <View key={destination.id} style={styles.destinationCard}>
            <View style={styles.destinationInfo}>
              <Text style={styles.destinationName}>{destination.name}</Text>
              {destination.description && (
                <Text style={styles.destinationDescription}>{destination.description}</Text>
              )}
            </View>
            <TouchableOpacity
              onPress={() => removeDestination(destination.id)}
              style={styles.removeButton}
            >
              <Text style={styles.removeButtonText}>Remove</Text>
            </TouchableOpacity>
          </View>
        ))}
      </View>
      )}

      {/* Show editor in text or split view */}
      {(viewMode === 'text' || viewMode === 'split') && (
        <View style={styles.section}>
          <View style={styles.editorHeader}>
            <Text style={styles.sectionTitle}>Itinerary Details</Text>
            <TouchableOpacity
              style={styles.syncButton}
              onPress={syncDestinationsFromDocument}
            >
              <Text style={styles.syncButtonText}>🔄 Sync</Text>
            </TouchableOpacity>
          </View>
          <TipTapEditorWrapper
            content={currentItinerary.document || ''}
            onChange={handleDocumentChange}
            placeholder="Write your itinerary details here..."
            height={viewMode === 'text' ? 600 : 400}
          />
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e5e5',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  viewModeContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  viewModeButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#f0f0f0',
  },
  viewModeButtonActive: {
    backgroundColor: '#007AFF',
  },
  viewModeButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  viewModeButtonTextActive: {
    color: 'white',
  },
  mapHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  totalCost: {
    fontSize: 16,
    fontWeight: '600',
    color: '#007AFF',
  },
  editorHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  syncButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#10B981',
    borderRadius: 6,
  },
  syncButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
  fullHeight: {
    minHeight: 600,
  },
  section: {
    padding: 20,
    backgroundColor: 'white',
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 16,
  },
  input: {
    borderWidth: 1,
    borderColor: '#e5e5e5',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    fontSize: 16,
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  destinationForm: {
    marginBottom: 16,
  },
  addButton: {
    backgroundColor: '#007AFF',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  addButtonText: {
    color: 'white',
    fontWeight: '600',
  },
  destinationCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
    marginBottom: 8,
  },
  destinationInfo: {
    flex: 1,
  },
  destinationName: {
    fontSize: 16,
    fontWeight: '600',
  },
  destinationDescription: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  removeButton: {
    padding: 8,
  },
  removeButtonText: {
    color: '#FF3B30',
    fontWeight: '600',
  },
});