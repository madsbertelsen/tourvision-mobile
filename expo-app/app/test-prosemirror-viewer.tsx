import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Platform, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ProseMirrorViewerWrapper } from '@/components/ProseMirrorViewerWrapper';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { parseHTMLToProseMirror } from '@/utils/prosemirror-parser';

// Mock ProseMirror document for testing
const createMockDocument = () => {
  return {
    type: 'doc',
    content: [
      {
        type: 'heading',
        attrs: { level: 1, id: 'heading-1' },
        content: [{ type: 'text', text: 'Barcelona Adventure - 3 Day Itinerary' }]
      },
      {
        type: 'paragraph',
        attrs: { id: 'intro-1' },
        content: [
          { type: 'text', text: 'Welcome to your Barcelona adventure! This 3-day itinerary covers the must-see attractions including ' },
          {
            type: 'geoMark',
            attrs: {
              lat: 41.4036,
              lng: 2.1744,
              placeName: 'Sagrada Familia',
              geoId: 'sagrada-1',
              colorIndex: 0
            },
            content: [{ type: 'text', text: 'Sagrada Familia' }]
          },
          { type: 'text', text: ', ' },
          {
            type: 'geoMark',
            attrs: {
              lat: 41.3947,
              lng: 2.1615,
              placeName: 'Park Güell',
              geoId: 'park-guell-1',
              colorIndex: 1
            },
            content: [{ type: 'text', text: 'Park Güell' }]
          },
          { type: 'text', text: ', and the vibrant ' },
          {
            type: 'geoMark',
            attrs: {
              lat: 41.3816,
              lng: 2.1713,
              placeName: 'La Rambla',
              geoId: 'rambla-1',
              colorIndex: 2
            },
            content: [{ type: 'text', text: 'La Rambla' }]
          },
          { type: 'text', text: '.' }
        ]
      },
      {
        type: 'heading',
        attrs: { level: 2, id: 'day1-heading' },
        content: [{ type: 'text', text: 'Day 1: Gothic Quarter & Beach' }]
      },
      {
        type: 'paragraph',
        attrs: { id: 'day1-morning' },
        content: [
          { type: 'text', text: 'Start your morning exploring the historic ' },
          {
            type: 'geoMark',
            attrs: {
              lat: 41.3839,
              lng: 2.1764,
              placeName: 'Gothic Quarter',
              geoId: 'gothic-1',
              colorIndex: 3
            },
            content: [{ type: 'text', text: 'Gothic Quarter' }]
          },
          { type: 'text', text: '. Wander through the narrow medieval streets and discover the ' },
          {
            type: 'geoMark',
            attrs: {
              lat: 41.3840,
              lng: 2.1762,
              placeName: 'Barcelona Cathedral',
              geoId: 'cathedral-1',
              colorIndex: 4
            },
            content: [{ type: 'text', text: 'Barcelona Cathedral' }]
          },
          { type: 'text', text: '.' }
        ]
      },
      {
        type: 'paragraph',
        attrs: { id: 'day1-afternoon' },
        content: [
          { type: 'text', text: 'In the afternoon, head to ' },
          {
            type: 'geoMark',
            attrs: {
              lat: 41.3768,
              lng: 2.1900,
              placeName: 'Barceloneta Beach',
              geoId: 'beach-1',
              colorIndex: 5
            },
            content: [{ type: 'text', text: 'Barceloneta Beach' }]
          },
          { type: 'text', text: ' for some sun and relaxation. Enjoy fresh seafood at a beachside chiringuito.' }
        ]
      },
      {
        type: 'heading',
        attrs: { level: 2, id: 'day2-heading' },
        content: [{ type: 'text', text: 'Day 2: Gaudí Architecture' }]
      },
      {
        type: 'paragraph',
        attrs: { id: 'day2-morning' },
        content: [
          { type: 'text', text: 'Dedicate this day to exploring Antoni Gaudí\'s masterpieces. Start early at ' },
          {
            type: 'geoMark',
            attrs: {
              lat: 41.4036,
              lng: 2.1744,
              placeName: 'Sagrada Familia',
              geoId: 'sagrada-2',
              colorIndex: 0
            },
            content: [{ type: 'text', text: 'Sagrada Familia' }]
          },
          { type: 'text', text: ' (book tickets in advance!).' }
        ]
      },
      {
        type: 'paragraph',
        attrs: { id: 'day2-afternoon' },
        content: [
          { type: 'text', text: 'Continue to ' },
          {
            type: 'geoMark',
            attrs: {
              lat: 41.3947,
              lng: 2.1615,
              placeName: 'Park Güell',
              geoId: 'park-guell-2',
              colorIndex: 1
            },
            content: [{ type: 'text', text: 'Park Güell' }]
          },
          { type: 'text', text: ' for stunning city views. Don\'t miss ' },
          {
            type: 'geoMark',
            attrs: {
              lat: 41.3917,
              lng: 2.1649,
              placeName: 'Casa Batlló',
              geoId: 'batllo-1',
              colorIndex: 6
            },
            content: [{ type: 'text', text: 'Casa Batlló' }]
          },
          { type: 'text', text: ' on Passeig de Gràcia.' }
        ]
      },
      {
        type: 'heading',
        attrs: { level: 2, id: 'day3-heading' },
        content: [{ type: 'text', text: 'Day 3: Montjuïc & Culture' }]
      },
      {
        type: 'paragraph',
        attrs: { id: 'day3-morning' },
        content: [
          { type: 'text', text: 'Take the cable car up to ' },
          {
            type: 'geoMark',
            attrs: {
              lat: 41.3639,
              lng: 2.1655,
              placeName: 'Montjuïc Castle',
              geoId: 'montjuic-1',
              colorIndex: 7
            },
            content: [{ type: 'text', text: 'Montjuïc Castle' }]
          },
          { type: 'text', text: ' for panoramic views of the city and port.' }
        ]
      },
      {
        type: 'paragraph',
        attrs: { id: 'day3-afternoon' },
        content: [
          { type: 'text', text: 'Visit the ' },
          {
            type: 'geoMark',
            attrs: {
              lat: 41.3708,
              lng: 2.1516,
              placeName: 'Museu Nacional d\'Art de Catalunya',
              geoId: 'mnac-1',
              colorIndex: 8
            },
            content: [{ type: 'text', text: 'Museu Nacional d\'Art de Catalunya' }]
          },
          { type: 'text', text: ' to see Catalan art. End your day watching the ' },
          {
            type: 'geoMark',
            attrs: {
              lat: 41.3711,
              lng: 2.1516,
              placeName: 'Magic Fountain',
              geoId: 'fountain-1',
              colorIndex: 9
            },
            content: [{ type: 'text', text: 'Magic Fountain' }]
          },
          { type: 'text', text: ' show.' }
        ]
      },
      {
        type: 'heading',
        attrs: { level: 3, id: 'tips-heading' },
        content: [{ type: 'text', text: 'Travel Tips' }]
      },
      {
        type: 'paragraph',
        attrs: { id: 'tip-1' },
        content: [
          { type: 'text', text: '• Book attraction tickets online in advance to skip queues' }
        ]
      },
      {
        type: 'paragraph',
        attrs: { id: 'tip-2' },
        content: [
          { type: 'text', text: '• Use the T10 transport card for metro and bus travel' }
        ]
      },
      {
        type: 'paragraph',
        attrs: { id: 'tip-3' },
        content: [
          { type: 'text', text: '• Try local tapas in the evening at El Born neighborhood' }
        ]
      },
      {
        type: 'paragraph',
        attrs: { id: 'tip-4' },
        content: [
          { type: 'text', text: '• Best time to visit is April-June or September-October' }
        ]
      }
    ]
  };
};

