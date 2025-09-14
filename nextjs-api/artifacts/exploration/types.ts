export interface Destination {
  id: string;
  name: string;
  coordinates: [number, number]; // [longitude, latitude]
  category: 'attraction' | 'restaurant' | 'activity' | 'accommodation' | 'shopping' | 'nature';
  description: string;
  rating?: number;
  priceLevel?: '$' | '$$' | '$$$' | '$$$$';
  imageUrl?: string;
  tags?: string[];
  estimatedDuration?: string;
  address?: string;
  openingHours?: string;
}

export interface ExplorationData {
  city: string;
  dates?: string;
  duration?: string;
  travelStyle?: string;
  companions?: string;
  destinations: Destination[];
}

export interface ExplorationPreferences {
  liked: Set<string>; // Destination IDs
  disliked: Set<string>; // Destination IDs
  categories: Set<string>; // Selected categories
}

export interface ExplorationState {
  data: ExplorationData;
  preferences: ExplorationPreferences;
  isLoading: boolean;
  activeDestination: string | null; // Currently focused destination
}