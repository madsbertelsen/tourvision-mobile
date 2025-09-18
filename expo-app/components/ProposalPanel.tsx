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
import { Proposal } from '@/hooks/useAIAssistant';
import { useAuth } from '@/lib/supabase/auth-context';

interface ProposalPanelProps {
  proposals: Proposal[];
  onVote: (proposalId: string, vote: 'approve' | 'reject', comment?: string) => void;
  onApply: (proposalId: string) => void;
  getUserVote: (proposalId: string) => { vote: 'approve' | 'reject' } | null;
  isVoting?: boolean;
  isApplying?: boolean;
}

export function ProposalPanel({
  proposals,
  onVote,
  onApply,
  getUserVote,
  isVoting = false,
  isApplying = false,
}: ProposalPanelProps) {
  const { user } = useAuth();
  const [expandedProposal, setExpandedProposal] = useState<string | null>(null);
  const [voteComments, setVoteComments] = useState<Record<string, string>>({});


  // Ensure proposals is always an array
  const validProposals = Array.isArray(proposals) ? proposals : [];

  const pendingProposals = validProposals.filter(s => s && s.status === 'pending');
  const approvedProposals = validProposals.filter(s => s && s.status === 'approved');
  const appliedProposals = validProposals.filter(s => s && s.status === 'applied');

  const renderProposalCard = (proposalItem: Proposal) => {
    // Create a local copy to avoid closure issues
    const proposal = { ...proposalItem };

    if (!proposal || !proposal.id) {
      console.error('Invalid proposal object:', proposal);
      return null;
    }

    const userVote = getUserVote(proposal.id);
    const isExpanded = expandedProposal === proposal.id;
    const canApply = proposal.status === 'approved' && !isApplying;

    const getTypeIcon = () => {
      switch (proposal.proposal_type) {
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
      switch (proposal.proposal_type) {
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
      <View key={proposal.id} style={styles.proposalCard}>
        {/* Header */}
        <TouchableOpacity
          style={styles.proposalHeader}
          onPress={() => setExpandedProposal(isExpanded ? null : proposal.id)}
        >
          <View style={styles.proposalHeaderLeft}>
            <View style={[styles.typeIcon, { backgroundColor: getTypeColor() + '20' }]}>
              <Feather name={getTypeIcon() as any} size={18} color={getTypeColor()} />
            </View>
            <View style={styles.proposalInfo}>
              <Text style={styles.proposalTitle}>{proposal.title}</Text>
              {proposal.description && (
                <Text style={styles.proposalDescription} numberOfLines={isExpanded ? 0 : 1}>
                  {proposal.description}
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
                { width: `${(proposal.approval_count / proposal.required_approvals) * 100}%` }
              ]}
            />
          </View>
          <Text style={styles.voteText}>
            {proposal.approval_count} / {proposal.required_approvals} approvals
          </Text>
        </View>

        {/* Expanded Content */}
        {isExpanded && (
          <View style={styles.expandedContent}>


            {/* Document Changes Visualization */}
            {(proposal.transaction_steps || proposal.proposal_operations) && (
              <View style={styles.changesSection}>
                <Text style={styles.sectionTitle}>Document Changes</Text>

                {/* Show operation type and target */}
                {proposal.proposal_operations && (
                  <View style={styles.operationInfo}>
                    <View style={[styles.operationBadge, { backgroundColor: getTypeColor() + '20' }]}>
                      <Text style={[styles.operationText, { color: getTypeColor() }]}>
                        {proposal.proposal_operations.operation?.toUpperCase() || proposal.proposal_type.toUpperCase()}
                      </Text>
                    </View>
                    {proposal.proposal_operations.target_id && (
                      <Text style={styles.targetText}>
                        Target: {proposal.proposal_operations.target_id}
                      </Text>
                    )}
                  </View>
                )}

                {/* Show affected range if available */}
                {proposal.affected_range && (
                  <View style={styles.rangeInfo}>
                    <Feather name="edit-2" size={12} color="#6B7280" />
                    <Text style={styles.rangeText}>
                      Affects positions {proposal.affected_range.from} to {proposal.affected_range.to}
                    </Text>
                  </View>
                )}

                {/* Show transaction metadata if available */}
                {proposal.transaction_metadata?.confidence && (
                  <View style={styles.confidenceInfo}>
                    <Text style={styles.confidenceLabel}>AI Confidence:</Text>
                    <View style={styles.confidenceBar}>
                      <View
                        style={[
                          styles.confidenceProgress,
                          { width: `${proposal.transaction_metadata.confidence * 100}%` }
                        ]}
                      />
                    </View>
                    <Text style={styles.confidenceValue}>
                      {Math.round(proposal.transaction_metadata.confidence * 100)}%
                    </Text>
                  </View>
                )}

                {/* Show number of steps */}
                {proposal.transaction_steps && (
                  <Text style={styles.stepsInfo}>
                    {proposal.transaction_steps.length} transaction step{proposal.transaction_steps.length !== 1 ? 's' : ''} will be applied
                  </Text>
                )}
              </View>
            )}

            {/* AI Reasoning */}
            {proposal.ai_reasoning && (
              <View style={styles.reasoningSection}>
                <Text style={styles.sectionTitle}>AI Analysis</Text>
                <Text style={styles.reasoningText}>{proposal.ai_reasoning}</Text>
              </View>
            )}

            {/* Chat Context */}
            {proposal.chat_context && proposal.chat_context.length > 0 && (
              <View style={styles.contextSection}>
                <Text style={styles.sectionTitle}>Based on Discussion</Text>
                <ScrollView style={styles.contextScroll} horizontal showsHorizontalScrollIndicator={false}>
                  {proposal.chat_context.slice(0, 3).map((msg, index) => (
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
            {proposal.status === 'pending' && (
              <View style={styles.votingSection}>
                {userVote ? (
                  <View style={styles.votedStatus}>
                    <Feather
                      name={userVote.vote === 'approve' ? 'check-circle' : 'x-circle'}
                      size={16}
                      color={userVote.vote === 'approve' ? '#10B981' : '#EF4444'}
                    />
                    <Text style={styles.votedText}>
                      You {userVote.vote === 'approve' ? 'approved' : 'rejected'} this proposal
                    </Text>
                  </View>
                ) : (
                  <>
                    <View style={styles.voteButtons}>
                      <TouchableOpacity
                        style={[styles.voteButton, styles.approveButton]}
                        onPress={() => {
                          console.log('Approve button clicked');
                          console.log('proposal object:', proposal);
                          console.log('proposal.id:', proposal?.id);
                          if (!proposal?.id) {
                            console.error('proposal.id is undefined!', proposal);
                            return;
                          }
                          onVote(proposal.id, 'approve', voteComments[proposal.id]);
                        }}
                        disabled={isVoting}
                      >
                        <Feather name="check" size={18} color="white" />
                        <Text style={styles.voteButtonText}>Approve</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.voteButton, styles.rejectButton]}
                        onPress={() => onVote(proposal.id, 'reject', voteComments[proposal.id])}
                        disabled={isVoting}
                      >
                        <Feather name="x" size={18} color="white" />
                        <Text style={styles.voteButtonText}>Reject</Text>
                      </TouchableOpacity>
                    </View>
                    <TextInput
                      style={styles.commentInput}
                      placeholder="Add a comment (optional)"
                      value={voteComments[proposal.id] || ''}
                      onChangeText={(text) =>
                        setVoteComments({ ...voteComments, [proposal.id]: text })
                      }
                      multiline
                    />
                  </>
                )}
              </View>
            )}

            {/* Apply Button for Approved Proposals */}
            {canApply && (
              <TouchableOpacity
                style={styles.applyButton}
                onPress={() => onApply(proposal.id)}
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

  if (validProposals.length === 0) {
    return (
      <View style={styles.emptyState}>
        <Feather name="cpu" size={32} color="#9CA3AF" />
        <Text style={styles.emptyTitle}>No AI Proposals Yet</Text>
        <Text style={styles.emptyText}>
          The AI will analyze your chat discussions and suggest document changes
        </Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Pending Proposals */}
      {pendingProposals.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionHeaderText}>Pending Review</Text>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{pendingProposals.length}</Text>
            </View>
          </View>
          {pendingProposals.map((proposal) => (
            <React.Fragment key={proposal.id}>
              {renderProposalCard(proposal)}
            </React.Fragment>
          ))}
        </View>
      )}

      {/* Approved Proposals */}
      {approvedProposals.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionHeaderText}>Ready to Apply</Text>
            <View style={[styles.badge, styles.approvedBadge]}>
              <Text style={styles.badgeText}>{approvedProposals.length}</Text>
            </View>
          </View>
          {approvedProposals.map(renderProposalCard)}
        </View>
      )}

      {/* Applied Proposals */}
      {appliedProposals.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionHeaderText}>Applied</Text>
            <Feather name="check-circle" size={16} color="#10B981" />
          </View>
          <View style={styles.appliedList}>
            {appliedProposals.slice(0, 3).map((proposal) => (
              <View key={proposal.id} style={styles.appliedItem}>
                <Feather name="check" size={14} color="#10B981" />
                <Text style={styles.appliedText} numberOfLines={1}>
                  {proposal.title}
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
            {isVoting ? 'Submitting vote...' : 'Applying proposal...'}
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
  proposalCard: {
    backgroundColor: 'white',
    marginHorizontal: 12,
    marginVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    overflow: 'hidden',
  },
  proposalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  proposalHeaderLeft: {
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
  proposalInfo: {
    flex: 1,
  },
  proposalTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 2,
  },
  proposalDescription: {
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
  // New styles for enriched content
  enrichedSection: {
    marginTop: 12,
    marginBottom: 8,
  },
  enrichedText: {
    fontSize: 14,
    color: '#374151',
    lineHeight: 20,
  },
  factItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 6,
    paddingRight: 12,
  },
  bulletPoint: {
    fontSize: 14,
    color: '#6B7280',
    marginRight: 8,
    width: 12,
  },
  factText: {
    fontSize: 14,
    color: '#4B5563',
    flex: 1,
    lineHeight: 20,
  },
  practicalSection: {
    marginTop: 16,
    backgroundColor: '#F9FAFB',
    padding: 12,
    borderRadius: 8,
  },
  infoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 8,
  },
  infoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '50%',
    marginBottom: 8,
  },
  infoText: {
    fontSize: 13,
    color: '#4B5563',
    marginLeft: 6,
    flex: 1,
  },
  locationSection: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  transportSection: {
    marginTop: 8,
  },
  miniTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
    marginBottom: 4,
  },
  transportOption: {
    fontSize: 13,
    color: '#4B5563',
    marginLeft: 12,
    marginBottom: 2,
  },
  accessibilitySection: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  facilitiesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 8,
  },
  facilityChip: {
    backgroundColor: 'white',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginRight: 6,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  facilityText: {
    fontSize: 12,
    color: '#6B7280',
  },
  resourcesSection: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  linksRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  linkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    gap: 4,
  },
  linkText: {
    fontSize: 13,
    color: '#3B82F6',
    fontWeight: '500',
  },
  // Document changes visualization styles
  changesSection: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  operationInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 8,
  },
  operationBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 4,
  },
  operationText: {
    fontSize: 12,
    fontWeight: '600',
  },
  targetText: {
    fontSize: 13,
    color: '#6B7280',
    flex: 1,
  },
  rangeInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
  },
  rangeText: {
    fontSize: 12,
    color: '#6B7280',
  },
  confidenceInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
  },
  confidenceLabel: {
    fontSize: 12,
    color: '#6B7280',
  },
  confidenceBar: {
    flex: 1,
    height: 6,
    backgroundColor: '#E5E7EB',
    borderRadius: 3,
  },
  confidenceProgress: {
    height: '100%',
    backgroundColor: '#10B981',
    borderRadius: 3,
  },
  confidenceValue: {
    fontSize: 12,
    color: '#374151',
    fontWeight: '600',
  },
  stepsInfo: {
    fontSize: 12,
    color: '#6B7280',
    fontStyle: 'italic',
    marginTop: 8,
  },
});