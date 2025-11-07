import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';

export default function TestNestedDynamic() {
  const router = useRouter();
  const params = useLocalSearchParams();

  const documentId = params.id as string;
  const testId = params.testId as string;

  return (
    <View style={styles.overlay}>
      <TouchableOpacity
        style={styles.backdrop}
        onPress={() => router.back()}
        activeOpacity={1}
      />

      <View style={styles.container}>
        <Text style={styles.title}>Nested Dynamic Route Test</Text>

        <View style={styles.infoContainer}>
          <Text style={styles.label}>Document ID:</Text>
          <Text style={styles.value}>{documentId}</Text>
        </View>

        <View style={styles.infoContainer}>
          <Text style={styles.label}>Test ID:</Text>
          <Text style={styles.value}>{testId}</Text>
        </View>

        <Text style={styles.text}>
          If you can see the document behind this modal,
          then nested dynamic routes work! 🎉
        </Text>

        <TouchableOpacity
          style={styles.button}
          onPress={() => router.back()}
        >
          <Text style={styles.buttonText}>Close</Text>
        </TouchableOpacity>
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
    padding: 32,
    paddingBottom: 48,
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 16,
  },
  infoContainer: {
    marginBottom: 12,
    padding: 12,
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
    marginBottom: 4,
  },
  value: {
    fontSize: 14,
    color: '#111827',
    fontFamily: 'monospace',
  },
  text: {
    fontSize: 16,
    color: '#6B7280',
    marginTop: 16,
    marginBottom: 24,
    lineHeight: 24,
  },
  button: {
    backgroundColor: '#3B82F6',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
