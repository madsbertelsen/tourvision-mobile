import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTripContext } from './_layout';

export default function DocumentOptionsModal() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams();
  const documentTitle = params.title as string || 'Document';
  const { isEditMode, setIsEditMode } = useTripContext();

  const handleAction = (action: string) => {
    console.log(`Action: ${action}`);

    // Handle specific actions that need to update state before closing
    if (action === 'toggleEdit') {
      setIsEditMode(!isEditMode);
    }

    router.back();
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}>
      {/* Handle bar */}
      <View style={styles.handleBar} />

      {/* Quick Actions Grid */}
      <View style={styles.quickActionsContainer}>
        <TouchableOpacity style={styles.quickAction} onPress={() => handleAction('toggleEdit')}>
          <View style={styles.quickActionIcon}>
            <Ionicons name={isEditMode ? "book" : "create-outline"} size={24} color="#007AFF" />
          </View>
          <Text style={styles.quickActionLabel}>{isEditMode ? 'Læs' : 'Rediger'}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.quickAction} onPress={() => handleAction('toggleMap')}>
          <View style={styles.quickActionIcon}>
            <Ionicons name="map-outline" size={24} color="#007AFF" />
          </View>
          <Text style={styles.quickActionLabel}>Kort</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.quickAction} onPress={() => handleAction('toggleChat')}>
          <View style={styles.quickActionIcon}>
            <Ionicons name="chatbubbles-outline" size={24} color="#007AFF" />
          </View>
          <Text style={styles.quickActionLabel}>Chat</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.quickAction} onPress={() => handleAction('play')}>
          <View style={styles.quickActionIcon}>
            <Ionicons name="play-outline" size={24} color="#007AFF" />
          </View>
          <Text style={styles.quickActionLabel}>Afspil</Text>
        </TouchableOpacity>
      </View>

      {/* Document Title Section */}
      <View style={styles.titleSection}>
        <Text style={styles.documentTitle} numberOfLines={1}>
          {documentTitle}
        </Text>
      </View>

      {/* Action List */}
      <View style={styles.actionList}>
        <TouchableOpacity style={styles.actionItem} onPress={() => handleAction('collaboration')}>
          <View style={styles.actionIcon}>
            <Ionicons name="people-outline" size={22} color="#007AFF" />
          </View>
          <Text style={styles.actionText}>Samarbejd</Text>
        </TouchableOpacity>

        <View style={styles.separator} />

        <TouchableOpacity style={styles.actionItem} onPress={() => handleAction('share')}>
          <View style={styles.actionIcon}>
            <Ionicons name="share-outline" size={22} color="#007AFF" />
          </View>
          <Text style={styles.actionText}>Del dokument</Text>
        </TouchableOpacity>

        <View style={styles.separator} />

        <TouchableOpacity style={styles.actionItem} onPress={() => handleAction('rename')}>
          <View style={styles.actionIcon}>
            <Ionicons name="pencil-outline" size={22} color="#007AFF" />
          </View>
          <Text style={styles.actionText}>Omdøb</Text>
        </TouchableOpacity>

        <View style={styles.separator} />

        <TouchableOpacity style={styles.actionItem} onPress={() => handleAction('duplicate')}>
          <View style={styles.actionIcon}>
            <Ionicons name="copy-outline" size={22} color="#007AFF" />
          </View>
          <Text style={styles.actionText}>Opret en kopi</Text>
        </TouchableOpacity>
      </View>

      {/* Delete Section */}
      <View style={styles.deleteSection}>
        <TouchableOpacity style={styles.deleteItem} onPress={() => handleAction('delete')}>
          <View style={styles.actionIcon}>
            <Ionicons name="trash-outline" size={22} color="#FF3B30" />
          </View>
          <Text style={styles.deleteText}>Slet dokument</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F2F2F7',
    paddingTop: 8,
    paddingHorizontal: 16,
  },
  handleBar: {
    width: 36,
    height: 5,
    backgroundColor: '#C6C6C8',
    borderRadius: 3,
    alignSelf: 'center',
    marginBottom: 16,
  },
  quickActionsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 24,
  },
  quickAction: {
    alignItems: 'center',
    gap: 8,
  },
  quickActionIcon: {
    width: 64,
    height: 64,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickActionLabel: {
    fontSize: 13,
    color: '#000000',
    textAlign: 'center',
  },
  titleSection: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    alignItems: 'center',
  },
  documentTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#000000',
  },
  actionList: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    marginBottom: 16,
  },
  actionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 12,
  },
  actionIcon: {
    width: 28,
    alignItems: 'center',
  },
  actionText: {
    fontSize: 17,
    color: '#007AFF',
    flex: 1,
  },
  separator: {
    height: 0.5,
    backgroundColor: '#C6C6C8',
    marginLeft: 56,
  },
  deleteSection: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    marginBottom: 16,
  },
  deleteItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 12,
  },
  deleteText: {
    fontSize: 17,
    color: '#FF3B30',
    flex: 1,
  },
});
