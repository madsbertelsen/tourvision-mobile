import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/lib/supabase/auth-context';

// Dynamically import components only on web
const DynamicLandingDocumentProseMirror = Platform.OS === 'web'
  ? require('./components/DynamicLandingDocumentProseMirror').default
  : null;

export default function LandingPage() {
  const router = useRouter();
  const { isAuthenticated } = useAuth();

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerContent}>
          <Text style={styles.logo}>TourVision</Text>
          <View style={styles.headerButtons}>
            {!isAuthenticated ? (
              <>
                <TouchableOpacity
                  style={styles.headerButton}
                  onPress={() => router.push('/(auth)/login')}
                >
                  <Text style={styles.headerButtonText}>Log in</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.headerButtonPrimary}
                  onPress={() => router.push('/(auth)/register')}
                >
                  <Text style={styles.headerButtonPrimaryText}>Sign up</Text>
                </TouchableOpacity>
              </>
            ) : (
              <TouchableOpacity
                style={styles.headerButtonPrimary}
                onPress={() => router.push('/(app)/dashboard')}
              >
                <Text style={styles.headerButtonPrimaryText}>Dashboard</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>

      {/* Dynamic Document Section */}
      {Platform.OS === 'web' && DynamicLandingDocumentProseMirror ? (
        <View style={styles.editorFullWidth}>
          <DynamicLandingDocumentProseMirror />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <>
            {/* Fallback for non-web platforms */}
            <View style={styles.hero}>
              <View style={styles.heroContent}>
                <View style={styles.heroText}>
                  <Text style={styles.heroTitle}>Create Stunning Travel Presentations</Text>
                  <Text style={styles.heroSubtitle}>
                    Transform your journeys into immersive stories. Plan, collaborate, and share beautiful travel presentations with the world.
                  </Text>

                  <View style={styles.ctaButtons}>
                    {isAuthenticated ? (
                      <TouchableOpacity
                        style={styles.primaryCTA}
                        onPress={() => router.push('/(app)/dashboard')}
                      >
                        <Text style={styles.primaryCTAText}>Go to Dashboard</Text>
                        <Ionicons name="arrow-forward-circle" size={20} color="#fff" />
                      </TouchableOpacity>
                    ) : (
                      <>
                        <TouchableOpacity
                          style={styles.primaryCTA}
                          onPress={() => router.push('/(auth)/register')}
                        >
                          <Text style={styles.primaryCTAText}>Start Creating</Text>
                          <Ionicons name="arrow-forward-circle" size={20} color="#fff" />
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.secondaryCTA}
                          onPress={() => router.push('/(auth)/login')}
                        >
                          <Text style={styles.secondaryCTAText}>Login</Text>
                        </TouchableOpacity>
                      </>
                    )}
                  </View>
                </View>
              </View>
            </View>
          </>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  scrollContent: {
    flexGrow: 1,
  },
  header: {
    width: '100%',
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 16,
    maxWidth: 1200,
    marginHorizontal: 'auto',
    width: '100%',
  },
  logo: {
    fontSize: 24,
    fontWeight: '700',
    color: '#3B82F6',
  },
  headerButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  headerButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
    ...Platform.select({
      web: {
        cursor: 'pointer' as any,
      },
    }),
  },
  headerButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  headerButtonPrimary: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: '#3B82F6',
    ...Platform.select({
      web: {
        cursor: 'pointer' as any,
      },
    }),
  },
  headerButtonPrimaryText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
  },
  loginButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
  },
  loginButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  signupButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: '#3B82F6',
  },
  signupButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  dashboardButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: '#3B82F6',
  },
  dashboardButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  hero: {
    position: 'relative',
    minHeight: Platform.OS === 'web' ? '100vh' : 500,
    overflow: 'hidden',
    alignItems: 'flex-start',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  heroGlobeBackground: {
    position: 'absolute',
    right: Platform.OS === 'web' ? -150 : 0,
    top: '50%',
    transform: [{ translateY: -650 }],
    width: 1500,
    height: 1500,
    opacity: 1,
    pointerEvents: 'none',
    ...(Platform.OS === 'web' ? {
      '@media (max-width: 1400px)': {
        right: -250,
        width: 1300,
        height: 1300,
        transform: [{ translateY: -600 }],
      },
      '@media (max-width: 1024px)': {
        opacity: 0.3,
        right: -200,
        width: 1000,
        height: 1000,
        transform: [{ translateY: -500 }],
      },
    } : {}),
  },
  heroContent: {
    position: 'relative',
    zIndex: 10,
    width: '100%',
    maxWidth: 1200,
    paddingHorizontal: 48,
    paddingVertical: 96,
    marginLeft: Platform.OS === 'web' ? 'auto' : 0,
    marginRight: Platform.OS === 'web' ? 'auto' : 0,
  },
  heroText: {
    maxWidth: Platform.OS === 'web' ? 600 : '100%',
    alignItems: Platform.OS === 'web' ? 'flex-start' : 'center',
  },
  heroTitle: {
    fontSize: 64,
    fontWeight: '800',
    color: '#111827',
    textAlign: Platform.OS === 'web' ? 'left' : 'center',
    marginBottom: 16,
    lineHeight: 72,
  },
  heroSubtitle: {
    fontSize: 20,
    color: '#6B7280',
    textAlign: Platform.OS === 'web' ? 'left' : 'center',
    marginBottom: 32,
    lineHeight: 28,
  },
  ctaButtons: {
    flexDirection: 'row',
    gap: 16,
    flexWrap: 'wrap',
    justifyContent: Platform.OS === 'web' ? 'flex-start' : 'center',
  },
  primaryCTA: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 8,
    backgroundColor: '#3B82F6',
  },
  primaryCTAText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  secondaryCTA: {
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#3B82F6',
  },
  secondaryCTAText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#3B82F6',
  },
  editorFullWidth: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    width: '100%',
  },
  features: {
    paddingHorizontal: 24,
    paddingVertical: 64,
    backgroundColor: '#F9FAFB',
  },
  sectionTitle: {
    fontSize: 36,
    fontWeight: '700',
    color: '#111827',
    textAlign: 'center',
    marginBottom: 48,
  },
  featureGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 24,
    justifyContent: 'center',
  },
  featureCard: {
    width: Platform.OS === 'web' ? 280 : '100%',
    backgroundColor: '#fff',
    padding: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  featureIcon: {
    width: 64,
    height: 64,
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  featureTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 8,
  },
  featureDescription: {
    fontSize: 14,
    color: '#6B7280',
    lineHeight: 20,
  },
  howItWorks: {
    paddingHorizontal: 24,
    paddingVertical: 64,
    backgroundColor: '#fff',
  },
  stepsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 32,
    justifyContent: 'center',
    maxWidth: 1000,
    marginLeft: 'auto',
    marginRight: 'auto',
  },
  stepCard: {
    width: Platform.OS === 'web' ? 280 : '100%',
    alignItems: 'center',
  },
  stepNumber: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#3B82F6',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  stepNumberText: {
    fontSize: 28,
    fontWeight: '700',
    color: '#fff',
  },
  stepTitle: {
    fontSize: 22,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 12,
    textAlign: 'center',
  },
  stepDescription: {
    fontSize: 15,
    color: '#6B7280',
    lineHeight: 22,
    textAlign: 'center',
  },
  useCases: {
    paddingHorizontal: 24,
    paddingVertical: 64,
    backgroundColor: '#fff',
  },
  useCaseGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 32,
    justifyContent: 'center',
    maxWidth: 1100,
    marginLeft: 'auto',
    marginRight: 'auto',
  },
  useCaseCard: {
    width: Platform.OS === 'web' ? 320 : '100%',
    alignItems: 'center',
    padding: 32,
    borderRadius: 16,
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  useCaseIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
  },
  useCaseTitle: {
    fontSize: 24,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 12,
    textAlign: 'center',
  },
  useCaseDescription: {
    fontSize: 15,
    color: '#6B7280',
    lineHeight: 22,
    textAlign: 'center',
  },
});
