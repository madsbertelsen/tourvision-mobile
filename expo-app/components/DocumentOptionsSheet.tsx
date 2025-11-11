import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface DocumentOptionsSheetProps {
  visible: boolean;
  onClose: () => void;
  documentTitle: string;
  onShare?: () => void;
  onRename?: () => void;
  onDuplicate?: () => void;
  onDelete?: () => void;
  onAddToBookmarks?: () => void;
}

export function DocumentOptionsSheet({
  visible,
  onClose,
  documentTitle,
  onShare,
  onRename,
  onDuplicate,
  onDelete,
  onAddToBookmarks,
}: DocumentOptionsSheetProps) {
  const insets = useSafeAreaInsets();

  const handleAction = (action?: () => void) => {
    if (action) {
      action();
    }
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]} onPress={(e) => e.stopPropagation()}>
          {/* Handle bar */}
          <View style={styles.handleBar} />

          {/* Quick Actions Grid */}
          <View style={styles.quickActionsContainer}>
            <TouchableOpacity style={styles.quickAction} onPress={() => handleAction(onShare)}>
              <View style={styles.quickActionIcon}>
                <Ionicons name="share-outline" size={24} color="#007AFF" />
              </View>
              <Text style={styles.quickActionLabel}>Del</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.quickAction} onPress={() => handleAction(onRename)}>
              <View style={styles.quickActionIcon}>
                <Ionicons name="pencil-outline" size={24} color="#007AFF" />
              </View>
              <Text style={styles.quickActionLabel}>Omdøb</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.quickAction} onPress={() => handleAction(onDuplicate)}>
              <View style={styles.quickActionIcon}>
                <Ionicons name="copy-outline" size={24} color="#007AFF" />
              </View>
              <Text style={styles.quickActionLabel}>Dupliker</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.quickAction} onPress={() => handleAction(onAddToBookmarks)}>
              <View style={styles.quickActionIcon}>
                <Ionicons name="bookmark-outline" size={24} color="#007AFF" />
              </View>
              <Text style={styles.quickActionLabel}>Bogmærke</Text>
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
            <TouchableOpacity style={styles.actionItem} onPress={() => handleAction(onShare)}>
              <View style={styles.actionIcon}>
                <Ionicons name="share-outline" size={22} color="#007AFF" />
              </View>
              <Text style={styles.actionText}>Del dokument</Text>
            </TouchableOpacity>

            <View style={styles.separator} />

            <TouchableOpacity style={styles.actionItem} onPress={() => handleAction(onRename)}>
              <View style={styles.actionIcon}>
                <Ionicons name="pencil-outline" size={22} color="#007AFF" />
              </View>
              <Text style={styles.actionText}>Omdøb</Text>
            </TouchableOpacity>

            <View style={styles.separator} />

            <TouchableOpacity style={styles.actionItem} onPress={() => handleAction(onDuplicate)}>
              <View style={styles.actionIcon}>
                <Ionicons name="copy-outline" size={22} color="#007AFF" />
              </View>
              <Text style={styles.actionText}>Opret en kopi</Text>
            </TouchableOpacity>

            <View style={styles.separator} />

            <TouchableOpacity style={styles.actionItem} onPress={() => handleAction(onAddToBookmarks)}>
              <View style={styles.actionIcon}>
                <Ionicons name="bookmark-outline" size={22} color="#007AFF" />
              </View>
              <Text style={styles.actionText}>Føj til bogmærker</Text>
            </TouchableOpacity>
          </View>

          {/* Delete Section */}
          <View style={styles.deleteSection}>
            <TouchableOpacity style={styles.deleteItem} onPress={() => handleAction(onDelete)}>
              <View style={styles.actionIcon}>
                <Ionicons name="trash-outline" size={22} color="#FF3B30" />
              </View>
              <Text style={styles.deleteText}>Slet dokument</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#F2F2F7',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
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
