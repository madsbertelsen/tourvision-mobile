import React from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  Alert,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { Link, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather, MaterialIcons } from '@expo/vector-icons';
import { useAuth } from '@/lib/supabase/auth-context';
import { formatUserDisplayName, getUserInitials } from '@/lib/auth/utils';
import { useTrips } from '@/hooks/useTrips';
import type { Tables } from '@/lib/database.types';

const { width } = Dimensions.get('window');

interface StatCardProps {
  icon: React.ReactNode;
  value: string | number;
  label: string;
  badge?: string;
  badgeColor?: string;
  iconBg: string;
}

const StatCard = ({ icon, value, label, badge, badgeColor, iconBg }: StatCardProps) => (
  <View style={styles.statCard}>
    <View style={styles.statHeader}>
      <View style={[styles.statIcon, { backgroundColor: iconBg }]}>
        {icon}
      </View>
      {badge && (
        <View style={[styles.badge, { backgroundColor: badgeColor }]}>
          <Text style={styles.badgeText}>{badge}</Text>
        </View>
      )}
    </View>
    <Text style={styles.statValue}>{value}</Text>
    <Text style={styles.statLabel}>{label}</Text>
  </View>
);

interface TripCardProps {
  id: string;
  title: string;
  status: string;
  statusColor: string;
  details: string;
  date: string;
  gradient: string[];
  participants?: string[];
  onPress?: () => void;
}

