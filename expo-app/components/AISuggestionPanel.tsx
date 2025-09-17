import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  TextInput,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { AISuggestion } from '@/hooks/useAIAssistant';
import { useAuth } from '@/lib/supabase/auth-context';

interface AISuggestionPanelProps {
  suggestions: AISuggestion[];
  onVote: (suggestionId: string, vote: 'approve' | 'reject', comment?: string) => void;
  onApply: (suggestionId: string) => void;
  getUserVote: (suggestionId: string) => { vote: 'approve' | 'reject' } | null;
  isVoting?: boolean;
  isApplying?: boolean;
}

export function AISuggestionPanel({
  suggestions,
  onVote,
  onApply,
  getUserVote,
  isVoting = false,
  isApplying = false,
}: AISuggestionPanelProps) {
  const { user } = useAuth();
  const [expandedSuggestion, setExpandedSuggestion] = useState<string | null>(null);
  const [voteComments, setVoteComments] = useState<Record<string, string>>({});


  // Ensure suggestions is always an array
  const validSuggestions = Array.isArray(suggestions) ? suggestions : [];

  const pendingSuggestions = validSuggestions.filter(s => s && s.status === 'pending');
  const approvedSuggestions = validSuggestions.filter(s => s && s.status === 'approved');
  const appliedSuggestions = validSuggestions.filter(s => s && s.status === 'applied');

  const renderSuggestionCard = (suggestionItem: AISuggestion) => {
    // Create a local copy to avoid closure issues
    const suggestion = { ...suggestionItem };

    if (!suggestion || !suggestion.id) {
      console.error('Invalid suggestion object:', suggestion);
      return null;
    }

    const userVote = getUserVote(suggestion.id);
    const isExpanded = expandedSuggestion === suggestion.id;
    const canApply = suggestion.status === 'approved' && !isApplying;

    const getTypeIcon = () => {
      switch (suggestion.suggestion_type) {
        case 'add':
          return 'plus-circle';
        case 'modify':
          return 'edit-3';
        case 'remove':
          return 'x-circle';
        case 'reorganize':
          return 'shuffle';
        default:
          return 'help-circle';
      }
    };

    const getTypeColor = () => {
      switch (suggestion.suggestion_type) {
        case 'add':
          return '#10B981';
        case 'modify':
          return '#3B82F6';
        case 'remove':
          return '#EF4444';
        case 'reorganize':
          return '#F59E0B';
        default:
          return '#6B7280';
      }
    };

    return (
      <View key={suggestion.id} style={styles.suggestionCard}>
        {/* Header */}
        <TouchableOpacity
          style={styles.suggestionHeader}
          onPress={() => setExpandedSuggestion(isExpanded ? null : suggestion.id)}
        >
          <View style={styles.suggestionHeaderLeft}>
            <View style={[styles.typeIcon, { backgroundColor: getTypeColor() + '20' }]}>
              <Feather name={getTypeIcon() as any} size={18} color={getTypeColor()} />
            </View>
            <View style={styles.suggestionInfo}>
              <Text style={styles.suggestionTitle}>{suggestion.title}</Text>
              {suggestion.description && (
                <Text style={styles.suggestionDescription} numberOfLines={isExpanded ? 0 : 1}>
                  {suggestion.description}
                </Text>
              )}
            </View>
          </View>
          <Feather
            name={isExpanded ? 'chevron-up' : 'chevron-down'}
            size={20}
            color="#6B7280"
          />
        </TouchableOpacity>

        {/* Voting Status */}
        <View style={styles.votingStatus}>
          <View style={styles.voteBar}>
            <View
              style={[
                styles.voteProgress,
                styles.approveBar,
                { width: `${(suggestion.approval_count / suggestion.required_approvals) * 100}%` }
              ]}
            />
          </View>
          <Text style={styles.voteText}>
            {suggestion.approval_count} / {suggestion.required_approvals} approvals
          </Text>
        </View>

        {/* Expanded Content */}
        {isExpanded && (
          <View style={styles.expandedContent}>
            {/* AI Reasoning */}
            {suggestion.ai_reasoning && (
              <View style={styles.reasoningSection}>
                <Text style={styles.sectionTitle}>AI Reasoning</Text>
                <Text style={styles.reasoningText}>{suggestion.ai_reasoning}</Text>
              </View>
            )}

            {/* Chat Context */}
            {suggestion.chat_context && suggestion.chat_context.length > 0 && (
              <View style={styles.contextSection}>
                <Text style={styles.sectionTitle}>Based on Discussion</Text>
                <ScrollView style={styles.contextScroll} horizontal showsHorizontalScrollIndicator={false}>
                  {suggestion.chat_context.slice(0, 3).map((msg, index) => (
                    <View key={index} style={styles.contextBubble}>
                      <Text style={styles.contextText} numberOfLines={2}>
                        "{msg}"
                      </Text>
                    </View>
                  ))}
                </ScrollView>
              </View>
            )}

            {/* Voting Actions */}
            {suggestion.status === 'pending' && (
              <View style={styles.votingSection}>
                {userVote ? (
                  <View style={styles.votedStatus}>
                    <Feather
                      name={userVote.vote === 'approve' ? 'check-circle' : 'x-circle'}
                      size={16}
                      color={userVote.vote === 'approve' ? '#10B981' : '#EF4444'}
                    />
                    <Text style={styles.votedText}>
                      You {userVote.vote === 'approve' ? 'approved' : 'rejected'} this suggestion
                    </Text>
                  </View>
                ) : (
                  <>
                    <View style={styles.voteButtons}>
                      <TouchableOpacity
                        style={[styles.voteButton, styles.approveButton]}
                        onPress={() => {
                          console.log('Approve button clicked');
                          console.log('suggestion object:', suggestion);
                          console.log('suggestion.id:', suggestion?.id);
                          if (!suggestion?.id) {
                            console.error('suggestion.id is undefined!', suggestion);
                            return;
                          }
                          onVote(suggestion.id, 'approve', voteComments[suggestion.id]);
                        }}
                        disabled={isVoting}
                      >
                        <Feather name="check" size={18} color="white" />
                        <Text style={styles.voteButtonText}>Approve</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.voteButton, styles.rejectButton]}
                        onPress={() => onVote(suggestion.id, 'reject', voteComments[suggestion.id])}
                        disabled={isVoting}
                      >
                        <Feather name="x" size={18} color="white" />
                        <Text style={styles.voteButtonText}>Reject</Text>
                      </TouchableOpacity>
                    </View>
                    <TextInput
                      style={styles.commentInput}
                      placeholder="Add a comment (optional)"
                      value={voteComments[suggestion.id] || ''}
                      onChangeText={(text) =>
                        setVoteComments({ ...voteComments, [suggestion.id]: text })
                      }
                      multiline
                    />
                  </>
                )}
              </View>
            )}

            {/* Apply Button for Approved Suggestions */}
            {canApply && (
              <TouchableOpacity
                style={styles.applyButton}
                onPress={() => onApply(suggestion.id)}
              >
                <Feather name="check-square" size={18} color="white" />
                <Text style={styles.applyButtonText}>Apply to Document</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>
    );
  };

  if (validSuggestions.length === 0) {
    return (
      <View style={styles.emptyState}>
        <Feather name="cpu" size={32} color="#9CA3AF" />
        <Text style={styles.emptyTitle}>No AI Suggestions Yet</Text>
        <Text style={styles.emptyText}>
          The AI will analyze your chat discussions and suggest document changes
        </Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Pending Suggestions */}
      {pendingSuggestions.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionHeaderText}>Pending Review</Text>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{pendingSuggestions.length}</Text>
            </View>
          </View>
          {pendingSuggestions.map((suggestion) => (
            <React.Fragment key={suggestion.id}>
              {renderSuggestionCard(suggestion)}
            </React.Fragment>
          ))}
        </View>
      )}

      {/* Approved Suggestions */}
      {approvedSuggestions.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionHeaderText}>Ready to Apply</Text>
            <View style={[styles.badge, styles.approvedBadge]}>
              <Text style={styles.badgeText}>{approvedSuggestions.length}</Text>
            </View>
          </View>
          {approvedSuggestions.map(renderSuggestionCard)}
        </View>
      )}

      {/* Applied Suggestions */}
      {appliedSuggestions.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionHeaderText}>Applied</Text>
            <Feather name="check-circle" size={16} color="#10B981" />
          </View>
          <View style={styles.appliedList}>
            {appliedSuggestions.slice(0, 3).map((suggestion) => (
              <View key={suggestion.id} style={styles.appliedItem}>
                <Feather name="check" size={14} color="#10B981" />
                <Text style={styles.appliedText} numberOfLines={1}>
                  {suggestion.title}
                </Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Loading State */}
      {(isVoting || isApplying) && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="small" color="#3B82F6" />
          <Text style={styles.loadingText}>
            {isVoting ? 'Submitting vote...' : 'Applying suggestion...'}
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 48,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    marginTop: 12,
  },
  emptyText: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginBottom: 8,
  },
  sectionHeaderText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  badge: {
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
  },
  approvedBadge: {
    backgroundColor: '#D1FAE5',
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#374151',
  },
  suggestionCard: {
    backgroundColor: 'white',
    marginHorizontal: 12,
    marginVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    overflow: 'hidden',
  },
  suggestionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  suggestionHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    flex: 1,
  },
  typeIcon: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  suggestionInfo: {
    flex: 1,
  },
  suggestionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 2,
  },
  suggestionDescription: {
    fontSize: 13,
    color: '#6B7280',
    lineHeight: 18,
  },
  votingStatus: {
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  voteBar: {
    height: 4,
    backgroundColor: '#E5E7EB',
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 4,
  },
  voteProgress: {
    height: '100%',
  },
  approveBar: {
    backgroundColor: '#10B981',
  },
  voteText: {
    fontSize: 12,
    color: '#6B7280',
  },
  expandedContent: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  reasoningSection: {
    marginTop: 12,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  reasoningText: {
    fontSize: 14,
    color: '#374151',
    lineHeight: 20,
  },
  contextSection: {
    marginTop: 16,
  },
  contextScroll: {
    maxHeight: 60,
  },
  contextBubble: {
    backgroundColor: '#F9FAFB',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    marginRight: 8,
    maxWidth: 200,
  },
  contextText: {
    fontSize: 13,
    color: '#4B5563',
    fontStyle: 'italic',
  },
  votingSection: {
    marginTop: 16,
  },
  voteButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  voteButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 8,
    gap: 6,
  },
  approveButton: {
    backgroundColor: '#10B981',
  },
  rejectButton: {
    backgroundColor: '#EF4444',
  },
  voteButtonText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 14,
  },
  commentInput: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    padding: 10,
    fontSize: 14,
    minHeight: 60,
    textAlignVertical: 'top',
  },
  votedStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    padding: 12,
    borderRadius: 8,
    gap: 8,
  },
  votedText: {
    fontSize: 14,
    color: '#4B5563',
  },
  applyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#3B82F6',
    paddingVertical: 12,
    borderRadius: 8,
    marginTop: 16,
    gap: 8,
  },
  applyButtonText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 15,
  },
  appliedList: {
    paddingHorizontal: 16,
  },
  appliedItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    gap: 8,
  },
  appliedText: {
    fontSize: 13,
    color: '#6B7280',
    flex: 1,
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    gap: 8,
  },
  loadingText: {
    fontSize: 14,
    color: '#6B7280',
  },
});