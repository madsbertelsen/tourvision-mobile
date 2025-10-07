import ProseMirrorViewerWrapper from '@/components/ProseMirrorViewerWrapper';
import { useMockContext } from '@/contexts/MockContext';
import { generateAPIUrl } from '@/lib/ai-sdk-config';
import { htmlToProsemirror } from '@/utils/prosemirror-html';
import { schema } from '@/utils/prosemirror-schema';
import { stateFromJSON } from '@/utils/prosemirror-transactions';
import { getTrip, saveTrip, type SavedTrip } from '@/utils/trips-storage';
import { useChat } from '@ai-sdk/react';
import { Ionicons } from '@expo/vector-icons';
import { DefaultChatTransport } from 'ai';
import { fetch as expoFetch } from 'expo/fetch';
import { EditorState } from 'prosemirror-state';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

interface TripDetailViewProps {
  tripId: string;
  initialMessage?: string;
}

type ViewMode = 'chat' | 'document';

export default function TripDetailView({ tripId, initialMessage }: TripDetailViewProps) {
  const { setFocusedLocation } = useMockContext();
  const [currentTrip, setCurrentTrip] = useState<SavedTrip | null>(null);
  const [isLoadingTrip, setIsLoadingTrip] = useState(true);
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('chat');
  const [isEditable, setIsEditable] = useState(false);
  const [editorState, setEditorState] = useState<EditorState>(() =>
    EditorState.create({ schema })
  );
  const [inputText, setInputText] = useState('');
  const initialMessageSentRef = useRef(false);

  const scrollViewRef = useRef<ScrollView>(null);

  // API URL for chat
  const apiUrl = generateAPIUrl('/api/chat-simple');

  // Initialize chat
  const chatHelpers = useChat({
    transport: new DefaultChatTransport({
      fetch: expoFetch as unknown as typeof globalThis.fetch,
      api: apiUrl,
    }),
    onError: (error) => {
      console.error('Chat error:', error);
    },
    initialMessages: currentTrip?.messages || [],
    id: tripId,
  });

  const {
    messages = [],
    setMessages,
    sendMessage,
    status = 'idle',
  } = chatHelpers;

  const isChatLoading = status === ('in_progress' as any) || status === 'loading';

  // Load trip data
  useEffect(() => {
    const loadTripData = async () => {
      try {
        setIsLoadingTrip(true);
        const trip = await getTrip(tripId);

        if (!trip) {
          console.error('Trip not found:', tripId);
          return;
        }

        setCurrentTrip(trip);

        // Load messages into chat
        if (trip.messages && trip.messages.length > 0) {
          setMessages(trip.messages);
        }

        // Load document if exists
        if (trip.itineraries && trip.itineraries.length > 0) {
          console.log('[TripDetailView] Loading document from itineraries, count:', trip.itineraries.length);
          const latestItinerary = trip.itineraries[trip.itineraries.length - 1];
          if (latestItinerary.document) {
            console.log('[TripDetailView] Latest itinerary document:', JSON.stringify(latestItinerary.document).substring(0, 200));
            const state = stateFromJSON(latestItinerary.document);
            setEditorState(state);
            console.log('[TripDetailView] EditorState loaded from itinerary');
          }
        } else {
          console.log('[TripDetailView] No itineraries found in trip');
        }
      } catch (error) {
        console.error('Error loading trip:', error);
      } finally {
        setIsLoadingTrip(false);
      }
    };

    loadTripData();
  }, [tripId]);

  // Save messages to trip
  useEffect(() => {
    const saveMessages = async () => {
      if (!currentTrip || messages.length === 0) return;

      const updatedTrip = {
        ...currentTrip,
        messages: messages,
        updatedAt: Date.now(),
      };

      await saveTrip(updatedTrip);
      setCurrentTrip(updatedTrip);
    };

    saveMessages();
  }, [messages]);

  // Sync editor state with itineraries array
  useEffect(() => {
    console.log('[TripDetailView] Sync effect triggered');
    console.log('[TripDetailView] currentTrip exists:', !!currentTrip);
    console.log('[TripDetailView] itineraries exists:', !!currentTrip?.itineraries);
    console.log('[TripDetailView] itineraries length:', currentTrip?.itineraries?.length || 0);

    if (!currentTrip?.itineraries || currentTrip.itineraries.length === 0) {
      console.log('[TripDetailView] No itineraries to sync');
      return;
    }

    const latestItinerary = currentTrip.itineraries[currentTrip.itineraries.length - 1];
    if (!latestItinerary.document) {
      console.log('[TripDetailView] Latest itinerary has no document');
      return;
    }

    console.log('[TripDetailView] Syncing editorState with latest itinerary');
    console.log('[TripDetailView] Latest itinerary document:', JSON.stringify(latestItinerary.document).substring(0, 200));
    const newState = stateFromJSON(latestItinerary.document);
    setEditorState(newState);
    console.log('[TripDetailView] EditorState synced');
  }, [currentTrip?.itineraries?.length, currentTrip]);

  // Parse and save itinerary from messages
  useEffect(() => {
    const parseItinerary = async () => {
      if (!currentTrip || messages.length === 0) return;

      // Only parse when streaming is complete
      if (isChatLoading) return;

      // Find last assistant message
      const lastAssistantMessage = messages.findLast((msg: any) => msg.role === 'assistant');
      if (!lastAssistantMessage) {
        console.log('[TripDetailView] No assistant message found');
        return;
      }

      // Check if already processed
      const existingItinerary = currentTrip.itineraries?.find(
        (it: any) => it.messageId === lastAssistantMessage.id
      );

      // If already processed and has content, skip
      if (existingItinerary) {
        const hasContent = existingItinerary.document?.content?.some(
          (node: any) => node.content && node.content.length > 0
        );
        if (hasContent) {
          console.log('[TripDetailView] Message already processed with content:', lastAssistantMessage.id);
          return;
        } else {
          console.log('[TripDetailView] Message was processed but document is empty, re-parsing');
          // Remove the empty itinerary so we can re-parse
          const filteredItineraries = currentTrip.itineraries?.filter(
            (it: any) => it.messageId !== lastAssistantMessage.id
          );
          const updatedTrip = {
            ...currentTrip,
            itineraries: filteredItineraries || [],
          };
          await saveTrip(updatedTrip);
          setCurrentTrip(updatedTrip);
        }
      }

      // Extract text content
      const textParts = lastAssistantMessage.parts?.filter((part: any) => part.type === 'text') || [];
      const textContent = textParts.map((part: any) => part.text).join('');

      console.log('[TripDetailView] Checking message for itinerary');
      console.log('[TripDetailView] Message has parts:', lastAssistantMessage.parts?.length || 0);
      console.log('[TripDetailView] Text parts count:', textParts.length);
      console.log('[TripDetailView] Text content length:', textContent.length);
      console.log('[TripDetailView] Text content preview:', textContent.substring(0, 300));

      // Check for itinerary HTML
      if (!textContent.includes('<itinerary')) {
        console.log('[TripDetailView] No itinerary HTML found in message');
        return;
      }

      console.log('[TripDetailView] Parsing itinerary from message:', lastAssistantMessage.id);
      console.log('[TripDetailView] Full text content:', textContent);

      try {
        // Parse HTML to ProseMirror
        const proseMirrorDoc = htmlToProsemirror(textContent);

        // Create new itinerary entry
        const newItinerary = {
          messageId: lastAssistantMessage.id,
          document: proseMirrorDoc,
          createdAt: Date.now(),
        };

        // Update trip with new itinerary
        const updatedItineraries = [...(currentTrip.itineraries || []), newItinerary];
        const updatedTrip = {
          ...currentTrip,
          itineraries: updatedItineraries,
        };

        console.log('[TripDetailView] Saving itinerary, total count:', updatedItineraries.length);
        console.log('[TripDetailView] Itinerary document:', JSON.stringify(proseMirrorDoc).substring(0, 200));
        await saveTrip(updatedTrip);
        setCurrentTrip(updatedTrip);

        // Update editor state
        const newState = stateFromJSON(proseMirrorDoc);
        console.log('[TripDetailView] Setting editor state from parsed itinerary');
        console.log('[TripDetailView] New state doc:', JSON.stringify(newState.doc.toJSON()).substring(0, 200));
        setEditorState(newState);

        console.log('[TripDetailView] Itinerary parsed and saved');
      } catch (error) {
        console.error('[TripDetailView] Failed to parse itinerary:', error);
      }
    };

    parseItinerary();
  }, [messages, currentTrip, isChatLoading]);

  // Handle initial message
  useEffect(() => {
    if (initialMessage && !isLoadingTrip && !initialMessageSentRef.current && currentTrip) {
      initialMessageSentRef.current = true;
      setInputText(initialMessage);
      setTimeout(() => {
        sendMessage({ content: initialMessage });
      }, 100);
    }
  }, [initialMessage, isLoadingTrip, currentTrip]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (viewMode === 'chat') {
      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [messages, viewMode]);

  const handleNodeFocus = (nodeId: string | null) => {
    setFocusedNodeId(nodeId);
  };

  const handleDocumentChange = useCallback(
    async (newDoc: any) => {
      if (!currentTrip || !currentTrip.itineraries || currentTrip.itineraries.length === 0) return;

      console.log('[TripDetailView] Document changed, persisting to storage');

      const newState = stateFromJSON(newDoc, schema);
      setEditorState(newState);

      const updatedItineraries = [...currentTrip.itineraries];
      updatedItineraries[updatedItineraries.length - 1] = {
        ...updatedItineraries[updatedItineraries.length - 1],
        document: newDoc,
      };

      const updatedTrip = {
        ...currentTrip,
        itineraries: updatedItineraries,
      };

      await saveTrip(updatedTrip);
      setCurrentTrip(updatedTrip);
    },
    [currentTrip]
  );

  const handleSendMessage = () => {
    if (!inputText.trim()) return;
    sendMessage({ content: inputText.trim() });
    setInputText('');
  };

  if (isLoadingTrip) {
    return (
      <View style={styles.container}>
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color="#3B82F6" />
          <Text style={styles.loadingText}>Loading trip...</Text>
        </View>
      </View>
    );
  }

  if (!currentTrip) {
    return (
      <View style={styles.container}>
        <View style={styles.centerContent}>
          <Ionicons name="alert-circle-outline" size={64} color="#EF4444" />
          <Text style={styles.errorText}>Trip not found</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title} numberOfLines={1}>
          {currentTrip.title}
        </Text>
        <View style={styles.headerButtons}>
          <TouchableOpacity
            style={[styles.viewModeButton, viewMode === 'chat' && styles.viewModeButtonActive]}
            onPress={() => {
              console.log('[TripDetailView] Switching to chat view');
              setViewMode('chat');
            }}
          >
            <Ionicons name="chatbubble-outline" size={20} color={viewMode === 'chat' ? '#fff' : '#6B7280'} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.viewModeButton, viewMode === 'document' && styles.viewModeButtonActive]}
            onPress={() => {
              console.log('[TripDetailView] Switching to document view');
              console.log('[TripDetailView] Current itineraries count:', currentTrip?.itineraries?.length || 0);
              console.log('[TripDetailView] Current editorState doc:', JSON.stringify(editorState.doc.toJSON()).substring(0, 200));
              setViewMode('document');
            }}
          >
            <Ionicons name="document-text-outline" size={20} color={viewMode === 'document' ? '#fff' : '#6B7280'} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Content */}
      {viewMode === 'chat' ? (
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={100}
        >
          {/* Messages */}
          <ScrollView
            ref={scrollViewRef}
            style={styles.messagesContainer}
            contentContainerStyle={styles.messagesContent}
          >
            {messages.map((message, index) => {
              // Extract text content from message parts
              const textParts = message.parts?.filter((part: any) => part.type === 'text') || [];
              const textContent = textParts.map((part: any) => part.text).join('');

              // Skip system messages
              if (message.role === 'system') return null;

              // For user messages, show plain text
              if (message.role === 'user') {
                return (
                  <View key={message.id || index} style={styles.messageWrapper}>
                    <View style={[styles.messageBubble, styles.userMessage]}>
                      <Text style={styles.userText}>{textContent}</Text>
                    </View>
                  </View>
                );
              }

              // For assistant messages, always parse HTML to ProseMirror (even during streaming)
              let prosemirrorDoc;
              try {
                // Always try to parse the HTML content
                prosemirrorDoc = htmlToProsemirror(textContent);
              } catch (error) {
                console.error('[TripDetailView] Error parsing HTML:', error);
                console.log('[TripDetailView] Content that failed:', textContent);
                // Fallback to plain paragraph
                prosemirrorDoc = {
                  type: 'doc',
                  content: [{
                    type: 'paragraph',
                    content: [{ type: 'text', text: textContent || '' }]
                  }]
                };
              }

              return (
                <View key={message.id || index} style={styles.messageWrapper}>
                  <View style={[styles.messageBubble, styles.assistantMessage]}>
                    <ProseMirrorViewerWrapper
                      content={prosemirrorDoc}
                      onNodeFocus={() => {}}
                      focusedNodeId={null}
                      height="auto"
                      editable={false}
                      onChange={() => {}}
                    />
                  </View>
                </View>
              );
            })}
          </ScrollView>

          {/* Input */}
          <View style={styles.inputContainer}>
            <TextInput
              style={styles.input}
              value={inputText}
              onChangeText={setInputText}
              placeholder="Type a message..."
              multiline
              maxLength={2000}
              editable={!isChatLoading}
              onSubmitEditing={handleSendMessage}
            />
            <TouchableOpacity
              style={[styles.sendButton, !inputText.trim() && styles.sendButtonDisabled]}
              onPress={handleSendMessage}
              disabled={!inputText.trim() || isChatLoading}
            >
              <Ionicons name="send" size={20} color="#fff" />
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      ) : (
        <View style={styles.documentContainer}>
          {/* Document toolbar */}
          <View style={styles.documentToolbar}>
            <TouchableOpacity
              style={[styles.toolbarButton, isEditable && styles.toolbarButtonActive]}
              onPress={() => setIsEditable(!isEditable)}
            >
              <Ionicons name={isEditable ? 'checkmark' : 'create-outline'} size={20} color={isEditable ? '#fff' : '#6B7280'} />
              <Text style={[styles.toolbarButtonText, isEditable && styles.toolbarButtonTextActive]}>
                {isEditable ? 'Done' : 'Edit'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Document editor */}
          <View style={{ flex: 1 }}>
            {(() => {
              const docContent = editorState.doc.toJSON();
              console.log('[TripDetailView] Rendering document view with content:', JSON.stringify(docContent).substring(0, 200));
              console.log('[TripDetailView] Document has content nodes:', docContent.content?.length || 0);
              return (
                <ProseMirrorViewerWrapper
                  content={docContent}
                  onNodeFocus={handleNodeFocus}
                  focusedNodeId={focusedNodeId}
                  height="100%"
                  editable={isEditable}
                  onChange={handleDocumentChange}
                />
              );
            })()}
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#6B7280',
  },
  errorText: {
    marginTop: 12,
    fontSize: 18,
    color: '#EF4444',
    fontWeight: '600',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  title: {
    flex: 1,
    fontSize: 20,
    fontWeight: 'bold',
    color: '#111827',
    marginRight: 12,
  },
  headerButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  viewModeButton: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  viewModeButtonActive: {
    backgroundColor: '#3B82F6',
  },
  messagesContainer: {
    flex: 1,
  },
  messagesContent: {
    padding: 16,
  },
  messageWrapper: {
    marginBottom: 12,
  },
  messageBubble: {
    padding: 12,
    borderRadius: 12,
    maxWidth: '80%',
  },
  userMessage: {
    backgroundColor: '#3B82F6',
    alignSelf: 'flex-end',
    marginLeft: '20%',
  },
  userText: {
    color: '#fff',
    fontSize: 15,
    lineHeight: 22,
  },
  assistantMessage: {
    backgroundColor: '#fff',
    alignSelf: 'flex-start',
    marginRight: '20%',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    width: '80%',
  },
  streamingText: {
    marginLeft: 8,
    fontSize: 14,
    color: '#6B7280',
    fontStyle: 'italic',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 16,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    gap: 12,
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    backgroundColor: '#F9FAFB',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    color: '#111827',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#3B82F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: '#9CA3AF',
    opacity: 0.5,
  },
  documentContainer: {
    flex: 1,
  },
  documentToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    gap: 12,
  },
  toolbarButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
    gap: 6,
  },
  toolbarButtonActive: {
    backgroundColor: '#3B82F6',
  },
  toolbarButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#6B7280',
  },
  toolbarButtonTextActive: {
    color: '#fff',
  },
});