const TripCard = ({ id, title, status, statusColor, details, date, gradient, participants, onPress }: TripCardProps) => (
  <TouchableOpacity style={styles.tripCard} onPress={onPress}>
    <LinearGradient
      colors={gradient}
      style={styles.tripGradient}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
    />
    <View style={styles.tripContent}>
      <View style={styles.tripHeader}>
        <Text style={styles.tripTitle}>{title}</Text>
        <View style={[styles.tripStatus, { backgroundColor: statusColor }]}>
          <Text style={styles.tripStatusText}>{status}</Text>
        </View>
      </View>
      <Text style={styles.tripDetails}>{details}</Text>
      <View style={styles.tripFooter}>
        {participants && (
          <View style={styles.participantsContainer}>
            {participants.map((color, index) => (
              <View 
                key={index} 
                style={[
                  styles.participant, 
                  { backgroundColor: color, marginLeft: index > 0 ? -8 : 0 }
                ]} 
              />
            ))}
            {participants.length > 3 && (
              <View style={[styles.participant, styles.participantMore, { marginLeft: -8 }]}>
                <Text style={styles.participantMoreText}>+{participants.length - 3}</Text>
              </View>
            )}
          </View>
        )}
        <Text style={styles.tripDate}>{date}</Text>
      </View>
    </View>
  </TouchableOpacity>
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
  
  // Generate gradient colors based on title
  const getGradientColors = (title: string): string[] => {
    const gradients = [
      ['#06B6D4', '#3B82F6'],
      ['#8B5CF6', '#EC4899'],
      ['#10B981', '#3B82F6'],
      ['#F59E0B', '#EF4444'],
      ['#6366F1', '#8B5CF6'],
    ];
    const index = title.length % gradients.length;
    return gradients[index];
  };
  
  const handleLogout = async () => {
    console.log('Logout button pressed');
    
    // For web, use window.confirm instead of Alert
    if (Platform.OS === 'web') {
      const confirmed = window.confirm('Are you sure you want to logout?');
      if (confirmed) {
        try {
          console.log('Signing out...');
          await signOut();
          console.log('Sign out successful');
          // Force navigation to login
          router.replace('/(auth)/login');
        } catch (error) {
          console.error('Logout error:', error);
          alert('Failed to logout');
        }
      }
    } else {
      Alert.alert(
        'Logout',
        'Are you sure you want to logout?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Logout',
            style: 'destructive',
            onPress: async () => {
              try {
                console.log('Signing out...');
                await signOut();
                console.log('Sign out successful');
                // Force navigation to login
                router.replace('/(auth)/login');
              } catch (error) {
                console.error('Logout error:', error);
                Alert.alert('Error', 'Failed to logout');
              }
            },
          },
        ]
      );
    }
  };
  
  return (
    <ScrollView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.logo}>
            <Text style={styles.logoText}>T</Text>
          </View>
          <Text style={styles.appName}>TourVision</Text>
        </View>
        <View style={styles.headerRight}>
          <TouchableOpacity style={styles.notificationButton}>
            <Feather name="bell" size={24} color="#333" />
            <View style={styles.notificationDot} />
          </TouchableOpacity>
          <TouchableOpacity 
            onPress={handleLogout} 
            style={styles.logoutButton}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Feather name="log-out" size={24} color="#EF4444" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Sidebar */}
      <View style={styles.sidebarPlaceholder}>
        <TouchableOpacity style={[styles.sidebarItem, styles.sidebarItemActive]}>
          <Feather name="home" size={20} color="#10B981" />
          <Text style={[styles.sidebarText, styles.sidebarTextActive]}>Dashboard</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.sidebarItem}>
          <Feather name="search" size={20} color="#666" />
          <Text style={styles.sidebarText}>Explore</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.sidebarItem}>
          <Feather name="briefcase" size={20} color="#666" />
          <Text style={styles.sidebarText}>My Trips</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.sidebarItem}>
          <MaterialIcons name="assistant" size={20} color="#666" />
          <Text style={styles.sidebarText}>AI Assistant</Text>
        </TouchableOpacity>
      </View>

      {/* Welcome Section */}
      <View style={styles.welcomeSection}>
        <Text style={styles.welcomeTitle}>Welcome back, {formatUserDisplayName(user)}!</Text>
        <Text style={styles.welcomeSubtitle}>Here's what's happening with your trips today.</Text>
      </View>

      {/* Stats Grid */}
      <View style={styles.statsGrid}>
        <StatCard
          icon={<Feather name="globe" size={24} color="#3B82F6" />}
          value={8}
          label="Total Trips"
          badge="+12%"
          badgeColor="#D1FAE5"
          iconBg="#DBEAFE"
        />
        <StatCard
          icon={<Feather name="map-pin" size={24} color="#8B5CF6" />}
          value={23}
          label="Places Visited"
          badge="New"
          badgeColor="#EDE9FE"
          iconBg="#F3E8FF"
        />
        <StatCard
          icon={<MaterialIcons name="attach-money" size={24} color="#10B981" />}
          value="$4,250"
          label="Total Spent"
          badge="Budget"
          badgeColor="#D1FAE5"
          iconBg="#D1FAE5"
        />
        <StatCard
          icon={<Feather name="star" size={24} color="#F59E0B" />}
          value={142}
          label="Reviews"
          badge="4.8"
          badgeColor="#FEF3C7"
          iconBg="#FEF3C7"
        />
      </View>

      {/* Recent Trips */}
      <View style={styles.recentTripsSection}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Your Trips</Text>
          <TouchableOpacity>
            <Text style={styles.viewAllButton}>View all →</Text>
          </TouchableOpacity>
        </View>

        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#6366F1" />
            <Text style={styles.loadingText}>Loading your trips...</Text>
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
            contentContainerStyle={styles.tripsContainer}
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
          <View style={styles.emptyContainer}>
            <Feather name="map" size={48} color="#CBD5E1" />
            <Text style={styles.emptyText}>No trips yet</Text>
            <Text style={styles.emptySubtext}>Start planning your next adventure!</Text>
            <TouchableOpacity style={styles.createButton}>
              <Text style={styles.createButtonText}>Create Trip</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* User Profile Footer */}
      <View style={styles.userProfile}>
        <View style={styles.profileLeft}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{getUserInitials(user)}</Text>
          </View>
          <View>
            <Text style={styles.userName}>{formatUserDisplayName(user)}</Text>
            <Text style={styles.userEmail}>{user?.email || 'No email'}</Text>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAFAFA',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 50,
    paddingBottom: 20,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5E5',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  logo: {
    width: 40,
    height: 40,
    backgroundColor: '#6366F1',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoText: {
    color: 'white',
    fontSize: 20,
    fontWeight: 'bold',
  },
  appName: {
    fontSize: 24,
    fontWeight: 'bold',
    marginLeft: 12,
  },
  notificationButton: {
    position: 'relative',
  },
  notificationDot: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 8,
    height: 8,
    backgroundColor: '#EF4444',
    borderRadius: 4,
  },
  logoutButton: {
    padding: 8,
    backgroundColor: '#FEE2E2',
    borderRadius: 8,
  },
  sidebarPlaceholder: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5E5',
  },
  sidebarItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginRight: 8,
    borderRadius: 8,
  },
  sidebarItemActive: {
    backgroundColor: '#F0FDF4',
  },
  sidebarText: {
    marginLeft: 8,
    fontSize: 14,
    color: '#666',
  },
  sidebarTextActive: {
    color: '#10B981',
    fontWeight: '600',
  },
  welcomeSection: {
    padding: 20,
  },
  welcomeTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  welcomeSubtitle: {
    fontSize: 16,
    color: '#666',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 20,
    justifyContent: 'space-between',
  },
  statCard: {
    width: (width - 50) / 2,
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
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
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 14,
    color: '#666',
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#059669',
  },
  recentTripsSection: {
    marginTop: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: 'bold',
  },
  viewAllButton: {
    fontSize: 14,
    color: '#3B82F6',
    fontWeight: '600',
  },
  tripsContainer: {
    paddingHorizontal: 20,
  },
  tripCard: {
    width: width * 0.7,
    marginRight: 16,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: 'white',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  tripGradient: {
    height: 150,
  },
  tripContent: {
    padding: 16,
  },
  tripHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  tripTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  tripStatus: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  tripStatusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  tripDetails: {
    fontSize: 14,
    color: '#666',
    marginBottom: 12,
  },
  tripFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  participantsContainer: {
    flexDirection: 'row',
  },
  participant: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: 'white',
  },
  participantMore: {
    backgroundColor: '#E5E5E5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  participantMoreText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#666',
  },
  tripDate: {
    fontSize: 14,
    color: '#999',
    fontWeight: '600',
  },
  userProfile: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    marginTop: 20,
    borderTopWidth: 1,
    borderTopColor: '#E5E5E5',
  },
  profileLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#8B5CF6',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  userName: {
    fontSize: 16,
    fontWeight: '600',
  },
  userEmail: {
    fontSize: 14,
    color: '#666',
  },
  loadingContainer: {
    padding: 40,
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#666',
  },
  errorContainer: {
    padding: 40,
    alignItems: 'center',
  },
  errorText: {
    fontSize: 16,
    color: '#EF4444',
    fontWeight: '600',
  },
  errorSubtext: {
    marginTop: 4,
    fontSize: 14,
    color: '#666',
  },
  emptyContainer: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    marginTop: 16,
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  emptySubtext: {
    marginTop: 8,
    fontSize: 14,
    color: '#666',
  },
  createButton: {
    marginTop: 20,
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: '#6366F1',
    borderRadius: 8,
  },
  createButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
});