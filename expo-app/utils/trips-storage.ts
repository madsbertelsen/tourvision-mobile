import AsyncStorage from '@react-native-async-storage/async-storage';

const TRIPS_KEY = '@tourvision_trips';

export interface SavedTrip {
  id: string;
  title: string;
  description?: string;
  messages: any[]; // AI SDK message format
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
  }>;
  modifications?: Array<{
    elementId: string;
    type: 'edit' | 'delete';
    originalText?: string;
    newText?: string;
    timestamp: number;
  }>;
  itinerary_document?: any; // ProseMirror document JSON (deprecated - use itineraries array)
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
 * Create a new trip
 */
export async function createTrip(title: string): Promise<SavedTrip> {
  try {
    const trips = await getTrips();

    const newTrip: SavedTrip = {
      id: `trip-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      title,
      description: '',
      messages: [],
      locations: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const updatedTrips = [...trips, newTrip];
    await AsyncStorage.setItem(TRIPS_KEY, JSON.stringify(updatedTrips));

    return newTrip;
  } catch (error) {
    console.error('Error creating trip:', error);
    throw error;
  }
}

/**
 * Save/update a trip
 */
export async function saveTrip(trip: SavedTrip): Promise<void> {
  try {
    console.log('[saveTrip] Saving trip with ID:', trip.id);
    console.log('[saveTrip] Trip has modifications:', trip.modifications?.length || 0);
    console.log('[saveTrip] Trip has itinerary_document:', !!trip.itinerary_document);
    console.log('[saveTrip] Trip has messages:', trip.messages?.length || 0);

    const trips = await getTrips();
    const existingIndex = trips.findIndex(t => t.id === trip.id);

    const updatedTrip = {
      ...trip,
      updatedAt: Date.now(),
    };

    let updatedTrips: SavedTrip[];
    if (existingIndex >= 0) {
      // Update existing trip
      console.log('[saveTrip] Updating existing trip at index:', existingIndex);
      updatedTrips = [...trips];
      updatedTrips[existingIndex] = updatedTrip;
    } else {
      // Add new trip
      console.log('[saveTrip] Adding new trip');
      updatedTrips = [...trips, updatedTrip];
    }

    const jsonString = JSON.stringify(updatedTrips);
    console.log('[saveTrip] Saving JSON length:', jsonString.length);

    await AsyncStorage.setItem(TRIPS_KEY, jsonString);

    // Verify the save
    const verification = await AsyncStorage.getItem(TRIPS_KEY);
    const verifiedTrips = JSON.parse(verification || '[]');
    const verifiedTrip = verifiedTrips.find((t: SavedTrip) => t.id === trip.id);
    console.log('[saveTrip] Verification - trip saved with modifications:', verifiedTrip?.modifications?.length || 0);

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
