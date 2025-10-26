import React from 'react';
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

export default function LandingPage() {
  const router = useRouter();
  const { isAuthenticated } = useAuth();

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.logo}>TourVision</Text>
          <View style={styles.headerButtons}>
            {isAuthenticated ? (
              <TouchableOpacity
                style={styles.dashboardButton}
                onPress={() => router.push('/(app)/dashboard')}
              >
                <Text style={styles.dashboardButtonText}>Dashboard</Text>
                <Ionicons name="arrow-forward" size={16} color="#fff" />
              </TouchableOpacity>
            ) : (
              <>
                <TouchableOpacity
                  style={styles.loginButton}
                  onPress={() => router.push('/(auth)/login')}
                >
                  <Text style={styles.loginButtonText}>Login</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.signupButton}
                  onPress={() => router.push('/(auth)/register')}
                >
                  <Text style={styles.signupButtonText}>Sign Up</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>

        {/* Hero Section */}
        <View style={styles.hero}>
          <Text style={styles.heroTitle}>Plan Your Perfect Journey</Text>
          <Text style={styles.heroSubtitle}>
            Collaborative travel planning with AI-powered itineraries, interactive maps, and real-time editing
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
                  <Text style={styles.primaryCTAText}>Get Started Free</Text>
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

        {/* Features Section */}
        <View style={styles.features}>
          <Text style={styles.sectionTitle}>Why TourVision?</Text>

          <View style={styles.featureGrid}>
            <View style={styles.featureCard}>
              <View style={styles.featureIcon}>
                <Ionicons name="globe-outline" size={32} color="#3B82F6" />
              </View>
              <Text style={styles.featureTitle}>Interactive Maps</Text>
              <Text style={styles.featureDescription}>
                Visualize your journey with beautiful maps and location markers
              </Text>
            </View>

            <View style={styles.featureCard}>
              <View style={styles.featureIcon}>
                <Ionicons name="sparkles-outline" size={32} color="#8B5CF6" />
              </View>
              <Text style={styles.featureTitle}>AI-Powered Planning</Text>
              <Text style={styles.featureDescription}>
                Get smart suggestions and auto-generated itineraries
              </Text>
            </View>

            <View style={styles.featureCard}>
              <View style={styles.featureIcon}>
                <Ionicons name="people-outline" size={32} color="#10B981" />
              </View>
              <Text style={styles.featureTitle}>Real-time Collaboration</Text>
              <Text style={styles.featureDescription}>
                Plan together with friends and family in real-time
              </Text>
            </View>

            <View style={styles.featureCard}>
              <View style={styles.featureIcon}>
                <Ionicons name="document-text-outline" size={32} color="#F59E0B" />
              </View>
              <Text style={styles.featureTitle}>Rich Documentation</Text>
              <Text style={styles.featureDescription}>
                Create detailed itineraries with notes, photos, and links
              </Text>
            </View>
          </View>
        </View>

        {/* Footer CTA */}
        <View style={styles.footerCTA}>
          <Text style={styles.footerCTATitle}>Ready to start planning?</Text>
          {!isAuthenticated && (
            <TouchableOpacity
              style={styles.footerCTAButton}
              onPress={() => router.push('/(auth)/register')}
            >
              <Text style={styles.footerCTAButtonText}>Create Free Account</Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
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
    paddingHorizontal: 24,
    paddingVertical: 64,
    alignItems: 'center',
  },
  heroTitle: {
    fontSize: 48,
    fontWeight: '800',
    color: '#111827',
    textAlign: 'center',
    marginBottom: 16,
    ...(Platform.OS === 'web' ? { maxWidth: 800 } : {}),
  },
  heroSubtitle: {
    fontSize: 20,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 28,
    ...(Platform.OS === 'web' ? { maxWidth: 600 } : {}),
  },
  ctaButtons: {
    flexDirection: 'row',
    gap: 16,
    flexWrap: 'wrap',
    justifyContent: 'center',
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
  footerCTA: {
    paddingHorizontal: 24,
    paddingVertical: 64,
    alignItems: 'center',
  },
  footerCTATitle: {
    fontSize: 32,
    fontWeight: '700',
    color: '#111827',
    textAlign: 'center',
    marginBottom: 24,
  },
  footerCTAButton: {
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 8,
    backgroundColor: '#3B82F6',
  },
  footerCTAButtonText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
});
