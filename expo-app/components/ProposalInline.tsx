import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Proposal } from '@/hooks/useAIAssistant';

interface ProposalInlineProps {
  proposal: Proposal;
  onVote: (proposalId: string, vote: 'approve' | 'reject', comment?: string) => void;
  onApply?: (proposalId: string) => void;
  onPreviewDiff?: (proposalId: string) => void;
  getUserVote: (proposalId: string) => { vote_type: 'approve' | 'reject' } | null;
  isVoting?: boolean;
  isApplying?: boolean;
  isDiffActive?: boolean;
}

export function ProposalInline({
  proposal,
  onVote,
  onApply,
  onPreviewDiff,
  getUserVote,
  isVoting = false,
  isApplying = false,
  isDiffActive = false,
}: ProposalInlineProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const userVote = getUserVote(proposal.id);
  const canApply = proposal.status === 'approved' && !proposal.applied_at && !isApplying && onApply;

  const getTypeIcon = () => {
    switch (proposal.request_type) {
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
    switch (proposal.request_type) {
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
    <View style={styles.container}>
      {/* Header with icon and title */}
      <TouchableOpacity
        style={styles.header}
        onPress={() => setIsExpanded(!isExpanded)}
        activeOpacity={0.7}
      >
        <View style={styles.headerLeft}>
          <View style={[styles.typeIcon, { backgroundColor: getTypeColor() + '20' }]}>
            <Feather name={getTypeIcon() as any} size={16} color={getTypeColor()} />
          </View>
          <View style={styles.titleSection}>
            <Text style={styles.title}>{proposal.title || 'Change Request'}</Text>
          </View>
        </View>
        <Feather
          name={isExpanded ? 'chevron-up' : 'chevron-down'}
          size={18}
          color="#6B7280"
        />
      </TouchableOpacity>

      {/* Main content */}
      <View style={styles.content}>
        <Text style={styles.description}>{proposal.description || 'AI generated change request'}</Text>


        {/* Expanded details */}
        {isExpanded && (
          <View style={styles.expandedContent}>
            {/* Practical Info */}
            {proposal.practical_info && (
              <View style={styles.practicalInfo}>
                <View style={styles.infoRow}>
                  {proposal.practical_info.duration && (
                    <View style={styles.infoItem}>
                      <Feather name="clock" size={12} color="#6B7280" />
                      <Text style={styles.infoText}>Duration: {proposal.practical_info.duration}</Text>
                    </View>
                  )}
                  {proposal.practical_info.best_time && (
                    <View style={styles.infoItem}>
                      <Feather name="sun" size={12} color="#6B7280" />
                      <Text style={styles.infoText}>Best Time: {proposal.practical_info.best_time}</Text>
                    </View>
                  )}
                </View>
                {proposal.practical_info.admission?.adults && (
                  <View style={styles.infoItem}>
                    <Feather name="users" size={12} color="#6B7280" />
                    <Text style={styles.infoText}>Admission: {proposal.practical_info.admission.adults}</Text>
                  </View>
                )}
                {proposal.practical_info.opening_hours && (
                  <View style={styles.infoItem}>
                    <Feather name="clock" size={12} color="#6B7280" />
                    <Text style={styles.infoText}>Hours: {proposal.practical_info.opening_hours}</Text>
                  </View>
                )}
              </View>
            )}
          </View>
        )}

        {/* Voting progress - always visible */}
        <View style={styles.votingProgress}>
          <View style={styles.progressBar}>
            <View
              style={[
                styles.progressFill,
                { width: `${((proposal.approval_count || 0) / (proposal.required_approvals || 3)) * 100}%` }
              ]}
            />
          </View>
          <Text style={styles.progressText}>
            {proposal.approval_count || 0}/{proposal.required_approvals || 3} approvals
          </Text>
        </View>

        {/* Diff Preview Button */}
        {proposal.diff_decorations && onPreviewDiff && (
          <TouchableOpacity
            style={[
              styles.diffButton,
              isDiffActive && styles.diffButtonActive
            ]}
            onPress={() => onPreviewDiff(proposal.id)}
          >
            <Feather
              name="eye"
              size={14}
              color={isDiffActive ? '#3B82F6' : '#6B7280'}
            />
            <Text style={[
              styles.diffButtonText,
              isDiffActive && styles.diffButtonTextActive
            ]}>
              {isDiffActive ? 'Hide Changes' : 'Show Changes in Document'}
            </Text>
          </TouchableOpacity>
        )}

        {/* Action buttons - only show if not applied */}
        {!proposal.applied_at && (
          <View style={styles.actions}>
            {userVote ? (
              <View style={styles.votedStatus}>
                <Feather
                  name={userVote.vote_type === 'approve' ? 'check-circle' : 'x-circle'}
                  size={16}
                  color={userVote.vote_type === 'approve' ? '#10B981' : '#EF4444'}
                />
                <Text style={styles.votedText}>
                  You {userVote.vote_type === 'approve' ? 'accepted' : 'rejected'} this
                </Text>
              </View>
            ) : (
            <>
              <TouchableOpacity
                style={[styles.actionButton, styles.acceptButton]}
                onPress={() => {
                  console.log('Accept pressed for proposal:', proposal.id);
                  onVote(proposal.id, 'approve');
                }}
                disabled={isVoting}
              >
                {isVoting ? (
                  <ActivityIndicator size="small" color="white" />
                ) : (
                  <>
                    <Feather name="check" size={16} color="white" />
                    <Text style={styles.buttonText}>Accept</Text>
                  </>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionButton, styles.rejectButton]}
                onPress={() => {
                  console.log('Reject pressed for proposal:', proposal.id);
                  onVote(proposal.id, 'reject');
                }}
                disabled={isVoting}
              >
                {isVoting ? (
                  <ActivityIndicator size="small" color="white" />
                ) : (
                  <>
                    <Feather name="x" size={16} color="white" />
                    <Text style={styles.buttonText}>Reject</Text>
                  </>
                )}
              </TouchableOpacity>
            </>
          )}
          </View>
        )}

        {/* Apply button for approved suggestions */}
        {canApply && (
          <TouchableOpacity
            style={styles.applyButton}
            onPress={() => onApply!(proposal.id)}
            disabled={isApplying}
          >
            {isApplying ? (
              <ActivityIndicator size="small" color="white" />
            ) : (
              <>
                <Feather name="check-square" size={16} color="white" />
                <Text style={styles.buttonText}>Apply to Document</Text>
              </>
            )}
          </TouchableOpacity>
        )}

        {/* Status badge for applied suggestions */}
        {(proposal.status === 'applied' || proposal.applied_at) && (
          <View style={styles.appliedBadge}>
            <Feather name="check-circle" size={14} color="#10B981" />
            <Text style={styles.appliedText}>Applied</Text>
          </View>
        )}
      </View>

      {/* Footer link */}
      <TouchableOpacity
        style={styles.footer}
        onPress={() => setIsExpanded(!isExpanded)}
      >
        <Text style={styles.footerText}>
          {isExpanded ? 'Show less' : 'Click to view full proposal details and vote'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'white',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#F9FAFB',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  typeIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  titleSection: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 2,
  },
  titlePrefix: {
    fontSize: 12,
    color: '#6B7280',
    fontWeight: '500',
  },
  title: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
  },
  content: {
    padding: 12,
  },
  description: {
    fontSize: 14,
    color: '#4B5563',
    lineHeight: 20,
    marginBottom: 8,
  },
  quickInfo: {
    marginBottom: 12,
  },
  quickInfoText: {
    fontSize: 13,
    color: '#6B7280',
    lineHeight: 18,
    marginBottom: 4,
  },
  quickInfoLabel: {
    fontWeight: '600',
    color: '#374151',
  },
  expandedContent: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  section: {
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 6,
  },
  factItem: {
    fontSize: 13,
    color: '#4B5563',
    lineHeight: 18,
    marginBottom: 3,
    marginLeft: 8,
  },
  practicalInfo: {
    backgroundColor: '#F9FAFB',
    padding: 10,
    borderRadius: 8,
    marginTop: 8,
  },
  infoRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 6,
  },
  infoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  infoText: {
    fontSize: 12,
    color: '#6B7280',
  },
  votingProgress: {
    marginTop: 12,
    marginBottom: 12,
  },
  progressBar: {
    height: 4,
    backgroundColor: '#E5E7EB',
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 4,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#10B981',
  },
  progressText: {
    fontSize: 12,
    color: '#6B7280',
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 8,
    gap: 6,
  },
  acceptButton: {
    backgroundColor: '#10B981',
  },
  rejectButton: {
    backgroundColor: '#EF4444',
  },
  buttonText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 14,
  },
  votedStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    paddingVertical: 8,
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
    gap: 6,
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
    paddingVertical: 10,
    borderRadius: 8,
    marginTop: 8,
    gap: 6,
  },
  appliedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#D1FAE5',
    paddingVertical: 8,
    borderRadius: 8,
    marginTop: 8,
    gap: 6,
  },
  appliedText: {
    fontSize: 14,
    color: '#10B981',
    fontWeight: '500',
  },
  footer: {
    backgroundColor: '#F9FAFB',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  footerText: {
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'center',
  },
  diffButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#F9FAFB',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginBottom: 8,
  },
  diffButtonActive: {
    backgroundColor: '#EBF5FF',
    borderColor: '#3B82F6',
  },
  diffButtonText: {
    fontSize: 13,
    color: '#6B7280',
    fontWeight: '500',
  },
  diffButtonTextActive: {
    color: '#3B82F6',
  },
});