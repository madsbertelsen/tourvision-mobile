import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase/client';

const DOCUMENTS_KEY = '@tourvision_documents';

export interface SavedDocument {
  id: string;
  title: string;
  description?: string;
  messages: any[]; // AI SDK message format
  document?: any; // Main document ProseMirror document (deprecated - use yjsState)
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
export async function getDocuments(): Promise<SavedDocument[]> {
  try {
    const tripsJson = await AsyncStorage.getItem(DOCUMENTS_KEY);
    if (!tripsJson) return [];
    return JSON.parse(tripsJson);
  } catch (error) {
    console.error('Error loading documents:', error);
    return [];
  }
}

/**
 * Get a specific document by id
 * First checks AsyncStorage, then falls back to Supabase if not found locally
 */
export async function getDocument(documentId: string): Promise<SavedDocument | null> {
  try {
    // Check local storage first
    const documents = await getDocuments();
    const localDocument = documents.find(doc => doc.id === documentId);
    if (localDocument) {
      return localDocument;
    }

    // If not found locally, try fetching from Supabase
    console.log('[getDocument] Trip not found in AsyncStorage, fetching from Supabase:', documentId);
    const { data: dbDocument, error } = await supabase
      .from('documents')
      .select('*')
      .eq('id', documentId)
      .maybeSingle();

    if (error || !dbDocument) {
      console.log('[getDocument] Trip not found in Supabase either:', error?.message);
      return null;
    }

    // Convert database document to SavedDocument format
    const savedDocument: SavedDocument = {
      id: dbDocument.id,
      title: dbDocument.title,
      description: dbDocument.description || '',
      messages: [], // Not stored in database
      locations: [], // Could be fetched from document_places table if needed
      createdAt: new Date(dbDocument.created_at).getTime(),
      updatedAt: new Date(dbDocument.updated_at).getTime(),
    };

    // Include Y.js state if available (base64 encoded binary)
    if (dbDocument.yjs_state) {
      // Convert Buffer/Uint8Array to base64 string
      if (typeof dbDocument.yjs_state === 'string') {
        savedDocument.yjsState = dbDocument.yjs_state;
      } else {
        // Convert binary to base64
        const bytes = new Uint8Array(dbDocument.yjs_state);
        savedDocument.yjsState = btoa(String.fromCharCode(...bytes));
      }
      console.log('[getDocument] Loaded Y.js state from database:', savedDocument.yjsState.length, 'characters');
    }

    // Save to AsyncStorage for future access
    await saveDocument(savedDocument);

    return savedDocument;
  } catch (error) {
    console.error('Error loading document:', error);
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
 * Create a new document (local-first, syncs to Supabase when online)
 */
export async function createDocument(title: string): Promise<SavedDocument> {
  try {
    const documents = await getDocuments();

    // Generate a proper UUID for local trip
    const documentId = generateUUID();

    const newDocument: SavedDocument = {
      id: documentId,
      title,
      description: '',
      messages: [],
      locations: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    // Save locally first (local-first approach)
    const updatedDocuments = [...documents, newDocument];
    await AsyncStorage.setItem(DOCUMENTS_KEY, JSON.stringify(updatedDocuments));

    // Try to sync to Supabase if online (non-blocking)
    syncDocumentToSupabase(newDocument).catch(err => {
      console.log('[createDocument] Offline or sync failed (will retry later):', err.message);
    });

    return newDocument;
  } catch (error) {
    console.error('Error creating document:', error);
    throw error;
  }
}

/**
 * Sync a document to Supabase database (non-blocking)
 */
async function syncDocumentToSupabase(document: SavedDocument): Promise<void> {
  try {
    // Check if user is authenticated
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      console.log('[syncDocumentToSupabase] User not authenticated, skipping sync');
      return;
    }

    // Check if document already exists in database
    const { data: existingDocument } = await supabase
      .from('documents')
      .select('id')
      .eq('id', document.id)
      .maybeSingle();

    if (existingDocument) {
      console.log('[syncDocumentToSupabase] Trip already exists in database:', document.id);
      return;
    }

    // Insert document into database
    const { error: dbError } = await supabase
      .from('documents')
      .insert({
        id: document.id, // Use the same UUID
        title: document.title,
        description: document.description || '',
        created_by: user.id,
        status: 'planning',
        is_public: false,
        created_at: new Date(document.createdAt).toISOString(),
        updated_at: new Date(document.updatedAt).toISOString(),
      });

    if (dbError) {
      throw dbError;
    }

    console.log('[syncDocumentToSupabase] Successfully synced document to database:', document.id);
  } catch (error: any) {
    // Don't throw - this is non-blocking background sync
    console.error('[syncDocumentToSupabase] Failed to sync document:', error.message);
    throw error;
  }
}

/**
 * Save/update a trip
 */
export async function saveDocument(document: SavedDocument): Promise<void> {
  try {
    // Verbose logging removed - saves happen frequently during collaboration
    const documents = await getDocuments();
    const existingIndex = documents.findIndex(d => d.id === document.id);

    const updatedDocument = {
      ...document,
      updatedAt: Date.now(),
    };

    let updatedDocuments: SavedDocument[];
    if (existingIndex >= 0) {
      updatedDocuments = [...documents];
      updatedDocuments[existingIndex] = updatedDocument;
    } else {
      updatedDocuments = [...documents, updatedDocument];
    }

    const jsonString = JSON.stringify(updatedDocuments);
    await AsyncStorage.setItem(DOCUMENTS_KEY, jsonString);

  } catch (error) {
    console.error('Error saving document:', error);
    throw error;
  }
}

/**
 * Delete a trip
 */
export async function deleteDocument(documentId: string): Promise<void> {
  try {
    const documents = await getDocuments();
    const updatedDocuments = documents.filter(d => d.id !== documentId);
    await AsyncStorage.setItem(DOCUMENTS_KEY, JSON.stringify(updatedDocuments));
  } catch (error) {
    console.error('Error deleting document:', error);
    throw error;
  }
}

/**
 * Update document title
 */
export async function updateDocumentTitle(documentId: string, title: string): Promise<void> {
  try {
    const document = await getDocument(documentId);
    if (!document) throw new Error('Document not found');

    document.title = title;
    await saveDocument(document);
  } catch (error) {
    console.error('Error updating document title:', error);
    throw error;
  }
}

/**
 * Clear all documents (for testing)
 */
export async function clearDocuments(): Promise<void> {
  try {
    await AsyncStorage.removeItem(DOCUMENTS_KEY);
  } catch (error) {
    console.error('Error clearing documents:', error);
    throw error;
  }
}
