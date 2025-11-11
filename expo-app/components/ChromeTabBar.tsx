import React, { useState, useEffect } from 'react';
import { View, TouchableOpacity, Text, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, usePathname } from 'expo-router';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/lib/supabase/auth-context';
import { storage } from '@/utils/storage';

export function ChromeTabBar() {
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useAuth();
  const [documentCount, setDocumentCount] = useState(0);
  const [currentDocTitle, setCurrentDocTitle] = useState('Document');

  // Extract document ID from pathname
  const currentDocId = pathname.match(/\/document\/([^\/]+)/)?.[1];

  useEffect(() => {
    loadDocumentCount();
  }, [pathname]); // Reload count when navigating between documents

  useEffect(() => {
    if (currentDocId) {
      fetchDocumentTitle(currentDocId);
    }
  }, [currentDocId]);

  const fetchDocumentTitle = async (docId: string) => {
    try {
      const stored = await storage.getItem('@tourvision_documents');
      if (stored) {
        const documents = JSON.parse(stored);
        const doc = documents.find((d: any) => d.id === docId);
        if (doc) {
          setCurrentDocTitle(doc.title || 'Untitled');
        }
      }
    } catch (error) {
      console.error('Error fetching document title:', error);
    }
  };

  const loadDocumentCount = async () => {
    try {
      const stored = await storage.getItem('@tourvision_documents');
      if (stored) {
        const documents = JSON.parse(stored);
        setDocumentCount(documents.length);
      } else {
        setDocumentCount(0);
      }
    } catch (error) {
      console.error('Error loading document count:', error);
      setDocumentCount(0);
    }
  };

  const showDocumentList = () => {
    router.push('/(app)/dashboard');
  };

  const createNewDocument = async () => {
    try {
      // Generate new document ID
      const newDocId = `doc-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

      // Create new document with empty content
      const newDocument = {
        id: newDocId,
        title: 'New Document',
        description: '',
        content: {
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: []
            }
          ]
        },
        messages: [],
        locations: [],
        createdAt: Date.now(),
        updatedAt: Date.now()
      };

      // Get existing documents from storage
      const stored = await storage.getItem('@tourvision_documents');
      const documents = stored ? JSON.parse(stored) : [];

      // Add new document to the list
      documents.push(newDocument);

      // Save back to storage
      await storage.setItem('@tourvision_documents', JSON.stringify(documents));

      // Update document count
      setDocumentCount(documents.length);

      // Navigate to the new document
      router.push(`/(app)/document/${newDocId}`);
    } catch (error) {
      console.error('Error creating new document:', error);
    }
  };

  const handleMenuPress = () => {
    if (currentDocId) {
      router.push(`/(app)/document/${currentDocId}/options?title=${encodeURIComponent(currentDocTitle)}`);
    }
  };

  return (
    <View style={styles.container}>
      {/* Navigation Section */}
      <View style={styles.navSection}>
        <TouchableOpacity style={styles.navButton} onPress={showDocumentList}>
          <Ionicons name="chevron-back" size={28} color="#9CA3AF" />
        </TouchableOpacity>

        <TouchableOpacity style={styles.navButton} onPress={showDocumentList}>
          <Ionicons name="chevron-forward" size={28} color="#9CA3AF" />
        </TouchableOpacity>
      </View>

      {/* Center Section - Document Indicator */}
      <View style={styles.centerSection}>
        <TouchableOpacity style={styles.newButton} onPress={createNewDocument}>
          <View style={styles.newButtonCircle}>
            <Ionicons name="add" size={20} color="#6B7280" />
          </View>
        </TouchableOpacity>

        <TouchableOpacity style={styles.tabIndicator} onPress={showDocumentList}>
          <View style={styles.tabBox}>
            <Text style={styles.tabCount}>{documentCount}</Text>
          </View>
        </TouchableOpacity>
      </View>

      {/* Right Section - Menu */}
      <View style={styles.rightSection}>
        <TouchableOpacity style={styles.menuButton} onPress={handleMenuPress}>
          <Ionicons name="ellipsis-horizontal" size={28} color="#9CA3AF" />
        </TouchableOpacity>
      </View>

      {/* Bottom indicator line (like Chrome) */}
      <View style={styles.bottomIndicator} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    paddingVertical: 12,
    paddingHorizontal: 16,
    ...Platform.select({
      ios: {
        paddingBottom: 28, // Account for safe area
      },
    }),
  },
  navSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  navButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerSection: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  newButton: {
    padding: 4,
  },
  newButtonCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabIndicator: {
    padding: 4,
  },
  tabBox: {
    minWidth: 52,
    height: 44,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#9CA3AF',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  tabCount: {
    fontSize: 15,
    fontWeight: '600',
    color: '#4B5563',
  },
  rightSection: {
    alignItems: 'center',
  },
  menuButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomIndicator: {
    position: 'absolute',
    bottom: 0,
    left: '40%',
    right: '40%',
    height: 4,
    backgroundColor: '#1F2937',
    borderRadius: 2,
    ...Platform.select({
      ios: {
        bottom: 8,
      },
    }),
  },
});
