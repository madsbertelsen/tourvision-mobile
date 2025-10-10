import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

export default function DictationTestScreen() {
  const router = useRouter();
  const [singleLine, setSingleLine] = useState('');
  const [multiLine, setMultiLine] = useState('');
  const [notes, setNotes] = useState('');
  const [locationName, setLocationName] = useState('');
  const [description, setDescription] = useState('');

  const handleClear = () => {
    setSingleLine('');
    setMultiLine('');
    setNotes('');
    setLocationName('');
    setDescription('');
  };

  const handleShowValues = () => {
    const message = `
Single Line: "${singleLine}"
Multi Line: "${multiLine}"
Notes: "${notes}"
Location: "${locationName}"
Description: "${description}"
    `.trim();

    Alert.alert('Current Values', message);
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.container}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#333" />
          </TouchableOpacity>
          <Text style={styles.title}>iOS Dictation Test</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
          <Text style={styles.description}>
            Test iOS dictation by tapping the microphone icon on your keyboard.
            Try different input fields to see how dictation works.
          </Text>

          {/* Single Line Input */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Single Line Input</Text>
            <TextInput
              style={styles.input}
              value={singleLine}
              onChangeText={setSingleLine}
              placeholder="Tap here and use dictation..."
              placeholderTextColor="#999"
              returnKeyType="done"
              autoCorrect={true}
              autoCapitalize="sentences"
            />
            <Text style={styles.hint}>Length: {singleLine.length} characters</Text>
          </View>

          {/* Multi Line Input */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Multi-Line Input</Text>
            <TextInput
              style={[styles.input, styles.multilineInput]}
              value={multiLine}
              onChangeText={setMultiLine}
              placeholder="Try dictating longer text here..."
              placeholderTextColor="#999"
              multiline={true}
              numberOfLines={4}
              autoCorrect={true}
              autoCapitalize="sentences"
            />
            <Text style={styles.hint}>Length: {multiLine.length} characters</Text>
          </View>

          {/* Travel Notes */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Travel Notes</Text>
            <TextInput
              style={[styles.input, styles.multilineInput]}
              value={notes}
              onChangeText={setNotes}
              placeholder="Dictate your travel notes here..."
              placeholderTextColor="#999"
              multiline={true}
              numberOfLines={3}
              autoCorrect={true}
              autoCapitalize="sentences"
              textContentType="none"
            />
            <Text style={styles.hint}>Words: {notes.split(/\s+/).filter(w => w.length > 0).length}</Text>
          </View>

          {/* Location Name */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Location Name</Text>
            <TextInput
              style={styles.input}
              value={locationName}
              onChangeText={setLocationName}
              placeholder="Say a location name..."
              placeholderTextColor="#999"
              returnKeyType="done"
              autoCorrect={true}
              autoCapitalize="words"
              textContentType="location"
            />
          </View>

          {/* Description Field */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Description</Text>
            <TextInput
              style={[styles.input, styles.multilineInput, styles.largeInput]}
              value={description}
              onChangeText={setDescription}
              placeholder="Describe your travel experience..."
              placeholderTextColor="#999"
              multiline={true}
              numberOfLines={6}
              autoCorrect={true}
              autoCapitalize="sentences"
            />
            <Text style={styles.hint}>
              Characters: {description.length} | Words: {description.split(/\s+/).filter(w => w.length > 0).length}
            </Text>
          </View>

          {/* Action Buttons */}
          <View style={styles.buttonContainer}>
            <TouchableOpacity style={styles.button} onPress={handleClear}>
              <Text style={styles.buttonText}>Clear All</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.button, styles.primaryButton]} onPress={handleShowValues}>
              <Text style={[styles.buttonText, styles.primaryButtonText]}>Show Values</Text>
            </TouchableOpacity>
          </View>

          {/* Tips */}
          <View style={styles.tipsContainer}>
            <Text style={styles.tipsTitle}>Dictation Tips:</Text>
            <Text style={styles.tip}>• Tap any text field to bring up the keyboard</Text>
            <Text style={styles.tip}>• Look for the microphone icon on your keyboard</Text>
            <Text style={styles.tip}>• Tap the microphone to start dictation</Text>
            <Text style={styles.tip}>• Speak clearly and naturally</Text>
            <Text style={styles.tip}>• Say "period" for . and "comma" for ,</Text>
            <Text style={styles.tip}>• Say "new line" or "new paragraph" for line breaks</Text>
            <Text style={styles.tip}>• Tap "Done" when finished dictating</Text>
          </View>

          {/* Debug Info */}
          <View style={styles.debugContainer}>
            <Text style={styles.debugTitle}>Debug Info:</Text>
            <Text style={styles.debugText}>Platform: {Platform.OS}</Text>
            <Text style={styles.debugText}>Version: {Platform.Version}</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  backButton: {
    padding: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  description: {
    fontSize: 14,
    color: '#666',
    marginBottom: 24,
    lineHeight: 20,
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: '#333',
  },
  multilineInput: {
    paddingTop: 10,
    paddingBottom: 10,
    textAlignVertical: 'top',
    minHeight: 80,
  },
  largeInput: {
    minHeight: 120,
  },
  hint: {
    fontSize: 12,
    color: '#999',
    marginTop: 4,
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 24,
    marginBottom: 32,
  },
  button: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
    alignItems: 'center',
  },
  primaryButton: {
    backgroundColor: '#3B82F6',
    borderColor: '#3B82F6',
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  primaryButtonText: {
    color: '#fff',
  },
  tipsContainer: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
  },
  tipsTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  tip: {
    fontSize: 14,
    color: '#666',
    marginBottom: 6,
    lineHeight: 20,
  },
  debugContainer: {
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  debugTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginBottom: 8,
  },
  debugText: {
    fontSize: 12,
    color: '#999',
    marginBottom: 4,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
});