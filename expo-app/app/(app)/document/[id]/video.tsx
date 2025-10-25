import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Animated, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { MapViewSimpleWrapper } from '@/components/MapViewSimpleWrapper';
import { PROSE_STYLES } from '@/styles/prose-styles';

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
  const [typedText, setTypedText] = useState<string>('');
  const [showCursor, setShowCursor] = useState<boolean>(true);
  const currentFocusedLocationRef = useRef<string | null>(null); // Track current focused location ID

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(-100)).current; // Start off-screen left
  const cursorBlinkAnim = useRef(new Animated.Value(1)).current;

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

  // Cursor blink animation
  useEffect(() => {
    const blinkAnimation = Animated.loop(
      Animated.sequence([
        Animated.timing(cursorBlinkAnim, {
          toValue: 0,
          duration: 500,
          useNativeDriver: true,
        }),
        Animated.timing(cursorBlinkAnim, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
      ])
    );
    blinkAnimation.start();
    return () => blinkAnimation.stop();
  }, []);

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
          // Only update if location ID has changed (prevents camera animation spam)
          if (location.geoId !== currentFocusedLocationRef.current) {
            console.log(`[VideoPlayback] Focusing on location: ${location.placeName} (${location.lat}, ${location.lng})`);
            currentFocusedLocationRef.current = location.geoId;
            setFocusedLocation(location);
          } else {
            console.log(`[VideoPlayback] Already focused on ${location.placeName}, skipping setFocusedLocation`);
          }
        } else {
          console.log(`[VideoPlayback] Geo-mark found but location not in list: ${geoMarkInBlock.geoId}`);
        }
      } else {
        console.log(`[VideoPlayback] Block ${i} has no geo-mark`);
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
          setTypedText(''); // Reset typed text

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

      // Typewriter effect - use simple interval-based updates to minimize overhead
      const fullText = extractTextContent(block.content);
      setShowCursor(true);
      setTypedText(''); // Start empty

      console.log(`[Typewriter] Starting for block ${i}, text length: ${fullText.length}`);

      // Instead of requestAnimationFrame, use setInterval for less frequent updates
      const updateInterval = 100; // Update every 100ms (10 updates/sec)
      const charsPerUpdate = 3; // Type 3 characters at once
      let currentIndex = 0;
      let updateCount = 0;
      const typeStartTime = performance.now();

      await new Promise<void>((resolve) => {
        const intervalId = setInterval(() => {
          currentIndex = Math.min(currentIndex + charsPerUpdate, fullText.length);
          setTypedText(fullText.substring(0, currentIndex));
          updateCount++;

          if (currentIndex >= fullText.length) {
            const elapsed = performance.now() - typeStartTime;
            console.log(`[Typewriter] Complete - ${updateCount} updates in ${elapsed.toFixed(0)}ms (avg ${(elapsed / updateCount).toFixed(1)}ms per update)`);
            clearInterval(intervalId);
            setShowCursor(false);
            resolve();
          }
        }, updateInterval);
      });

      // Wait to show the block (faster for non-geo-mark blocks)
      const delay = geoMarkInBlock ? 2000 : 1000;
      await new Promise(resolve => setTimeout(resolve, delay));
    }

    // Animation complete
    setAnimationProgress(100);
    setFocusedLocation(null);
    currentFocusedLocationRef.current = null; // Clear the ref
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

  // Color palette for geo-marks (same as markers)
  const GEO_MARK_COLORS = [
    '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899',
    '#06B6D4', '#84CC16', '#F97316', '#6366F1', '#14B8A6', '#A855F7',
    '#FDE047', '#E879F9', '#FB923C', '#C084FC',
  ];

  // Render inline content (text + geo-marks) with proper styling
  const renderInlineContent = (content: any[], baseStyle: any, charsToShow: number): React.ReactNode[] => {
    const elements: React.ReactNode[] = [];
    let charsSoFar = 0;

    for (let i = 0; i < content.length; i++) {
      const node = content[i];

      if (charsSoFar >= charsToShow) break;

      if (node.type === 'text') {
        const text = node.text || '';
        const availableChars = charsToShow - charsSoFar;
        const displayText = text.substring(0, availableChars);

        elements.push(
          <Text key={i} style={baseStyle}>
            {displayText}
          </Text>
        );

        charsSoFar += displayText.length;
      } else if (node.type === 'geoMark') {
        const geoText = node.content?.map((child: any) => child.text || '').join('') || node.attrs?.placeName || '';
        const availableChars = charsToShow - charsSoFar;
        const displayText = geoText.substring(0, availableChars);

        if (displayText.length > 0) {
          const colorIndex = node.attrs?.colorIndex || 0;
          const circleColor = GEO_MARK_COLORS[colorIndex % GEO_MARK_COLORS.length];

          elements.push(
            <View key={i} style={{ flexDirection: 'row', alignItems: 'stretch' }}>
              <View
                style={{
                  backgroundColor: 'rgba(0, 0, 0, 0.9)',
                  paddingHorizontal: 8,
                  justifyContent: 'center',
                  alignItems: 'center',
                }}
              >
                <View
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 4,
                    backgroundColor: circleColor,
                  }}
                />
              </View>
              <Text style={baseStyle}>
                {displayText}
              </Text>
            </View>
          );
        }

        charsSoFar += displayText.length;
      }
    }

    return elements;
  };

  // Simple renderer for video overlay - stacked lines with individual backgrounds and typewriter effect
  const renderBlock = (block: BlockNode) => {
    if (!block) return null;

    const displayLength = typedText.length; // How many characters to show

    switch (block.type) {
      case 'heading': {
        const level = block.attrs?.level || 1;
        const headingStyle = level === 1 ? styles.videoH1 : level === 2 ? styles.videoH2 : styles.videoH3;

        return (
          <View style={styles.textLinesContainer}>
            <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' }}>
              {renderInlineContent(block.content || [], headingStyle, displayLength)}
              {showCursor && (
                <Animated.Text style={[styles.cursor, { opacity: cursorBlinkAnim }]}>
                  |
                </Animated.Text>
              )}
            </View>
          </View>
        );
      }
      case 'paragraph': {
        return (
          <View style={styles.textLinesContainer}>
            <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' }}>
              {renderInlineContent(block.content || [], styles.videoParagraph, displayLength)}
              {showCursor && (
                <Animated.Text style={[styles.cursor, { opacity: cursorBlinkAnim }]}>
                  |
                </Animated.Text>
              )}
            </View>
          </View>
        );
      }
      default:
        return null;
    }
  };

  // Extract plain text from block content
  const extractTextContent = (content?: any[]): string => {
    if (!content) return '';
    return content
      .map((node: any) => {
        if (node.type === 'text') return node.text || '';
        if (node.type === 'geoMark') {
          return node.content?.map((child: any) => child.text || '').join('') || node.attrs?.placeName || '';
        }
        return '';
      })
      .join('');
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
          {renderBlock(allBlocks[currentBlockIndex])}
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
    top: 200, // Position from top instead of bottom
    left: 24,
    right: 24,
  },
  textLinesContainer: {
    alignItems: 'flex-start', // Left-align the text lines
    gap: 4, // Space between lines
  },
  cursor: {
    color: '#ffffff',
    fontSize: 24,
    fontWeight: '300',
    marginLeft: 2,
    backgroundColor: 'transparent',
  },
  // Video-specific text styles - white text with black backgrounds
  videoH1: {
    fontSize: PROSE_STYLES.h1.fontSize,
    fontWeight: PROSE_STYLES.h1.fontWeight as any,
    color: '#ffffff',
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 4,
    overflow: 'hidden',
    textShadowColor: 'rgba(0, 0, 0, 1)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  videoH2: {
    fontSize: PROSE_STYLES.h2.fontSize,
    fontWeight: PROSE_STYLES.h2.fontWeight as any,
    color: '#ffffff',
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginBottom: 4,
    overflow: 'hidden',
    textShadowColor: 'rgba(0, 0, 0, 1)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  videoH3: {
    fontSize: PROSE_STYLES.h3.fontSize,
    fontWeight: PROSE_STYLES.h3.fontWeight as any,
    color: '#ffffff',
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginBottom: 4,
    overflow: 'hidden',
    textShadowColor: 'rgba(0, 0, 0, 1)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  videoParagraph: {
    fontSize: PROSE_STYLES.paragraph.fontSize,
    lineHeight: PROSE_STYLES.paragraph.lineHeight,
    color: '#ffffff',
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    overflow: 'hidden',
    textShadowColor: 'rgba(0, 0, 0, 1)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
});
