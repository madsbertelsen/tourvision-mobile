import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Svg, Line, Circle, Path } from 'react-native-svg';
import { supabase } from '@/lib/supabase/client';

interface Branch {
  destinationId: string;
  destinationName: string;
  attendees: Array<{
    user_id: string;
    full_name: string;
    avatar_color: string;
  }>;
}

interface BranchingIndicatorProps {
  tripId: string;
  currentDestinationId: string;
  nextDestinationId: string;
  dayIndex: number;
}

const getAvatarColor = (fullName: string | null) => {
  const name = fullName?.toLowerCase() || '';
  if (name.includes('blue')) return '#3B82F6';
  if (name.includes('green')) return '#10B981';
  if (name.includes('purple')) return '#8B5CF6';
  if (name.includes('red')) return '#EF4444';
  if (name.includes('yellow')) return '#F59E0B';
  return '#6B7280';
};

export default function BranchingIndicator({
  tripId,
  currentDestinationId,
  nextDestinationId,
  dayIndex,
}: BranchingIndicatorProps) {
  const [loading, setLoading] = useState(true);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [expanded, setExpanded] = useState(true); // Default to expanded to show the branching

  useEffect(() => {
    loadBranchingData();
  }, [tripId, currentDestinationId, nextDestinationId]);

  const loadBranchingData = async () => {
    try {
      // Example: After Hotel Casa Fuster, the group splits
      const mockBranches: Branch[] = [
        {
          destinationId: 'gothic-quarter',
          destinationName: 'Gothic Quarter',
          attendees: [
            { user_id: 'blue-user', full_name: 'Blue User', avatar_color: '#3B82F6' },
            { user_id: 'purple-user', full_name: 'Purple User', avatar_color: '#8B5CF6' },
          ],
        },
        {
          destinationId: 'barceloneta-beach',
          destinationName: 'Barceloneta Beach',
          attendees: [
            { user_id: 'green-user', full_name: 'Green User', avatar_color: '#10B981' },
          ],
        },
        {
          destinationId: 'park-guell',
          destinationName: 'Park Güell',
          attendees: [
            { user_id: 'red-user', full_name: 'Red User', avatar_color: '#EF4444' },
          ],
        },
      ];

      setBranches(mockBranches);
    } catch (error) {
      console.error('Error loading branching data:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="small" color="#6B7280" />
      </View>
    );
  }

  if (branches.length <= 1) {
    return null;
  }

  const totalAttendees = branches.reduce(
    (sum, branch) => sum + branch.attendees.length,
    0
  );

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.header}
        onPress={() => setExpanded(!expanded)}
        activeOpacity={0.7}
      >
        <View style={styles.headerLeft}>
          <Ionicons name="git-branch" size={14} color="#6B7280" />
          <Text style={styles.headerText}>
            Group splits • {branches.length} parallel paths
          </Text>
        </View>
        <Ionicons
          name={expanded ? "chevron-up" : "chevron-down"}
          size={14}
          color="#6B7280"
        />
      </TouchableOpacity>

      {expanded && (
        <View style={styles.branchContainer}>
          {/* Divergence point - where branches split */}
          <View style={styles.branchRow}>
            <View style={styles.gitVisual}>
              <Svg width={120} height={60} style={styles.svgContainer}>
                {/* Main branch line */}
                <Line x1={20} y1={0} x2={20} y2={30} stroke="#58a6ff" strokeWidth={2} />

                {/* Simple branch curves */}
                <Path
                  d="M 20 30 Q 35 30, 50 45 L 50 60"
                  stroke="#3fb950"
                  strokeWidth={2}
                  fill="none"
                />
                <Path
                  d="M 20 30 Q 55 30, 80 55 L 80 60"
                  stroke="#f85149"
                  strokeWidth={2}
                  fill="none"
                />

                {/* Commit dot at branch point */}
                <Circle cx={20} cy={30} r={5} fill="#58a6ff" stroke="#fff" strokeWidth={2} />
              </Svg>
            </View>
            <View style={styles.divergenceLabel}>
              <Ionicons name="git-branch" size={12} color="#6B7280" />
              <Text style={styles.divergenceText}>Groups split here</Text>
            </View>
          </View>

          {/* Branch paths */}
          {branches.map((branch, index) => (
            <View key={branch.destinationId} style={styles.branchRow}>
              <View style={styles.gitVisual}>
                <Svg width={120} height={50} style={styles.svgContainer}>
                  {/* Vertical lines for each branch */}
                  <Line
                    x1={index === 0 ? 20 : (index === 1 ? 50 : 80)}
                    y1={0}
                    x2={index === 0 ? 20 : (index === 1 ? 50 : 80)}
                    y2={50}
                    stroke={index === 0 ? '#58a6ff' : (index === 1 ? '#3fb950' : '#f85149')}
                    strokeWidth={2}
                  />

                  {/* Commit dot for this destination */}
                  <Circle
                    cx={index === 0 ? 20 : (index === 1 ? 50 : 80)}
                    cy={25}
                    r={5}
                    fill={index === 0 ? '#58a6ff' : (index === 1 ? '#3fb950' : '#f85149')}
                    stroke="#fff"
                    strokeWidth={2}
                  />
                </Svg>
              </View>

              {/* Branch content */}
              <View style={styles.branchContent}>
                <View style={styles.destinationRow}>
                  <Text style={styles.destinationName}>
                    {branch.destinationName}
                  </Text>
                  <View style={styles.attendeeList}>
                    {branch.attendees.map((attendee, idx) => (
                      <View
                        key={attendee.user_id}
                        style={[
                          styles.attendeeAvatar,
                          {
                            backgroundColor: attendee.avatar_color,
                            marginLeft: idx > 0 ? -10 : 0,
                            zIndex: branch.attendees.length - idx,
                          },
                        ]}
                      >
                        <Text style={styles.avatarText}>
                          {attendee.full_name.charAt(0).toUpperCase()}
                        </Text>
                      </View>
                    ))}
                    {branch.attendees.length > 0 && (
                      <Text style={styles.attendeeCount}>
                        {branch.attendees.length}
                      </Text>
                    )}
                  </View>
                </View>
              </View>
            </View>
          ))}

          {/* Reconvergence point - where branches merge */}
          <View style={styles.branchRow}>
            <View style={styles.gitVisual}>
              <Svg width={120} height={60} style={styles.svgContainer}>
                {/* Branch merge curves with smooth cubic bezier */}
                {branches.slice(1).map((_, idx) => {
                  const xOffset = 40 + (idx * 40);
                  const yMerge = 15 - (idx * 5);
                  // Smooth cubic bezier curves for natural merging
                  return (
                    <Path
                      key={idx}
                      d={`M ${xOffset} 0 L ${xOffset} ${yMerge} L ${xOffset - 5} ${yMerge} C 25 ${yMerge}, 20 20, 20 30`}
                      stroke={idx === 0 ? '#3fb950' : '#f85149'}
                      strokeWidth={2}
                      fill="none"
                    />
                  );
                })}

                {/* Main branch continues */}
                <Line x1={20} y1={30} x2={20} y2={60} stroke="#58a6ff" strokeWidth={2} />

                {/* Merge commit dot */}
                <Circle cx={20} cy={30} r={5} fill="#58a6ff" stroke="#fff" strokeWidth={2} />
              </Svg>
            </View>
            <View style={styles.divergenceLabel}>
              <Ionicons name="git-merge" size={12} color="#6B7280" />
              <Text style={styles.divergenceText}>Groups reconverge</Text>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
    paddingHorizontal: 8,
    backgroundColor: '#F9FAFB',
    borderRadius: 6,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerText: {
    fontSize: 12,
    color: '#6B7280',
    fontWeight: '500',
  },
  branchContainer: {
    marginTop: 12,
    paddingLeft: 8,
  },
  branchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    position: 'relative',
  },
  gitVisual: {
    width: 120,
    alignItems: 'center',
    position: 'relative',
  },
  svgContainer: {
    position: 'absolute',
    left: 0,
    top: -10,
  },
  divergenceLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginLeft: 12,
  },
  divergenceText: {
    fontSize: 11,
    color: '#6B7280',
    fontStyle: 'italic',
  },
  branchContent: {
    flex: 1,
    marginLeft: 12,
  },
  destinationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  destinationName: {
    fontSize: 14,
    fontWeight: '500',
    color: '#1F2937',
    flex: 1,
  },
  attendeeList: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  attendeeAvatar: {
    width: 26,
    height: 26,
    borderRadius: 13,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  avatarText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
  },
  attendeeCount: {
    marginLeft: 8,
    fontSize: 12,
    color: '#6B7280',
    fontWeight: '500',
  },
});