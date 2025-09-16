import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase/client';

export type AttendanceStatus = 'confirmed' | 'considering' | 'declined' | 'alternative';

interface UserAttendance {
  user_id: string;
  destination_id: string;
  status: AttendanceStatus;
  notes?: string;
  alternative_id?: string;
  profile?: {
    username: string;
    avatar_url?: string;
  };
}

interface DestinationAttendance {
  destination_id: string;
  total_members: number;
  confirmed: number;
  considering: number;
  declined: number;
  alternative: number;
  attendees: UserAttendance[];
}

interface TripMember {
  user_id: string;
  role: 'owner' | 'member' | 'viewer';
  joined_at: string;
  onboarding_completed: boolean;
  profile?: {
    username: string;
    avatar_url?: string;
    full_name?: string;
  };
}

export function useAttendance(tripId: string) {
  const [members, setMembers] = useState<TripMember[]>([]);
  const [attendance, setAttendance] = useState<Map<string, DestinationAttendance>>(new Map());
  const [myAttendance, setMyAttendance] = useState<Map<string, AttendanceStatus>>(new Map());
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    if (tripId) {
      loadData();
      subscribeToChanges();
    }
  }, [tripId]);

  const loadData = async () => {
    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);

      // Load trip members
      const { data: membersData } = await supabase
        .from('trip_members')
        .select(`
          *,
          profile:profiles!user_id (
            username,
            avatar_url,
            full_name
          )
        `)
        .eq('trip_id', tripId);

      if (membersData) {
        setMembers(membersData);
      }

      // Load all attendance data
      const { data: attendanceData } = await supabase
        .from('user_attendance')
        .select(`
          *,
          profile:profiles!user_id (
            username,
            avatar_url
          )
        `)
        .eq('trip_id', tripId);

      if (attendanceData) {
        // Group by destination
        const attendanceMap = new Map<string, DestinationAttendance>();
        const myAttendanceMap = new Map<string, AttendanceStatus>();

        attendanceData.forEach((record) => {
          const destId = record.destination_id;

          // Track my own attendance
          if (record.user_id === user.id) {
            myAttendanceMap.set(destId, record.status);
          }

          // Build destination attendance
          if (!attendanceMap.has(destId)) {
            attendanceMap.set(destId, {
              destination_id: destId,
              total_members: membersData?.length || 0,
              confirmed: 0,
              considering: 0,
              declined: 0,
              alternative: 0,
              attendees: [],
            });
          }

          const dest = attendanceMap.get(destId)!;
          dest.attendees.push(record);

          // Count statuses
          switch (record.status) {
            case 'confirmed':
              dest.confirmed++;
              break;
            case 'considering':
              dest.considering++;
              break;
            case 'declined':
              dest.declined++;
              break;
            case 'alternative':
              dest.alternative++;
              break;
          }
        });

        setAttendance(attendanceMap);
        setMyAttendance(myAttendanceMap);
      }
    } catch (error) {
      console.error('Error loading attendance data:', error);
    } finally {
      setLoading(false);
    }
  };

  const subscribeToChanges = () => {
    // Subscribe to attendance changes
    const attendanceSubscription = supabase
      .channel(`attendance:${tripId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_attendance',
          filter: `trip_id=eq.${tripId}`,
        },
        () => {
          // Reload data when attendance changes
          loadData();
        }
      )
      .subscribe();

    // Subscribe to member changes
    const memberSubscription = supabase
      .channel(`members:${tripId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'trip_members',
          filter: `trip_id=eq.${tripId}`,
        },
        () => {
          // Reload data when members change
          loadData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(attendanceSubscription);
      supabase.removeChannel(memberSubscription);
    };
  };

  const updateMyAttendance = async (
    destinationId: string,
    dayIndex: number,
    status: AttendanceStatus,
    notes?: string
  ) => {
    if (!userId) return;

    try {
      const { error } = await supabase
        .from('user_attendance')
        .upsert({
          trip_id: tripId,
          user_id: userId,
          destination_id: destinationId,
          day_index: dayIndex,
          status,
          notes,
          decided_at: new Date().toISOString(),
        });

      if (error) throw error;

      // Update local state optimistically
      const newMyAttendance = new Map(myAttendance);
      newMyAttendance.set(destinationId, status);
      setMyAttendance(newMyAttendance);

      // Reload full data to get updated counts
      await loadData();
    } catch (error) {
      console.error('Error updating attendance:', error);
      throw error;
    }
  };

  const createParallelActivity = async (
    dayIndex: number,
    timeStart: string,
    timeEnd: string,
    originalDestinationId: string,
    alternativeDestinationId: string
  ) => {
    if (!userId) return;

    try {
      const { data, error } = await supabase
        .from('parallel_activities')
        .insert({
          trip_id: tripId,
          day_index: dayIndex,
          time_slot_start: timeStart,
          time_slot_end: timeEnd,
          original_destination_id: originalDestinationId,
          alternative_destination_id: alternativeDestinationId,
          created_by: userId,
        })
        .select()
        .single();

      if (error) throw error;

      // Also record that this user is taking the alternative
      if (data) {
        await supabase
          .from('split_attendance')
          .insert({
            parallel_activity_id: data.id,
            user_id: userId,
            chosen_destination_id: alternativeDestinationId,
          });
      }

      return data;
    } catch (error) {
      console.error('Error creating parallel activity:', error);
      throw error;
    }
  };

  const getDestinationAttendance = (destinationId: string): DestinationAttendance | null => {
    return attendance.get(destinationId) || null;
  };

  const getMyStatus = (destinationId: string): AttendanceStatus => {
    return myAttendance.get(destinationId) || 'considering';
  };

  const getMemberAttendance = (memberId: string): Map<string, AttendanceStatus> => {
    const memberAttendance = new Map<string, AttendanceStatus>();

    attendance.forEach((dest, destId) => {
      const memberRecord = dest.attendees.find(a => a.user_id === memberId);
      if (memberRecord) {
        memberAttendance.set(destId, memberRecord.status);
      }
    });

    return memberAttendance;
  };

  const getAttendanceStats = () => {
    let totalDestinations = 0;
    let myConfirmed = 0;
    let myConsidering = 0;
    let myDeclined = 0;
    let myAlternative = 0;

    myAttendance.forEach((status) => {
      totalDestinations++;
      switch (status) {
        case 'confirmed':
          myConfirmed++;
          break;
        case 'considering':
          myConsidering++;
          break;
        case 'declined':
          myDeclined++;
          break;
        case 'alternative':
          myAlternative++;
          break;
      }
    });

    return {
      totalDestinations,
      myConfirmed,
      myConsidering,
      myDeclined,
      myAlternative,
      completionRate: totalDestinations > 0
        ? Math.round((myConfirmed / totalDestinations) * 100)
        : 0,
    };
  };

  return {
    members,
    attendance,
    myAttendance,
    loading,
    userId,
    updateMyAttendance,
    createParallelActivity,
    getDestinationAttendance,
    getMyStatus,
    getMemberAttendance,
    getAttendanceStats,
    reload: loadData,
  };
}