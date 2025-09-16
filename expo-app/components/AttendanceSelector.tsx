import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Modal,
  TextInput,
  ScrollView,
  Alert,
} from 'react-native';
import { Feather, Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase/client';

type AttendanceStatus = 'confirmed' | 'considering' | 'declined' | 'alternative';

interface AttendanceInfo {
  status: AttendanceStatus;
  count: {
    confirmed: number;
    considering: number;
    declined: number;
    alternative: number;
  };
  attendees: Array<{
    user_id: string;
    status: AttendanceStatus;
    profile: {
      username: string;
      avatar_url?: string;
    };
  }>;
}

interface AttendanceSelectorProps {
  tripId: string;
  destinationId: string;
  destinationName: string;
  dayIndex: number;
  onStatusChange?: (status: AttendanceStatus) => void;
  onAlternativePropose?: () => void;
  compact?: boolean;
}

export default function AttendanceSelector({
  tripId,
  destinationId,
  destinationName,
  dayIndex,
  onStatusChange,
  onAlternativePropose,
  compact = false,
}: AttendanceSelectorProps) {
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [myStatus, setMyStatus] = useState<AttendanceStatus>('considering');
  const [attendanceInfo, setAttendanceInfo] = useState<AttendanceInfo | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [showNotesModal, setShowNotesModal] = useState(false);
  const [notes, setNotes] = useState('');
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useEffect(() => {
    loadAttendance();
  }, [tripId, destinationId]);

  const loadAttendance = async () => {
    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setCurrentUserId(user.id);

      // Get my attendance status
      const { data: myAttendance } = await supabase
        .from('user_attendance')
        .select('status, notes')
        .eq('trip_id', tripId)
        .eq('destination_id', destinationId)
        .eq('user_id', user.id)
        .single();

      if (myAttendance) {
        setMyStatus(myAttendance.status);
        setNotes(myAttendance.notes || '');
      }

      // Get all attendance for this destination
      const { data: allAttendance } = await supabase
        .from('user_attendance')
        .select(`
          user_id,
          status,
          profile:profiles!user_id (
            username,
            avatar_url
          )
        `)
        .eq('trip_id', tripId)
        .eq('destination_id', destinationId);

      if (allAttendance) {
        const count = {
          confirmed: allAttendance.filter(a => a.status === 'confirmed').length,
          considering: allAttendance.filter(a => a.status === 'considering').length,
          declined: allAttendance.filter(a => a.status === 'declined').length,
          alternative: allAttendance.filter(a => a.status === 'alternative').length,
        };

        setAttendanceInfo({
          status: myStatus,
          count,
          attendees: allAttendance,
        });
      }
    } catch (error) {
      console.error('Error loading attendance:', error);
    } finally {
      setLoading(false);
    }
  };

  const updateAttendance = async (newStatus: AttendanceStatus) => {
    if (!currentUserId) return;

    // If choosing alternative, trigger the alternative proposal flow
    if (newStatus === 'alternative') {
      onAlternativePropose?.();
      return;
    }

    setUpdating(true);
    try {
      const { error } = await supabase
        .from('user_attendance')
        .upsert({
          trip_id: tripId,
          user_id: currentUserId,
          destination_id: destinationId,
          day_index: dayIndex,
          status: newStatus,
          notes: notes || null,
          decided_at: new Date().toISOString(),
        }, {
          onConflict: 'trip_id,user_id,destination_id',
        });

      if (error) throw error;

      setMyStatus(newStatus);
      onStatusChange?.(newStatus);

      // Reload attendance to get updated counts
      await loadAttendance();
    } catch (error) {
      console.error('Error updating attendance:', error);
      Alert.alert('Error', 'Failed to update attendance status');
    } finally {
      setUpdating(false);
    }
  };

  const saveNotes = async () => {
    if (!currentUserId) return;

    try {
      const { error } = await supabase
        .from('user_attendance')
        .update({ notes })
        .eq('trip_id', tripId)
        .eq('destination_id', destinationId)
        .eq('user_id', currentUserId);

      if (error) throw error;
      setShowNotesModal(false);
    } catch (error) {
      console.error('Error saving notes:', error);
    }
  };

  const getStatusIcon = (status: AttendanceStatus) => {
    switch (status) {
      case 'confirmed':
        return <Ionicons name="checkmark-circle" size={20} color="#10B981" />;
      case 'considering':
        return <Ionicons name="help-circle" size={20} color="#F59E0B" />;
      case 'declined':
        return <Ionicons name="close-circle" size={20} color="#EF4444" />;
      case 'alternative':
        return <Ionicons name="git-branch" size={20} color="#8B5CF6" />;
    }
  };

  const getStatusColor = (status: AttendanceStatus) => {
    switch (status) {
      case 'confirmed': return '#10B981';
      case 'considering': return '#F59E0B';
      case 'declined': return '#EF4444';
      case 'alternative': return '#8B5CF6';
    }
  };

  const getStatusLabel = (status: AttendanceStatus) => {
    switch (status) {
      case 'confirmed': return "I'm going";
      case 'considering': return 'Maybe';
      case 'declined': return 'Skip';
      case 'alternative': return 'Alternative';
    }
  };

  const AttendanceFull = () => (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Your Attendance</Text>
        <Text style={styles.destinationName}>{destinationName}</Text>
      </View>

      <View style={styles.statusButtons}>
        <TouchableOpacity
          style={[
            styles.statusButton,
            myStatus === 'confirmed' && styles.statusButtonActive,
            { borderColor: '#10B981' }
          ]}
          onPress={() => updateAttendance('confirmed')}
          disabled={updating}
        >
          <Ionicons name="checkmark-circle" size={24} color="#10B981" />
          <Text style={[styles.statusButtonText, { color: '#10B981' }]}>
            I'm going
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.statusButton,
            myStatus === 'considering' && styles.statusButtonActive,
            { borderColor: '#F59E0B' }
          ]}
          onPress={() => updateAttendance('considering')}
          disabled={updating}
        >
          <Ionicons name="help-circle" size={24} color="#F59E0B" />
          <Text style={[styles.statusButtonText, { color: '#F59E0B' }]}>
            Maybe
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.statusButton,
            myStatus === 'declined' && styles.statusButtonActive,
            { borderColor: '#EF4444' }
          ]}
          onPress={() => updateAttendance('declined')}
          disabled={updating}
        >
          <Ionicons name="close-circle" size={24} color="#EF4444" />
          <Text style={[styles.statusButtonText, { color: '#EF4444' }]}>
            Skip
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.statusButton,
            myStatus === 'alternative' && styles.statusButtonActive,
            { borderColor: '#8B5CF6' }
          ]}
          onPress={() => updateAttendance('alternative')}
          disabled={updating}
        >
          <Ionicons name="git-branch" size={24} color="#8B5CF6" />
          <Text style={[styles.statusButtonText, { color: '#8B5CF6' }]}>
            Alternative
          </Text>
        </TouchableOpacity>
      </View>

      {(myStatus === 'declined' || myStatus === 'alternative') && (
        <TouchableOpacity
          style={styles.notesButton}
          onPress={() => setShowNotesModal(true)}
        >
          <Feather name="message-circle" size={16} color="#6B7280" />
          <Text style={styles.notesButtonText}>
            {notes ? 'Edit reason' : 'Add reason (optional)'}
          </Text>
        </TouchableOpacity>
      )}

      {attendanceInfo && (
        <View style={styles.attendeeSection}>
          <Text style={styles.attendeeTitle}>Who's Going</Text>

          <View style={styles.attendeeStats}>
            <View style={styles.statItem}>
              <Ionicons name="checkmark-circle" size={16} color="#10B981" />
              <Text style={styles.statNumber}>{attendanceInfo.count.confirmed}</Text>
              <Text style={styles.statLabel}>Going</Text>
            </View>
            <View style={styles.statItem}>
              <Ionicons name="help-circle" size={16} color="#F59E0B" />
              <Text style={styles.statNumber}>{attendanceInfo.count.considering}</Text>
              <Text style={styles.statLabel}>Maybe</Text>
            </View>
            <View style={styles.statItem}>
              <Ionicons name="close-circle" size={16} color="#EF4444" />
              <Text style={styles.statNumber}>{attendanceInfo.count.declined}</Text>
              <Text style={styles.statLabel}>Skip</Text>
            </View>
            {attendanceInfo.count.alternative > 0 && (
              <View style={styles.statItem}>
                <Ionicons name="git-branch" size={16} color="#8B5CF6" />
                <Text style={styles.statNumber}>{attendanceInfo.count.alternative}</Text>
                <Text style={styles.statLabel}>Alt</Text>
              </View>
            )}
          </View>

          <ScrollView style={styles.attendeeList} horizontal showsHorizontalScrollIndicator={false}>
            {attendanceInfo.attendees
              .filter(a => a.status === 'confirmed')
              .map((attendee) => (
                <View key={attendee.user_id} style={styles.attendeeChip}>
                  <Text style={styles.attendeeName}>
                    {attendee.profile.username}
                  </Text>
                </View>
              ))}
          </ScrollView>
        </View>
      )}

      {showDetails && (
        <TouchableOpacity
          style={styles.closeButton}
          onPress={() => setShowDetails(false)}
        >
          <Text style={styles.closeButtonText}>Done</Text>
        </TouchableOpacity>
      )}

      <Modal visible={showNotesModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.notesModal}>
            <Text style={styles.modalTitle}>Why are you skipping?</Text>
            <TextInput
              style={styles.notesInput}
              value={notes}
              onChangeText={setNotes}
              placeholder="Optional: Let others know why..."
              multiline
              numberOfLines={4}
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalCancel}
                onPress={() => setShowNotesModal(false)}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalSave}
                onPress={saveNotes}
              >
                <Text style={styles.modalSaveText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );

  if (loading) {
    return <ActivityIndicator size="small" color="#3B82F6" />;
  }

  if (compact) {
    return (
      <View style={styles.compactContainer}>
        <TouchableOpacity
          style={[
            styles.compactButton,
            { borderColor: getStatusColor(myStatus) }
          ]}
          onPress={() => setShowDetails(true)}
        >
          {getStatusIcon(myStatus)}
          <Text style={[styles.compactLabel, { color: getStatusColor(myStatus) }]}>
            {getStatusLabel(myStatus)}
          </Text>
        </TouchableOpacity>

        {attendanceInfo && attendanceInfo.count.confirmed > 0 && (
          <View style={styles.attendeeCount}>
            <Ionicons name="people" size={14} color="#6B7280" />
            <Text style={styles.countText}>{attendanceInfo.count.confirmed}</Text>
          </View>
        )}

        <Modal visible={showDetails} animationType="slide" transparent>
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <AttendanceFull />
            </View>
          </View>
        </Modal>
      </View>
    );
  }

  return <AttendanceFull />;
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
  },
  header: {
    marginBottom: 16,
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
    marginBottom: 4,
  },
  destinationName: {
    fontSize: 16,
    fontWeight: '500',
    color: '#1F2937',
  },
  statusButtons: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  statusButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#E5E7EB',
  },
  statusButtonActive: {
    backgroundColor: '#F9FAFB',
  },
  statusButtonText: {
    fontSize: 12,
    fontWeight: '500',
    marginTop: 4,
  },
  notesButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#F9FAFB',
    borderRadius: 6,
    marginBottom: 16,
  },
  notesButtonText: {
    fontSize: 14,
    color: '#6B7280',
  },
  attendeeSection: {
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    paddingTop: 16,
  },
  attendeeTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
    marginBottom: 12,
  },
  attendeeStats: {
    flexDirection: 'row',
    gap: 20,
    marginBottom: 12,
  },
  statItem: {
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1F2937',
    marginVertical: 2,
  },
  statLabel: {
    fontSize: 12,
    color: '#6B7280',
  },
  attendeeList: {
    flexDirection: 'row',
    marginTop: 8,
  },
  attendeeChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#EBF5FF',
    borderRadius: 16,
    marginRight: 8,
  },
  attendeeName: {
    fontSize: 14,
    color: '#3B82F6',
  },
  compactContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  compactButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
  },
  compactLabel: {
    fontSize: 14,
    fontWeight: '500',
  },
  attendeeCount: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  countText: {
    fontSize: 12,
    color: '#6B7280',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: '90%',
    maxWidth: 400,
  },
  closeButton: {
    marginTop: 16,
    paddingVertical: 12,
    backgroundColor: '#3B82F6',
    borderRadius: 8,
    alignItems: 'center',
  },
  closeButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  notesModal: {
    width: '90%',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 16,
  },
  notesInput: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    padding: 12,
    minHeight: 100,
    textAlignVertical: 'top',
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },
  modalCancel: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
  },
  modalCancelText: {
    color: '#6B7280',
    fontWeight: '500',
  },
  modalSave: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#3B82F6',
    alignItems: 'center',
  },
  modalSaveText: {
    color: '#fff',
    fontWeight: '600',
  },
});