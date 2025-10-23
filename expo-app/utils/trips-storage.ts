import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase/client';

const TRIPS_KEY = '@tourvision_trips';

export interface SavedTrip {
  id: string;
  title: string;
  description?: string;
  messages: any[]; // AI SDK message format
  document?: any; // Main trip ProseMirror document (deprecated - use yjsState)
  yjsState?: string; // Y.js binary state encoded as base64 (local-first CRDT state)
  locations: Array<{
    id: string;
    name: string;
    lat: number;
    lng: number;
    description?: string;
    photoName?: string;
    colorIndex?: number;
    geoId?: string; // Unique ID for this location
    transportFrom?: string; // ID of origin location
    transportProfile?: 'walking' | 'driving' | 'cycling' | 'transit'; // Transportation mode
    document?: any; // General location notes (shared across all references)
  }>;
  modifications?: Array<{
    elementId: string;
    type: 'edit' | 'delete';
    originalText?: string;
    newText?: string;
    timestamp: number;
  }>;
  itineraries?: Array<{
    messageId: string; // ID of the message that generated this itinerary
    document: any; // ProseMirror document JSON
    createdAt: number;
  }>;
  createdAt: number;
  updatedAt: number;
}

/**
 * Get all saved trips
 */
export async function getTrips(): Promise<SavedTrip[]> {
  try {
    const tripsJson = await AsyncStorage.getItem(TRIPS_KEY);
    if (!tripsJson) return [];
    return JSON.parse(tripsJson);
  } catch (error) {
    console.error('Error loading trips:', error);
    return [];
  }
}

/**
 * Get a specific trip by id
 */
export async function getTrip(tripId: string): Promise<SavedTrip | null> {
  try {
    const trips = await getTrips();
    return trips.find(trip => trip.id === tripId) || null;
  } catch (error) {
    console.error('Error loading trip:', error);
    return null;
  }
}

/**
 * Generate a UUID v4
 */
function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * Create a new trip (local-first, syncs to Supabase when online)
 */
export async function createTrip(title: string): Promise<SavedTrip> {
  try {
    const trips = await getTrips();

    // Generate a proper UUID for local trip
    const tripId = generateUUID();

    const newTrip: SavedTrip = {
      id: tripId,
      title,
      description: '',
      messages: [],
      locations: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    // Save locally first (local-first approach)
    const updatedTrips = [...trips, newTrip];
    await AsyncStorage.setItem(TRIPS_KEY, JSON.stringify(updatedTrips));

    // Try to sync to Supabase if online (non-blocking)
    syncTripToSupabase(newTrip).catch(err => {
      console.log('[createTrip] Offline or sync failed (will retry later):', err.message);
    });

    return newTrip;
  } catch (error) {
    console.error('Error creating trip:', error);
    throw error;
  }
}

/**
 * Sync a trip to Supabase database (non-blocking)
 */
async function syncTripToSupabase(trip: SavedTrip): Promise<void> {
  try {
    // Check if user is authenticated
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      console.log('[syncTripToSupabase] User not authenticated, skipping sync');
      return;
    }

    // Check if trip already exists in database
    const { data: existingTrip } = await supabase
      .from('trips')
      .select('id')
      .eq('id', trip.id)
      .maybeSingle();

    if (existingTrip) {
      console.log('[syncTripToSupabase] Trip already exists in database:', trip.id);
      return;
    }

    // Insert trip into database
    const { error: dbError } = await supabase
      .from('trips')
      .insert({
        id: trip.id, // Use the same UUID
        title: trip.title,
        description: trip.description || '',
        created_by: user.id,
        status: 'planning',
        is_public: false,
        created_at: new Date(trip.createdAt).toISOString(),
        updated_at: new Date(trip.updatedAt).toISOString(),
      });

    if (dbError) {
      throw dbError;
    }

    console.log('[syncTripToSupabase] Successfully synced trip to database:', trip.id);
  } catch (error: any) {
    // Don't throw - this is non-blocking background sync
    console.error('[syncTripToSupabase] Failed to sync trip:', error.message);
    throw error;
  }
}

/**
 * Save/update a trip
 */
export async function saveTrip(trip: SavedTrip): Promise<void> {
  try {
    // Verbose logging removed - saves happen frequently during collaboration
    const trips = await getTrips();
    const existingIndex = trips.findIndex(t => t.id === trip.id);

    const updatedTrip = {
      ...trip,
      updatedAt: Date.now(),
    };

    let updatedTrips: SavedTrip[];
    if (existingIndex >= 0) {
      updatedTrips = [...trips];
      updatedTrips[existingIndex] = updatedTrip;
    } else {
      updatedTrips = [...trips, updatedTrip];
    }

    const jsonString = JSON.stringify(updatedTrips);
    await AsyncStorage.setItem(TRIPS_KEY, jsonString);

  } catch (error) {
    console.error('Error saving trip:', error);
    throw error;
  }
}

/**
 * Delete a trip
 */
export async function deleteTrip(tripId: string): Promise<void> {
  try {
    const trips = await getTrips();
    const updatedTrips = trips.filter(t => t.id !== tripId);
    await AsyncStorage.setItem(TRIPS_KEY, JSON.stringify(updatedTrips));
  } catch (error) {
    console.error('Error deleting trip:', error);
    throw error;
  }
}

/**
 * Update trip title
 */
export async function updateTripTitle(tripId: string, title: string): Promise<void> {
  try {
    const trip = await getTrip(tripId);
    if (!trip) throw new Error('Trip not found');

    trip.title = title;
    await saveTrip(trip);
  } catch (error) {
    console.error('Error updating trip title:', error);
    throw error;
  }
}

/**
 * Clear all trips (for testing)
 */
export async function clearTrips(): Promise<void> {
  try {
    await AsyncStorage.removeItem(TRIPS_KEY);
  } catch (error) {
    console.error('Error clearing trips:', error);
    throw error;
  }
}
