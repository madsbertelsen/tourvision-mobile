import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Link, router } from 'expo-router';

/**
 * Test screen for Link.Preview feature
 * Based on: https://docs.expo.dev/router/reference/link-preview/
 */
export default function LinkPreviewTestScreen() {
  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Link Preview Test</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        <Text style={styles.instructions}>
          Long-press on the links below to see the preview popup (iOS only).
        </Text>

        {/* Example 1: Basic Link Preview */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>1. Basic Link Preview</Text>
          <Link href="/(mock)/location-preview/test-1?name=Paris&lat=48.8566&lng=2.3522">
            <Link.Trigger asChild>
              <Text style={styles.linkText}>Paris, France</Text>
            </Link.Trigger>
            <Link.Preview />
          </Link>
        </View>

        {/* Example 2: Custom Preview Content */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>2. Custom Preview Content</Text>
          <Link href="/(mock)/location-preview/test-2?name=Tokyo&lat=35.6762&lng=139.6503">
            <Link.Trigger asChild>
              <Text style={styles.linkText}>Tokyo, Japan</Text>
            </Link.Trigger>
            <Link.Preview>
              <View style={styles.previewContainer}>
                <Text style={styles.previewTitle}>Tokyo</Text>
                <Text style={styles.previewDescription}>Capital of Japan</Text>
                <Text style={styles.previewCoords}>35.6762°N, 139.6503°E</Text>
              </View>
            </Link.Preview>
          </Link>
        </View>

        {/* Example 3: Multiple Links */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>3. Multiple Links in Paragraph</Text>
          <View style={styles.paragraph}>
            <Text style={styles.text}>Visit </Text>
            <Link href="/(mock)/location-preview/test-3?name=London&lat=51.5074&lng=-0.1278">
              <Link.Trigger asChild>
                <Text style={styles.linkText}>London</Text>
              </Link.Trigger>
              <Link.Preview>
                <View style={styles.previewContainer}>
                  <Text style={styles.previewTitle}>London</Text>
                  <Text style={styles.previewCoords}>51.5074°N, 0.1278°W</Text>
                </View>
              </Link.Preview>
            </Link>
            <Text style={styles.text}> and </Text>
            <Link href="/(mock)/location-preview/test-4?name=New+York&lat=40.7128&lng=-74.0060">
              <Link.Trigger asChild>
                <Text style={styles.linkText}>New York</Text>
              </Link.Trigger>
              <Link.Preview>
                <View style={styles.previewContainer}>
                  <Text style={styles.previewTitle}>New York</Text>
                  <Text style={styles.previewCoords}>40.7128°N, 74.0060°W</Text>
                </View>
              </Link.Preview>
            </Link>
            <Text style={styles.text}> on your trip!</Text>
          </View>
        </View>

        {/* Example 4: Link Preview with Custom Size */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>4. Custom Size Preview</Text>
          <Link href="/(mock)/location-preview/test-5?name=Sydney&lat=-33.8688&lng=151.2093">
            <Link.Trigger asChild>
              <Text style={styles.linkText}>Sydney, Australia</Text>
            </Link.Trigger>
            <Link.Preview style={{ width: 300, height: 200 }}>
              <View style={[styles.previewContainer, { width: 300, height: 200 }]}>
                <Text style={styles.previewTitle}>Sydney</Text>
                <Text style={styles.previewDescription}>
                  Largest city in Australia, known for the Opera House and Harbour Bridge
                </Text>
                <Text style={styles.previewCoords}>33.8688°S, 151.2093°E</Text>
              </View>
            </Link.Preview>
          </Link>
        </View>

        {/* Example 5: Standalone Link (not inline) */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>5. Standalone Link (View-based)</Text>
          <Link href="/(mock)/location-preview/test-6?name=Barcelona&lat=41.3851&lng=2.1734">
            <Link.Trigger asChild>
              <View style={styles.linkButton}>
                <Text style={styles.linkButtonText}>Barcelona, Spain</Text>
              </View>
            </Link.Trigger>
            <Link.Preview>
              <View style={styles.previewContainer}>
                <Text style={styles.previewTitle}>Barcelona</Text>
                <Text style={styles.previewDescription}>Home of Gaudí's Sagrada Família</Text>
                <Text style={styles.previewCoords}>41.3851°N, 2.1734°E</Text>
              </View>
            </Link.Preview>
          </Link>
        </View>

        <View style={styles.note}>
          <Text style={styles.noteText}>
            Note: Link.Preview only works on iOS 17+. On other platforms, tapping the link will navigate normally.
          </Text>
        </View>
      </ScrollView>
    </View>
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
    backgroundColor: '#f9fafb',
  },
  backButton: {
    padding: 8,
  },
  backButtonText: {
    fontSize: 16,
    color: '#3B82F6',
    fontWeight: '500',
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1f2937',
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
  },
  instructions: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 24,
    lineHeight: 20,
  },
  section: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 12,
  },
  paragraph: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'baseline',
  },
  text: {
    fontSize: 16,
    color: '#374151',
    lineHeight: 24,
  },
  linkText: {
    fontSize: 16,
    color: '#3B82F6',
    fontWeight: '500',
    textDecorationLine: 'underline',
  },
  linkButton: {
    backgroundColor: '#3B82F6',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  linkButtonText: {
    fontSize: 16,
    color: '#ffffff',
    fontWeight: '600',
  },
  previewContainer: {
    padding: 16,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    minWidth: 200,
  },
  previewTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4,
  },
  previewDescription: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 8,
    lineHeight: 20,
  },
  previewCoords: {
    fontSize: 12,
    color: '#9ca3af',
    fontFamily: 'monospace',
  },
  note: {
    marginTop: 32,
    padding: 16,
    backgroundColor: '#fef3c7',
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#f59e0b',
  },
  noteText: {
    fontSize: 14,
    color: '#92400e',
    lineHeight: 20,
  },
});
