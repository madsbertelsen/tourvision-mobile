import React, { useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Platform,
  Alert,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { Link, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather, MaterialIcons } from '@expo/vector-icons';
import { useAuth } from '@/lib/supabase/auth-context';
import { formatUserDisplayName, getUserInitials } from '@/lib/auth/utils';
import { useTrips } from '@/hooks/useTrips';
import type { Tables } from '@/lib/database.types';

interface TripCardProps {
  id: string;
  title: string;
  status: string;
  statusColor: string;
  details: string;
  date: string;
  gradient: string[];
  participants?: string[];
  onPress: () => void;
}

const TripCard = ({ id, title, status, statusColor, details, date, gradient, participants, onPress }: TripCardProps) => (
  <TouchableOpacity style={styles.tripCard} onPress={onPress}>
    <LinearGradient
      colors={gradient}
      style={styles.tripGradient}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
    >
      <View style={styles.tripHeader}>
        <View style={styles.tripInfo}>
          <Text style={styles.tripTitle} numberOfLines={1}>{title}</Text>
          <View style={styles.tripStatus}>
            <Text style={styles.tripStatusText}>{status}</Text>
          </View>
        </View>
        {participants && participants.length > 0 && (
          <View style={styles.tripParticipants}>
            {participants.map((color, index) => (
              <View
                key={index}
                style={[
                  styles.participantAvatar,
                  { backgroundColor: color, marginLeft: index > 0 ? -8 : 0 }
                ]}
              />
            ))}
          </View>
        )}
      </View>
      
      <View style={styles.tripFooter}>
        <Text style={styles.tripDetails}>{details}</Text>
        <View style={styles.tripDateRow}>
          <Feather name="calendar" size={12} color="rgba(255,255,255,0.8)" />
          <Text style={styles.tripDate}>{date}</Text>
        </View>
      </View>
    </LinearGradient>
  </TouchableOpacity>
);

interface StatCardProps {
  icon: React.ReactNode;
  value: string;
  label: string;
  trend?: string;
  trendUp?: boolean;
}

const StatCard = ({ icon, value, label, trend, trendUp }: StatCardProps) => (
  <View style={styles.statCard}>
    <View style={styles.statHeader}>
      <View style={styles.statIcon}>
        {icon}
      </View>
      {trend && (
        <View style={[
          styles.statTrend,
          { backgroundColor: trendUp ? '#F0FDF4' : '#FEFCE8' }
        ]}>
          <Text style={[
            styles.statTrendText,
            { color: trendUp ? '#16A34A' : '#CA8A04' }
          ]}>
            {trend}
          </Text>
        </View>
      )}
    </View>
    <Text style={styles.statValue}>{value}</Text>
    <Text style={styles.statLabel}>{label}</Text>
  </View>
);

export default function DashboardScreen() {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const { data: trips, isLoading, error } = useTrips();
  
  // Helper function to extract destination count from document
  const getDestinationCount = (document: any): number => {
    if (!document?.content) return 0;
    let count = 0;
    document.content.forEach((node: any) => {
      if (node.type === 'dayNode' && node.content) {
        node.content.forEach((child: any) => {
          if (child.type === 'destinationNode') count++;
        });
      }
    });
    return count;
  };
  
  // Helper function to get trip status
  const getTripStatus = (trip: Tables<'trips'>): { status: string; color: string } => {
    const doc = trip.itinerary_document as any;
    const hasPlanning = trip.title.toLowerCase().includes('planning') || 
                       trip.description?.toLowerCase().includes('planning');
    
    if (hasPlanning) return { status: 'Planning', color: '#DBEAFE' };
    
    // Check dates in document to determine if upcoming or completed
    const today = new Date();
    let earliestDate: Date | null = null;
    
    if (doc?.content) {
      doc.content.forEach((node: any) => {
        if (node.type === 'dayNode' && node.attrs?.date) {
          const date = new Date(node.attrs.date);
          if (!earliestDate || date < earliestDate) {
            earliestDate = date;
          }
        }
      });
    }
    
    if (earliestDate) {
      if (earliestDate > today) return { status: 'Upcoming', color: '#FEF3C7' };
      return { status: 'Completed', color: '#D1FAE5' };
    }
    
    return { status: 'Draft', color: '#E5E5E5' };
  };
  
  // Helper function to format date
  const formatTripDate = (trip: Tables<'trips'>): string => {
    const doc = trip.itinerary_document as any;
    if (doc?.content) {
      for (const node of doc.content) {
        if (node.type === 'dayNode' && node.attrs?.date) {
          const date = new Date(node.attrs.date);
          return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
        }
      }
    }
    if (trip.created_at) {
      const date = new Date(trip.created_at);
      return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    }
    return 'TBD';
  };
  
  // Helper function to get gradient colors based on trip title
  const getGradientColors = (title: string): string[] => {
    const gradients = [
      ['#667EEA', '#764BA2'],
      ['#F093FB', '#F5576C'],
      ['#4FACFE', '#00F2FE'],
      ['#43E97B', '#38F9D7'],
      ['#FA709A', '#FEE140'],
      ['#30CCED', '#2A8AE6'],
    ];
    
    // Use title hash to consistently pick same gradient
    let hash = 0;
    for (let i = 0; i < title.length; i++) {
      hash = title.charCodeAt(i) + ((hash << 5) - hash);
    }
    return gradients[Math.abs(hash) % gradients.length];
  };
  
  const handleSignOut = async () => {
    if (Platform.OS === 'web') {
      if (window.confirm('Are you sure you want to sign out?')) {
        await signOut();
        router.replace('/login');
      }
    } else {
      Alert.alert(
        'Sign Out',
        'Are you sure you want to sign out?',
        [
          { text: 'Cancel', style: 'cancel' },
          { 
            text: 'Sign Out', 
            onPress: async () => {
              await signOut();
              router.replace('/login');
            },
            style: 'destructive'
          }
        ]
      );
    }
  };

  // Memoized sidebar links
  const sidebarLinks = useMemo(() => [
    { icon: 'home', label: 'Dashboard', active: true },
    { icon: 'compass', label: 'Explore', active: false },
    { icon: 'map', label: 'My Trips', active: false },
    { icon: 'message-square', label: 'AI Assistant', active: false },
  ], []);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerContent}>
          <View style={styles.logo}>
            <View style={styles.logoIcon}>
              <Text style={styles.logoText}>T</Text>
            </View>
            <Text style={styles.appName}>TourVision</Text>
          </View>
          
          <View style={styles.headerActions}>
            <TouchableOpacity style={styles.headerButton}>
              <Feather name="bell" size={20} color="#6B7280" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.headerButton}>
              <Feather name="settings" size={20} color="#6B7280" />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Navigation Tabs */}
      <View style={styles.navTabs}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.navTabsContent}>
            {sidebarLinks.map((link, index) => (
              <TouchableOpacity
                key={index}
                style={[
                  styles.navTab,
                  link.active && styles.navTabActive
                ]}
              >
                <Feather 
                  name={link.icon as any} 
                  size={18} 
                  color={link.active ? '#6366F1' : '#6B7280'} 
                />
                <Text style={[
                  styles.navTabText,
                  link.active && styles.navTabTextActive
                ]}>
                  {link.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      </View>

      <ScrollView style={styles.content}>
        {/* Welcome Section */}
        <View style={styles.welcomeSection}>
          <Text style={styles.welcomeTitle}>
            Welcome back, {user ? formatUserDisplayName(user) : 'Guest'}!
          </Text>
          <Text style={styles.welcomeSubtitle}>
            Here's what's happening with your trips today.
          </Text>
        </View>

        {/* Stats Grid */}
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false}
          style={styles.statsContainer}
          contentContainerStyle={styles.statsContent}
        >
          <StatCard
            icon={<MaterialIcons name="flight" size={20} color="#6366F1" />}
            value="8"
            label="Total Trips"
            trend="+12%"
            trendUp
          />
          <StatCard
            icon={<Feather name="map-pin" size={20} color="#6366F1" />}
            value="23"
            label="Places Visited"
            trend="New"
            trendUp={false}
          />
          <StatCard
            icon={<MaterialIcons name="attach-money" size={20} color="#6366F1" />}
            value="$4,250"
            label="Total Spent"
            trend="Budget"
            trendUp={false}
          />
          <StatCard
            icon={<Feather name="star" size={20} color="#6366F1" />}
            value="142"
            label="Reviews"
            trend="4.8"
            trendUp={false}
          />
        </ScrollView>

        {/* Trips Section */}
        <View style={styles.tripsSection}>
          <View style={styles.tripsSectionHeader}>
            <Text style={styles.tripsSectionTitle}>Your Trips</Text>
            <TouchableOpacity>
              <Text style={styles.viewAllLink}>View all →</Text>
            </TouchableOpacity>
          </View>

          {isLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#6366F1" />
              <Text style={styles.loadingText}>Loading trips...</Text>
            </View>
          ) : error ? (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>Failed to load trips</Text>
              <Text style={styles.errorSubtext}>Please try again later</Text>
            </View>
          ) : trips && trips.length > 0 ? (
            <ScrollView 
              horizontal 
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.tripsScrollContent}
            >
              {trips.map((trip) => {
                const { status, color } = getTripStatus(trip);
                const destinationCount = getDestinationCount(trip.itinerary_document);
                const duration = trip.description?.match(/(\d+)\s*day/i)?.[1] || '?';
                
                return (
                  <TripCard
                    key={trip.id}
                    id={trip.id}
                    title={trip.title}
                    status={status}
                    statusColor={color}
                    details={`${duration} days • ${destinationCount} places`}
                    date={formatTripDate(trip)}
                    gradient={getGradientColors(trip.title)}
                    participants={trip.collaborators?.slice(0, 3).map(() => {
                      const colors = ['#3B82F6', '#8B5CF6', '#EC4899', '#10B981', '#F59E0B'];
                      return colors[Math.floor(Math.random() * colors.length)];
                    })}
                    onPress={() => router.push(`/trip/${trip.id}`)}
                  />
                );
              })}
            </ScrollView>
          ) : (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateTitle}>No trips yet</Text>
              <Text style={styles.emptyStateText}>Start planning your next adventure!</Text>
              <TouchableOpacity style={styles.createTripButton}>
                <Text style={styles.createTripButtonText}>Create Trip</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </ScrollView>

      {/* User Profile Button */}
      <View style={styles.profileButton}>
        <TouchableOpacity 
          onPress={handleSignOut}
          style={styles.profileAvatar}
        >
          <Text style={styles.profileAvatarText}>
            {user ? getUserInitials(user) : '?'}
          </Text>
        </TouchableOpacity>
        <View style={styles.profileInfo}>
          <Text style={styles.profileName}>
            {user ? formatUserDisplayName(user) : 'Guest'}
          </Text>
          <Text style={styles.profileEmail}>
            {user?.email || 'No email'}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  header: {
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    paddingTop: 48,
    paddingBottom: 16,
    paddingHorizontal: 24,
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  logo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  logoIcon: {
    width: 40,
    height: 40,
    backgroundColor: '#6366F1',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  logoText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
  appName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#111827',
  },
  headerActions: {
    flexDirection: 'row',
    gap: 16,
  },
  headerButton: {
    padding: 8,
  },
  navTabs: {
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    paddingHorizontal: 24,
  },
  navTabsContent: {
    flexDirection: 'row',
    paddingVertical: 12,
  },
  navTab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginRight: 8,
    borderRadius: 8,
  },
  navTabActive: {
    backgroundColor: '#EEF2FF',
  },
  navTabText: {
    marginLeft: 8,
    fontWeight: '500',
    color: '#6B7280',
  },
  navTabTextActive: {
    color: '#6366F1',
  },
  content: {
    flex: 1,
  },
  welcomeSection: {
    paddingHorizontal: 24,
    paddingVertical: 24,
  },
  welcomeTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111827',
  },
  welcomeSubtitle: {
    fontSize: 16,
    color: '#6B7280',
    marginTop: 4,
  },
  statsContainer: {
    marginBottom: 24,
  },
  statsContent: {
    paddingHorizontal: 24,
  },
  statCard: {
    width: 160,
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 16,
    marginRight: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  statHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  statIcon: {
    width: 40,
    height: 40,
    backgroundColor: '#EEF2FF',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statTrend: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statTrendText: {
    fontSize: 12,
    fontWeight: '500',
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: '#6B7280',
  },
  tripsSection: {
    paddingHorizontal: 24,
    marginBottom: 24,
  },
  tripsSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  tripsSectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#111827',
  },
  viewAllLink: {
    color: '#6366F1',
    fontWeight: '500',
  },
  tripsScrollContent: {
    paddingRight: 24,
  },
  tripCard: {
    width: 280,
    marginRight: 16,
  },
  tripGradient: {
    height: 160,
    borderRadius: 16,
    padding: 20,
  },
  tripHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  tripInfo: {
    flex: 1,
  },
  tripTitle: {
    color: 'white',
    fontSize: 20,
    fontWeight: 'bold',
  },
  tripStatus: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: 'flex-start',
    marginTop: 8,
  },
  tripStatusText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '500',
  },
  tripParticipants: {
    flexDirection: 'row',
  },
  participantAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: 'white',
  },
  tripFooter: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  tripDetails: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 14,
    marginBottom: 4,
  },
  tripDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  tripDate: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 12,
    marginLeft: 4,
  },
  loadingContainer: {
    paddingVertical: 32,
    alignItems: 'center',
  },
  loadingText: {
    color: '#6B7280',
    marginTop: 8,
  },
  errorContainer: {
    paddingVertical: 32,
    alignItems: 'center',
  },
  errorText: {
    color: '#EF4444',
  },
  errorSubtext: {
    color: '#6B7280',
    marginTop: 4,
  },
  emptyState: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
  },
  emptyStateTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 8,
  },
  emptyStateText: {
    color: '#6B7280',
    marginBottom: 16,
  },
  createTripButton: {
    backgroundColor: '#6366F1',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  createTripButtonText: {
    color: 'white',
    fontWeight: '600',
  },
  profileButton: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    flexDirection: 'row',
    alignItems: 'center',
  },
  profileAvatar: {
    width: 56,
    height: 56,
    backgroundColor: '#6366F1',
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 4,
  },
  profileAvatarText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
  profileInfo: {
    position: 'absolute',
    bottom: -8,
    right: -8,
    backgroundColor: 'white',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  profileName: {
    fontSize: 12,
    fontWeight: '500',
    color: '#374151',
  },
  profileEmail: {
    fontSize: 12,
    color: '#6B7280',
  },
});