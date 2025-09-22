import { DocumentMapWrapper } from '@/components/DocumentMapWrapper';
import { ItineraryDocumentEditor } from '@/components/ItineraryDocumentEditor';
import { ProposalInline } from '@/components/ProposalInline';
import { useAIAssistant } from '@/hooks/useAIAssistant';
import { useResponsive } from '@/hooks/useResponsive';
import { useTripChat } from '@/hooks/useTripChat';
import { useTrip } from '@/hooks/useTrips';
import { useAuth } from '@/lib/supabase/auth-context';
import { supabase } from '@/lib/supabase/client';
import { useDocumentProposal } from '@/hooks/useDocumentProposal';
import { prosemirrorToHTML, htmlToProsemirror } from '@/utils/prosemirror-html';
import { Feather } from '@expo/vector-icons';
import { JSONContent } from '@tiptap/react';
import { useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

export default function TripDocumentView() {
  const { id } = useLocalSearchParams();
  const { data: trip, isLoading, error, refetch } = useTrip(id as string);
  // Enable editing in the document
  const isEditing = true;
  const [isSaving, setIsSaving] = useState(false);
  const [chatMessage, setChatMessage] = useState('');
  const responsive = useResponsive();
  const { user } = useAuth();

  // State for tracking active diff preview
  const [activeDiffProposalId, setActiveDiffProposalId] = useState<string | null>(null);
  const editorRef = useRef<any>(null);

  // Chat functionality
  const { messages, sendMessage, isSending } = useTripChat(id as string);
  const chatScrollRef = useRef<ScrollView>(null);

  // Selected text for context
  const [selectedTextContext, setSelectedTextContext] = useState<string>('');

  // AI Assistant
  const {
    pendingProposals,
    proposals,
    voteProposal,
    applyProposal,
    getUserVote,
    isVoting,
    isApplying,
  } = useAIAssistant(id as string);

  // Document proposal generation
  const { generateProposal, saveProposalToDatabase, isGenerating: isGeneratingProposal } = useDocumentProposal();

  // Collaboration panel tabs
  const [activeTab, setActiveTab] = useState<'chat' | 'suggestions'>('chat');

  // Map view state
  const [showMap, setShowMap] = useState(true);
  const [documentLocations, setDocumentLocations] = useState<Array<{
    latitude: number;
    longitude: number;
    placeName: string;
    address?: string;
  }>>([]);

  console.log('Document View - Trip ID:', id);
  console.log('Document View - Trip Data:', trip);
  console.log('Document View - Loading:', isLoading);
  console.log('Document View - Error:', error);

  // Extract locations from document content
  const extractLocationsFromDocument = useCallback((content: JSONContent) => {
    const locations: Array<{
      latitude: number;
      longitude: number;
      placeName: string;
      address?: string;
    }> = [];

    const traverse = (node: any) => {
      // Check for location marks
      if (node.marks) {
        node.marks.forEach((mark: any) => {
          if (mark.type === 'location' && mark.attrs) {
            const { latitude, longitude, placeName, address } = mark.attrs;
            if (latitude && longitude && placeName) {
              // Check if location already exists
              const exists = locations.some(
                loc => loc.latitude === latitude && loc.longitude === longitude
              );
              if (!exists) {
                locations.push({ latitude, longitude, placeName, address });
              }
            }
          }
        });
      }

      // Traverse children
      if (node.content) {
        node.content.forEach(traverse);
      }
    };

    if (content && content.content) {
      content.content.forEach(traverse);
    }

    return locations;
  }, []);

  // Auto-save functionality with debouncing
  const saveTimeoutRef = useRef<NodeJS.Timeout>();

  const handleSave = useCallback(async (content: JSONContent) => {
    // Extract locations when document changes
    const locations = extractLocationsFromDocument(content);
    setDocumentLocations(locations);
    // Clear any existing timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    // Set a new timeout to save after 1 second of inactivity
    saveTimeoutRef.current = setTimeout(async () => {
      setIsSaving(true);
      try {
        const { error: saveError } = await supabase
          .from('trips')
          .update({ itinerary_document: content })
          .eq('id', id);

        if (saveError) {
          console.error('Error saving document:', saveError);
        } else {
          console.log('Document saved successfully');
        }
      } catch (err) {
        console.error('Error saving document:', err);
      } finally {
        setIsSaving(false);
      }
    }, 1000); // Save after 1 second of no changes
  }, [id, extractLocationsFromDocument]);

  // Extract locations from initial document content
  useEffect(() => {
    if (trip?.itinerary_document) {
      const locations = extractLocationsFromDocument(trip.itinerary_document as JSONContent);
      setDocumentLocations(locations);
    }
  }, [trip?.itinerary_document, extractLocationsFromDocument]);

  // Listen for messages from the editor
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'open-chat-with-context') {
        const selectedText = event.data.text;
        if (selectedText) {
          // Set the selected text as context
          setSelectedTextContext(selectedText);
          // Switch to chat tab
          setActiveTab('chat');
          // Pre-fill the chat input with a prompt
          setChatMessage(`What can you tell me about: "${selectedText}"?`);
          // Focus on the chat input
          setTimeout(() => {
            const chatInput = document.querySelector('[placeholder="Type a message..."]') as HTMLTextAreaElement;
            if (chatInput) {
              chatInput.focus();
            }
          }, 100);
        }
      }
    };

    if (Platform.OS === 'web') {
      window.addEventListener('message', handleMessage);
      return () => window.removeEventListener('message', handleMessage);
    }
  }, []);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  // Check if message is requesting a document change
  const isDocumentChangeRequest = (message: string): boolean => {
    const changePatterns = [
      /add\s+(.*?)\s+to\s+/i,
      /let'?s add/i,
      /add a visit to/i,
      /include\s+(.*?)\s+in/i,
      /remove\s+(.*?)\s+from/i,
      /change\s+(.*?)\s+to/i,
      /replace\s+(.*?)\s+with/i,
      /update\s+(.*?)\s+section/i,
      /modify\s+/i,
      /insert\s+/i,
      /delete\s+/i,
      /move\s+(.*?)\s+to/i,
      /reorganize\s+/i
    ];

    return changePatterns.some(pattern => pattern.test(message));
  };

  // Handle sending messages
  const handleSendMessage = useCallback(async () => {
    if (chatMessage.trim() && !isSending) {
      let messageToSend = chatMessage.trim();

      // If there's selected text context, add it to the message
      if (selectedTextContext) {
        messageToSend = `Regarding this text: "${selectedTextContext}"\n\n${messageToSend}`;
        setSelectedTextContext(''); // Clear context after sending
      }

      // Send the message first
      const sentMessage = await sendMessage(messageToSend);
      setChatMessage('');

      // Check if this is a document change request
      if (isDocumentChangeRequest(messageToSend) && trip?.itinerary_document) {
        try {
          // Convert current document to HTML
          const currentHtml = prosemirrorToHTML(trip.itinerary_document as JSONContent);

          // Generate proposal using the new Edge Function
          const proposalResult = await generateProposal(currentHtml, messageToSend);

          if (proposalResult && proposalResult.success && user) {
            // Save the proposal to the database
            await saveProposalToDatabase(
              id as string,
              user.id,
              sentMessage?.id || null,
              proposalResult,
              currentHtml
            );

            console.log('[TripDocument] Proposal generated and saved successfully');
          }
        } catch (err) {
          console.error('[TripDocument] Error generating proposal:', err);
        }
      }
    }
  }, [chatMessage, sendMessage, isSending, selectedTextContext, trip, generateProposal, saveProposalToDatabase, user, id]);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    if (chatScrollRef.current && messages?.length) {
      setTimeout(() => {
        chatScrollRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [messages?.length]);

  // Helper to get user initials
  const getUserInitials = (name?: string | null, email?: string) => {
    if (name) {
      return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    }
    return email?.slice(0, 2).toUpperCase() || '??';
  };

  // Format time
  const formatMessageTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`;
    if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    const mins = Math.floor(diff / (1000 * 60));
    if (mins > 0) return `${mins} min${mins > 1 ? 's' : ''} ago`;
    return 'Just now';
  };

  // Handle diff preview
  const handlePreviewDiff = useCallback((proposalId: string) => {
    console.log('\n=== Document - handlePreviewDiff START ===');
    console.log('Document - proposalId:', proposalId);
    console.log('Document - proposals available:', proposals?.length || 0);

    const proposal = proposals?.find(p => p.id === proposalId);
    console.log('Document - Found proposal:', !!proposal);
    console.log('Document - Proposal diff_decorations:', proposal?.diff_decorations);

    if (!proposal) {
      console.log('Document - ERROR: Proposal not found!');
      return;
    }

    if (!editorRef.current) {
      console.log('Document - ERROR: EditorRef not available!');
      return;
    }

    if (!trip?.itinerary_document) {
      console.log('Document - ERROR: No itinerary document available!');
      return;
    }

    if (activeDiffProposalId === proposalId) {
      // Toggle off if clicking the same proposal
      console.log('Document - CLEARING diff decorations (toggle off)');
      setActiveDiffProposalId(null);

      // Restore original content
      if (editorRef.current?.restoreOriginalContent) {
        console.log('Document - Restoring original content');
        editorRef.current.restoreOriginalContent();
      } else if (editorRef.current?.clearDiffDecorations) {
        console.log('Document - Calling clearDiffDecorations()');
        editorRef.current.clearDiffDecorations();
      }
    } else {
      // Show diff for this proposal
      console.log('Document - Showing diff for proposal');
      setActiveDiffProposalId(proposalId);

      // Check if we have HTML-based proposal
      if (proposal.proposed_content?.html) {
        console.log('Document - Using HTML-based proposal');

        // Convert the modified HTML back to ProseMirror format
        const modifiedDoc = htmlToProsemirror(proposal.proposed_content.html);

        // Show the proposed content with the current content for comparison
        if (editorRef.current?.showProposedContent) {
          editorRef.current.showProposedContent(
            modifiedDoc,
            trip.itinerary_document as JSONContent
          );
        }

        // Skip diff decorations for now to avoid position errors
        // The proposed content is already being shown by showProposedContent
        console.log('Document - Skipping diff decorations for HTML-based proposal');
      } else if (proposal.transaction_steps && Array.isArray(proposal.transaction_steps) && proposal.transaction_steps.length > 0) {
        // Legacy transaction steps method
        console.log('Document - Using transaction steps from proposal:', proposal.transaction_steps);

        if (editorRef.current?.applyTransactionSteps) {
          // Apply the actual transaction steps to transform the document
          const inverseSteps = proposal.inverse_steps;
          const success = editorRef.current.applyTransactionSteps(
            proposal.transaction_steps,
            inverseSteps
          );
          console.log('Document - Applied transaction steps:', success);
        }
      }
      // For HTML-based proposals, show the proposed content directly
      else if (proposal.proposed_content) {
        console.log('Document - Using proposed_content for preview');

        if (editorRef.current?.showProposedContent) {
          // Show the proposed content (which is the modified HTML/document)
          editorRef.current.showProposedContent(
            proposal.proposed_content,
            proposal.current_content || trip.itinerary_document
          );
        }
      } else if (proposal.diff_decorations && Array.isArray(proposal.diff_decorations)) {
        console.log('Document - Using diff decorations from proposal (legacy):', proposal.diff_decorations);

        if (editorRef.current?.setDiffDecorations) {
          // Legacy path for old diff decorations
          editorRef.current.setDiffDecorations(proposal.diff_decorations);
        }
      } else {
        console.log('Document - WARNING: No suitable content found in proposal for preview');
      }
    }
  }, [activeDiffProposalId, proposals, trip]);

  // Helper function to calculate document size
  const calculateDocumentSize = (doc: JSONContent): number => {
    if (!doc) return 2;
    let size = 2;
    if (doc.content && Array.isArray(doc.content)) {
      for (const node of doc.content) {
        size += calculateNodeSize(node);
      }
    }
    return size;
  };

  const calculateNodeSize = (node: any): number => {
    if (!node) return 0;
    if (node.type === 'text') return node.text?.length || 0;
    let size = 2;
    if (node.content && Array.isArray(node.content)) {
      for (const child of node.content) {
        size += calculateNodeSize(child);
      }
    }
    return size;
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#3B82F6" />
        <Text style={styles.loadingText}>Loading document...</Text>
      </View>
    );
  }

  if (error || !trip) {
    return (
      <View style={styles.errorContainer}>
        <Feather name="file-text" size={48} color="#9CA3AF" />
        <Text style={styles.errorText}>Unable to load trip document</Text>
        {error && <Text style={styles.errorSubtext}>{error.message || 'Failed to load trip'}</Text>}
        {!trip && !error && <Text style={styles.errorSubtext}>Trip not found (ID: {id})</Text>}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Main Content Area */}
      <View style={styles.mainContent}>
        {/* Document Section */}
        <View style={[styles.documentSection, responsive.isDesktop && styles.documentSectionDesktop]}>
          {/* Document Toolbar */}
          <View style={styles.toolbar}>
        <View style={styles.toolbarLeft}>
          <View style={styles.toolButton}>
            <Feather name="cpu" size={18} color="#8B5CF6" />
            <Text style={styles.toolButtonText}>AI-Assisted Document</Text>
          </View>
          <TouchableOpacity
            style={[styles.toolButton, showMap && styles.toolButtonActive]}
            onPress={() => setShowMap(!showMap)}
          >
            <Feather name="map" size={18} color={showMap ? "#3B82F6" : "#6B7280"} />
            <Text style={[styles.toolButtonText, showMap && styles.toolButtonTextActive]}>Map View</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.toolbarRight}>
          {isSaving && (
            <View style={styles.savingIndicator}>
              <ActivityIndicator size="small" color="#3B82F6" />
              <Text style={styles.savingText}>Saving...</Text>
            </View>
          )}
          <TouchableOpacity style={styles.toolButton}>
            <Feather name="share-2" size={18} color="#6B7280" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.toolButton}>
            <Feather name="download" size={18} color="#6B7280" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Document Content Area */}
      <ScrollView
        style={styles.documentScrollView}
        contentContainerStyle={styles.documentScrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={[
          styles.documentPaper,
          responsive.isDesktop && styles.documentPaperDesktop
        ]}>
          {/* Document Title */}
          <View style={styles.documentHeader}>
            <Text style={styles.documentTitle}>{trip.title}</Text>
            {trip.description && (
              <Text style={styles.documentSubtitle}>{trip.description}</Text>
            )}
            <View style={styles.documentMeta}>
              <View style={styles.metaItem}>
                <Feather name="calendar" size={14} color="#6B7280" />
                <Text style={styles.metaText}>
                  {trip.start_date ? new Date(trip.start_date).toLocaleDateString() : 'Not set'}
                  {trip.end_date && ` - ${new Date(trip.end_date).toLocaleDateString()}`}
                </Text>
              </View>
              <View style={styles.metaItem}>
                <Feather name="users" size={14} color="#6B7280" />
                <Text style={styles.metaText}>3 travelers</Text>
              </View>
            </View>
          </View>

          {/* Divider */}
          <View style={styles.documentDivider} />

          {/* Map View */}
          {showMap && documentLocations.length > 0 && (
            <View style={styles.mapContainer}>
              <DocumentMapWrapper
                locations={documentLocations}
                height={300}
              />
            </View>
          )}

          {/* TipTap Editor - Now editable with bubble menu */}
          <ItineraryDocumentEditor
            ref={editorRef}
            trip={trip}
            editable={isEditing}
            onSave={handleSave}
          />
        </View>
      </ScrollView>
        </View>

        {/* Collaboration Panel - Desktop Only */}
        {responsive.isDesktop && (
          <View style={styles.collaborationPanel}>
            <View style={styles.collaborationHeader}>
              <Text style={styles.collaborationTitle}>Collaboration</Text>
              <View style={styles.collaborationTabs}>
                <TouchableOpacity
                  style={[styles.tabButton, activeTab === 'chat' && styles.tabButtonActive]}
                  onPress={() => setActiveTab('chat')}
                >
                  <Feather name="message-circle" size={16} color={activeTab === 'chat' ? '#3B82F6' : '#6B7280'} />
                  <Text style={[styles.tabButtonText, activeTab === 'chat' && styles.tabButtonTextActive]}>Chat</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.tabButton, activeTab === 'suggestions' && styles.tabButtonActive]}
                  onPress={() => setActiveTab('suggestions')}
                >
                  <Feather name="cpu" size={16} color={activeTab === 'suggestions' ? '#3B82F6' : '#6B7280'} />
                  <Text style={[styles.tabButtonText, activeTab === 'suggestions' && styles.tabButtonTextActive]}>AI</Text>
                  {pendingProposals?.length > 0 && (
                    <View style={styles.tabBadge}>
                      <Text style={styles.tabBadgeText}>{pendingProposals.length}</Text>
                    </View>
                  )}
                </TouchableOpacity>
              </View>
            </View>

            {/* Active Collaborators */}
            <View style={styles.collaborationSection}>
              <Text style={styles.sectionTitle}>Active Now</Text>
              <View style={styles.collaboratorsList}>
                <View style={styles.collaboratorItem}>
                  <View style={[styles.collaboratorAvatar, { backgroundColor: '#3B82F6' }]}>
                    <Text style={styles.collaboratorInitial}>M</Text>
                  </View>
                  <View style={styles.collaboratorInfo}>
                    <Text style={styles.collaboratorName}>You</Text>
                    <Text style={styles.collaboratorStatus}>Editing</Text>
                  </View>
                  <View style={[styles.statusDot, { backgroundColor: '#10B981' }]} />
                </View>
              </View>
            </View>

            {/* Tab Content */}
            {activeTab === 'chat' ? (
              <>
                {/* Chat Messages */}
                <View style={[styles.collaborationSection, { flex: 1 }]}>
              <Text style={styles.sectionTitle}>Chat</Text>
              <ScrollView
                ref={chatScrollRef}
                style={styles.messagesContainer}
                showsVerticalScrollIndicator={false}
              >
                {messages && messages.length > 0 ? (
                  messages.map((msg) => {
                    const isOwnMessage = msg.user_id === user?.id;
                    const isAISuggestion = msg.metadata?.type === 'ai_proposal' || msg.metadata?.type === 'ai_suggestion' || msg.user?.email === 'ai@tourvision.app';
                    const userColor = isAISuggestion ? '#8B5CF6' : (isOwnMessage ? '#3B82F6' : '#8B5CF6');

                    return (
                      <View key={msg.id} style={styles.messageItem}>
                        <View style={[styles.messageAvatar, { backgroundColor: userColor }]}>
                          <Text style={styles.messageInitial}>
                            {isAISuggestion ? 'AI' : getUserInitials(msg.user?.full_name, msg.user?.email)}
                          </Text>
                        </View>
                        <View style={styles.messageContent}>
                          <View style={styles.messageHeader}>
                            <Text style={styles.messageAuthor}>
                              {isAISuggestion ? 'AI Assistant' : (isOwnMessage ? 'You' : msg.user?.full_name || msg.user?.email?.split('@')[0] || 'Unknown')}
                            </Text>
                            <Text style={styles.messageTime}>{formatMessageTime(msg.created_at)}</Text>
                          </View>
                          {isAISuggestion ? (
                            <ProposalInline
                              proposal={(() => {
                                // Find the actual proposal from the proposals array using the proposal_id from metadata
                                const proposalId = msg.metadata?.proposal_id || msg.metadata?.suggestion_id;
                                const actualProposal = proposalId ? proposals?.find(p => p.id === proposalId) : null;

                                // Return the actual proposal if found, otherwise create a fallback
                                return actualProposal || {
                                  id: proposalId || msg.id,
                                  title: 'Proposal',
                                  description: msg.message,
                                  proposal_type: 'add',
                                  status: 'pending',
                                  approval_count: 0,
                                  required_approvals: 3,
                                };
                              })()}
                              onVote={(proposalId: string, vote: 'approve' | 'reject', comment?: string) => {
                                console.log('Vote called from document view:', proposalId, vote);
                                if (voteProposal && proposalId && vote) {
                                  voteProposal({ proposalId, vote, comment });
                                }
                              }}
                              onApply={applyProposal}
                              onPreviewDiff={handlePreviewDiff}
                              isDiffActive={activeDiffProposalId === (msg.metadata?.proposal_id || msg.metadata?.suggestion_id)}
                              getUserVote={(sugId: string) => {
                                const vote = getUserVote(sugId);
                                return vote ? { vote: vote.vote as 'approve' | 'reject' } : null;
                              }}
                              isVoting={isVoting}
                              isApplying={isApplying}
                            />
                          ) : (
                            <Text style={styles.messageText}>{msg.message}</Text>
                          )}
                        </View>
                      </View>
                    );
                  })
                ) : (
                  <Text style={styles.noMessagesText}>No messages yet. Start a conversation!</Text>
                )}
              </ScrollView>
            </View>

            {/* Activity Feed */}
            <View style={styles.collaborationSection}>
              <Text style={styles.sectionTitle}>Recent Activity</Text>
              <ScrollView style={styles.activityContainer}>
                <View style={styles.activityItem}>
                  <Feather name="edit-3" size={14} color="#6B7280" />
                  <Text style={styles.activityText}>
                    <Text style={styles.activityAuthor}>Sarah</Text> edited the itinerary
                  </Text>
                  <Text style={styles.activityTime}>5 min ago</Text>
                </View>
                <View style={styles.activityItem}>
                  <Feather name="message-circle" size={14} color="#6B7280" />
                  <Text style={styles.activityText}>
                    <Text style={styles.activityAuthor}>Tom</Text> added a comment
                  </Text>
                  <Text style={styles.activityTime}>1 hour ago</Text>
                </View>
              </ScrollView>
            </View>

                {/* Chat Input */}
                <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
              style={styles.chatInputContainer}
            >
              {selectedTextContext && (
                <View style={styles.contextIndicator}>
                  <Text style={styles.contextLabel}>Context:</Text>
                  <Text style={styles.contextText} numberOfLines={1}>
                    "{selectedTextContext}"
                  </Text>
                  <TouchableOpacity
                    onPress={() => setSelectedTextContext('')}
                    style={styles.clearContextButton}
                  >
                    <Feather name="x" size={14} color="#6B7280" />
                  </TouchableOpacity>
                </View>
              )}
              <TextInput
                style={styles.chatInput}
                placeholder="Type a message..."
                placeholderTextColor="#9CA3AF"
                value={chatMessage}
                onChangeText={setChatMessage}
                multiline
                onSubmitEditing={handleSendMessage}
                returnKeyType="send"
                editable={!isSending}
              />
              <TouchableOpacity
                style={[styles.sendButton, (!chatMessage.trim() || isSending) && styles.sendButtonDisabled]}
                onPress={handleSendMessage}
                disabled={!chatMessage.trim() || isSending}
              >
                {isSending ? (
                  <ActivityIndicator size="small" color="white" />
                ) : (
                  <Feather name="send" size={18} color="white" />
                )}
              </TouchableOpacity>
                </KeyboardAvoidingView>
              </>
            ) : (
              /* AI Suggestions Tab */
              <View style={styles.proposalsContainer}>

              </View>
            )}
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3F4F6',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#6B7280',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
  },
  errorText: {
    marginTop: 12,
    fontSize: 14,
    color: '#6B7280',
  },
  toolbar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 1,
      },
      android: {
        elevation: 2,
      },
      web: {
        boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
      },
    }),
  },
  toolbarLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  toolbarRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  toolbarDivider: {
    width: 1,
    height: 24,
    backgroundColor: '#E5E7EB',
    marginHorizontal: 4,
  },
  toolButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  toolButtonActive: {
    backgroundColor: '#EBF5FF',
  },
  toolButtonText: {
    fontSize: 14,
    color: '#6B7280',
  },
  toolButtonTextActive: {
    color: '#3B82F6',
    fontWeight: '500',
  },
  documentScrollView: {
    flex: 1,
  },
  documentScrollContent: {
    paddingVertical: 24,
    paddingHorizontal: 16,
  },
  documentPaper: {
    backgroundColor: 'white',
    borderRadius: 8,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
      },
      android: {
        elevation: 3,
      },
      web: {
        boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
      },
    }),
  },
  documentPaperDesktop: {
    maxWidth: 800,
    marginHorizontal: 'auto',
    width: '100%',
  },
  documentHeader: {
    padding: 32,
    paddingBottom: 24,
  },
  documentTitle: {
    fontSize: 32,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 8,
    letterSpacing: -0.5,
  },
  documentSubtitle: {
    fontSize: 16,
    color: '#6B7280',
    marginBottom: 16,
    lineHeight: 24,
  },
  documentMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 20,
    marginTop: 12,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metaText: {
    fontSize: 14,
    color: '#6B7280',
  },
  documentDivider: {
    height: 1,
    backgroundColor: '#E5E7EB',
    marginHorizontal: 32,
    marginBottom: 24,
  },
  errorSubtext: {
    fontSize: 14,
    color: '#9CA3AF',
    marginTop: 8,
    textAlign: 'center',
  },
  savingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#EBF5FF',
    borderRadius: 6,
    marginRight: 12,
  },
  savingText: {
    fontSize: 13,
    color: '#3B82F6',
    fontWeight: '500',
  },
  mainContent: {
    flex: 1,
    flexDirection: 'row',
  },
  documentSection: {
    flex: 1,
  },
  documentSectionDesktop: {
    maxWidth: 900,
  },
  collaborationPanel: {
    width: 360,
    backgroundColor: 'white',
    borderLeftWidth: 1,
    borderLeftColor: '#E5E7EB',
    flexDirection: 'column',
  },
  collaborationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  collaborationTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
  },
  collaborationButton: {
    padding: 8,
  },
  collaborationSection: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  collaboratorsList: {
    gap: 12,
  },
  collaboratorItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  collaboratorAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  collaboratorInitial: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
  collaboratorInfo: {
    flex: 1,
  },
  collaboratorName: {
    fontSize: 14,
    fontWeight: '500',
    color: '#111827',
  },
  collaboratorStatus: {
    fontSize: 12,
    color: '#6B7280',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  commentsContainer: {
    maxHeight: 200,
  },
  commentItem: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  commentAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  commentInitial: {
    color: 'white',
    fontSize: 12,
    fontWeight: '600',
  },
  commentContent: {
    flex: 1,
  },
  commentAuthor: {
    fontSize: 13,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 2,
  },
  commentText: {
    fontSize: 13,
    color: '#374151',
    lineHeight: 18,
  },
  commentTime: {
    fontSize: 11,
    color: '#9CA3AF',
    marginTop: 4,
  },
  activityContainer: {
    maxHeight: 150,
  },
  activityItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 12,
  },
  activityText: {
    flex: 1,
    fontSize: 13,
    color: '#6B7280',
  },
  activityAuthor: {
    fontWeight: '600',
    color: '#111827',
  },
  activityTime: {
    fontSize: 11,
    color: '#9CA3AF',
  },
  chatInputContainer: {
    flexDirection: 'row',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    gap: 8,
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'white',
  },
  chatInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    fontSize: 14,
    maxHeight: 100,
  },
  sendButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#3B82F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: '#CBD5E1',
  },
  messagesContainer: {
    flex: 1,
    paddingBottom: 10,
  },
  messageItem: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  messageAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  messageInitial: {
    color: 'white',
    fontSize: 12,
    fontWeight: '600',
  },
  messageContent: {
    flex: 1,
  },
  messageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  messageAuthor: {
    fontSize: 13,
    fontWeight: '600',
    color: '#111827',
  },
  messageText: {
    fontSize: 14,
    color: '#374151',
    lineHeight: 20,
  },
  messageTime: {
    fontSize: 11,
    color: '#9CA3AF',
  },
  noMessagesText: {
    textAlign: 'center',
    color: '#9CA3AF',
    fontSize: 13,
    marginTop: 20,
    fontStyle: 'italic',
  },
  collaborationTabs: {
    flexDirection: 'row',
    gap: 8,
  },
  tabButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  tabButtonActive: {
    backgroundColor: '#EBF5FF',
  },
  tabButtonText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#6B7280',
  },
  tabButtonTextActive: {
    color: '#3B82F6',
  },
  tabBadge: {
    backgroundColor: '#EF4444',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 10,
    marginLeft: 4,
  },
  tabBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: 'white',
  },
  suggestionsContainer: {
    flex: 1,
  },
  processingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F3E8FF',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#E9D5FF',
  },
  processingText: {
    fontSize: 13,
    color: '#7C3AED',
  },
  mapContainer: {
    marginHorizontal: 32,
    marginBottom: 24,
  },
  contextIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 8,
    borderRadius: 8,
    marginHorizontal: 8,
  },
  contextLabel: {
    fontSize: 12,
    color: '#6B7280',
    fontWeight: '500',
    marginRight: 8,
  },
  contextText: {
    fontSize: 12,
    color: '#374151',
    flex: 1,
    fontStyle: 'italic',
  },
  clearContextButton: {
    padding: 4,
  },
});