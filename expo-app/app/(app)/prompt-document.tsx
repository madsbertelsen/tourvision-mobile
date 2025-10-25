import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

export default function PromptTripScreen() {
  const router = useRouter();
  const [prompt, setPrompt] = useState('');

  const handleGenerate = () => {
    if (!prompt.trim()) {
      return;
    }

    // Navigate to generate-trip screen with the prompt
    router.push({
      pathname: '/(app)/generate-trip',
      params: { prompt: prompt.trim() }
    });
  };

  const handleCancel = () => {
    router.back();
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleCancel} style={styles.headerButton}>
          <Ionicons name="close" size={24} color="#374151" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Generate Trip with AI</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Content */}
      <View style={styles.content}>
        <View style={styles.iconContainer}>
          <Ionicons name="sparkles" size={64} color="#3B82F6" />
        </View>

        <Text style={styles.title}>What kind of document do you want to plan?</Text>
        <Text style={styles.subtitle}>
          Describe your ideal document and our AI will create a personalized itinerary for you.
        </Text>

        <View style={styles.promptContainer}>
          <TextInput
            style={styles.promptInput}
            value={prompt}
            onChangeText={setPrompt}
            placeholder="e.g., Plan a 5-day document to Tokyo for food lovers"
            placeholderTextColor="#9ca3af"
            multiline
            maxLength={200}
            autoFocus
          />
          <Text style={styles.charCount}>{prompt.length}/200</Text>
        </View>

        <TouchableOpacity
          onPress={handleGenerate}
          style={[
            styles.generateButton,
            !prompt.trim() && styles.generateButtonDisabled
          ]}
          disabled={!prompt.trim()}
        >
          <Ionicons name="sparkles" size={20} color="#fff" />
          <Text style={styles.generateButtonText}>Generate Trip</Text>
        </TouchableOpacity>

        {/* Example prompts */}
        <View style={styles.examplesContainer}>
          <Text style={styles.examplesTitle}>Try these examples:</Text>
          {[
            'Plan a 3-day romantic getaway to Paris',
            'Create a week-long adventure document in Iceland',
            'Design a family-friendly vacation in Orlando',
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
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  headerButton: {
    padding: 4,
    width: 40,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#111827',
    flex: 1,
    textAlign: 'center',
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 32,
  },
  iconContainer: {
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
    textAlign: 'center',
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 16,
    color: '#6b7280',
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 24,
  },
  promptContainer: {
    marginBottom: 24,
  },
  promptInput: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    backgroundColor: '#f9fafb',
    minHeight: 120,
    maxHeight: 200,
    textAlignVertical: 'top',
  },
  charCount: {
    fontSize: 14,
    color: '#9ca3af',
    textAlign: 'right',
    marginTop: 8,
  },
  generateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#3B82F6',
    paddingVertical: 16,
    borderRadius: 12,
    marginBottom: 32,
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  generateButtonDisabled: {
    backgroundColor: '#9ca3af',
    opacity: 0.6,
    shadowOpacity: 0,
  },
  generateButtonText: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '600',
  },
  examplesContainer: {
    flex: 1,
  },
  examplesTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6b7280',
    marginBottom: 12,
  },
  exampleButton: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#f3f4f6',
    borderRadius: 8,
    marginBottom: 8,
  },
  exampleText: {
    fontSize: 15,
    color: '#374151',
  },
});
