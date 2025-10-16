import React, { useState } from 'react';
import {
  View,
  Text,
  Modal,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface CommentData {
  commentId: string;
  userId: string;
  userName: string;
  content: string;
  createdAt: string;
  resolved: boolean;
  replies: any[] | null;
}

interface CommentModalProps {
  visible: boolean;
  onClose: () => void;
  onSave: (comment: CommentData) => void;
  existingComment?: CommentData | null;
  selectedText?: string;
}

export default function CommentModal({
  visible,
  onClose,
  onSave,
  existingComment,
  selectedText,
}: CommentModalProps) {
  const [commentText, setCommentText] = useState(existingComment?.content || '');
  const [resolved, setResolved] = useState(existingComment?.resolved || false);

  const handleSave = () => {
    if (!commentText.trim()) return;

    const commentData: CommentData = {
      commentId: existingComment?.commentId || `comment-${Date.now()}`,
      userId: 'current-user', // TODO: Get from auth context
      userName: 'You', // TODO: Get from auth context
      content: commentText.trim(),
      createdAt: existingComment?.createdAt || new Date().toISOString(),
      resolved: resolved,
      replies: existingComment?.replies || null,
    };

    onSave(commentData);
    setCommentText('');
    setResolved(false);
    onClose();
  };

  const handleCancel = () => {
    setCommentText(existingComment?.content || '');
    setResolved(existingComment?.resolved || false);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={handleCancel}
    >
      <View style={styles.overlay}>
        <View style={styles.modalContainer}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>
              {existingComment ? 'Edit Comment' : 'Add Comment'}
            </Text>
            <TouchableOpacity onPress={handleCancel} style={styles.closeButton}>
              <Ionicons name="close" size={24} color="#6b7280" />
            </TouchableOpacity>
          </View>

          {/* Selected Text */}
          {selectedText && !existingComment && (
            <View style={styles.selectedTextContainer}>
              <Text style={styles.selectedTextLabel}>On:</Text>
              <Text style={styles.selectedText} numberOfLines={2}>
                "{selectedText}"
              </Text>
            </View>
          )}

          {/* Content */}
          <ScrollView style={styles.content}>
            {/* Comment Input */}
            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>Comment</Text>
              <TextInput
                style={styles.textInput}
                placeholder="Add your comment..."
                value={commentText}
                onChangeText={setCommentText}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
                autoFocus
              />
            </View>

            {/* Resolved Toggle (only for existing comments) */}
            {existingComment && (
              <TouchableOpacity
                style={styles.resolvedToggle}
                onPress={() => setResolved(!resolved)}
              >
                <View style={styles.checkboxContainer}>
                  <View style={[styles.checkbox, resolved && styles.checkboxChecked]}>
                    {resolved && <Ionicons name="checkmark" size={16} color="#fff" />}
                  </View>
                  <Text style={styles.resolvedLabel}>Mark as resolved</Text>
                </View>
              </TouchableOpacity>
            )}

            {/* Replies (if any) */}
            {existingComment?.replies && existingComment.replies.length > 0 && (
              <View style={styles.repliesContainer}>
                <Text style={styles.repliesTitle}>
                  {existingComment.replies.length} {existingComment.replies.length === 1 ? 'Reply' : 'Replies'}
                </Text>
                {existingComment.replies.map((reply: any, index: number) => (
                  <View key={index} style={styles.replyItem}>
                    <Text style={styles.replyAuthor}>{reply.userName}</Text>
                    <Text style={styles.replyContent}>{reply.content}</Text>
                  </View>
                ))}
              </View>
            )}
          </ScrollView>

          {/* Footer */}
          <View style={styles.footer}>
            <TouchableOpacity onPress={handleCancel} style={styles.cancelButton}>
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleSave}
              style={[styles.saveButton, !commentText.trim() && styles.saveButtonDisabled]}
              disabled={!commentText.trim()}
            >
              <Text style={styles.saveButtonText}>
                {existingComment ? 'Update' : 'Add Comment'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '90%',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -2 },
        shadowOpacity: 0.1,
        shadowRadius: 10,
      },
      android: {
        elevation: 5,
      },
    }),
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
  },
  closeButton: {
    padding: 4,
  },
  selectedTextContainer: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: '#f9fafb',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  selectedTextLabel: {
    fontSize: 12,
    color: '#6b7280',
    marginBottom: 4,
    fontWeight: '500',
  },
  selectedText: {
    fontSize: 14,
    color: '#374151',
    fontStyle: 'italic',
  },
  content: {
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  inputContainer: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
    marginBottom: 8,
  },
  textInput: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    color: '#111827',
    minHeight: 100,
    backgroundColor: '#fff',
  },
  resolvedToggle: {
    marginBottom: 16,
  },
  checkboxContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  checkbox: {
    width: 24,
    height: 24,
    borderWidth: 2,
    borderColor: '#d1d5db',
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  checkboxChecked: {
    backgroundColor: '#10b981',
    borderColor: '#10b981',
  },
  resolvedLabel: {
    fontSize: 15,
    color: '#374151',
  },
  repliesContainer: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  repliesTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 12,
  },
  replyItem: {
    marginBottom: 12,
    padding: 12,
    backgroundColor: '#f9fafb',
    borderRadius: 8,
  },
  replyAuthor: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6b7280',
    marginBottom: 4,
  },
  replyContent: {
    fontSize: 14,
    color: '#374151',
  },
  footer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#d1d5db',
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
  },
  saveButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#f59e0b',
    alignItems: 'center',
  },
  saveButtonDisabled: {
    opacity: 0.5,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
});
