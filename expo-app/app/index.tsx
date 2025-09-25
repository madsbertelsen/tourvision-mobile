import { NativeItineraryViewer } from '@/components/NativeItineraryViewer';
import { MapViewWrapper } from '@/components/MapViewWrapper';
import { generateAPIUrl } from '@/lib/ai-sdk-config';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { fetch as expoFetch } from 'expo/fetch';
import React from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const { height: screenHeight, width: screenWidth } = Dimensions.get('window');

interface Location {
  id: string;
  name: string;
  lat: number;
  lng: number;
  description?: string;
  colorIndex?: number;
}

export default function SimpleChatScreen() {
  const [inputText, setInputText] = React.useState('');
  const [mapLocations, setMapLocations] = React.useState<Location[]>([]);

  // Memoize the callback to prevent re-renders
  const handleLocationsUpdate = React.useCallback((locations: Location[]) => {
    setMapLocations(locations);
  }, []);

  // Square map size based on screen width
  const mapSize = screenWidth;

  // Debug the API URL
  const apiUrl = generateAPIUrl('/api/chat-simple');
  console.log('API URL:', apiUrl);

  // Use the AI SDK useChat hook with DefaultChatTransport for Expo
  const chatHelpers = useChat({
    transport: new DefaultChatTransport({
      fetch: expoFetch as unknown as typeof globalThis.fetch,
      api: apiUrl,
    }),
    onError: (error) => {
      console.error('Chat error:', error);
    },
  });

  console.log('Chat helpers:', Object.keys(chatHelpers));

  const {
    messages = [],
    sendMessage,
    status = 'idle',
    error
  } = chatHelpers;

  const isLoading = status === 'in_progress';

  // Debug messages
  console.log('Messages:', messages);
  console.log('Status:', status);
  console.log('Error:', error);

  const handleSendMessage = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!inputText?.trim() || isLoading) return;

    const message = inputText.trim();
    console.log('Sending message:', message);
    console.log('sendMessage available?', !!sendMessage, typeof sendMessage);
    setInputText(''); // Clear input immediately

    // Use sendMessage which is available in the chatHelpers
    if (sendMessage) {
      try {
        console.log('Calling sendMessage...');
        await sendMessage({ text: message });
        console.log('sendMessage completed');
      } catch (error) {
        console.error('Error sending message:', error);
      }
    } else {
      console.error('sendMessage is not available');
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Travel Assistant</Text>
          <Text style={styles.headerSubtitle}>Ask me anything about travel planning</Text>
        </View>

        {/* Map positioned absolutely at bottom - always visible */}
        <View style={styles.mapContainer}>
          <MapViewWrapper
            elements={[]} // We'll pass locations directly instead
            locations={mapLocations}
            height={mapSize}
          />
        </View>

        {/* Messages overlaying the map */}
        <ScrollView
          style={styles.messagesContainer}
          contentContainerStyle={[
            styles.messagesContent,
            messages.length === 0 && styles.messagesContentEmpty
          ]}
        >
          {messages.map((message) => {
            // Check if message contains HTML content (itinerary)
            const hasHTMLContent = message.parts?.some((part: any) =>
              part.type === 'text' && part.text?.includes('<h1>') && part.text?.includes('geo-mark')
            );


            // Extract text content for regular messages
            const textContent = message.parts?.filter((part: any) => part.type === 'text')
              .map((part: any) => part.text)
              .join('') || message.content || '';

            return (
              <View
                key={message.id}
                style={[
                  styles.messageContainer,
                  message.role === 'user' ? styles.userMessage : styles.assistantMessage,
                  hasHTMLContent && styles.messageWithTool
                ]}
              >
                <View style={styles.messageHeader}>
                  <View style={[styles.avatar, message.role === 'assistant' && styles.assistantAvatar]}>
                    <Text style={styles.avatarText}>
                      {message.role === 'user' ? 'U' : 'AI'}
                    </Text>
                  </View>
                  <Text style={styles.senderName}>
                    {message.role === 'user' ? 'You' : 'Travel Assistant'}
                  </Text>
                  <Text style={styles.timestamp}>
                    {new Date(message.createdAt || Date.now()).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </Text>
                </View>

                {/* Render text content or HTML itinerary */}
                {textContent && (
                  hasHTMLContent ? (
                    <NativeItineraryViewer
                      content={textContent}
                      isStreaming={status === 'in_progress' && message === messages[messages.length - 1]}
                      onLocationClick={(location, lat, lng) => {
                        console.log('Location clicked:', location, lat, lng);
                      }}
                      onLocationsUpdate={handleLocationsUpdate}
                    />
                  ) : (
                    <Text style={styles.messageText}>{textContent}</Text>
                  )
                )}
              </View>
            );
          })}

          {isLoading && (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color="#8b5cf6" />
              <Text style={styles.loadingText}>Thinking...</Text>
            </View>
          )}
        </ScrollView>

        {/* Input */}
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.textInput}
            value={inputText}
            onChangeText={setInputText}
            placeholder="Ask about travel plans..."
            placeholderTextColor="#9ca3af"
            multiline
            editable={!isLoading}
            onSubmitEditing={handleSendMessage}
          />
          <TouchableOpacity
            style={[styles.sendButton, (!inputText?.trim() || isLoading) && styles.sendButtonDisabled]}
            onPress={handleSendMessage}
            disabled={!inputText?.trim() || isLoading}
          >
            {isLoading ? (
              <ActivityIndicator size="small" color="white" />
            ) : (
              <Text style={styles.sendButtonText}>Send</Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  keyboardView: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111827',
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 4,
  },
  mapContainer: {
    position: 'absolute',
    bottom: 60, // Above input area
    left: 0,
    right: 0,
    height: screenWidth,
    width: screenWidth,
    zIndex: 0,
  },
  messagesContainer: {
    flex: 1,
    zIndex: 1,
    maxHeight: screenHeight - screenWidth - 160, // Leave space for map and input
    marginBottom: screenWidth - 60, // Push messages up above the map
  },
  messagesContent: {
    flexGrow: 1,
    padding: 16,
    paddingBottom: 32,
  },
  messagesContentEmpty: {
    minHeight: 100, // Smaller min height when empty
  },
  messageContainer: {
    marginBottom: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.95)', // Semi-transparent white
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  userMessage: {
    backgroundColor: 'rgba(239, 246, 255, 0.95)', // Semi-transparent blue
  },
  assistantMessage: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)', // Semi-transparent white
  },
  messageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
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
  assistantAvatar: {
    backgroundColor: '#8b5cf6',
  },
  avatarText: {
    color: 'white',
    fontSize: 12,
    fontWeight: 'bold',
  },
  senderName: {
    fontWeight: '600',
    color: '#111827',
    fontSize: 14,
  },
  timestamp: {
    fontSize: 12,
    color: '#9ca3af',
    marginLeft: 'auto',
  },
  messageText: {
    fontSize: 15,
    lineHeight: 22,
    color: '#374151',
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#f3f4f6',
    borderRadius: 12,
  },
  loadingText: {
    marginLeft: 8,
    fontSize: 14,
    color: '#6b7280',
  },
  messageWithTool: {
    maxWidth: '100%',
  },
  toolCallContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  toolCallText: {
    marginLeft: 8,
    fontSize: 14,
    color: '#8b5cf6',
    fontStyle: 'italic',
  },
  inputContainer: {
    flexDirection: 'row',
    padding: 16,
    backgroundColor: 'white',
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    alignItems: 'flex-end',
  },
  textInput: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    color: '#111827',
    marginRight: 12,
  },
  sendButton: {
    minWidth: 64,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#3b82f6',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  sendButtonDisabled: {
    backgroundColor: '#9ca3af',
  },
  sendButtonText: {
    color: 'white',
    fontSize: 15,
    fontWeight: '600',
  },
});