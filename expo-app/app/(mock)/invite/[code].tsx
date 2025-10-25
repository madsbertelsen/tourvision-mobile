import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase/client';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function InviteScreen() {
  const { code } = useLocalSearchParams();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tripInfo, setTripInfo] = useState<{
    trip_id: string;
    trip_title: string;
    permission: string;
  } | null>(null);

  useEffect(() => {
    if (code) {
      acceptInvite();
    }
  }, [code]);

  const acceptInvite = async () => {
    try {
      setLoading(true);
      setError(null);

      console.log('[InviteScreen] Processing invitation code:', code);

      // Check if user is authenticated
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.log('[InviteScreen] User not authenticated, redirecting to login');
        // Redirect to login with return URL
        router.replace({
          pathname: '/(auth)/login',
          params: { returnUrl: `/invite/${code}` }
        });
        return;
      }

      console.log('[InviteScreen] User authenticated:', user.id);

      // Use the share link
      const { data, error } = await supabase.rpc('use_share_link', {
        p_share_code: code
      });

      if (error) throw error;

      console.log('[InviteScreen] Share link response:', data);

      if (data?.success) {
        setTripInfo({
          trip_id: data.trip_id,
          trip_title: data.trip_title,
          permission: data.permission
        });

        console.log('[InviteScreen] Navigating to document:', data.trip_id);

        // Always navigate to document after successful invitation acceptance
        setTimeout(() => {
          navigateToTrip(data.trip_id);
        }, 1500);
      } else {
        setError(data?.error || 'Invalid or expired invitation link');
      }
    } catch (err: any) {
      console.error('[InviteScreen] Error accepting invite:', err);
      setError(err.message || 'Failed to accept invitation');
    } finally {
      setLoading(false);
    }
  };

  const navigateToTrip = (tripId: string) => {
    console.log('[InviteScreen] navigateToTrip called with tripId:', tripId);
    const targetPath = `/(mock)/trip/${tripId}`;
    console.log('[InviteScreen] Navigating to:', targetPath);
    router.replace({
      pathname: targetPath as any
    });
  };

  if (loading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.content}>
          <ActivityIndicator size="large" color="#3B82F6" />
          <Text style={styles.loadingText}>Processing invitation...</Text>
        </View>
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.content}>
          <View style={styles.errorIcon}>
            <Ionicons name="close-circle" size={64} color="#EF4444" />
          </View>
          <Text style={styles.errorTitle}>Invitation Error</Text>
          <Text style={styles.errorMessage}>{error}</Text>
          <TouchableOpacity
            style={styles.button}
            onPress={() => router.replace('/')}
          >
            <Text style={styles.buttonText}>Go to Dashboard</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (tripInfo) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.content}>
          <View style={styles.successIcon}>
            <Ionicons name="checkmark-circle" size={64} color="#10B981" />
          </View>
          <Text style={styles.successTitle}>Invitation Accepted!</Text>
          <Text style={styles.tripTitle}>"{tripInfo.trip_title}"</Text>
          <View style={styles.permissionBadge}>
            <Text style={styles.permissionText}>
              {tripInfo.permission === 'edit' ? 'Can Edit' : 'Can View'}
            </Text>
          </View>
          <Text style={styles.successMessage}>
            You now have access to this document. Redirecting...
          </Text>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => navigateToTrip(tripInfo.trip_id)}
          >
            <Text style={styles.primaryButtonText}>Open Trip Now</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#6B7280',
  },
  errorIcon: {
    marginBottom: 16,
  },
  errorTitle: {
    fontSize: 24,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 8,
  },
  errorMessage: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 22,
  },
  successIcon: {
    marginBottom: 16,
  },
  successTitle: {
    fontSize: 24,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 12,
  },
  tripTitle: {
    fontSize: 18,
    fontWeight: '500',
    color: '#374151',
    marginBottom: 12,
  },
  permissionBadge: {
    backgroundColor: '#EBF5FF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginBottom: 16,
  },
  permissionText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#3B82F6',
  },
  successMessage: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 24,
  },
  button: {
    backgroundColor: '#6B7280',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  primaryButton: {
    backgroundColor: '#3B82F6',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  primaryButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
});