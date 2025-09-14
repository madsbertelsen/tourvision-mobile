import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
} from 'react-native';
import { Feather, Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';

interface Destination {
  id: string;
  name: string;
  duration: string;
  cost?: number;
  time?: string;
  description?: string;
}

interface Transportation {
  mode: string;
  duration: string;
  cost?: number;
}

interface DayItinerary {
  destinations: Destination[];
  transportations: Transportation[];
  totalCost: number;
  totalDuration: string;
}

interface ProposalComparisonViewProps {
  original: DayItinerary;
  proposed: DayItinerary;
  proposedBy: {
    name: string;
    avatar?: string;
  };
  proposedAt: Date;
  description?: string;
  onAccept: () => void;
  onReject: () => void;
  onMerge: () => void;
  votes?: {
    approve: number;
    reject: number;
    neutral: number;
  };
}

const { width: screenWidth } = Dimensions.get('window');
const columnWidth = (screenWidth - 60) / 2;

export default function ProposalComparisonView({
  original,
  proposed,
  proposedBy,
  proposedAt,
  description,
  onAccept,
  onReject,
  onMerge,
  votes = { approve: 0, reject: 0, neutral: 0 },
}: ProposalComparisonViewProps) {
  const [viewMode, setViewMode] = useState<'side-by-side' | 'diff'>('side-by-side');

  // Calculate differences
  const addedDestinations = proposed.destinations.filter(
    (dest) => !original.destinations.find((orig) => orig.id === dest.id)
  );
  const removedDestinations = original.destinations.filter(
    (dest) => !proposed.destinations.find((prop) => prop.id === dest.id)
  );
  const modifiedDestinations = proposed.destinations.filter((dest) => {
    const orig = original.destinations.find((o) => o.id === dest.id);
    return orig && (orig.duration !== dest.duration || orig.time !== dest.time);
  });

  const costDifference = proposed.totalCost - original.totalCost;
  const totalVotes = votes.approve + votes.reject + votes.neutral;

  const renderDestination = (
    destination: Destination,
    status?: 'added' | 'removed' | 'modified'
  ) => {
    const getStatusColor = () => {
      switch (status) {
        case 'added':
          return '#10B981';
        case 'removed':
          return '#EF4444';
        case 'modified':
          return '#F59E0B';
        default:
          return '#6B7280';
      }
    };

    return (
      <View
        key={destination.id}
        style={[
          styles.destinationCard,
          status && { borderLeftColor: getStatusColor(), borderLeftWidth: 3 },
        ]}
      >
        <View style={styles.destinationHeader}>
          <Text style={styles.destinationName} numberOfLines={1}>
            {destination.name}
          </Text>
          {status && (
            <View
              style={[styles.statusBadge, { backgroundColor: `${getStatusColor()}15` }]}
            >
              <Text style={[styles.statusText, { color: getStatusColor() }]}>
                {status}
              </Text>
            </View>
          )}
        </View>
        <View style={styles.destinationDetails}>
          <View style={styles.detailItem}>
            <Feather name="clock" size={12} color="#6B7280" />
            <Text style={styles.detailText}>{destination.duration}</Text>
          </View>
          {destination.cost && (
            <View style={styles.detailItem}>
              <Feather name="dollar-sign" size={12} color="#6B7280" />
              <Text style={styles.detailText}>${destination.cost}</Text>
            </View>
          )}
        </View>
      </View>
    );
  };

  const renderSideBySide = () => (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <View style={styles.sideBySideContainer}>
        {/* Original Column */}
        <View style={[styles.column, { width: columnWidth }]}>
          <View style={styles.columnHeader}>
            <Text style={styles.columnTitle}>Current</Text>
            <View style={styles.columnStats}>
              <Text style={styles.statText}>{original.totalDuration}</Text>
              <Text style={styles.statText}>${original.totalCost}</Text>
            </View>
          </View>
          <ScrollView style={styles.columnContent}>
            {original.destinations.map((dest) => {
              const isRemoved = removedDestinations.find((d) => d.id === dest.id);
              const isModified = modifiedDestinations.find((d) => d.id === dest.id);
              return renderDestination(
                dest,
                isRemoved ? 'removed' : isModified ? 'modified' : undefined
              );
            })}
          </ScrollView>
        </View>

        {/* Proposed Column */}
        <View style={[styles.column, { width: columnWidth }]}>
          <View style={styles.columnHeader}>
            <Text style={styles.columnTitle}>Proposed</Text>
            <View style={styles.columnStats}>
              <Text style={styles.statText}>{proposed.totalDuration}</Text>
              <Text style={[styles.statText, costDifference < 0 && styles.savings]}>
                ${proposed.totalCost}
              </Text>
            </View>
          </View>
          <ScrollView style={styles.columnContent}>
            {proposed.destinations.map((dest) => {
              const isAdded = addedDestinations.find((d) => d.id === dest.id);
              const isModified = modifiedDestinations.find((d) => d.id === dest.id);
              return renderDestination(
                dest,
                isAdded ? 'added' : isModified ? 'modified' : undefined
              );
            })}
          </ScrollView>
        </View>
      </View>
    </ScrollView>
  );

  const renderDiffView = () => (
    <ScrollView style={styles.diffContainer}>
      {/* Added destinations */}
      {addedDestinations.length > 0 && (
        <View style={styles.diffSection}>
          <Text style={styles.diffSectionTitle}>Added</Text>
          {addedDestinations.map((dest) => renderDestination(dest, 'added'))}
        </View>
      )}

      {/* Removed destinations */}
      {removedDestinations.length > 0 && (
        <View style={styles.diffSection}>
          <Text style={styles.diffSectionTitle}>Removed</Text>
          {removedDestinations.map((dest) => renderDestination(dest, 'removed'))}
        </View>
      )}

      {/* Modified destinations */}
      {modifiedDestinations.length > 0 && (
        <View style={styles.diffSection}>
          <Text style={styles.diffSectionTitle}>Modified</Text>
          {modifiedDestinations.map((dest) => renderDestination(dest, 'modified'))}
        </View>
      )}

      {/* Summary */}
      <View style={styles.summaryCard}>
        <Text style={styles.summaryTitle}>Impact Summary</Text>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Duration change:</Text>
          <Text style={styles.summaryValue}>
            {original.totalDuration} → {proposed.totalDuration}
          </Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Cost change:</Text>
          <Text
            style={[
              styles.summaryValue,
              costDifference < 0 ? styles.savings : styles.expense,
            ]}
          >
            {costDifference > 0 ? '+' : ''}${Math.abs(costDifference)}
          </Text>
        </View>
      </View>
    </ScrollView>
  );

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.proposalInfo}>
          <View style={styles.proposerInfo}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {proposedBy.name.substring(0, 2).toUpperCase()}
              </Text>
            </View>
            <View>
              <Text style={styles.proposerName}>{proposedBy.name}</Text>
              <Text style={styles.proposedTime}>
                {format(proposedAt, 'MMM d, h:mm a')}
              </Text>
            </View>
          </View>
          {description && <Text style={styles.description}>{description}</Text>}
        </View>

        {/* View Mode Toggle */}
        <View style={styles.viewModeToggle}>
          <TouchableOpacity
            style={[
              styles.toggleButton,
              viewMode === 'side-by-side' && styles.toggleButtonActive,
            ]}
            onPress={() => setViewMode('side-by-side')}
          >
            <Ionicons
              name="git-compare"
              size={16}
              color={viewMode === 'side-by-side' ? '#3B82F6' : '#6B7280'}
            />
            <Text
              style={[
                styles.toggleText,
                viewMode === 'side-by-side' && styles.toggleTextActive,
              ]}
            >
              Compare
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toggleButton, viewMode === 'diff' && styles.toggleButtonActive]}
            onPress={() => setViewMode('diff')}
          >
            <Feather
              name="git-pull-request"
              size={16}
              color={viewMode === 'diff' ? '#3B82F6' : '#6B7280'}
            />
            <Text
              style={[styles.toggleText, viewMode === 'diff' && styles.toggleTextActive]}
            >
              Changes
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Votes */}
      {totalVotes > 0 && (
        <View style={styles.votesContainer}>
          <View style={styles.voteBar}>
            <View
              style={[
                styles.voteSegment,
                styles.approveSegment,
                { flex: votes.approve / totalVotes },
              ]}
            />
            <View
              style={[
                styles.voteSegment,
                styles.neutralSegment,
                { flex: votes.neutral / totalVotes },
              ]}
            />
            <View
              style={[
                styles.voteSegment,
                styles.rejectSegment,
                { flex: votes.reject / totalVotes },
              ]}
            />
          </View>
          <View style={styles.voteCounts}>
            <Text style={styles.voteCount}>
              <Feather name="thumbs-up" size={12} color="#10B981" /> {votes.approve}
            </Text>
            <Text style={styles.voteCount}>
              <Feather name="minus" size={12} color="#6B7280" /> {votes.neutral}
            </Text>
            <Text style={styles.voteCount}>
              <Feather name="thumbs-down" size={12} color="#EF4444" /> {votes.reject}
            </Text>
          </View>
        </View>
      )}

      {/* Content */}
      <View style={styles.content}>
        {viewMode === 'side-by-side' ? renderSideBySide() : renderDiffView()}
      </View>

      {/* Actions */}
      <View style={styles.actions}>
        <TouchableOpacity style={[styles.actionButton, styles.rejectButton]} onPress={onReject}>
          <Feather name="x" size={18} color="#EF4444" />
          <Text style={styles.rejectText}>Reject</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.actionButton, styles.mergeButton]} onPress={onMerge}>
          <Ionicons name="git-merge" size={18} color="#F59E0B" />
          <Text style={styles.mergeText}>Merge</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.actionButton, styles.acceptButton]} onPress={onAccept}>
          <Feather name="check" size={18} color="white" />
          <Text style={styles.acceptText}>Accept</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'white',
  },
  header: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  proposalInfo: {
    marginBottom: 12,
  },
  proposerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#3B82F6',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
  proposerName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  proposedTime: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  description: {
    fontSize: 14,
    color: '#4B5563',
    lineHeight: 20,
    marginLeft: 48,
  },
  viewModeToggle: {
    flexDirection: 'row',
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
    padding: 2,
  },
  toggleButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
  },
  toggleButtonActive: {
    backgroundColor: 'white',
  },
  toggleText: {
    fontSize: 13,
    color: '#6B7280',
    marginLeft: 6,
    fontWeight: '500',
  },
  toggleTextActive: {
    color: '#3B82F6',
  },
  votesContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  voteBar: {
    height: 6,
    flexDirection: 'row',
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 8,
  },
  voteSegment: {
    height: '100%',
  },
  approveSegment: {
    backgroundColor: '#10B981',
  },
  neutralSegment: {
    backgroundColor: '#6B7280',
  },
  rejectSegment: {
    backgroundColor: '#EF4444',
  },
  voteCounts: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  voteCount: {
    fontSize: 12,
    color: '#6B7280',
  },
  content: {
    flex: 1,
  },
  sideBySideContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  column: {
    marginRight: 12,
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    overflow: 'hidden',
  },
  columnHeader: {
    padding: 12,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  columnTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  columnStats: {
    flexDirection: 'row',
    gap: 12,
  },
  statText: {
    fontSize: 12,
    color: '#6B7280',
  },
  savings: {
    color: '#10B981',
    fontWeight: '600',
  },
  expense: {
    color: '#EF4444',
    fontWeight: '600',
  },
  columnContent: {
    padding: 12,
    maxHeight: 400,
  },
  destinationCard: {
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  destinationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  destinationName: {
    fontSize: 14,
    fontWeight: '500',
    color: '#111827',
    flex: 1,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    marginLeft: 8,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  destinationDetails: {
    flexDirection: 'row',
    gap: 12,
  },
  detailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  detailText: {
    fontSize: 12,
    color: '#6B7280',
  },
  diffContainer: {
    padding: 16,
  },
  diffSection: {
    marginBottom: 20,
  },
  diffSectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  summaryCard: {
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 16,
    marginTop: 12,
  },
  summaryTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 12,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  summaryLabel: {
    fontSize: 13,
    color: '#6B7280',
  },
  summaryValue: {
    fontSize: 13,
    color: '#111827',
    fontWeight: '500',
  },
  actions: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    gap: 12,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 8,
    gap: 6,
  },
  rejectButton: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FCA5A5',
  },
  rejectText: {
    color: '#EF4444',
    fontSize: 14,
    fontWeight: '600',
  },
  mergeButton: {
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FCD34D',
  },
  mergeText: {
    color: '#F59E0B',
    fontSize: 14,
    fontWeight: '600',
  },
  acceptButton: {
    backgroundColor: '#10B981',
  },
  acceptText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
});