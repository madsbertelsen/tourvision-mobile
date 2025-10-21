import { supabase } from '@/lib/supabase/client';

export interface SharedTrip {
  id: string;
  title: string;
  description?: string;
  user_id: string;
  is_owner: boolean;
  permission: 'view' | 'edit' | 'admin';
  shared_by?: string;
  shared_by_name?: string;
  created_at: string;
  updated_at: string;
  itinerary_document?: any;
}

/**
 * Get all trips (owned and shared) from Supabase
 */
export async function getAllTrips(): Promise<SharedTrip[]> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    // Get owned trips
    const { data: ownedTrips, error: ownedError } = await supabase
      .from('trips')
      .select('*')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false });

    if (ownedError) {
      console.error('Error loading owned trips:', ownedError);
    }

    // Get shared trips
    const { data: sharedTrips, error: sharedError } = await supabase
      .from('trip_shares')
      .select(`
        *,
        trip:trips(*),
        owner:profiles!trip_shares_owner_id_fkey(full_name, email)
      `)
      .eq('shared_with_user_id', user.id)
      .not('accepted_at', 'is', null)
      .order('created_at', { ascending: false });

    if (sharedError) {
      console.error('Error loading shared trips:', sharedError);
    }

    // Combine and format results
    const allTrips: SharedTrip[] = [];

    // Add owned trips
    if (ownedTrips) {
      ownedTrips.forEach(trip => {
        allTrips.push({
          ...trip,
          is_owner: true,
          permission: 'admin' as const,
        });
      });
    }

    // Add shared trips
    if (sharedTrips) {
      sharedTrips.forEach(share => {
        if (share.trip) {
          allTrips.push({
            ...share.trip,
            is_owner: false,
            permission: share.permission,
            shared_by: share.owner_id,
            shared_by_name: share.owner?.full_name || share.owner?.email || 'Unknown',
          });
        }
      });
    }

    // Sort by updated_at descending
    allTrips.sort((a, b) => {
      const dateA = new Date(a.updated_at || a.created_at).getTime();
      const dateB = new Date(b.updated_at || b.created_at).getTime();
      return dateB - dateA;
    });

    return allTrips;
  } catch (error) {
    console.error('Error loading trips:', error);
    return [];
  }
}

/**
 * Check if user has permission to edit a trip
 */
export function canEditTrip(trip: SharedTrip): boolean {
  return trip.is_owner || trip.permission === 'edit' || trip.permission === 'admin';
}

/**
 * Check if user has permission to share a trip
 */
export function canShareTrip(trip: SharedTrip): boolean {
  return trip.is_owner || trip.permission === 'admin';
}

/**
 * Accept a trip share invitation via share code
 */
export async function acceptShareInvite(shareCode: string) {
  try {
    const { data, error } = await supabase.rpc('use_share_link', {
      p_share_code: shareCode
    });

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error accepting share invite:', error);
    throw error;
  }
}