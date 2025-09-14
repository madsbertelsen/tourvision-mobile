import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, TextInput, Image, Platform } from 'react-native';
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
  isMobile?: boolean;
  isTablet?: boolean;
}

export default function CollaborationPanel({ isOpen, onClose, tripId, isMobile = false, isTablet = false }: CollaborationPanelProps) {
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

  const getActivityColorClass = (type: Activity['type']) => {
    switch (type) {
      case 'comment':
        return 'bg-blue-500';
      case 'suggestion':
        return 'bg-amber-500';
      case 'change':
        return 'bg-emerald-500';
      default:
        return 'bg-gray-500';
    }
  };

  const renderActivity = (activity: Activity) => (
    <View key={activity.id} className="flex-row mb-5">
      <View className={`w-8 h-8 rounded-full items-center justify-center mr-3 ${getActivityColorClass(activity.type)}`}>
        <Ionicons name={getActivityIcon(activity.type) as any} size={16} color="#fff" />
      </View>
      <View className="flex-1">
        <View className="flex-row items-center justify-between mb-1">
          <Text className="text-sm font-semibold text-gray-900">{activity.user.name}</Text>
          <Text className="text-xs text-gray-400">
            {format(activity.timestamp, 'h:mm a')}
          </Text>
        </View>
        <Text className="text-sm text-gray-600 leading-5">{activity.content}</Text>
        {activity.location && (
          <View className="flex-row items-center mt-1">
            <Ionicons name="location-outline" size={12} color="#6B7280" />
            <Text className="text-xs text-gray-500 ml-1">{activity.location}</Text>
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
            <ScrollView className="flex-1">
              <View className="p-5">
                {activities.map(renderActivity)}
              </View>
              
              <View className="p-5 border-t border-gray-200">
                <Text className="text-sm font-semibold text-gray-900 mb-3">Quick Actions</Text>
                <TouchableOpacity className="flex-row items-center p-3 bg-gray-50 rounded-lg mb-2">
                  <Ionicons name="chatbubbles-outline" size={16} color="#3B82F6" />
                  <Text className="flex-1 text-sm text-gray-600 ml-2">View All Comments</Text>
                  <View className="bg-red-500 rounded-full px-2 py-0.5">
                    <Text className="text-xs text-white font-semibold">3</Text>
                  </View>
                </TouchableOpacity>
                <TouchableOpacity className="flex-row items-center p-3 bg-gray-50 rounded-lg mb-2">
                  <Ionicons name="checkmark-circle-outline" size={16} color="#10B981" />
                  <Text className="flex-1 text-sm text-gray-600 ml-2">Accept Suggestions</Text>
                  <View className="bg-red-500 rounded-full px-2 py-0.5">
                    <Text className="text-xs text-white font-semibold">1</Text>
                  </View>
                </TouchableOpacity>
              </View>
            </ScrollView>
            
            <View className="flex-row items-end p-4 border-t border-gray-200 bg-gray-50">
              <TextInput
                className="flex-1 bg-white border border-gray-200 rounded-lg px-3 py-2 mr-2 max-h-24 text-sm"
                placeholder="Add a comment..."
                value={commentText}
                onChangeText={setCommentText}
                multiline
              />
              <TouchableOpacity 
                className={`p-2 ${!commentText && 'opacity-50'}`}
                disabled={!commentText}
              >
                <Ionicons name="send" size={18} color={commentText ? '#3B82F6' : '#D1D5DB'} />
              </TouchableOpacity>
            </View>
          </>
        );
      
      case 'chat':
        return (
          <View className="flex-1 items-center justify-center p-10">
            <Ionicons name="chatbubbles-outline" size={48} color="#D1D5DB" />
            <Text className="text-base font-semibold text-gray-600 mt-4 mb-2">No messages yet</Text>
            <Text className="text-sm text-gray-400 text-center">Start a conversation with your travel companions</Text>
          </View>
        );
      
      case 'threads':
        return (
          <View className="flex-1 items-center justify-center p-10">
            <Ionicons name="git-branch-outline" size={48} color="#D1D5DB" />
            <Text className="text-base font-semibold text-gray-600 mt-4 mb-2">No threads yet</Text>
            <Text className="text-sm text-gray-400 text-center">Create discussion threads for specific topics</Text>
          </View>
        );
      
      default:
        return null;
    }
  };

  if (!isOpen) return null;

  // Responsive panel width
  const panelWidth = isMobile ? '100%' : isTablet ? 300 : 400;
  
  return (
    <>
      {/* Overlay backdrop for mobile/tablet */}
      {isOpen && (isMobile || isTablet) && (
        <TouchableOpacity 
          className="absolute inset-0 bg-black/50 z-40"
          activeOpacity={1}
          onPress={onClose}
        />
      )}
      
      <View 
        className={`absolute ${isMobile ? 'inset-0' : 'right-0 top-0 bottom-0'} bg-white ${!isMobile && 'border-l border-gray-200'} ${(isMobile || isTablet) ? 'z-50' : ''}`}
        style={{ 
          width: panelWidth,
          ...Platform.select({
            web: {
              boxShadow: isMobile ? '0 0 24px rgba(0, 0, 0, 0.15)' : '-4px 0 12px rgba(0, 0, 0, 0.08)',
            },
            default: {
              shadowColor: '#000',
              shadowOffset: isMobile ? { width: 0, height: 0 } : { width: -4, height: 0 },
              shadowOpacity: isMobile ? 0.15 : 0.08,
              shadowRadius: isMobile ? 24 : 12,
              elevation: isMobile ? 10 : 5,
            },
        })
      }}
    >
      <View className={`flex-row items-center justify-between ${isMobile ? 'p-4' : 'p-5'} border-b border-gray-200`}>
        <Text className={`${isMobile ? 'text-lg' : 'text-xl'} font-semibold text-gray-900`}>Collaboration</Text>
        <TouchableOpacity onPress={onClose} className="p-1">
          <Ionicons name="close" size={24} color="#6B7280" />
        </TouchableOpacity>
      </View>

      <View className="flex-row border-b border-gray-200">
        <TouchableOpacity
          className={`flex-1 py-3 items-center ${activeTab === 'activity' ? 'border-b-2 border-blue-500' : ''}`}
          onPress={() => setActiveTab('activity')}
        >
          <Text className={`text-sm font-medium ${activeTab === 'activity' ? 'text-blue-500' : 'text-gray-500'}`}>
            Activity
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          className={`flex-1 py-3 items-center ${activeTab === 'chat' ? 'border-b-2 border-blue-500' : ''}`}
          onPress={() => setActiveTab('chat')}
        >
          <Text className={`text-sm font-medium ${activeTab === 'chat' ? 'text-blue-500' : 'text-gray-500'}`}>
            Chat
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          className={`flex-1 py-3 items-center ${activeTab === 'threads' ? 'border-b-2 border-blue-500' : ''}`}
          onPress={() => setActiveTab('threads')}
        >
          <Text className={`text-sm font-medium ${activeTab === 'threads' ? 'text-blue-500' : 'text-gray-500'}`}>
            Threads
          </Text>
        </TouchableOpacity>
      </View>

      {renderTabContent()}
    </View>
    </>
  );
}