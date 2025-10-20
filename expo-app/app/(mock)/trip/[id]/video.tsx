import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Animated, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { MapViewSimpleWrapper } from '@/components/MapViewSimpleWrapper';
import ProseMirrorNativeRenderer from '@/components/ProseMirrorNativeRenderer';

interface Location {
  geoId: string;
  placeName: string;
  lat: number;
  lng: number;
  text: string;
}

interface BlockNode {
  type: string;
  attrs?: any;
  content?: any[];
  marks?: any[];
  text?: string;
}

const { width, height } = Dimensions.get('window');

export default function VideoPlaybackScreen() {
  const params = useLocalSearchParams();
  const { tripId, documentContent } = params;

  const [isPlaying, setIsPlaying] = useState(false);
  const [locations, setLocations] = useState<Location[]>([]);
  const [focusedLocation, setFocusedLocation] = useState<Location | null>(null);
  const [animationProgress, setAnimationProgress] = useState(0);
  const [currentBlockIndex, setCurrentBlockIndex] = useState<number>(-1);
  const [allBlocks, setAllBlocks] = useState<BlockNode[]>([]);
  const [parsedDoc, setParsedDoc] = useState<any>(null);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(-100)).current; // Start off-screen left

  // Parse document content and extract locations and blocks
  useEffect(() => {
    if (typeof documentContent === 'string') {
      try {
        const doc = JSON.parse(documentContent);
        setParsedDoc(doc);

        const extractedLocations = extractLocations(doc);
        setLocations(extractedLocations);

        // Extract top-level block nodes from document
        const blocks = doc.content || [];
        setAllBlocks(blocks);

        console.log('[VideoPlayback] Extracted locations:', extractedLocations);
        console.log('[VideoPlayback] Extracted blocks:', blocks.length);
      } catch (error) {
        console.error('[VideoPlayback] Failed to parse document:', error);
      }
    }
  }, [documentContent]);

  // Auto-start animation when locations are set
  useEffect(() => {
    if (locations.length > 0 && !isPlaying) {
      setIsPlaying(true);
      // Small delay to ensure map is rendered
      setTimeout(() => startAnimation(), 500);
    }
  }, [locations]);

  // Extract geo-mark locations from document
  const extractLocations = (doc: any): Location[] => {
    const locs: Location[] = [];

    const traverse = (node: any) => {
      if (node.type === 'geoMark') {
        const attrs = node.attrs || {};
        const text = node.content?.map((child: any) => child.text || '').join('') || attrs.placeName || '';

        if (attrs.lat && attrs.lng) {
          locs.push({
            geoId: attrs.geoId || `loc-${locs.length}`,
            placeName: attrs.placeName || text,
            lat: parseFloat(attrs.lat),
            lng: parseFloat(attrs.lng),
            text,
          });
        }
      }

      if (node.content) {
        node.content.forEach(traverse);
      }
    };

    traverse(doc);
    return locs;
  };

  const startAnimation = async () => {
    if (allBlocks.length === 0) {
      console.warn('[VideoPlayback] No blocks to animate');
      return;
    }

    console.log('[VideoPlayback] Starting animation with', allBlocks.length, 'blocks');

    // Animate through each block
    for (let i = 0; i < allBlocks.length; i++) {
      const block = allBlocks[i];
      setAnimationProgress(((i + 1) / allBlocks.length) * 100);

      // Check if this block contains a geo-mark
      const geoMarkInBlock = findGeoMarkInBlock(block);
      if (geoMarkInBlock) {
        const location = locations.find(loc => loc.geoId === geoMarkInBlock.geoId);
        if (location) {
          setFocusedLocation(location);
        }
      }

      // Check if current block is a heading
      const isHeading = block.type === 'heading';

      // Fade out previous block, show new block
      await new Promise<void>((resolve) => {
        // Fade out and slide out
        Animated.parallel([
          Animated.timing(fadeAnim, {
            toValue: 0,
            duration: 300,
            useNativeDriver: true,
          }),
          Animated.timing(slideAnim, {
            toValue: 100, // Slide right for exit
            duration: 300,
            useNativeDriver: true,
          }),
        ]).start(() => {
          // Update to new block
          setCurrentBlockIndex(i);

          // Reset slide position for entry
          slideAnim.setValue(isHeading ? -100 : 0); // Headings slide from left

          // Fade in and slide in
          Animated.parallel([
            Animated.timing(fadeAnim, {
              toValue: 1,
              duration: 500,
              useNativeDriver: true,
            }),
            Animated.timing(slideAnim, {
              toValue: 0, // Slide to center
              duration: 500,
              useNativeDriver: true,
            }),
          ]).start(() => {
            resolve();
          });
        });
      });

      // Wait to show the block (faster for non-geo-mark blocks)
      const delay = geoMarkInBlock ? 3000 : 1500;
      await new Promise(resolve => setTimeout(resolve, delay));
    }

    // Animation complete
    setAnimationProgress(100);
    setFocusedLocation(null);
  };

  // Helper to find geo-mark in a block node
  const findGeoMarkInBlock = (block: BlockNode): { geoId: string } | null => {
    if (block.type === 'geoMark' && block.attrs?.geoId) {
      return { geoId: block.attrs.geoId };
    }

    // Recursively search content
    if (block.content) {
      for (const child of block.content) {
        const found = findGeoMarkInBlock(child);
        if (found) return found;
      }
    }

    return null;
  };

  const handleClose = () => {
    router.back();
  };

  // Calculate center point of all locations
  const getMapCenter = () => {
    if (locations.length === 0) return null;

    const avgLat = locations.reduce((sum, loc) => sum + loc.lat, 0) / locations.length;
    const avgLng = locations.reduce((sum, loc) => sum + loc.lng, 0) / locations.length;

    return { lat: avgLat, lng: avgLng };
  };

  const center = getMapCenter();

  return (
    <View style={styles.container}>
      {/* Full-screen Map Background */}
      <View style={styles.mapContainer}>
        {center && (
          <MapViewSimpleWrapper
            center={center}
            height="100%"
            focusedLocation={focusedLocation ? {
              id: focusedLocation.geoId,
              name: focusedLocation.placeName,
              lat: focusedLocation.lat,
              lng: focusedLocation.lng,
            } : null}
          />
        )}
      </View>

      {/* Overlay Header */}
      <SafeAreaView style={styles.overlayHeader} edges={['top']}>
        <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
          <View style={styles.closeButtonBg}>
            <Ionicons name="close" size={24} color="#fff" />
          </View>
        </TouchableOpacity>

        {isPlaying && (
          <View style={styles.progressContainer}>
            <View style={styles.progressBar}>
              <View style={[styles.progressFill, { width: `${animationProgress}%` }]} />
            </View>
            <Text style={styles.progressText}>
              {Math.round(animationProgress)}%
            </Text>
          </View>
        )}
      </SafeAreaView>

      {/* Content Overlay - Show current block with fade and slide animation */}
      {parsedDoc && currentBlockIndex >= 0 && currentBlockIndex < allBlocks.length && (
        <Animated.View style={[
          styles.contentOverlay,
          {
            opacity: fadeAnim,
            transform: [{ translateX: slideAnim }]
          }
        ]}>
          <ProseMirrorNativeRenderer
            content={{
              type: 'doc',
              content: [allBlocks[currentBlockIndex]]
            }}
            tripId={tripId as string}
          />
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  mapContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  overlayHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  closeButton: {
    zIndex: 10,
  },
  closeButtonBg: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  progressContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 16,
    gap: 12,
  },
  progressBar: {
    flex: 1,
    height: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#10B981',
    borderRadius: 2,
  },
  progressText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
    textShadowColor: 'rgba(0, 0, 0, 0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  contentOverlay: {
    position: 'absolute',
    bottom: 120,
    left: 24,
    right: 24,
    padding: 20,
  },
});
