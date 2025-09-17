import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Platform,
  FlatList,
  KeyboardAvoidingView,
  TextInput,
} from 'react-native';
import { Feather, Ionicons, MaterialIcons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { format } from 'date-fns';
import AlternativeDayModal from '@/components/AlternativeDayModal';
import ProposalComparisonView from '@/components/ProposalComparisonView';
import { AISuggestionPanel } from '@/components/AISuggestionPanel';
import { useAIAssistant } from '@/hooks/useAIAssistant';
import { useTripChat, ChatMessage } from '@/hooks/useTripChat';

// Remove this interface as we'll use ChatMessage from useTripChat
// interface Message { ... }

interface Activity {
  id: string;
  user: string;
  action: string;
  target: string;
  timestamp: string;
  icon: string;
  color: string;
}

// Mock data for proposals
const mockProposals = [
  {
    id: '1',
    dayNumber: 1,
    title: 'Beach Day Alternative',
    description: 'How about we spend more time at the beach and skip the museum?',
    status: 'pending',
    proposedBy: {
      name: 'Sarah Chen',
      avatar: 'SC',
    },
    proposedAt: new Date('2024-09-14T10:30:00'),
    original: {
      destinations: [
        { id: '1', name: 'Gothic Quarter', duration: '3 hours', cost: 0, time: 'Morning' },
        { id: '2', name: 'Barcelona Museum', duration: '2 hours', cost: 15, time: 'Afternoon' },
      ],
      transportations: [],
      totalCost: 15,
      totalDuration: '5 hours',
    },
    proposed: {
      destinations: [
        { id: '1', name: 'Barceloneta Beach', duration: '4 hours', cost: 0, time: 'Morning' },
        { id: '2', name: 'Beach Restaurants', duration: '2 hours', cost: 30, time: 'Afternoon' },
      ],
      transportations: [{ mode: 'Metro', duration: '20 min', cost: 2.40 }],
      totalCost: 32.40,
      totalDuration: '6 hours',
    },
    votes: {
      approve: 2,
      reject: 1,
      neutral: 1,
    },
    comments: [
      { user: 'Mike Johnson', text: 'Great idea! The weather looks perfect for the beach.' },
      { user: 'Emma Davis', text: 'I was really looking forward to the museum though...' },
    ],
  },
  {
    id: '2',
    dayNumber: 2,
    title: 'Earlier Start for Sagrada Familia',
    description: 'Beat the crowds by starting at 8 AM instead of 10 AM',
    status: 'accepted',
    proposedBy: {
      name: 'Mike Johnson',
      avatar: 'MJ',
    },
    proposedAt: new Date('2024-09-13T15:45:00'),
    original: {
      destinations: [
        { id: '1', name: 'Sagrada Familia', duration: '2 hours', cost: 0, time: '10:00 AM' },
        { id: '2', name: 'Park Güell', duration: '2 hours', cost: 0, time: '2:00 PM' },
      ],
      transportations: [{ mode: 'Walk', duration: '5 min' }],
      totalCost: 0,
      totalDuration: '4 hours',
    },
    proposed: {
      destinations: [
        { id: '1', name: 'Sagrada Familia', duration: '2 hours', cost: 0, time: '8:00 AM' },
        { id: '2', name: 'Park Güell', duration: '2 hours', cost: 0, time: '12:00 PM' },
      ],
      transportations: [{ mode: 'Walk', duration: '5 min' }],
      totalCost: 0,
      totalDuration: '4 hours',
    },
    votes: {
      approve: 4,
      reject: 0,
      neutral: 0,
    },
    comments: [
      { user: 'Sarah Chen', text: 'Perfect! Less crowds will make for better photos.' },
    ],
  },
];

const SAMPLE_MESSAGES: Message[] = [
  {
    id: '1',
    user: 'Sarah',
    avatar: '👩',
    message: 'Should we book the Sagrada Familia tickets in advance?',
    timestamp: '10:30 AM',
    type: 'message',
  },
  {
    id: '2',
    user: 'John',
    avatar: '👨',
    message: 'Definitely! Skip-the-line tickets save so much time.',
    timestamp: '10:32 AM',
    type: 'message',
  },
  {
    id: '3',
    user: 'Emma',
    avatar: '👩‍🦰',
    message: 'I suggest trying tapas at La Boqueria market! 🥘',
    timestamp: '11:15 AM',
    type: 'suggestion',
  },
  {
    id: '4',
    user: 'Sarah',
    avatar: '👩',
    message: 'Great idea! Let\'s add it to Day 1',
    timestamp: '11:20 AM',
    type: 'message',
  },
];

const SAMPLE_ACTIVITIES: Activity[] = [
  {
    id: '1',
    user: 'Emma',
    action: 'proposed alternative for',
    target: 'Day 1: Beach Day',
    timestamp: '11:22 AM',
    icon: 'plus-circle',
    color: '#10B981',
  },
  {
    id: '2',
    user: 'John',
    action: 'voted on',
    target: 'Beach Day Alternative',
    timestamp: '10:00 AM',
    icon: 'message-circle',
    color: '#3B82F6',
  },
  {
    id: '3',
    user: 'Sarah',
    action: 'accepted proposal for',
    target: 'Earlier Sagrada Familia',
    timestamp: 'Yesterday',
    icon: 'check-circle',
    color: '#10B981',
  },
];

export default function CollaborationTab() {
  const { id } = useLocalSearchParams();
  const tripId = Array.isArray(id) ? id[0] : id;
  const [activeTab, setActiveTab] = useState<'proposals' | 'chat' | 'activity'>('proposals');
  const [message, setMessage] = useState('');
  const [selectedProposal, setSelectedProposal] = useState<any>(null);
  const [showAlternativeModal, setShowAlternativeModal] = useState(false);

  // Integrate AI Assistant hook
  const {
    suggestions,
    voteSuggestion,
    applySuggestion,
    getUserVote,
    isVoting,
    isApplying,
  } = useAIAssistant(tripId || '');

  // Integrate chat hook
  const {
    messages: chatMessages,
    sendMessage: sendChatMessage,
    isLoading: isChatLoading,
  } = useTripChat(tripId || '');
  const [selectedDay, setSelectedDay] = useState<number>(1);

  const renderMessage = ({ item }: { item: ChatMessage }) => {
    const isAISuggestion = item.metadata?.type === 'ai_suggestion';
    const isReply = !!item.reply_to;
    const userName = item.user?.full_name || item.user?.email?.split('@')[0] || 'Unknown';
    const avatarText = userName.substring(0, 2).toUpperCase();
    const timestamp = format(new Date(item.created_at), 'h:mm a');

    return (
      <View style={[
        styles.messageContainer,
        isAISuggestion && styles.aiSuggestionMessage,
        isReply && styles.replyContainer
      ]}>
        {/* Threading indicator */}
        {isReply && (
          <View style={styles.threadLine} />
        )}

        <View style={styles.messageInner}>
          {/* Avatar */}
          {isAISuggestion ? (
            <View style={[styles.avatarContainer, styles.aiAvatar]}>
              <Feather name="cpu" size={20} color="#3B82F6" />
            </View>
          ) : (
            <View style={styles.avatarContainer}>
              <Text style={styles.avatarText}>{avatarText}</Text>
            </View>
          )}

          <View style={styles.messageContent}>
            <View style={styles.messageHeader}>
              <Text style={[styles.userName, isAISuggestion && styles.aiUserName]}>
                {userName}
              </Text>
              <Text style={styles.timestamp}>{timestamp}</Text>
            </View>

            {/* Show parent message reference if this is a reply */}
            {item.parent_message && (
              <View style={styles.replyToContainer}>
                <Text style={styles.replyToText}>
                  Replying to: {item.parent_message.message.substring(0, 50)}...
                </Text>
              </View>
            )}

            {/* Message content or AI suggestion */}
            {isAISuggestion && item.suggestion ? (
              <View style={styles.aiSuggestionContent}>
                <AISuggestionPanel
                  suggestions={[item.suggestion]}
                  onVote={(suggestionId: string, vote: 'approve' | 'reject', comment?: string) => {
                    if (voteSuggestion && suggestionId && vote) {
                      voteSuggestion({ suggestionId, vote, comment });
                    }
                  }}
                  onApply={applySuggestion}
                  getUserVote={(sugId) => {
                    const vote = getUserVote(sugId);
                    return vote ? { vote: vote.vote } : null;
                  }}
                  isVoting={isVoting}
                  isApplying={isApplying}
                />
              </View>
            ) : (
              <Text style={styles.messageText}>{item.message}</Text>
            )}

            {isAISuggestion && (
              <View style={styles.suggestionBadge}>
                <Feather name="sparkles" size={12} color="#3B82F6" />
                <Text style={styles.suggestionText}>AI Suggestion</Text>
              </View>
            )}
          </View>
        </View>
      </View>
    );
  };

  const renderActivity = ({ item }: { item: Activity }) => {
    return (
      <View style={styles.activityItem}>
        <View style={[styles.activityIcon, { backgroundColor: `${item.color}20` }]}>
          <Feather name={item.icon as any} size={16} color={item.color} />
        </View>
        <View style={styles.activityContent}>
          <Text style={styles.activityText}>
            <Text style={styles.activityUser}>{item.user}</Text>
            {' '}{item.action}{' '}
            <Text style={styles.activityTarget}>{item.target}</Text>
          </Text>
          <Text style={styles.activityTime}>{item.timestamp}</Text>
        </View>
      </View>
    );
  };

  const handleVote = (proposalId: string, voteType: 'approve' | 'reject' | 'neutral') => {
    console.log('Vote:', proposalId, voteType);
    // In real app, this would update the backend
  };

  const handleAcceptProposal = (proposalId: string) => {
    console.log('Accept proposal:', proposalId);
    // In real app, this would update the trip itinerary
  };

  const handleRejectProposal = (proposalId: string) => {
    console.log('Reject proposal:', proposalId);
    // In real app, this would update the proposal status
  };

  const handleMergeProposal = (proposalId: string) => {
    console.log('Merge proposal:', proposalId);
    // In real app, this would open a merge interface
  };

  const handleSubmitAlternative = (proposal: any) => {
    console.log('New proposal:', proposal);
    setShowAlternativeModal(false);
    // In real app, this would save to backend
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'accepted':
        return '#10B981';
      case 'rejected':
        return '#EF4444';
      case 'pending':
        return '#F59E0B';
      default:
        return '#6B7280';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'accepted':
        return 'check-circle';
      case 'rejected':
        return 'cancel';
      case 'pending':
        return 'schedule';
      default:
        return 'help-outline';
    }
  };

  const sendMessage = async () => {
    if (message.trim() && sendChatMessage) {
      await sendChatMessage(message);
      setMessage('');
    }
  };

  return (
    <KeyboardAvoidingView 
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      {/* Tab Selector */}
      <View style={styles.tabSelector}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'proposals' && styles.activeTab]}
          onPress={() => setActiveTab('proposals')}
        >
          <MaterialIcons
            name="lightbulb-outline"
            size={20}
            color={activeTab === 'proposals' ? '#3B82F6' : '#666'}
          />
          <Text style={[styles.tabText, activeTab === 'proposals' && styles.activeTabText]}>
            Proposals
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tab, activeTab === 'chat' && styles.activeTab]}
          onPress={() => setActiveTab('chat')}
        >
          <Ionicons
            name="chatbubbles-outline"
            size={20}
            color={activeTab === 'chat' ? '#3B82F6' : '#666'}
          />
          <Text style={[styles.tabText, activeTab === 'chat' && styles.activeTabText]}>
            Chat
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tab, activeTab === 'activity' && styles.activeTab]}
          onPress={() => setActiveTab('activity')}
        >
          <Feather
            name="activity"
            size={20}
            color={activeTab === 'activity' ? '#3B82F6' : '#666'}
          />
          <Text style={[styles.tabText, activeTab === 'activity' && styles.activeTabText]}>
            Activity
          </Text>
        </TouchableOpacity>
      </View>

      {/* Content */}
      {activeTab === 'proposals' ? (
        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {/* AI Suggestions Panel */}
          {suggestions && suggestions.length > 0 && (
            <View style={styles.aiSuggestionsSection}>
              <View style={styles.sectionHeader}>
                <View style={styles.sectionHeaderLeft}>
                  <Feather name="cpu" size={20} color="#3B82F6" />
                  <Text style={styles.sectionHeaderTitle}>AI Suggestions</Text>
                </View>
                <Text style={styles.sectionHeaderSubtitle}>
                  Based on your chat discussions
                </Text>
              </View>
              <AISuggestionPanel
                suggestions={suggestions}
                onVote={(suggestionId: string, vote: 'approve' | 'reject', comment?: string) => {
                  if (voteSuggestion && suggestionId && vote) {
                    voteSuggestion({ suggestionId, vote, comment });
                  }
                }}
                onApply={applySuggestion}
                getUserVote={(sugId) => {
                  const vote = getUserVote(sugId);
                  return vote ? { vote: vote.vote } : null;
                }}
                isVoting={isVoting}
                isApplying={isApplying}
              />
            </View>
          )}

          {/* Add Proposal Button */}
          <TouchableOpacity
            style={styles.addProposalButton}
            onPress={() => {
              setSelectedDay(1);
              setShowAlternativeModal(true);
            }}
          >
            <Ionicons name="add-circle-outline" size={24} color="white" />
            <Text style={styles.addProposalButtonText}>Propose Alternative</Text>
          </TouchableOpacity>

          {/* Proposals List */}
          <View style={styles.proposalsList}>
            {mockProposals.map((proposal) => (
              <TouchableOpacity
                key={proposal.id}
                style={styles.proposalCard}
                onPress={() => setSelectedProposal(proposal)}
                activeOpacity={0.7}
              >
                {/* Status Badge */}
                <View style={styles.proposalHeader}>
                  <View style={[styles.statusBadge, { backgroundColor: getStatusColor(proposal.status) + '20' }]}>
                    <MaterialIcons
                      name={getStatusIcon(proposal.status)}
                      size={16}
                      color={getStatusColor(proposal.status)}
                    />
                    <Text style={[styles.statusText, { color: getStatusColor(proposal.status) }]}>
                      {proposal.status.charAt(0).toUpperCase() + proposal.status.slice(1)}
                    </Text>
                  </View>
                  <Text style={styles.dayLabel}>Day {proposal.dayNumber}</Text>
                </View>

                {/* Proposal Title */}
                <Text style={styles.proposalTitle}>{proposal.title}</Text>
                <Text style={styles.proposalDescription}>{proposal.description}</Text>

                {/* Proposer Info */}
                <View style={styles.proposerInfo}>
                  <View style={styles.avatar}>
                    <Text style={styles.avatarInitials}>{proposal.proposedBy.avatar}</Text>
                  </View>
                  <View>
                    <Text style={styles.proposerName}>{proposal.proposedBy.name}</Text>
                    <Text style={styles.proposedTime}>
                      {format(proposal.proposedAt, 'MMM d, h:mm a')}
                    </Text>
                  </View>
                </View>

                {/* Vote Summary */}
                <View style={styles.voteSummary}>
                  <View style={styles.voteItem}>
                    <Ionicons name="thumbs-up" size={16} color="#10B981" />
                    <Text style={styles.voteCount}>{proposal.votes.approve}</Text>
                  </View>
                  <View style={styles.voteItem}>
                    <Ionicons name="thumbs-down" size={16} color="#EF4444" />
                    <Text style={styles.voteCount}>{proposal.votes.reject}</Text>
                  </View>
                  <View style={styles.voteItem}>
                    <MaterialIcons name="sentiment-neutral" size={16} color="#6B7280" />
                    <Text style={styles.voteCount}>{proposal.votes.neutral}</Text>
                  </View>
                  <View style={[styles.voteItem, { marginLeft: 'auto' }]}>
                    <Ionicons name="chatbubble-outline" size={16} color="#6B7280" />
                    <Text style={styles.voteCount}>{proposal.comments.length}</Text>
                  </View>
                </View>

                {/* Quick Actions */}
                {proposal.status === 'pending' && (
                  <View style={styles.quickActions}>
                    <TouchableOpacity
                      style={[styles.voteButton, styles.approveButton]}
                      onPress={(e) => {
                        e.stopPropagation();
                        handleVote(proposal.id, 'approve');
                      }}
                    >
                      <Ionicons name="thumbs-up-outline" size={18} color="#10B981" />
                      <Text style={[styles.voteButtonText, { color: '#10B981' }]}>Approve</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.voteButton, styles.rejectButton]}
                      onPress={(e) => {
                        e.stopPropagation();
                        handleVote(proposal.id, 'reject');
                      }}
                    >
                      <Ionicons name="thumbs-down-outline" size={18} color="#EF4444" />
                      <Text style={[styles.voteButtonText, { color: '#EF4444' }]}>Reject</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.voteButton, styles.neutralButton]}
                      onPress={(e) => {
                        e.stopPropagation();
                        handleVote(proposal.id, 'neutral');
                      }}
                    >
                      <MaterialIcons name="sentiment-neutral" size={18} color="#6B7280" />
                      <Text style={[styles.voteButtonText, { color: '#6B7280' }]}>Neutral</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      ) : activeTab === 'chat' ? (
        <>
          <FlatList
            data={chatMessages || []}
            keyExtractor={(item) => item.id}
            renderItem={renderMessage}
            contentContainerStyle={styles.messagesList}
            inverted={false}
          />
          
          {/* Message Input */}
          <View style={styles.inputContainer}>
            <TextInput
              style={styles.input}
              placeholder="Type a message..."
              value={message}
              onChangeText={setMessage}
              multiline
              maxLength={500}
            />
            <TouchableOpacity 
              style={styles.sendButton}
              onPress={sendMessage}
              disabled={!message.trim()}
            >
              <Ionicons 
                name="send" 
                size={20} 
                color={message.trim() ? '#3B82F6' : '#999'} 
              />
            </TouchableOpacity>
          </View>
        </>
      ) : (
        <ScrollView style={styles.activityList}>
          {SAMPLE_ACTIVITIES.map((activity) => (
            <View key={activity.id}>
              {renderActivity({ item: activity })}
            </View>
          ))}
        </ScrollView>
      )}

      {/* Alternative Day Modal */}
      <AlternativeDayModal
        visible={showAlternativeModal}
        onClose={() => setShowAlternativeModal(false)}
        onSubmit={handleSubmitAlternative}
        dayNumber={selectedDay}
        originalDestinations={[
          { id: '1', name: 'Gothic Quarter', duration: '3 hours', cost: 0, time: 'Morning' },
        ]}
      />

      {/* Proposal Comparison Modal */}
      {selectedProposal && (
        <ProposalComparisonView
          original={selectedProposal.original}
          proposed={selectedProposal.proposed}
          proposedBy={selectedProposal.proposedBy}
          proposedAt={selectedProposal.proposedAt}
          description={selectedProposal.description}
          onAccept={() => {
            handleAcceptProposal(selectedProposal.id);
            setSelectedProposal(null);
          }}
          onReject={() => {
            handleRejectProposal(selectedProposal.id);
            setSelectedProposal(null);
          }}
          onMerge={() => {
            handleMergeProposal(selectedProposal.id);
            setSelectedProposal(null);
          }}
          votes={selectedProposal.votes}
          comments={selectedProposal.comments}
          onClose={() => setSelectedProposal(null)}
        />
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  aiSuggestionsSection: {
    marginBottom: 20,
  },
  sectionHeader: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  sectionHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  sectionHeaderTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  sectionHeaderSubtitle: {
    fontSize: 13,
    color: '#6B7280',
    marginLeft: 28,
  },
  tabSelector: {
    flexDirection: 'row',
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5E5',
    paddingHorizontal: 20,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginRight: 20,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  activeTab: {
    borderBottomColor: '#3B82F6',
  },
  tabText: {
    fontSize: 14,
    color: '#666',
    marginLeft: 8,
  },
  activeTabText: {
    color: '#3B82F6',
    fontWeight: '600',
  },
  messagesList: {
    padding: 20,
  },
  messageContainer: {
    marginBottom: 20,
  },
  aiSuggestionMessage: {
    backgroundColor: '#EFF6FF',
    borderRadius: 12,
    padding: 12,
    marginHorizontal: 4,
  },
  replyContainer: {
    marginLeft: 30,
  },
  threadLine: {
    position: 'absolute',
    left: 20,
    top: -20,
    bottom: 30,
    width: 2,
    backgroundColor: '#E5E7EB',
  },
  messageInner: {
    flexDirection: 'row',
  },
  avatarContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#3B82F6',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  aiAvatar: {
    backgroundColor: '#DBEAFE',
  },
  avatarText: {
    fontSize: 14,
    fontWeight: '600',
    color: 'white',
  },
  avatarInitials: {
    fontSize: 14,
    fontWeight: '600',
    color: 'white',
  },
  messageContent: {
    flex: 1,
  },
  aiUserName: {
    color: '#3B82F6',
    fontWeight: '700',
  },
  replyToContainer: {
    backgroundColor: '#F3F4F6',
    padding: 6,
    borderRadius: 4,
    marginBottom: 8,
  },
  replyToText: {
    fontSize: 12,
    color: '#6B7280',
    fontStyle: 'italic',
  },
  aiSuggestionContent: {
    marginTop: 8,
  },
  messageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  userName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  timestamp: {
    fontSize: 12,
    color: '#999',
  },
  messageText: {
    fontSize: 14,
    color: '#444',
    lineHeight: 20,
  },
  suggestionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  suggestionText: {
    fontSize: 12,
    color: '#F59E0B',
    marginLeft: 4,
    fontWeight: '600',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: 'white',
    borderTopWidth: 1,
    borderTopColor: '#E5E5E5',
    paddingHorizontal: 20,
    paddingVertical: 10,
    paddingBottom: Platform.OS === 'ios' ? 25 : 10,
  },
  input: {
    flex: 1,
    backgroundColor: '#F3F4F6',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    maxHeight: 100,
    fontSize: 14,
  },
  sendButton: {
    marginLeft: 12,
    padding: 8,
  },
  activityList: {
    flex: 1,
    padding: 20,
  },
  activityItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 20,
  },
  activityIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  activityContent: {
    flex: 1,
  },
  activityText: {
    fontSize: 14,
    color: '#444',
    lineHeight: 20,
  },
  activityUser: {
    fontWeight: '600',
    color: '#333',
  },
  activityTarget: {
    fontWeight: '600',
    color: '#3B82F6',
  },
  activityTime: {
    fontSize: 12,
    color: '#999',
    marginTop: 2,
  },
  content: {
    flex: 1,
  },
  addProposalButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#3B82F6',
    marginHorizontal: 20,
    marginTop: 20,
    padding: 16,
    borderRadius: 12,
    gap: 8,
  },
  addProposalButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  proposalsList: {
    padding: 20,
    gap: 16,
  },
  proposalCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  proposalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    gap: 4,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  dayLabel: {
    fontSize: 12,
    color: '#6B7280',
    fontWeight: '500',
  },
  proposalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  proposalDescription: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 12,
  },
  proposerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  proposerName: {
    fontSize: 14,
    fontWeight: '500',
    color: '#111827',
  },
  proposedTime: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  voteSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    gap: 16,
  },
  voteItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  voteCount: {
    fontSize: 14,
    color: '#6B7280',
    fontWeight: '500',
  },
  quickActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  voteButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 8,
    gap: 4,
    borderWidth: 1,
  },
  approveButton: {
    backgroundColor: '#10B98110',
    borderColor: '#10B98130',
  },
  rejectButton: {
    backgroundColor: '#EF444410',
    borderColor: '#EF444430',
  },
  neutralButton: {
    backgroundColor: '#6B728010',
    borderColor: '#6B728030',
  },
  voteButtonText: {
    fontSize: 14,
    fontWeight: '500',
  },
});