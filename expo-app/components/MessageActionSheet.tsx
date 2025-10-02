import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Pressable,
  Platform,
} from 'react-native';

interface ActionItem {
  icon: string;
  text: string;
  onPress: () => void;
  destructive?: boolean;
}

interface MessageActionSheetProps {
  visible: boolean;
  onClose: () => void;
  actions: ActionItem[];
  messagePreview?: string;
}

export function MessageActionSheet({
  visible,
  onClose,
  actions,
  messagePreview,
}: MessageActionSheetProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.container} onPress={(e) => e.stopPropagation()}>
          {messagePreview && (
            <View style={styles.preview}>
              <Text style={styles.previewText} numberOfLines={2}>
                {messagePreview}
              </Text>
            </View>
          )}

          <View style={styles.actionsContainer}>
            {actions.map((action, index) => (
              <TouchableOpacity
                key={index}
                style={[
                  styles.actionButton,
                  action.destructive && styles.destructiveButton,
                ]}
                onPress={() => {
                  action.onPress();
                  onClose();
                }}
              >
                <Text style={styles.actionIcon}>{action.icon}</Text>
                <Text
                  style={[
                    styles.actionText,
                    action.destructive && styles.destructiveText,
                  ]}
                >
                  {action.text}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  container: {
    backgroundColor: 'white',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: Platform.OS === 'ios' ? 34 : 20,
    paddingTop: 12,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -3 },
        shadowOpacity: 0.1,
        shadowRadius: 10,
      },
      android: {
        elevation: 10,
      },
    }),
  },
  preview: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  previewText: {
    fontSize: 14,
    color: '#6B7280',
    fontStyle: 'italic',
  },
  actionsContainer: {
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  actionIcon: {
    fontSize: 20,
    marginRight: 16,
    width: 24,
    textAlign: 'center',
  },
  actionText: {
    fontSize: 16,
    color: '#1F2937',
  },
  destructiveButton: {
    borderBottomColor: '#FEE2E2',
  },
  destructiveText: {
    color: '#EF4444',
  },
  cancelButton: {
    alignItems: 'center',
    paddingVertical: 16,
    marginTop: 8,
    marginHorizontal: 20,
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
  },
  cancelText: {
    fontSize: 16,
    color: '#6B7280',
    fontWeight: '600',
  },
});