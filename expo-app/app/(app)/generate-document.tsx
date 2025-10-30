import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { createDocument, saveDocument } from '@/utils/documents-storage';
import { supabase } from '@/lib/supabase/client';

export default function GenerateTripScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ prompt: string }>();
  const [isCreating, setIsCreating] = useState(false);
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Auto-start generation when screen loads
  useEffect(() => {
    const prompt = params.prompt;
    if (!prompt) {
      Alert.alert('Error', 'No prompt provided', [
        { text: 'OK', onPress: () => router.back() }
      ]);
      return;
    }

    createDocumentWithChat(prompt);
  }, [params.prompt]);

  const createDocumentWithChat = async (prompt: string) => {
    setIsCreating(true);
    setError(null);

    try {
      // 1. Create a new document
      console.log('[GenerateDocument] Creating new document...');
      const newDocument = await createDocument('AI Generated Trip');

      // Save the empty document first
      await saveDocument({
        ...newDocument,
        document: {
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: []
            }
          ]
        }
      });

      console.log('[GenerateDocument] Document created:', newDocument.id);
      setDocumentId(newDocument.id);

      // 2. Get current user
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        throw new Error('User not authenticated');
      }

      // 3. Insert initial chat message with the prompt
      console.log('[GenerateDocument] Inserting chat message with prompt...');
      const { data: chatMessage, error: chatError } = await supabase
        .from('document_chats')
        .insert({
          document_id: newDocument.id,
          user_id: user.id,
          role: 'user',
          content: prompt,
          metadata: {
            source: 'generate_document_screen',
            initial_prompt: true
          }
        })
        .select()
        .single();

      if (chatError) {
        throw chatError;
      }

      console.log('[GenerateDocument] Chat message created:', chatMessage.id);

      // 4. The database trigger will automatically call the edge function
      // to process this message and generate content

      // 5. Subscribe to chat updates to monitor progress
      const subscription = supabase
        .channel(`document_chats_${newDocument.id}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'document_chats',
            filter: `document_id=eq.${newDocument.id}`
          },
          (payload) => {
            console.log('[GenerateDocument] New chat message:', payload.new);
            // Check if it's an assistant message indicating completion
            if ((payload.new as any).role === 'assistant') {
              // Document generation complete, navigate to document view
              console.log('[GenerateDocument] AI response received, navigating to document...');
              router.replace(`/(app)/document/${newDocument.id}`);
            }
          }
        )
        .subscribe();

      // Wait for a reasonable time, then navigate anyway
      setTimeout(() => {
        console.log('[GenerateDocument] Timeout reached, navigating to document...');
        subscription.unsubscribe();
        router.replace(`/(app)/document/${newDocument.id}`);
      }, 30000); // 30 seconds timeout

    } catch (err) {
      console.error('[GenerateDocument] Error:', err);
      setError(err instanceof Error ? err.message : 'Failed to create document');
      Alert.alert(
        'Generation Failed',
        err instanceof Error ? err.message : 'Failed to create document',
        [
          {
            text: 'Try Again',
            onPress: () => router.back(),
          },
        ]
      );
    } finally {
      setIsCreating(false);
    }
  };

  const handleCancel = () => {
    Alert.alert(
      'Cancel Generation?',
      'Are you sure you want to cancel the document generation?',
      [
        { text: 'Keep Generating', style: 'cancel' },
        {
          text: 'Cancel',
          style: 'destructive',
          onPress: () => router.back(),
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleCancel} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#3B82F6" />
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Creating Document</Text>
        </View>
        <View style={{ width: 60 }} />
      </View>

      {/* Content */}
      <View style={styles.content}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#3B82F6" />
          <Text style={styles.statusText}>
            {isCreating ? 'Setting up your document...' : 'AI is generating your trip...'}
          </Text>
          <Text style={styles.promptText}>"{params.prompt}"</Text>
        </View>

        {documentId && (
          <View style={styles.infoContainer}>
            <Text style={styles.infoText}>
              Document created! The AI is now generating content based on your prompt.
            </Text>
            <TouchableOpacity
              style={styles.viewButton}
              onPress={() => router.replace(`/(app)/document/${documentId}`)}
            >
              <Text style={styles.viewButtonText}>View Document</Text>
              <Ionicons name="arrow-forward" size={20} color="#3B82F6" />
            </TouchableOpacity>
          </View>
        )}

        {error && (
          <View style={styles.errorContainer}>
            <Ionicons name="alert-circle" size={48} color="#EF4444" />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    backgroundColor: '#ffffff',
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    padding: 4,
  },
  backText: {
    fontSize: 17,
    color: '#3B82F6',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#111827',
  },
  content: {
    flex: 1,
    padding: 24,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginTop: 24,
    marginBottom: 12,
  },
  promptText: {
    fontSize: 16,
    color: '#6b7280',
    fontStyle: 'italic',
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  infoContainer: {
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    padding: 20,
    marginTop: 24,
  },
  infoText: {
    fontSize: 16,
    color: '#374151',
    marginBottom: 16,
    lineHeight: 24,
  },
  viewButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#ffffff',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#3B82F6',
  },
  viewButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#3B82F6',
  },
  errorContainer: {
    alignItems: 'center',
    marginTop: 48,
  },
  errorText: {
    fontSize: 16,
    color: '#EF4444',
    marginTop: 12,
    textAlign: 'center',
  },
});