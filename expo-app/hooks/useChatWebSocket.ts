import { useEffect, useRef, useState, useCallback } from 'react';
import { enrichGeoMarksInHTML } from '@/utils/enrich-geo-marks';

interface ChatMessage {
  id: string;
  document_id: string;
  user_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  metadata?: any;
  created_at: string;
}

interface UseChatWebSocketProps {
  documentId: string;
  userId: string;
  enabled?: boolean;
  url?: string; // WebSocket URL (defaults to production)
}

interface UseChatWebSocketReturn {
  messages: ChatMessage[];
  sendMessage: (content: string, metadata?: any) => void;
  isConnected: boolean;
  isStreaming: boolean;
  streamingContent: string;
  error: string | null;
}

const DEFAULT_WS_URL = 'wss://tourvision-chat.your-subdomain.workers.dev';

export function useChatWebSocket({
  documentId,
  userId,
  enabled = true,
  url = DEFAULT_WS_URL,
}: UseChatWebSocketProps): UseChatWebSocketReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [error, setError] = useState<string | null>(null);
  const colorIndexCounter = useRef(0); // Track color indices for streaming geo-marks

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);

  const MAX_RECONNECT_ATTEMPTS = 5;
  const RECONNECT_DELAY = 2000;

  // Helper to assign color indices to geo-marks in streaming content
  const assignColorIndices = useCallback((html: string): string => {
    if (!html.includes('geo-mark')) {
      return html;
    }

    let result = html;
    let currentIndex = 0;

    // Find all geo-marks and assign sequential color indices
    result = result.replace(
      /<span class="geo-mark"([^>]*)>/g,
      (match, attributes) => {
        // If already has color-index, keep it
        if (attributes.includes('data-color-index')) {
          return match;
        }

        // Assign new color index (0-4, cycling through 5 colors)
        const index = currentIndex % 5;
        currentIndex++;

        return `<span class="geo-mark"${attributes} data-color-index="${index}">`;
      }
    );

    return result;
  }, []);

  // Helper function to enrich assistant messages with Nominatim coordinates
  // TEMPORARILY DISABLED to test highlighting
  const enrichMessage = useCallback(async (message: ChatMessage): Promise<ChatMessage> => {
    // Skip enrichment - just return message as-is
    return message;

    /* DISABLED FOR TESTING
    if (message.role !== 'assistant' || !message.content.includes('geo-mark')) {
      return message;
    }

    try {
      console.log('[ChatWebSocket] Enriching geo-marks in assistant message...');
      const enrichedContent = await enrichGeoMarksInHTML(message.content);
      return { ...message, content: enrichedContent };
    } catch (error) {
      console.error('[ChatWebSocket] Failed to enrich message:', error);
      return message; // Return original on error
    }
    */
  }, []);

  // Helper to enrich multiple messages
  const enrichMessages = useCallback(async (messages: ChatMessage[]): Promise<ChatMessage[]> => {
    const enrichedMessages = await Promise.all(
      messages.map(msg => enrichMessage(msg))
    );
    return enrichedMessages;
  }, [enrichMessage]);

  const connect = useCallback(() => {
    if (!enabled || !documentId || wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    try {
      const wsUrl = `${url}/chat/${documentId}`;
      console.log('[ChatWebSocket] Connecting to:', wsUrl);

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('[ChatWebSocket] Connected');
        setIsConnected(true);
        setError(null);
        reconnectAttemptsRef.current = 0;
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          switch (data.type) {
            case 'history':
              // Initial chat history - enrich geo-marks
              enrichMessages(data.messages).then(enriched => {
                setMessages(enriched);
              });
              break;

            case 'message':
              // New message from another user - enrich if assistant
              enrichMessage(data.message).then(enriched => {
                setMessages((prev) => [...prev, enriched]);
              });
              break;

            case 'ai_chunk':
              // AI response streaming
              if (data.done) {
                // Streaming complete - add the final message WITHOUT enrichment first
                setIsStreaming(false);
                setStreamingContent('');
                colorIndexCounter.current = 0; // Reset for next message
                if (data.message) {
                  // First, add the unenriched message immediately
                  setMessages((prev) => [
                    ...prev.filter(msg => !msg.metadata?.processing),
                    data.message
                  ]);

                  // Then enrich asynchronously and update in-place
                  enrichMessage(data.message).then(enriched => {
                    setMessages((prev) =>
                      prev.map(msg =>
                        msg.id === enriched.id ? enriched : msg
                      )
                    );
                  });
                }
              } else {
                // Streaming in progress
                setIsStreaming(true);
                setStreamingContent((prev) => {
                  const newContent = prev + data.chunk;
                  // Assign color indices to geo-marks in real-time
                  const withColors = assignColorIndices(newContent);

                  // Debug logging
                  if (newContent.includes('geo-mark')) {
                    if (newContent !== withColors) {
                      console.log('[ChatWebSocket] Added color indices to streaming content');
                    }
                    // Show a sample of geo-marks
                    const geoMarkMatch = withColors.match(/<span class="geo-mark"[^>]*>[^<]*<\/span>/);
                    if (geoMarkMatch) {
                      console.log('[ChatWebSocket] Geo-mark sample:', geoMarkMatch[0]);
                    }
                  }

                  return withColors;
                });
              }
              break;

            case 'error':
              console.error('[ChatWebSocket] Error:', data.error);
              setError(data.error);
              break;

            default:
              console.warn('[ChatWebSocket] Unknown message type:', data.type);
          }
        } catch (err) {
          console.error('[ChatWebSocket] Failed to parse message:', err);
        }
      };

      ws.onerror = (event) => {
        console.error('[ChatWebSocket] WebSocket error:', event);
        setError('Connection error');
      };

      ws.onclose = () => {
        console.log('[ChatWebSocket] Disconnected');
        setIsConnected(false);
        wsRef.current = null;

        // Attempt to reconnect
        if (enabled && reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
          reconnectAttemptsRef.current += 1;
          console.log(
            `[ChatWebSocket] Reconnecting... (attempt ${reconnectAttemptsRef.current}/${MAX_RECONNECT_ATTEMPTS})`
          );

          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, RECONNECT_DELAY);
        } else if (reconnectAttemptsRef.current >= MAX_RECONNECT_ATTEMPTS) {
          setError('Failed to connect after multiple attempts');
        }
      };
    } catch (err) {
      console.error('[ChatWebSocket] Connection error:', err);
      setError('Failed to establish connection');
    }
  }, [enabled, documentId, url]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    setIsConnected(false);
  }, []);

  const sendMessage = useCallback(
    (content: string, metadata?: any) => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        console.warn('[ChatWebSocket] Cannot send message - not connected');
        return;
      }

      const message = {
        type: 'chat_message',
        content,
        user_id: userId,
        metadata,
      };

      wsRef.current.send(JSON.stringify(message));
    },
    [userId]
  );

  // Connect on mount, disconnect on unmount
  useEffect(() => {
    if (enabled) {
      connect();
    }

    return () => {
      disconnect();
    };
  }, [enabled, connect, disconnect]);

  return {
    messages,
    sendMessage,
    isConnected,
    isStreaming,
    streamingContent,
    error,
  };
}
