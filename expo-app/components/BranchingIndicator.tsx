import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { Ionicons, Feather } from '@expo/vector-icons';
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
  activities?: Array<{
    id: string;
    name: string;
    time: string;
    duration: string;
    description: string;
    cost?: string;
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
  const [expanded, setExpanded] = useState(true);
  const [activeTab, setActiveTab] = useState(0);

  useEffect(() => {
    loadBranchingData();
  }, [tripId, currentDestinationId, nextDestinationId]);

  const loadBranchingData = async () => {
    try {
      // Example: After Hotel Casa Fuster, the group splits with activities
      const mockBranches: Branch[] = [
        {
          destinationId: 'gothic-quarter',
          destinationName: 'Gothic Quarter',
          attendees: [
            { user_id: 'blue-user', full_name: 'Blue User', avatar_color: '#3B82F6' },
            { user_id: 'purple-user', full_name: 'Purple User', avatar_color: '#8B5CF6' },
          ],
          activities: [
            {
              id: 'gq-1',
              name: 'Gothic Quarter Walking Tour',
              time: '2:30 PM',
              duration: '2 hours',
              description: 'Explore narrow medieval streets and hidden plazas',
              cost: '€15',
            },
            {
              id: 'gq-2',
              name: 'Barcelona Cathedral',
              time: '4:30 PM',
              duration: '45 min',
              description: 'Visit the stunning Gothic cathedral',
              cost: '€9',
            },
            {
              id: 'gq-3',
              name: 'Tapas at Els Quatre Gats',
              time: '5:30 PM',
              duration: '1.5 hours',
              description: 'Historic café where Picasso held his first exhibition',
              cost: '€35',
            },
          ],
        },
        {
          destinationId: 'barceloneta-beach',
          destinationName: 'Barceloneta Beach',
          attendees: [
            { user_id: 'green-user', full_name: 'Green User', avatar_color: '#10B981' },
          ],
          activities: [
            {
              id: 'bb-1',
              name: 'Beach Time',
              time: '2:30 PM',
              duration: '2 hours',
              description: 'Relax on the Mediterranean beach',
              cost: 'Free',
            },
            {
              id: 'bb-2',
              name: 'Seafood Lunch at La Barceloneta',
              time: '4:30 PM',
              duration: '1.5 hours',
              description: 'Fresh seafood with ocean views',
              cost: '€45',
            },
            {
              id: 'bb-3',
              name: 'Port Cable Car',
              time: '6:00 PM',
              duration: '30 min',
              description: 'Aerial views of the port and city',
              cost: '€11',
            },
          ],
        },
        {
          destinationId: 'park-guell',
          destinationName: 'Park Güell',
          attendees: [
            { user_id: 'red-user', full_name: 'Red User', avatar_color: '#EF4444' },
          ],
          activities: [
            {
              id: 'pg-1',
              name: 'Park Güell Guided Tour',
              time: '2:30 PM',
              duration: '2 hours',
              description: "Explore Gaudí's magical hilltop park",
              cost: '€10',
            },
            {
              id: 'pg-2',
              name: 'Casa Vicens',
              time: '4:45 PM',
              duration: '1 hour',
              description: "Gaudí's first major commission",
              cost: '€16',
            },
            {
              id: 'pg-3',
              name: 'Sunset at Bunkers del Carmel',
              time: '6:00 PM',
              duration: '1 hour',
              description: 'Best panoramic views of Barcelona',
              cost: 'Free',
            },
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

  const branchColors = ['#58a6ff', '#3fb950', '#f85149'];
  const activeBranch = branches[activeTab];

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
          {/* Vertical timeline with branch points */}
          <View style={styles.gitVisualization}>
            <View style={styles.timelineWrapper}>
              {/* Main vertical line */}
              <View style={styles.mainTimelineLine} />

              {/* Split point node */}
              <View style={styles.splitNode}>
                <View style={styles.splitNodeCircle} />
                <Text style={styles.splitNodeLabel}>Groups split</Text>
              </View>

              {/* Branch indicators */}
              <View style={styles.branchIndicators}>
                {branches.map((branch, index) => (
                  <View key={branch.destinationId} style={[
                    styles.branchIndicator,
                    index === 0 && styles.branchIndicatorLeft,
                    index === 2 && styles.branchIndicatorRight,
                  ]}>
                    <View style={[
                      styles.branchDot,
                      { backgroundColor: branchColors[index] }
                    ]} />
                  </View>
                ))}
              </View>
            </View>
          </View>

          {/* Tab Headers */}
          <View style={styles.tabContainer}>
            {branches.map((branch, index) => (
              <TouchableOpacity
                key={branch.destinationId}
                style={[
                  styles.tabHeader,
                  activeTab === index && styles.activeTabHeader,
                  { borderTopColor: activeTab === index ? branchColors[index] : 'transparent' }
                ]}
                onPress={() => setActiveTab(index)}
                activeOpacity={0.7}
              >
                <View style={styles.tabLabelContainer}>
                  <Text style={[
                    styles.tabLabel,
                    activeTab === index && styles.activeTabLabel
                  ]}>
                    {branch.destinationName}
                  </Text>
                  <View style={styles.tabAvatars}>
                    {branch.attendees.slice(0, 3).map((attendee, idx) => (
                      <View
                        key={attendee.user_id}
                        style={[
                          styles.miniAvatar,
                          {
                            backgroundColor: attendee.avatar_color,
                            marginLeft: idx > 0 ? -6 : 0,
                            zIndex: branch.attendees.length - idx,
                          },
                        ]}
                      >
                        <Text style={styles.miniAvatarText}>
                          {attendee.full_name.charAt(0).toUpperCase()}
                        </Text>
                      </View>
                    ))}
                    {branch.attendees.length > 3 && (
                      <View style={[styles.miniAvatar, styles.moreAvatar]}>
                        <Text style={styles.miniAvatarText}>+{branch.attendees.length - 3}</Text>
                      </View>
                    )}
                  </View>
                </View>
              </TouchableOpacity>
            ))}
          </View>

          {/* Tab Content */}
          <View style={styles.tabContent}>
            {activeBranch.activities && activeBranch.activities.length > 0 ? (
              <ScrollView
                style={styles.activitiesContainer}
                showsVerticalScrollIndicator={false}
              >
                {activeBranch.activities.map((activity, index) => (
                  <View key={activity.id} style={styles.activityCard}>
                    {/* Timeline marker */}
                    <View style={styles.timelineContainer}>
                      <View style={[
                        styles.timelineMarker,
                        { backgroundColor: branchColors[activeTab] }
                      ]}>
                        <View style={styles.timelineMarkerInner} />
                      </View>
                      {index < activeBranch.activities.length - 1 && (
                        <View style={styles.timelineLine} />
                      )}
                    </View>

                    {/* Activity content */}
                    <View style={styles.activityContent}>
                      <View style={styles.activityHeader}>
                        <View style={styles.activityTimeContainer}>
                          <Feather name="clock" size={12} color="#6B7280" />
                          <Text style={styles.activityTime}>{activity.time}</Text>
                          <Text style={styles.activityDuration}>• {activity.duration}</Text>
                        </View>
                        {activity.cost && (
                          <Text style={[
                            styles.activityCost,
                            activity.cost === 'Free' && styles.activityCostFree
                          ]}>
                            {activity.cost}
                          </Text>
                        )}
                      </View>
                      <Text style={styles.activityName}>{activity.name}</Text>
                      <Text style={styles.activityDescription}>{activity.description}</Text>
                    </View>
                  </View>
                ))}
              </ScrollView>
            ) : (
              <View style={styles.noActivities}>
                <Text style={styles.noActivitiesText}>
                  Activities for this path will be shown here
                </Text>
              </View>
            )}
          </View>

          {/* Reconvergence indicator */}
          <View style={styles.reconvergeContainer}>
            <View style={styles.reconvergeIcon}>
              <Ionicons name="git-merge" size={12} color="#6B7280" />
            </View>
            <Text style={styles.reconvergeText}>Groups reconverge at 7:00 PM</Text>
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
  },
  gitVisualization: {
    paddingVertical: 16,
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  timelineWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    position: 'relative',
  },
  mainTimelineLine: {
    position: 'absolute',
    left: 20,
    top: 0,
    bottom: 0,
    width: 2,
    backgroundColor: '#E5E7EB',
  },
  splitNode: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 14,
  },
  splitNodeCircle: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#3B82F6',
    marginRight: 10,
  },
  splitNodeLabel: {
    fontSize: 12,
    color: '#6B7280',
    fontWeight: '500',
  },
  branchIndicators: {
    flexDirection: 'row',
    marginLeft: 'auto',
    gap: 16,
  },
  branchIndicator: {
    alignItems: 'center',
  },
  branchIndicatorLeft: {
    marginRight: 8,
  },
  branchIndicatorRight: {
    marginLeft: 8,
  },
  branchDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    padding: 2,
  },
  tabHeader: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderTopWidth: 3,
    borderTopColor: 'transparent',
    borderRadius: 6,
  },
  activeTabHeader: {
    backgroundColor: '#fff',
  },
  tabLabelContainer: {
    alignItems: 'center',
  },
  tabLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: '#6B7280',
    marginBottom: 4,
  },
  activeTabLabel: {
    color: '#1F2937',
    fontWeight: '600',
  },
  tabAvatars: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  miniAvatar: {
    width: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#fff',
  },
  miniAvatarText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '600',
  },
  moreAvatar: {
    backgroundColor: '#6B7280',
    marginLeft: -6,
  },
  tabContent: {
    minHeight: 200,
    backgroundColor: '#fff',
    borderRadius: 8,
    marginTop: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  activitiesContainer: {
    maxHeight: 250,
  },
  activityCard: {
    flexDirection: 'row',
    marginBottom: 20,
    position: 'relative',
  },
  timelineContainer: {
    width: 30,
    alignItems: 'center',
    marginRight: 12,
    position: 'relative',
  },
  timelineMarker: {
    width: 12,
    height: 12,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 2,
  },
  timelineMarkerInner: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#fff',
  },
  timelineLine: {
    position: 'absolute',
    top: 12,
    bottom: -20,
    width: 2,
    backgroundColor: '#E5E7EB',
  },
  activityContent: {
    flex: 1,
    paddingRight: 8,
  },
  activityHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  activityTimeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  activityTime: {
    fontSize: 12,
    color: '#6B7280',
    fontWeight: '500',
  },
  activityDuration: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  activityCost: {
    fontSize: 12,
    color: '#10B981',
    fontWeight: '600',
  },
  activityCostFree: {
    color: '#6B7280',
  },
  activityName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 4,
  },
  activityDescription: {
    fontSize: 13,
    color: '#6B7280',
    lineHeight: 18,
  },
  noActivities: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  noActivitiesText: {
    fontSize: 13,
    color: '#9CA3AF',
    fontStyle: 'italic',
  },
  reconvergeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#F9FAFB',
    borderRadius: 6,
    gap: 6,
  },
  reconvergeIcon: {
    transform: [{ rotate: '180deg' }],
  },
  reconvergeText: {
    fontSize: 12,
    color: '#6B7280',
    fontWeight: '500',
  },
});