export default function TestProseMirrorViewerScreen() {
  const [document, setDocument] = useState<any>(null);
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Load mock document
    const loadDocument = async () => {
      try {
        // Try to load from storage first (if we have a real trip saved)
        const savedTrip = await AsyncStorage.getItem('trip-barcelona-adventure');

        if (savedTrip) {
          const tripData = JSON.parse(savedTrip);
          if (tripData.itineraries && tripData.itineraries.length > 0) {
            setDocument(tripData.itineraries[0]);
          } else {
            // Use mock document
            setDocument(createMockDocument());
          }
        } else {
          // Use mock document
          setDocument(createMockDocument());
        }
      } catch (error) {
        console.error('Error loading document:', error);
        // Fallback to mock document
        setDocument(createMockDocument());
      } finally {
        setLoading(false);
      }
    };

    loadDocument();
  }, []);

  // Handle node focus changes
  const handleNodeFocus = (nodeId: string | null) => {
    console.log('Focused node changed to:', nodeId);
    setFocusedNodeId(nodeId);
  };

  if (Platform.OS !== 'web') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>ProseMirror Viewer</Text>
          <Text style={styles.subtitle}>This test is only available on web platform</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Loading document...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>ProseMirror Document Viewer</Text>
        <Text style={styles.subtitle}>
          {focusedNodeId ? `Focused: ${focusedNodeId}` : 'Scroll to focus nodes'}
        </Text>
      </View>

      <View style={styles.content}>
        <ProseMirrorViewerWrapper
          content={document}
          onNodeFocus={handleNodeFocus}
          focusedNodeId={focusedNodeId}
          height="100%"
        />
      </View>

      {/* Debug panel */}
      <View style={styles.debugPanel}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.debugContent}>
            <Text style={styles.debugTitle}>Debug Info:</Text>
            <Text style={styles.debugText}>
              Nodes: {document?.content?.length || 0}
            </Text>
            <Text style={styles.debugText}>
              Focused: {focusedNodeId || 'none'}
            </Text>
          </View>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  header: {
    padding: 16,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#6b7280',
  },
  content: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
    color: '#6b7280',
  },
  debugPanel: {
    backgroundColor: '#1f2937',
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  debugContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  debugTitle: {
    color: '#9ca3af',
    fontSize: 12,
    fontWeight: '600',
  },
  debugText: {
    color: '#d1d5db',
    fontSize: 12,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
});