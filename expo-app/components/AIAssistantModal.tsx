import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Modal,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface AIAssistantModalProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: (prompt: string) => void;
  isGenerating?: boolean;
}

export default function AIAssistantModal({
  visible,
  onClose,
  onSubmit,
  isGenerating = false,
}: AIAssistantModalProps) {
  const [prompt, setPrompt] = useState('');

  const handleSubmit = () => {
    if (prompt.trim()) {
      onSubmit(prompt.trim());
      setPrompt(''); // Clear prompt after submission
    }
  };

  const handleCancel = () => {
    if (!isGenerating) {
      setPrompt('');
      onClose();
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleCancel}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.modalOverlay}
      >
        <TouchableOpacity
          style={styles.backdrop}
          activeOpacity={1}
          onPress={handleCancel}
          disabled={isGenerating}
        />

        <View style={styles.modalContent}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <Ionicons name="sparkles" size={24} color="#3B82F6" />
              <Text style={styles.headerTitle}>AI Assistant</Text>
            </View>
            {!isGenerating && (
              <TouchableOpacity onPress={handleCancel} style={styles.closeButton}>
                <Ionicons name="close" size={24} color="#6B7280" />
              </TouchableOpacity>
            )}
          </View>

          {/* Content */}
          <View style={styles.content}>
            <Text style={styles.label}>What would you like the AI to write?</Text>
            <TextInput
              style={styles.input}
              value={prompt}
              onChangeText={setPrompt}
              placeholder="e.g., Create a 3-day Tokyo itinerary"
              placeholderTextColor="#9CA3AF"
              multiline
              maxLength={500}
              editable={!isGenerating}
              autoFocus
            />
            <Text style={styles.charCount}>{prompt.length}/500</Text>

            {/* Example prompts */}
            {!isGenerating && prompt.length === 0 && (
              <View style={styles.examplesContainer}>
                <Text style={styles.examplesTitle}>Try these examples:</Text>
                {[
                  'Plan a 5-day food tour of Tokyo',
                  'Create a romantic weekend in Paris',
                  'Design a family trip to Orlando',
                ].map((example, index) => (
                  <TouchableOpacity
                    key={index}
                    style={styles.exampleButton}
                    onPress={() => setPrompt(example)}
                  >
                    <Text style={styles.exampleText}>{example}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {isGenerating && (
              <View style={styles.generatingContainer}>
                <ActivityIndicator size="large" color="#3B82F6" />
                <Text style={styles.generatingText}>
                  AI is typing your itinerary...
                </Text>
              </View>
            )}
          </View>

          {/* Actions */}
          <View style={styles.actions}>
            {!isGenerating && (
              <>
                <TouchableOpacity
                  style={[styles.button, styles.cancelButton]}
                  onPress={handleCancel}
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.button,
                    styles.submitButton,
                    !prompt.trim() && styles.submitButtonDisabled,
                  ]}
                  onPress={handleSubmit}
                  disabled={!prompt.trim()}
                >
                  <Ionicons name="sparkles" size={20} color="#fff" />
                  <Text style={styles.submitButtonText}>Generate</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  modalContent: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: 34, // Extra padding for safe area
    maxHeight: '80%',
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
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#111827',
  },
  closeButton: {
    padding: 4,
  },
  content: {
    padding: 20,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 12,
  },
  input: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: '#111827',
    minHeight: 120,
    maxHeight: 200,
    textAlignVertical: 'top',
    backgroundColor: '#F9FAFB',
  },
  charCount: {
    fontSize: 14,
    color: '#9CA3AF',
    textAlign: 'right',
    marginTop: 8,
  },
  examplesContainer: {
    marginTop: 24,
  },
  examplesTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
    marginBottom: 12,
  },
  exampleButton: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
    marginBottom: 8,
  },
  exampleText: {
    fontSize: 15,
    color: '#374151',
  },
  generatingContainer: {
    marginTop: 32,
    alignItems: 'center',
  },
  generatingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#6B7280',
    fontStyle: 'italic',
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  button: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
  },
  cancelButton: {
    backgroundColor: '#ffffff',
    borderWidth: 2,
    borderColor: '#D1D5DB',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
  },
  submitButton: {
    backgroundColor: '#3B82F6',
  },
  submitButtonDisabled: {
    backgroundColor: '#9CA3AF',
    opacity: 0.6,
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },
});
