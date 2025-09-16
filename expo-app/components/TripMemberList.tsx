import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Image,
  ActivityIndicator,
} from 'react-native';
import { Feather, Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase/client';

interface TripMember {
  id: string;
  user_id: string;
  role: 'owner' | 'member' | 'viewer';
  joined_at: string;
  onboarding_completed: boolean;
  profile?: {
    email?: string;
    avatar_url?: string;
    full_name?: string;
  };
  attendance_stats?: {
    confirmed: number;
    considering: number;
    declined: number;
    alternative: number;
  };
}

interface TripMemberListProps {
  tripId: string;
  onInvitePress?: () => void;
  onMemberPress?: (member: TripMember) => void;
  compact?: boolean;
}

export default function TripMemberList({
  tripId,
  onInvitePress,
  onMemberPress,
  compact = false
}: TripMemberListProps) {
  const [members, setMembers] = useState<TripMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useEffect(() => {
    loadMembers();
    getCurrentUser();
  }, [tripId]);

  const getCurrentUser = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    setCurrentUserId(user?.id || null);
  };

  const loadMembers = async () => {
    try {
      console.log('[TripMemberList] Loading members for trip:', tripId);

      // Fetch trip members with profiles
      const { data: membersData, error } = await supabase
        .from('trip_members')
        .select('*')
        .eq('trip_id', tripId)
        .order('role', { ascending: true })
        .order('joined_at', { ascending: true });

      console.log('[TripMemberList] Members query result:', { membersData, error });

      if (error) {
        console.error('[TripMemberList] Error fetching members:', error);
        throw error;
      }

      if (!membersData || membersData.length === 0) {
        console.log('[TripMemberList] No members found for trip');
        setMembers([]);
        setLoading(false);
        return;
      }

      console.log(`[TripMemberList] Found ${membersData.length} members, fetching profiles...`);

      // Fetch profiles and attendance stats for each member
      const membersWithStats = await Promise.all(
        membersData.map(async (member) => {
          console.log(`[TripMemberList] Fetching profile for user ${member.user_id}`);

          // Fetch profile - only select columns that exist
          const { data: profileData, error: profileError } = await supabase
            .from('profiles')
            .select('id, email, avatar_url, full_name')
            .eq('id', member.user_id)
            .single();

          if (profileError) {
            console.log(`[TripMemberList] Error fetching profile for ${member.user_id}:`, profileError);
          } else {
            console.log(`[TripMemberList] Profile fetched for ${member.user_id}:`, profileData);
          }

          // Fetch attendance stats
          const { data: stats } = await supabase
            .from('user_attendance')
            .select('status')
            .eq('trip_id', tripId)
            .eq('user_id', member.user_id);

          const attendanceStats = {
            confirmed: stats?.filter(s => s.status === 'confirmed').length || 0,
            considering: stats?.filter(s => s.status === 'considering').length || 0,
            declined: stats?.filter(s => s.status === 'declined').length || 0,
            alternative: stats?.filter(s => s.status === 'alternative').length || 0,
          };

          return {
            ...member,
            profile: profileData,
            attendance_stats: attendanceStats,
          };
        })
      );

      console.log('[TripMemberList] Final members with stats:', membersWithStats);
      setMembers(membersWithStats);
    } catch (error) {
      console.error('[TripMemberList] Error loading members:', error);
    } finally {
      console.log('[TripMemberList] Setting loading to false');
      setLoading(false);
    }
  };

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'owner':
        return <Ionicons name="star" size={16} color="#FFD700" />;
      case 'member':
        return <Ionicons name="person" size={16} color="#3B82F6" />;
      case 'viewer':
        return <Ionicons name="eye" size={16} color="#6B7280" />;
      default:
        return null;
    }
  };

  const getInitials = (member: TripMember) => {
    if (member.profile?.full_name) {
      return member.profile.full_name
        .split(' ')
        .map(n => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2);
    }
    return member.profile?.email?.slice(0, 2).toUpperCase() || '??';
  };

  const getAvatarColor = (member: TripMember) => {
    // Use color from full_name if it's a color user
    const name = member.profile?.full_name?.toLowerCase() || '';
    if (name.includes('blue')) return '#3B82F6';
    if (name.includes('green')) return '#10B981';
    if (name.includes('purple')) return '#8B5CF6';
    if (name.includes('red')) return '#EF4444';
    if (name.includes('yellow')) return '#F59E0B';
    if (name.includes('pink')) return '#EC4899';

    // Default colors based on user ID
    const colors = ['#3B82F6', '#10B981', '#8B5CF6', '#EF4444', '#F59E0B', '#EC4899'];
    const index = member.user_id.charCodeAt(0) % colors.length;
    return colors[index];
  };

  const formatJoinDate = (date: string) => {
    const joined = new Date(date);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - joined.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Joined today';
    if (diffDays === 1) return 'Joined yesterday';
    if (diffDays < 7) return `Joined ${diffDays} days ago`;
    if (diffDays < 30) return `Joined ${Math.floor(diffDays / 7)} weeks ago`;
    return `Joined ${joined.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#3B82F6" />
      </View>
    );
  }

  if (compact) {
    return (
      <View style={styles.compactContainer}>
        <View style={styles.avatarStack}>
          {members.slice(0, 4).map((member, index) => (
            <View
              key={member.id}
              style={[
                styles.compactAvatar,
                { marginLeft: index > 0 ? -12 : 0, zIndex: members.length - index }
              ]}
            >
              <View style={[styles.avatarPlaceholder, styles.avatarImage, { backgroundColor: getAvatarColor(member) }]}>
                <Text style={[styles.avatarInitials, { color: '#FFFFFF' }]}>{getInitials(member)}</Text>
              </View>
            </View>
          ))}
          {members.length > 4 && (
            <View style={[styles.compactAvatar, { marginLeft: -12, zIndex: 0 }]}>
              <View style={[styles.avatarPlaceholder, styles.avatarImage]}>
                <Text style={styles.avatarInitials}>+{members.length - 4}</Text>
              </View>
            </View>
          )}
        </View>
        <Text style={styles.compactText}>
          {members.length} {members.length === 1 ? 'member' : 'members'}
        </Text>
        {onInvitePress && (
          <TouchableOpacity onPress={onInvitePress} style={styles.inviteButton}>
            <Feather name="user-plus" size={20} color="#3B82F6" />
          </TouchableOpacity>
        )}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Trip Members ({members.length})</Text>
        {onInvitePress && (
          <TouchableOpacity onPress={onInvitePress} style={styles.inviteButton}>
            <Feather name="user-plus" size={20} color="#3B82F6" />
            <Text style={styles.inviteText}>Invite</Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView style={styles.memberList} showsVerticalScrollIndicator={false}>
        {members.map((member) => (
          <TouchableOpacity
            key={member.id}
            style={styles.memberCard}
            onPress={() => onMemberPress?.(member)}
            disabled={!onMemberPress}
          >
            <View style={styles.memberLeft}>
              <View style={[styles.avatarPlaceholder, styles.avatar, { backgroundColor: getAvatarColor(member) }]}>
                <Text style={[styles.avatarInitials, { color: '#FFFFFF' }]}>{getInitials(member)}</Text>
              </View>

              <View style={styles.memberInfo}>
                <View style={styles.nameRow}>
                  <Text style={styles.memberName}>
                    {member.profile?.full_name || member.profile?.username || 'Unknown'}
                  </Text>
                  {getRoleIcon(member.role)}
                  {member.user_id === currentUserId && (
                    <Text style={styles.youBadge}>You</Text>
                  )}
                </View>
                <Text style={styles.joinDate}>{formatJoinDate(member.joined_at)}</Text>

                {!member.onboarding_completed && (
                  <View style={styles.pendingBadge}>
                    <Feather name="clock" size={12} color="#F59E0B" />
                    <Text style={styles.pendingText}>Reviewing itinerary</Text>
                  </View>
                )}
              </View>
            </View>

            {member.attendance_stats && (
              <View style={styles.statsContainer}>
                <View style={styles.statBadge}>
                  <Ionicons name="checkmark-circle" size={14} color="#10B981" />
                  <Text style={styles.statText}>{member.attendance_stats.confirmed}</Text>
                </View>
                <View style={styles.statBadge}>
                  <Ionicons name="help-circle" size={14} color="#F59E0B" />
                  <Text style={styles.statText}>{member.attendance_stats.considering}</Text>
                </View>
                {member.attendance_stats.alternative > 0 && (
                  <View style={styles.statBadge}>
                    <Ionicons name="git-branch" size={14} color="#8B5CF6" />
                    <Text style={styles.statText}>{member.attendance_stats.alternative}</Text>
                  </View>
                )}
              </View>
            )}
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1F2937',
  },
  inviteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#EBF5FF',
    borderRadius: 8,
    gap: 6,
  },
  inviteText: {
    color: '#3B82F6',
    fontWeight: '500',
  },
  memberList: {
    flex: 1,
  },
  memberCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  memberLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    marginRight: 12,
  },
  avatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: 24,
  },
  avatarPlaceholder: {
    backgroundColor: '#E5E7EB',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarInitials: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6B7280',
  },
  memberInfo: {
    flex: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  memberName: {
    fontSize: 16,
    fontWeight: '500',
    color: '#1F2937',
  },
  youBadge: {
    fontSize: 12,
    color: '#3B82F6',
    backgroundColor: '#EBF5FF',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  joinDate: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 2,
  },
  pendingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  pendingText: {
    fontSize: 12,
    color: '#F59E0B',
  },
  statsContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  statBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
  },
  statText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#4B5563',
  },
  compactContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#fff',
    borderRadius: 8,
  },
  avatarStack: {
    flexDirection: 'row',
    marginRight: 12,
  },
  compactAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#fff',
  },
  compactText: {
    flex: 1,
    fontSize: 14,
    color: '#6B7280',
  },
});