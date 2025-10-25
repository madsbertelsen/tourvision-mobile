import { supabase } from '@/lib/supabase/client';

export interface SharedDocument {
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
 * Get all documents (owned and shared) from Supabase
 */
export async function getAllDocuments(): Promise<SharedDocument[]> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    // Get owned documents
    const { data: ownedDocuments, error: ownedError } = await supabase
      .from('documents')
      .select('*')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false });

    if (ownedError) {
      console.error('Error loading owned documents:', ownedError);
    }

    // Get shared documents
    const { data: sharedDocuments, error: sharedError } = await supabase
      .from('document_shares')
      .select(`
        *,
        document:documents(*),
        owner:profiles!document_shares_owner_id_fkey(full_name, email)
      `)
      .eq('shared_with_user_id', user.id)
      .not('accepted_at', 'is', null)
      .order('created_at', { ascending: false });

    if (sharedError) {
      console.error('Error loading shared documents:', sharedError);
    }

    // Combine and format results
    const allDocuments: SharedDocument[] = [];

    // Add owned documents
    if (ownedDocuments) {
      ownedDocuments.forEach(trip => {
        allDocuments.push({
          ...trip,
          is_owner: true,
          permission: 'admin' as const,
        });
      });
    }

    // Add shared documents
    if (sharedDocuments) {
      sharedDocuments.forEach(share => {
        if (share.document) {
          allDocuments.push({
            ...share.document,
            is_owner: false,
            permission: share.permission,
            shared_by: share.owner_id,
            shared_by_name: share.owner?.full_name || share.owner?.email || 'Unknown',
          });
        }
      });
    }

    // Sort by updated_at descending
    allDocuments.sort((a, b) => {
      const dateA = new Date(a.updated_at || a.created_at).getTime();
      const dateB = new Date(b.updated_at || b.created_at).getTime();
      return dateB - dateA;
    });

    return allDocuments;
  } catch (error) {
    console.error('Error loading documents:', error);
    return [];
  }
}

/**
 * Check if user has permission to edit a document
 */
export function canEditDocument(document: SharedDocument): boolean {
  return document.is_owner || document.permission === 'edit' || document.permission === 'admin';
}

/**
 * Check if user has permission to share a document
 */
export function canShareDocument(document: SharedDocument): boolean {
  return document.is_owner || document.permission === 'admin';
}

/**
 * Accept a document share invitation via share code
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