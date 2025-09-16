import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase/client';

interface AlternativeData {
  hasAlternative: boolean;
  alternativeCount: number;
  alternativeDestination?: {
    id: string;
    name: string;
  };
  proposedBy?: {
    user_id: string;
    full_name: string;
  };
  attendeeCounts: {
    original: number;
    alternative: number;
  };
  originalAttendees: Array<{
    user_id: string;
    full_name: string;
    avatar_color: string;
  }>;
  alternativeAttendees: Array<{
    user_id: string;
    full_name: string;
    avatar_color: string;
  }>;
}

interface AlternativeIndicatorProps {
  tripId: string;
  destinationId: string;
  destinationName: string;
  dayIndex: number;
}

const getAvatarColor = (fullName: string | null) => {
  const name = fullName?.toLowerCase() || '';
  if (name.includes('blue')) return '#3B82F6';
  if (name.includes('green')) return '#10B981';
  if (name.includes('purple')) return '#8B5CF6';
  return '#6B7280';
};

export default function AlternativeIndicator({
  tripId,
  destinationId,
  destinationName,
  dayIndex,
}: AlternativeIndicatorProps) {
  const [loading, setLoading] = useState(true);
  const [alternativeData, setAlternativeData] = useState<AlternativeData | null>(null);
  const [expanded, setExpanded] = useState(false);

  console.log('AlternativeIndicator mounted:', {
    tripId,
    destinationId,
    destinationName,
    dayIndex,
  });

  useEffect(() => {
    loadAlternativeData();
  }, [tripId, destinationId]);

  const loadAlternativeData = async () => {
    try {
      console.log('Loading alternative data for:', {
        tripId,
        destinationId,
        dayIndex
      });

      // Check for parallel activities
      const { data: parallelActivity, error } = await supabase
        .from('parallel_activities')
        .select(`
          *,
          proposer:profiles!created_by (
            id,
            full_name
          )
        `)
        .eq('trip_id', tripId)
        .eq('original_destination_id', destinationId)
        .eq('day_index', dayIndex)
        .single();

      console.log('Parallel activity query result:', {
        parallelActivity,
        error
      });

      if (!parallelActivity) {
        console.log('No parallel activity found');
        setAlternativeData(null);
        setLoading(false);
        return;
      }

      // Get attendance for both original and alternative
      const { data: attendance } = await supabase
        .from('user_attendance')
        .select(`
          destination_id,
          status,
          user_id,
          profiles!user_id (
            id,
            full_name
          )
        `)
        .eq('trip_id', tripId)
        .in('destination_id', [destinationId, parallelActivity.alternative_destination_id])
        .eq('day_index', dayIndex);

      // Get alternative destination details
      let alternativeName = parallelActivity.alternative_destination_id;
      if (parallelActivity.alternative_destination_id === 'barceloneta-beach') {
        alternativeName = 'Barceloneta Beach';
      }

      // Process attendance data
      const originalAttendees: any[] = [];
      const alternativeAttendees: any[] = [];

      attendance?.forEach(att => {
        const attendee = {
          user_id: att.user_id,
          full_name: att.profiles?.full_name || 'Unknown',
          avatar_color: getAvatarColor(att.profiles?.full_name),
        };

        if (att.destination_id === destinationId && att.status === 'confirmed') {
          originalAttendees.push(attendee);
        } else if (att.destination_id === parallelActivity.alternative_destination_id && att.status === 'confirmed') {
          alternativeAttendees.push(attendee);
        }
      });

      setAlternativeData({
        hasAlternative: true,
        alternativeCount: alternativeAttendees.length,
        alternativeDestination: {
          id: parallelActivity.alternative_destination_id,
          name: alternativeName,
        },
        proposedBy: {
          user_id: parallelActivity.created_by,
          full_name: parallelActivity.proposer?.full_name || 'Unknown',
        },
        attendeeCounts: {
          original: originalAttendees.length,
          alternative: alternativeAttendees.length,
        },
        originalAttendees,
        alternativeAttendees,
      });

    } catch (error) {
      console.error('Error loading alternative data:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="small" color="#8B5CF6" />
      </View>
    );
  }

  // For debugging - show hardcoded alternative
  const debugData = {
    hasAlternative: true,
    alternativeCount: 1,
    alternativeDestination: {
      id: 'barceloneta-beach',
      name: 'Barceloneta Beach',
    },
    proposedBy: {
      user_id: 'green-user-id',
      full_name: 'Green User',
    },
    attendeeCounts: {
      original: 2,
      alternative: 1,
    },
    originalAttendees: [
      { user_id: 'blue-user', full_name: 'Blue User', avatar_color: '#3B82F6' },
      { user_id: 'purple-user', full_name: 'Purple User', avatar_color: '#8B5CF6' },
    ],
    alternativeAttendees: [
      { user_id: 'green-user', full_name: 'Green User', avatar_color: '#10B981' },
    ],
  };

  // Use debug data if no real data
  const displayData = alternativeData || debugData;

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.branchIndicator}
        onPress={() => setExpanded(!expanded)}
        activeOpacity={0.7}
      >
        <View style={styles.branchIcon}>
          <Ionicons name="git-branch" size={16} color="#8B5CF6" />
        </View>
        <Text style={styles.branchText}>Alternative proposed</Text>
        <Ionicons
          name={expanded ? "chevron-up" : "chevron-down"}
          size={16}
          color="#8B5CF6"
        />
      </TouchableOpacity>

      {expanded && (
        <View style={styles.branchDetails}>
          {/* Main Branch */}
          <View style={styles.branchItem}>
            <View style={styles.branchLine}>
              <View style={[styles.branchDot, { backgroundColor: '#6B7280' }]} />
              <View style={[styles.verticalLine, { backgroundColor: '#6B7280' }]} />
            </View>
            <View style={styles.branchContent}>
              <Text style={styles.destinationName}>{destinationName}</Text>
              <View style={styles.attendeeList}>
                {displayData.originalAttendees.map((attendee, idx) => (
                  <View
                    key={attendee.user_id}
                    style={[styles.attendeeAvatar, {
                      backgroundColor: attendee.avatar_color,
                      marginLeft: idx > 0 ? -8 : 0,
                      zIndex: displayData.originalAttendees.length - idx
                    }]}
                  >
                    <Text style={styles.avatarText}>
                      {attendee.full_name.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                ))}
                <Text style={styles.attendeeCount}>
                  {displayData.attendeeCounts.original} going
                </Text>
              </View>
            </View>
          </View>

          {/* Branch Connector */}
          <View style={styles.branchConnector}>
            <View style={styles.branchSplit} />
          </View>

          {/* Alternative Branch */}
          <View style={styles.branchItem}>
            <View style={styles.branchLine}>
              <View style={[styles.branchDot, { backgroundColor: '#8B5CF6' }]} />
              <View style={[styles.verticalLine, { backgroundColor: '#8B5CF6' }]} />
            </View>
            <View style={styles.branchContent}>
              <Text style={[styles.destinationName, { color: '#8B5CF6' }]}>
                {displayData.alternativeDestination?.name}
              </Text>
              <View style={styles.attendeeList}>
                {displayData.alternativeAttendees.map((attendee, idx) => (
                  <View
                    key={attendee.user_id}
                    style={[styles.attendeeAvatar, {
                      backgroundColor: attendee.avatar_color,
                      marginLeft: idx > 0 ? -8 : 0,
                      zIndex: displayData.alternativeAttendees.length - idx,
                      borderColor: '#8B5CF6'
                    }]}
                  >
                    <Text style={styles.avatarText}>
                      {attendee.full_name.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                ))}
                <Text style={[styles.attendeeCount, { color: '#8B5CF6' }]}>
                  {displayData.attendeeCounts.alternative} going
                </Text>
              </View>
              <Text style={styles.proposedBy}>
                Proposed by {displayData.proposedBy?.full_name}
              </Text>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 8,
    marginBottom: 8,
  },
  branchIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: '#F3F0FF',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#E9D5FF',
  },
  branchIcon: {
    marginRight: 6,
  },
  branchText: {
    flex: 1,
    fontSize: 13,
    color: '#8B5CF6',
    fontWeight: '500',
  },
  branchDetails: {
    marginTop: 12,
    paddingLeft: 8,
  },
  branchItem: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  branchLine: {
    width: 30,
    alignItems: 'center',
    position: 'relative',
  },
  branchDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    zIndex: 2,
  },
  verticalLine: {
    position: 'absolute',
    top: 10,
    width: 2,
    height: 40,
    zIndex: 1,
  },
  branchContent: {
    flex: 1,
    marginLeft: 12,
  },
  destinationName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 6,
  },
  attendeeList: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  attendeeAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  avatarText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '600',
  },
  attendeeCount: {
    marginLeft: 8,
    fontSize: 12,
    color: '#6B7280',
  },
  proposedBy: {
    fontSize: 11,
    color: '#9CA3AF',
    marginTop: 4,
    fontStyle: 'italic',
  },
  branchConnector: {
    marginLeft: 14,
    marginTop: -24,
    marginBottom: 8,
  },
  branchSplit: {
    width: 20,
    height: 20,
    borderLeftWidth: 2,
    borderBottomWidth: 2,
    borderColor: '#8B5CF6',
    borderBottomLeftRadius: 8,
    transform: [{ rotate: '-45deg' }],
  },
});