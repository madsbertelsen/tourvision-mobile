import type { TestProseMirrorDOMRef } from '@/components/dom/TestProseMirrorDOM';
import TestProseMirrorDOM from '@/components/dom/TestProseMirrorDOM';
import React, { useRef, useState } from 'react';
import { ActivityIndicator, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

interface ChatMessage {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  timestamp: Date;
  proposal?: any;
}

export default function TestProseMirrorScreen() {
  const [isPreviewActive, setIsPreviewActive] = useState(false);
  const [isLoadingAI, setIsLoadingAI] = useState(false);
  const [activeProposalId, setActiveProposalId] = useState<string | null>(null);
  const [acceptedProposalIds, setAcceptedProposalIds] = useState<Set<string>>(new Set());
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [currentMessage, setCurrentMessage] = useState('create a 3-day itinerary in Copenhagen');
  const [tripTitle, setTripTitle] = useState('Copenhagen Adventure');
  const [tripDates, setTripDates] = useState('Dec 15 - Dec 18, 2024');
  const editorRef = useRef<TestProseMirrorDOMRef>(null);
  const chatScrollRef = useRef<ScrollView>(null);

  if (Platform.OS !== 'web') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Test only available on web platform</Text>
        </View>
      </SafeAreaView>
    );
  }

  // Handle suggestion from selection toolbar
  const handleSuggestionFromSelection = async (selectedText: string, suggestion: string, context: any) => {
    // Simple prompt that matches what appears in chat
    const simplePrompt = `Regarding this text: "${selectedText}"

Suggestion: ${suggestion}`;

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      sender: 'user',
      text: simplePrompt,
      timestamp: new Date(),
    };

    setChatMessages(prev => [...prev, userMessage]);
    setIsLoadingAI(true);

    // Scroll to bottom of chat
    setTimeout(() => {
      chatScrollRef.current?.scrollToEnd({ animated: true });
    }, 100);

    // Auto-submit to AI
    try {
      const currentHtml = context.documentHtml || editorRef.current?.getHTML() || '';

      // Call the API
      const apiUrl = process.env.EXPO_PUBLIC_NEXTJS_API_URL
        ? `${process.env.EXPO_PUBLIC_NEXTJS_API_URL}/api/generate-prosemirror-proposal`
        : `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/generate-prosemirror-proposal`;

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (!process.env.EXPO_PUBLIC_NEXTJS_API_URL) {
        headers['Authorization'] = `Bearer ${process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY}`;
      }

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          htmlDocument: currentHtml,
          prompt: simplePrompt  // Use the same simple prompt that appears in chat
        })
      });

      if (!response.ok) {
        throw new Error('Failed to generate proposal');
      }

      const result = await response.json();

      console.log('API Response:', {
        success: result.success,
        description: result.description,
        hasModifiedHtml: !!result.modifiedHtml,
        changes: result.changes
      });

      const aiMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        sender: 'ai',
        text: result.description || 'I\'ve updated the itinerary based on your suggestion.',
        timestamp: new Date(),
        proposal: result.modifiedHtml,
      };

      setChatMessages(prev => [...prev, aiMessage]);

      if (result.success && result.modifiedHtml) {
        editorRef.current?.showProposedChanges(result.modifiedHtml);
        setIsPreviewActive(true);
        setActiveProposalId(aiMessage.id);
      }
    } catch (error) {
      console.error('Error processing suggestion:', error);
      const errorMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        sender: 'ai',
        text: 'Sorry, I encountered an error processing your suggestion. Please try again.',
        timestamp: new Date(),
      };
      setChatMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoadingAI(false);
    }
  };

  const sendChatMessage = async () => {
    if (!currentMessage.trim()) return;

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      sender: 'user',
      text: currentMessage,
      timestamp: new Date(),
    };

    setChatMessages(prev => [...prev, userMessage]);
    setCurrentMessage('');
    setIsLoadingAI(true);

    try {
      // Get current document as HTML
      const currentHtml = editorRef.current?.getHTML() || '';

      // Check if the message is about modifying the itinerary
      const isModificationRequest = currentMessage.toLowerCase().includes('change') ||
                                    currentMessage.toLowerCase().includes('modify') ||
                                    currentMessage.toLowerCase().includes('instead') ||
                                    currentMessage.toLowerCase().includes('overnight') ||
                                    currentMessage.toLowerCase().includes('stay the night');

      // Create enhanced prompt if it's a modification request
      const promptToSend = isModificationRequest
        ? `IMPORTANT: When modifying an itinerary based on the user's request:
          1. PRESERVE existing day activities that aren't being changed
          2. Each day number must appear EXACTLY ONCE - no duplicates
          3. If adding overnight stays:
             - KEEP the day's activities, only change the evening
             - ADD Day 4 ONLY for next morning activities
          4. DO NOT add unnecessary extra days (like Day 5)
          5. DO NOT create separate sections for the same day
          6. Example: "Stay overnight in Roskilde" means:
             - Day 3 ends with overnight in Roskilde (keep Land of Legends trip)
             - Day 4 has morning activity and return to Copenhagen

          User request: ${currentMessage}`
        : currentMessage;

      // Call the API - use Next.js API if available, otherwise fall back to Supabase Edge Function
      const apiUrl = process.env.EXPO_PUBLIC_NEXTJS_API_URL
        ? `${process.env.EXPO_PUBLIC_NEXTJS_API_URL}/api/generate-prosemirror-proposal`
        : `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/generate-prosemirror-proposal`;

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      // Only add Authorization header for Supabase Edge Function
      if (!process.env.EXPO_PUBLIC_NEXTJS_API_URL) {
        headers['Authorization'] = `Bearer ${process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY}`;
      }

      const response = await fetch(apiUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            htmlDocument: currentHtml,
            prompt: promptToSend
          })
        }
      );

      if (!response.ok) {
        throw new Error('Failed to generate proposal');
      }

      const result = await response.json();

      console.log('API Response:', {
        success: result.success,
        description: result.description,
        hasModifiedHtml: !!result.modifiedHtml,
        changes: result.changes
      });

      const aiMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        sender: 'ai',
        text: result.description || 'Proposal generated',
        timestamp: new Date(),
        proposal: result.modifiedHtml,
      };

      setChatMessages(prev => [...prev, aiMessage]);

      if (result.success && result.modifiedHtml) {
        editorRef.current?.showProposedChanges(result.modifiedHtml);
        setIsPreviewActive(true);
        setActiveProposalId(aiMessage.id);
      }
    } catch (error) {
      const errorMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        sender: 'ai',
        text: `Error: ${error instanceof Error ? error.message : 'Failed to generate proposal'}`,
        timestamp: new Date(),
      };
      setChatMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoadingAI(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Navigation Header */}
      <View style={styles.navHeader}>
        <View style={styles.navContent}>
          <View>
            <Text style={styles.navTitle}>{tripTitle}</Text>
            <Text style={styles.navSubtitle}>{tripDates}</Text>
          </View>
          <TouchableOpacity style={styles.navButton}>
            <Text style={styles.navButtonText}>Share</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.mainContent}>
        <ScrollView style={styles.scrollContainer}>
        <View style={styles.editorContainer}>
          <Text style={styles.editorLabel}>ProseMirror Document Editor</Text>
          <View style={styles.editor}>
            <TestProseMirrorDOM
              ref={editorRef}
              onStateChange={() => {
                console.log('Editor state changed');
              }}
              onSuggestChange={handleSuggestionFromSelection}
            />
          </View>
        </View>
        </ScrollView>

        {/* Chat Panel */}
        <View style={styles.chatPanel}>
          <View style={styles.chatHeader}>
            <Text style={styles.chatTitle}>Chat</Text>
          </View>

          <ScrollView
            ref={chatScrollRef}
            style={styles.chatMessages}
            contentContainerStyle={styles.chatMessagesContent}
            onContentSizeChange={() => chatScrollRef.current?.scrollToEnd()}
          >
            {chatMessages.length === 0 && (
              <View style={styles.emptyChat}>
                <Text style={styles.emptyChatText}>Start a conversation about your trip...</Text>
              </View>
            )}
            {chatMessages.map((message) => (
              <View
                key={message.id}
                style={[
                  styles.chatMessage,
                  message.sender === 'user' ? styles.userMessage : styles.aiMessage
                ]}
              >
                <View style={styles.messageHeader}>
                  <View style={[styles.avatar, message.sender === 'ai' && styles.aiAvatar]}>
                    <Text style={styles.avatarText}>
                      {message.sender === 'user' ? 'U' : 'AI'}
                    </Text>
                  </View>
                  <Text style={styles.senderName}>
                    {message.sender === 'user' ? 'You' : 'AI Assistant'}
                  </Text>
                  <Text style={styles.timestamp}>
                    {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                </View>
                {message.text.includes('Regarding this text:') ? (
                  <View>
                    <Text style={[styles.messageText, { fontStyle: 'italic', color: '#6B7280', marginBottom: 4 }]}>
                      {message.text.split('\n\n')[0]}
                    </Text>
                    <Text style={styles.messageText}>
                      {message.text.split('\n\n')[1]}
                    </Text>
                  </View>
                ) : (
                  <Text style={styles.messageText}>{message.text}</Text>
                )}
                {message.proposal && (
                  <View style={styles.proposalActionsContainer}>
                    <TouchableOpacity
                      style={styles.showProposalButton}
                      onPress={() => {
                        if (editorRef.current && message.proposal) {
                          editorRef.current.showProposedChanges(message.proposal);
                          setIsPreviewActive(true);
                          setActiveProposalId(message.id);
                        }
                      }}
                    >
                      <Text style={styles.showProposalButtonText}>👁 Show Changes in Document</Text>
                    </TouchableOpacity>

                    {isPreviewActive && activeProposalId === message.id && !acceptedProposalIds.has(message.id) && (
                      <View style={styles.proposalActions}>
                        <TouchableOpacity
                          style={[styles.chatActionButton, styles.acceptButton]}
                          onPress={() => {
                            editorRef.current?.acceptProposedChanges();
                            setIsPreviewActive(false);
                            setActiveProposalId(null);
                            setAcceptedProposalIds(prev => new Set(prev).add(message.id));
                          }}
                        >
                          <Text style={styles.chatActionButtonText}>✓ Accept</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.chatActionButton, styles.rejectButton]}
                          onPress={() => {
                            editorRef.current?.rejectProposedChanges();
                            setIsPreviewActive(false);
                            setActiveProposalId(null);
                          }}
                        >
                          <Text style={styles.chatActionButtonText}>✗ Reject</Text>
                        </TouchableOpacity>
                      </View>
                    )}

                    {isPreviewActive && activeProposalId === message.id && (
                      <View style={styles.legendContainer}>
                        <View style={styles.legendItem}>
                          <View style={[styles.legendColor, { backgroundColor: '#10b981' }]} />
                          <Text style={styles.legendText}>Added</Text>
                        </View>
                        <View style={styles.legendItem}>
                          <View style={[styles.legendColor, { backgroundColor: '#ef4444' }]} />
                          <Text style={styles.legendText}>Deleted</Text>
                        </View>
                        <View style={styles.legendItem}>
                          <View style={[styles.legendColor, { backgroundColor: '#fbbf24' }]} />
                          <Text style={styles.legendText}>Modified</Text>
                        </View>
                      </View>
                    )}
                  </View>
                )}
              </View>
            ))}
          </ScrollView>

          <View>
            <View style={styles.chatInputContainer}>
              <TextInput
                style={styles.chatInput}
                value={currentMessage}
                onChangeText={setCurrentMessage}
                placeholder="Type a message..."
                placeholderTextColor="#999"
                multiline
                editable={!isLoadingAI}
                onSubmitEditing={sendChatMessage}
              />
              <TouchableOpacity
                style={[styles.sendButton, (!currentMessage.trim() || isLoadingAI) && styles.sendButtonDisabled]}
                onPress={sendChatMessage}
                disabled={!currentMessage.trim() || isLoadingAI}
              >
                {isLoadingAI ? (
                  <ActivityIndicator size="small" color="white" />
                ) : (
                  <Text style={styles.sendButtonText}>➤</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f3f4f6',
  },
  navHeader: {
    backgroundColor: '#1f2937',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#374151',
  },
  navContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  navTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: 'white',
  },
  navSubtitle: {
    fontSize: 14,
    color: '#9ca3af',
    marginTop: 2,
  },
  navButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#3b82f6',
    borderRadius: 6,
  },
  navButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '500',
  },
  mainContent: {
    flex: 1,
    flexDirection: 'row',
  },
  scrollContainer: {
    flex: 2,
    backgroundColor: 'transparent',
  },
  proposalHeader: {
    marginBottom: 16,
  },
  proposalTitle: {
    fontSize: 18,
    fontWeight: '500',
    color: '#1f2937',
    marginBottom: 4,
  },
  proposalDescription: {
    fontSize: 14,
    color: '#6b7280',
  },
  aiInputContainer: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  aiInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    color: '#111827',
  },
  aiButton: {
    backgroundColor: '#3b82f6',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 80,
  },
  aiButtonDisabled: {
    backgroundColor: '#9ca3af',
  },
  aiButtonText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 14,
  },
  errorContainer: {
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
    borderRadius: 6,
    padding: 12,
    marginBottom: 16,
  },
  errorText: {
    color: '#dc2626',
    fontSize: 14,
  },
  divider: {
    height: 1,
    backgroundColor: '#e5e7eb',
    marginVertical: 16,
  },
  previewButton: {
    backgroundColor: '#f3f4f6',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 6,
    alignItems: 'center',
    marginBottom: 12,
  },
  previewButtonActive: {
    backgroundColor: '#10b981',
  },
  previewButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  legendContainer: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  legendColor: {
    width: 12,
    height: 12,
    borderRadius: 2,
  },
  legendText: {
    fontSize: 11,
    color: '#6b7280',
  },
  editorContainer: {
    margin: 20,
  },
  editorLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 12,
  },
  editor: {
    borderRadius: 8,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
    minHeight: 400,
  },
  acceptButton: {
    backgroundColor: '#10b981',
  },
  rejectButton: {
    backgroundColor: '#ef4444',
  },
  chatPanel: {
    flex: 1,
    backgroundColor: 'white',
    borderLeftWidth: 1,
    borderLeftColor: '#e5e7eb',
    maxWidth: 400,
    minWidth: 300,
  },
  chatHeader: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  chatTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
  },
  chatMessages: {
    flex: 1,
  },
  chatMessagesContent: {
    padding: 16,
  },
  emptyChat: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyChatText: {
    color: '#9ca3af',
    fontSize: 14,
  },
  chatMessage: {
    marginBottom: 16,
  },
  messageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#3b82f6',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  aiAvatar: {
    backgroundColor: '#8b5cf6',
  },
  avatarText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '600',
  },
  senderName: {
    fontWeight: '600',
    color: '#111827',
    marginRight: 8,
  },
  timestamp: {
    fontSize: 12,
    color: '#9ca3af',
    marginLeft: 'auto',
  },
  messageText: {
    color: '#4b5563',
    fontSize: 14,
    lineHeight: 20,
    marginLeft: 40,
  },
  userMessage: {
    // Additional styling for user messages if needed
  },
  aiMessage: {
    // Additional styling for AI messages if needed
  },
  proposalActionsContainer: {
    marginLeft: 40,
    marginTop: 8,
  },
  showProposalButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: '#f3f4f6',
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  showProposalButtonText: {
    fontSize: 13,
    color: '#4b5563',
    fontWeight: '500',
  },
  proposalActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  chatActionButton: {
    paddingVertical: 6,
    paddingHorizontal: 16,
    borderRadius: 6,
    minWidth: 80,
  },
  chatActionButtonText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 13,
  },
  chatInputContainer: {
    flexDirection: 'row',
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    alignItems: 'flex-end',
  },
  chatInput: {
    flex: 1,
    minHeight: 40,
    maxHeight: 100,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 14,
    color: '#111827',
    marginRight: 8,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#3b82f6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: '#9ca3af',
  },
  sendButtonText: {
    color: 'white',
    fontSize: 20,
    fontWeight: '600',
  },
});