import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase/client';
import { htmlToProsemirror } from '@/utils/prosemirror-html';
import ProseMirrorNativeRenderer from './ProseMirrorNativeRenderer';
import { ChatMessageProseMirror } from './ChatMessageProseMirror';
import { useChatWebSocket } from '@/hooks/useChatWebSocket';
import { usePresentation } from '@/contexts/presentation-context';
import { parsePresentationBlocks } from '@/utils/parse-presentation-blocks';

interface ChatMessage {
  id: string;
  document_id: string;
  user_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  metadata?: any;
  created_at: string;
}

interface DocumentChatProps {
  documentId: string;
}

export default function DocumentChat({ documentId }: DocumentChatProps) {
  const [inputText, setInputText] = useState('');
  const [userId, setUserId] = useState<string>('');
  const scrollViewRef = useRef<ScrollView>(null);
  const { startPresentation } = usePresentation();

  // Get user ID on mount
  useEffect(() => {
    const getUserId = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUserId(user.id);
      }
    };
    getUserId();
  }, []);

  // Use WebSocket hook for chat
  const {
    messages,
    sendMessage: sendWebSocketMessage,
    isConnected,
    isStreaming,
    streamingContent,
    error: wsError,
  } = useChatWebSocket({
    documentId,
    userId,
    enabled: !!userId, // Only connect when we have a user ID
    url: process.env.EXPO_PUBLIC_CHAT_WS_URL || 'http://localhost:8787',
  });

  // Auto-scroll when messages or streaming content changes
  useEffect(() => {
    setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 100);
  }, [messages, streamingContent]);

  const sendMessage = async () => {
    if (!inputText.trim() || !isConnected) return;

    const messageContent = inputText.trim();
    setInputText('');

    // Send via WebSocket
    sendWebSocketMessage(messageContent);
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  if (!userId) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Ionicons name="chatbubbles-outline" size={20} color="#6B7280" />
          <Text style={styles.headerTitle}>Document Chat</Text>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#3B82F6" />
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={100}
    >
      {/* Header */}
      <View style={styles.header}>
        <Ionicons name="chatbubbles-outline" size={20} color="#6B7280" />
        <Text style={styles.headerTitle}>Document Chat</Text>
      </View>

      {/* Messages */}
      <ScrollView
        ref={scrollViewRef}
        style={styles.messagesContainer}
        contentContainerStyle={styles.messagesContent}
        onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: true })}
      >
        {messages.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="chatbubbles-outline" size={48} color="#D1D5DB" />
            <Text style={styles.emptyStateText}>No messages yet</Text>
            <Text style={styles.emptyStateSubtext}>
              Start a conversation about your document
            </Text>
          </View>
        ) : (
          <>
            {messages
              .filter(msg => !msg.metadata?.processing) // Filter out processing messages
              .map((message) => {
                // Parse assistant messages as ProseMirror HTML
                const parsedContent = message.role === 'assistant'
                  ? htmlToProsemirror(message.content)
                  : null;

                // DEBUG: Log full message content
                if (message.role === 'assistant') {
                  console.log('[DocumentChat] Full AI message content:', message.content.substring(0, 500));
                  console.log('[DocumentChat] Has geo-mark:', message.content.includes('geo-mark'));
                  console.log('[DocumentChat] Parsed content:', JSON.stringify(parsedContent, null, 2).substring(0, 500));
                }

                return (
                  <View
                    key={message.id}
                    style={[
                      styles.messageWrapper,
                      message.role === 'user' && styles.messageWrapperUser,
                    ]}
                  >
                    <View
                      style={[
                        styles.messageBubble,
                        message.role === 'user'
                          ? styles.messageBubbleUser
                          : styles.messageBubbleAssistant,
                      ]}
                    >
                      {message.role === 'assistant' && parsedContent ? (
                        Platform.OS === 'web' ? (
                          // Temporarily show raw HTML to debug
                          <div dangerouslySetInnerHTML={{ __html: message.content }} />
                        ) : (
                          <ProseMirrorNativeRenderer content={parsedContent} />
                        )
                      ) : (
                        <Text
                          style={[
                            styles.messageText,
                            message.role === 'user'
                              ? styles.messageTextUser
                              : styles.messageTextAssistant,
                          ]}
                        >
                          {message.content}
                        </Text>
                      )}

                      {/* Action icons for assistant messages */}
                      {message.role === 'assistant' && (
                        <View style={styles.messageActions}>
                          <TouchableOpacity
                            style={styles.actionButton}
                            onPress={() => {
                              const blocks = parsePresentationBlocks(message.content);
                              console.log('[DocumentChat] Starting presentation with blocks:', blocks);
                              startPresentation(blocks);
                            }}
                          >
                            <Ionicons name="play" size={16} color="#6B7280" />
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={styles.actionButton}
                            onPress={() => console.log('Copy message:', message.id)}
                          >
                            <Ionicons name="copy-outline" size={16} color="#6B7280" />
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={styles.actionButton}
                            onPress={() => console.log('Thumbs up:', message.id)}
                          >
                            <Ionicons name="thumbs-up-outline" size={16} color="#6B7280" />
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={styles.actionButton}
                            onPress={() => console.log('Thumbs down:', message.id)}
                          >
                            <Ionicons name="thumbs-down-outline" size={16} color="#6B7280" />
                          </TouchableOpacity>
                        </View>
                      )}

                      <Text style={styles.messageTime}>{formatTime(message.created_at)}</Text>
                    </View>
                  </View>
                );
              })}

            {/* Show loading indicator if there's a processing message */}
            {messages.some(msg => msg.metadata?.processing) && !isStreaming && (
              <View style={styles.messageWrapper}>
                <View style={[styles.messageBubble, styles.messageBubbleAssistant]}>
                  <View style={styles.streamingIndicator}>
                    <ActivityIndicator size="small" color="#3B82F6" />
                    <Text style={styles.streamingText}>AI is thinking...</Text>
                  </View>
                </View>
              </View>
            )}

            {/* Streaming AI response */}
            {isStreaming && streamingContent && (
              <View style={styles.messageWrapper}>
                <View style={[styles.messageBubble, styles.messageBubbleAssistant]}>
                  {/* Show raw HTML during streaming for debugging */}
                  <Text style={[styles.messageText, styles.messageTextAssistant]}>
                    {streamingContent}
                  </Text>
                  <View style={styles.streamingIndicator}>
                    <ActivityIndicator size="small" color="#3B82F6" />
                    <Text style={styles.streamingText}>AI is typing...</Text>
                  </View>
                </View>
              </View>
            )}
          </>
        )}
      </ScrollView>

      {/* Input */}
      <View style={styles.inputContainer}>
        {wsError && (
          <Text style={styles.errorText}>Connection error: {wsError}</Text>
        )}
        {!isConnected && !wsError && (
          <View style={styles.connectionStatus}>
            <ActivityIndicator size="small" color="#F59E0B" />
            <Text style={styles.connectionText}>Connecting...</Text>
          </View>
        )}
        <TextInput
          style={styles.input}
          value={inputText}
          onChangeText={setInputText}
          placeholder={isConnected ? "Type a message..." : "Connecting to chat..."}
          placeholderTextColor="#9CA3AF"
          multiline
          maxLength={500}
          editable={isConnected}
          onSubmitEditing={sendMessage}
        />
        <TouchableOpacity
          onPress={sendMessage}
          disabled={!inputText.trim() || !isConnected}
          style={[
            styles.sendButton,
            (!inputText.trim() || !isConnected) && styles.sendButtonDisabled,
          ]}
        >
          <Ionicons name="send" size={20} color="#fff" />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  messagesContainer: {
    flex: 1,
  },
  messagesContent: {
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyStateText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6B7280',
    marginTop: 12,
  },
  emptyStateSubtext: {
    fontSize: 14,
    color: '#9CA3AF',
    marginTop: 4,
  },
  messageWrapper: {
    marginBottom: 12,
    alignItems: 'flex-start',
  },
  messageWrapperUser: {
    alignItems: 'flex-end',
  },
  messageBubble: {
    maxWidth: '80%',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
  },
  messageBubbleUser: {
    backgroundColor: '#3B82F6',
    borderBottomRightRadius: 4,
  },
  messageBubbleAssistant: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderBottomLeftRadius: 4,
  },
  messageText: {
    fontSize: 15,
    lineHeight: 20,
  },
  messageTextUser: {
    color: '#ffffff',
  },
  messageTextAssistant: {
    color: '#111827',
  },
  messageTime: {
    fontSize: 11,
    color: '#9CA3AF',
    marginTop: 4,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    gap: 8,
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 100,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#F3F4F6',
    borderRadius: 20,
    fontSize: 15,
    color: '#111827',
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#3B82F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: '#9CA3AF',
    opacity: 0.6,
  },
  streamingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
  },
  streamingText: {
    fontSize: 12,
    color: '#6B7280',
    fontStyle: 'italic',
  },
  errorText: {
    fontSize: 12,
    color: '#EF4444',
    marginBottom: 8,
  },
  connectionStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  connectionText: {
    fontSize: 12,
    color: '#F59E0B',
  },
  messageActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  actionButton: {
    padding: 6,
    borderRadius: 4,
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
});