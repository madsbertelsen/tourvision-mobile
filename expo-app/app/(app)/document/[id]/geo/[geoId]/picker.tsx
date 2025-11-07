import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useTripContext } from '../../_layout';

export default function ToolPickerRoute() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { id: tripId, geoId } = params as { id: string; geoId: string };
  const { locationFlowState, clearLocationFlow } = useTripContext();

  const handleClose = () => {
    clearLocationFlow();
    router.push(`/document/${tripId}`);
  };

  const handleLocationClick = () => {
    router.push(`/document/${tripId}/geo/${geoId}/search`);
  };

  const handleCommentClick = () => {
    // TODO: Implement comment flow
    console.log('Comment button clicked');
    handleClose();
  };

  return (
    <View style={styles.overlay}>
      <TouchableOpacity
        style={styles.backdrop}
        onPress={handleClose}
        activeOpacity={1}
      />

      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Add to Document</Text>
          <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
            <Ionicons name="close" size={24} color="#374151" />
          </TouchableOpacity>
        </View>

        {/* Selected text display */}
        {locationFlowState.selectedText && (
          <View style={styles.selectedTextContainer}>
            <Text style={styles.selectedTextLabel}>Selected text:</Text>
            <Text style={styles.selectedText} numberOfLines={2}>
              "{locationFlowState.selectedText}"
            </Text>
          </View>
        )}

        {/* Tool buttons */}
        <View style={styles.toolsContainer}>
          <TouchableOpacity
            style={styles.toolButton}
            onPress={handleLocationClick}
          >
            <View style={[styles.toolIconContainer, { backgroundColor: '#DBEAFE' }]}>
              <Ionicons name="location" size={28} color="#3B82F6" />
            </View>
            <View style={styles.toolTextContainer}>
              <Text style={styles.toolLabel}>Location</Text>
              <Text style={styles.toolDescription}>
                Add a place with optional travel details
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.toolButton}
            onPress={handleCommentClick}
          >
            <View style={[styles.toolIconContainer, { backgroundColor: '#FEF3C7' }]}>
              <Ionicons name="chatbubble" size={28} color="#F59E0B" />
            </View>
            <View style={styles.toolTextContainer}>
              <Text style={styles.toolLabel}>Comment</Text>
              <Text style={styles.toolDescription}>
                Add a note or suggestion to discuss
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1000,
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  container: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 40,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
  },
  closeButton: {
    padding: 4,
  },
  selectedTextContainer: {
    padding: 16,
    backgroundColor: '#F9FAFB',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  selectedTextLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  selectedText: {
    fontSize: 14,
    color: '#111827',
    fontStyle: 'italic',
  },
  toolsContainer: {
    padding: 16,
    gap: 12,
  },
  toolButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    gap: 12,
  },
  toolIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolTextContainer: {
    flex: 1,
  },
  toolLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 2,
  },
  toolDescription: {
    fontSize: 13,
    color: '#6B7280',
  },
});
