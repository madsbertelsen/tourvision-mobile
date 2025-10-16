import React, { useRef, useState, useCallback, useEffect } from 'react';
import { View, StyleSheet, Text, TouchableOpacity, Platform, KeyboardAvoidingView, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import ProseMirrorWebView, { ProseMirrorWebViewRef } from '@/components/ProseMirrorWebView';
import CommentModal from '@/components/CommentModal';
import { router, useLocalSearchParams } from 'expo-router';
import { getTrip, saveTrip } from '@/utils/trips-storage';

export default function EditLocationInfoScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams();
  const {
    locationId,
    tripId,
    name,
    lat,
    lng,
    description,
    photoName,
    colorIndex,
  } = params as {
    locationId: string;
    tripId: string;
    name: string;
    lat?: string;
    lng?: string;
    description?: string;
    photoName?: string;
    colorIndex?: string;
  };

  const [currentDoc, setCurrentDoc] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const documentRef = useRef<ProseMirrorWebViewRef>(null);

  const [toolbarState, setToolbarState] = useState({
    paragraph: false,
    h1: false,
    h2: false,
    h3: false,
    bold: false,
    italic: false,
  });

  // Comment modal state
  const [showCommentModal, setShowCommentModal] = useState(false);
  const [commentData, setCommentData] = useState<{
    selectedText: string;
    from: number;
    to: number;
  } | null>(null);

  // Load existing location document
  useEffect(() => {
    const loadDocument = async () => {
      try {
        const trip = await getTrip(tripId);
        if (trip) {
          const location = trip.locations?.find(
            (loc) => loc.geoId === locationId || loc.id === locationId
          );

          if (location?.document) {
            setCurrentDoc(location.document);
          } else {
            // Create blank document
            setCurrentDoc({
              type: 'doc',
              content: [
                { type: 'paragraph', attrs: { id: `node-${Date.now()}` }, content: [] }
              ]
            });
          }
        }
      } catch (error) {
        console.error('Failed to load location document:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadDocument();
  }, [tripId, locationId]);

  const handleDocumentChange = useCallback((doc: any) => {
    setCurrentDoc(doc);
  }, []);

  const handleToolbarStateChange = useCallback((state: any) => {
    setToolbarState(state);
  }, []);

  const handleShowCommentEditor = useCallback((data: { selectedText: string; from: number; to: number }) => {
    console.log('[EditLocationInfo] Showing comment editor for:', data);
    setCommentData(data);
    setShowCommentModal(true);
  }, []);

  const handleSaveComment = useCallback((comment: any) => {
    console.log('[EditLocationInfo] Saving comment:', comment);

    if (commentData && documentRef.current) {
      // Send command to ProseMirror WebView to create the comment
      documentRef.current.sendCommand('createComment', {
        ...comment,
        from: commentData.from,
        to: commentData.to,
      });
    }

    setCommentData(null);
  }, [commentData]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      // Load the trip
      const trip = await getTrip(tripId);
      if (!trip) {
        Alert.alert('Error', 'Trip not found');
        return;
      }

      // Find or create the location
      const updatedLocations = [...(trip.locations || [])];
      const locationIndex = updatedLocations.findIndex(
        (loc) => loc.geoId === locationId || loc.id === locationId
      );

      if (locationIndex !== -1) {
        // Update existing location
        updatedLocations[locationIndex] = {
          ...updatedLocations[locationIndex],
          document: currentDoc,
        };
      } else {
        // Create new location entry
        updatedLocations.push({
          id: locationId,
          geoId: locationId,
          name: name,
          lat: lat ? parseFloat(lat) : 0,
          lng: lng ? parseFloat(lng) : 0,
          description: description,
          photoName: photoName,
          colorIndex: colorIndex ? parseInt(colorIndex) : 0,
          document: currentDoc,
        });
      }

      // Save the updated trip
      await saveTrip({
        ...trip,
        locations: updatedLocations,
      });

      Alert.alert('Success', 'Location information saved', [
        {
          text: 'OK',
          onPress: () => router.back(),
        },
      ]);
    } catch (error) {
      console.error('Failed to save location info:', error);
      Alert.alert('Error', 'Failed to save location information');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading || !currentDoc) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Text>Loading...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backButtonText}>Cancel</Text>
        </TouchableOpacity>
        <Text style={styles.title} numberOfLines={1}>
          Edit Location Info
        </Text>
        <TouchableOpacity onPress={handleSave} style={styles.saveButton} disabled={isSaving}>
          <Text style={[styles.saveButtonText, isSaving && styles.saveButtonTextDisabled]}>
            {isSaving ? 'Saving...' : 'Save'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Location Name */}
      <View style={styles.locationBanner}>
        <Text style={styles.locationText}>{name}</Text>
      </View>

      {/* Editor */}
      <KeyboardAvoidingView
        style={styles.editorWrapper}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        <View style={styles.editorContainer}>
          <ProseMirrorWebView
            ref={documentRef}
            content={currentDoc}
            editable={true}
            onChange={handleDocumentChange}
            onToolbarStateChange={handleToolbarStateChange}
            onShowCommentEditor={handleShowCommentEditor}
          />
        </View>

        {/* Toolbar */}
        <View style={styles.toolbar}>
          <TouchableOpacity
            onPress={() => documentRef.current?.sendCommand('setParagraph')}
            style={[styles.toolbarButton, toolbarState.paragraph && styles.toolbarButtonActive]}
          >
            <Text style={[styles.toolbarButtonText, toolbarState.paragraph && styles.toolbarButtonTextActive]}>P</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => documentRef.current?.sendCommand('setHeading', { level: 1 })}
            style={[styles.toolbarButton, toolbarState.h1 && styles.toolbarButtonActive]}
          >
            <Text style={[styles.toolbarButtonText, toolbarState.h1 && styles.toolbarButtonTextActive]}>H1</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => documentRef.current?.sendCommand('setHeading', { level: 2 })}
            style={[styles.toolbarButton, toolbarState.h2 && styles.toolbarButtonActive]}
          >
            <Text style={[styles.toolbarButtonText, toolbarState.h2 && styles.toolbarButtonTextActive]}>H2</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => documentRef.current?.sendCommand('setHeading', { level: 3 })}
            style={[styles.toolbarButton, toolbarState.h3 && styles.toolbarButtonActive]}
          >
            <Text style={[styles.toolbarButtonText, toolbarState.h3 && styles.toolbarButtonTextActive]}>H3</Text>
          </TouchableOpacity>

          <View style={styles.separator} />

          <TouchableOpacity
            onPress={() => documentRef.current?.sendCommand('toggleBold')}
            style={[styles.toolbarButton, toolbarState.bold && styles.toolbarButtonActive]}
          >
            <Text style={[styles.toolbarButtonText, toolbarState.bold && styles.toolbarButtonTextActive]}>B</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => documentRef.current?.sendCommand('toggleItalic')}
            style={[styles.toolbarButton, toolbarState.italic && styles.toolbarButtonActive]}
          >
            <Text style={[styles.toolbarButtonText, toolbarState.italic && styles.toolbarButtonTextActive]}>I</Text>
          </TouchableOpacity>

          <View style={styles.separator} />

          <TouchableOpacity
            onPress={() => documentRef.current?.sendCommand('addComment')}
            style={styles.toolbarButton}
          >
            <Ionicons name="chatbubble-outline" size={18} color="#374151" />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {/* Comment Modal */}
      <CommentModal
        visible={showCommentModal}
        onClose={() => {
          setShowCommentModal(false);
          setCommentData(null);
        }}
        onSave={handleSaveComment}
        selectedText={commentData?.selectedText}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    backgroundColor: '#fff',
  },
  backButton: {
    padding: 4,
  },
  backButtonText: {
    fontSize: 16,
    color: '#3B82F6',
    fontWeight: '500',
  },
  title: {
    fontSize: 17,
    fontWeight: '600',
    color: '#111827',
    flex: 1,
    textAlign: 'center',
  },
  saveButton: {
    padding: 4,
  },
  saveButtonText: {
    fontSize: 16,
    color: '#3B82F6',
    fontWeight: '600',
  },
  saveButtonTextDisabled: {
    opacity: 0.5,
  },
  locationBanner: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#f9fafb',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  locationText: {
    fontSize: 14,
    color: '#6b7280',
  },
  editorWrapper: {
    flex: 1,
  },
  editorContainer: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  toolbar: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#f9fafb',
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    gap: 8,
    alignItems: 'center',
  },
  toolbarButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#d1d5db',
    minWidth: 40,
    alignItems: 'center',
  },
  toolbarButtonActive: {
    backgroundColor: '#3B82F6',
    borderColor: '#3B82F6',
  },
  toolbarButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  toolbarButtonTextActive: {
    color: '#ffffff',
  },
  separator: {
    width: 1,
    height: 24,
    backgroundColor: '#e5e7eb',
    marginHorizontal: 4,
  },
});
