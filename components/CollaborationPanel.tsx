import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, Image, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';

type TabType = 'activity' | 'chat' | 'threads';

interface Activity {
  id: string;
  type: 'comment' | 'suggestion' | 'change';
  user: {
    name: string;
    avatar?: string;
    initials: string;
  };
  content: string;
  timestamp: Date;
  location?: string;
}

interface CollaborationPanelProps {
  isOpen: boolean;
  onClose: () => void;
  tripId: string;
}

export default function CollaborationPanel({ isOpen, onClose, tripId }: CollaborationPanelProps) {
  const [activeTab, setActiveTab] = useState<TabType>('activity');
  const [commentText, setCommentText] = useState('');

  // Mock data for activities
  const activities: Activity[] = [
    {
      id: '1',
      type: 'comment',
      user: {
        name: 'Sarah Chen',
        initials: 'SC',
      },
      content: 'The Louvre might be too crowded on Monday. Consider booking skip-the-line tickets?',
      timestamp: new Date(Date.now() - 1000 * 60 * 30),
      location: 'Louvre Museum',
    },
    {
      id: '2',
      type: 'suggestion',
      user: {
        name: 'Mike Johnson',
        initials: 'MJ',
      },
      content: 'We should add a Seine River cruise in the evening of Day 2!',
      timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2),
      location: 'Day 2',
    },
    {
      id: '3',
      type: 'change',
      user: {
        name: 'Emma Park',
        initials: 'EP',
      },
      content: 'Updated the restaurant reservation to 7:30 PM',
      timestamp: new Date(Date.now() - 1000 * 60 * 60 * 5),
      location: 'Le Comptoir du Relais',
    },
  ];

  const getActivityIcon = (type: Activity['type']) => {
    switch (type) {
      case 'comment':
        return 'chatbubble-outline';
      case 'suggestion':
        return 'bulb-outline';
      case 'change':
        return 'create-outline';
      default:
        return 'ellipse-outline';
    }
  };

  const getActivityColor = (type: Activity['type']) => {
    switch (type) {
      case 'comment':
        return '#3B82F6';
      case 'suggestion':
        return '#F59E0B';
      case 'change':
        return '#10B981';
      default:
        return '#6B7280';
    }
  };

  const renderActivity = (activity: Activity) => (
    <View key={activity.id} style={styles.activityItem}>
      <View style={[styles.activityIcon, { backgroundColor: getActivityColor(activity.type) }]}>
        <Ionicons name={getActivityIcon(activity.type) as any} size={16} color="#fff" />
      </View>
      <View style={styles.activityContent}>
        <View style={styles.activityHeader}>
          <Text style={styles.activityUser}>{activity.user.name}</Text>
          <Text style={styles.activityTime}>
            {format(activity.timestamp, 'h:mm a')}
          </Text>
        </View>
        <Text style={styles.activityText}>{activity.content}</Text>
        {activity.location && (
          <View style={styles.activityLocation}>
            <Ionicons name="location-outline" size={12} color="#6B7280" />
            <Text style={styles.activityLocationText}>{activity.location}</Text>
          </View>
        )}
      </View>
    </View>
  );

  const renderTabContent = () => {
    switch (activeTab) {
      case 'activity':
        return (
          <>
            <ScrollView style={styles.tabContent}>
              <View style={styles.activityList}>
                {activities.map(renderActivity)}
              </View>
              
              <View style={styles.quickActions}>
                <Text style={styles.quickActionsTitle}>Quick Actions</Text>
                <TouchableOpacity style={styles.quickActionButton}>
                  <Ionicons name="chatbubbles-outline" size={16} color="#3B82F6" />
                  <Text style={styles.quickActionText}>View All Comments</Text>
                  <View style={styles.quickActionBadge}>
                    <Text style={styles.quickActionBadgeText}>3</Text>
                  </View>
                </TouchableOpacity>
                <TouchableOpacity style={styles.quickActionButton}>
                  <Ionicons name="checkmark-circle-outline" size={16} color="#10B981" />
                  <Text style={styles.quickActionText}>Accept Suggestions</Text>
                  <View style={styles.quickActionBadge}>
                    <Text style={styles.quickActionBadgeText}>1</Text>
                  </View>
                </TouchableOpacity>
              </View>
            </ScrollView>
            
            <View style={styles.commentBox}>
              <TextInput
                style={styles.commentInput}
                placeholder="Add a comment..."
                value={commentText}
                onChangeText={setCommentText}
                multiline
              />
              <TouchableOpacity 
                style={[styles.sendButton, !commentText && styles.sendButtonDisabled]}
                disabled={!commentText}
              >
                <Ionicons name="send" size={18} color={commentText ? '#3B82F6' : '#D1D5DB'} />
              </TouchableOpacity>
            </View>
          </>
        );
      
      case 'chat':
        return (
          <View style={styles.tabContent}>
            <View style={styles.emptyState}>
              <Ionicons name="chatbubbles-outline" size={48} color="#D1D5DB" />
              <Text style={styles.emptyStateText}>No messages yet</Text>
              <Text style={styles.emptyStateSubtext}>Start a conversation with your travel companions</Text>
            </View>
          </View>
        );
      
      case 'threads':
        return (
          <View style={styles.tabContent}>
            <View style={styles.emptyState}>
              <Ionicons name="git-branch-outline" size={48} color="#D1D5DB" />
              <Text style={styles.emptyStateText}>No threads yet</Text>
              <Text style={styles.emptyStateSubtext}>Create discussion threads for specific topics</Text>
            </View>
          </View>
        );
      
      default:
        return null;
    }
  };

  if (!isOpen) return null;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Collaboration</Text>
        <TouchableOpacity onPress={onClose} style={styles.closeButton}>
          <Ionicons name="close" size={24} color="#6B7280" />
        </TouchableOpacity>
      </View>

      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'activity' && styles.activeTab]}
          onPress={() => setActiveTab('activity')}
        >
          <Text style={[styles.tabText, activeTab === 'activity' && styles.activeTabText]}>
            Activity
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'chat' && styles.activeTab]}
          onPress={() => setActiveTab('chat')}
        >
          <Text style={[styles.tabText, activeTab === 'chat' && styles.activeTabText]}>
            Chat
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'threads' && styles.activeTab]}
          onPress={() => setActiveTab('threads')}
        >
          <Text style={[styles.tabText, activeTab === 'threads' && styles.activeTabText]}>
            Threads
          </Text>
        </TouchableOpacity>
      </View>

      {renderTabContent()}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: 400,
    backgroundColor: '#fff',
    borderLeftWidth: 1,
    borderLeftColor: '#E5E7EB',
    ...Platform.select({
      web: {
        boxShadow: '-4px 0 12px rgba(0, 0, 0, 0.08)',
      },
      default: {
        shadowColor: '#000',
        shadowOffset: { width: -4, height: 0 },
        shadowOpacity: 0.08,
        shadowRadius: 12,
        elevation: 5,
      },
    }),
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: '#111827',
  },
  closeButton: {
    padding: 4,
  },
  tabs: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
  },
  activeTab: {
    borderBottomWidth: 2,
    borderBottomColor: '#3B82F6',
  },
  tabText: {
    fontSize: 14,
    color: '#6B7280',
    fontWeight: '500',
  },
  activeTabText: {
    color: '#3B82F6',
  },
  tabContent: {
    flex: 1,
  },
  activityList: {
    padding: 20,
  },
  activityItem: {
    flexDirection: 'row',
    marginBottom: 20,
  },
  activityIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  activityContent: {
    flex: 1,
  },
  activityHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  activityUser: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  activityTime: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  activityText: {
    fontSize: 14,
    color: '#4B5563',
    lineHeight: 20,
  },
  activityLocation: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  activityLocationText: {
    fontSize: 12,
    color: '#6B7280',
    marginLeft: 4,
  },
  quickActions: {
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  quickActionsTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 12,
  },
  quickActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    marginBottom: 8,
  },
  quickActionText: {
    flex: 1,
    fontSize: 14,
    color: '#4B5563',
    marginLeft: 8,
  },
  quickActionBadge: {
    backgroundColor: '#EF4444',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  quickActionBadgeText: {
    fontSize: 12,
    color: '#fff',
    fontWeight: '600',
  },
  commentBox: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    backgroundColor: '#F9FAFB',
  },
  commentInput: {
    flex: 1,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginRight: 8,
    maxHeight: 100,
    fontSize: 14,
  },
  sendButton: {
    padding: 8,
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  emptyStateText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#4B5563',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyStateSubtext: {
    fontSize: 14,
    color: '#9CA3AF',
    textAlign: 'center',
  },
});