import { useEffect, useRef, useState, useCallback } from 'react';

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

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);

  const MAX_RECONNECT_ATTEMPTS = 5;
  const RECONNECT_DELAY = 2000;

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
              // Initial chat history
              setMessages(data.messages);
              break;

            case 'message':
              // New message from another user
              setMessages((prev) => [...prev, data.message]);
              break;

            case 'ai_chunk':
              // AI response streaming
              if (data.done) {
                // Streaming complete
                setIsStreaming(false);
                setStreamingContent('');
                if (data.message) {
                  // Remove any processing messages and add the final AI message
                  setMessages((prev) => [
                    ...prev.filter(msg => !msg.metadata?.processing),
                    data.message
                  ]);
                }
              } else {
                // Streaming in progress
                setIsStreaming(true);
                setStreamingContent((prev) => prev + data.chunk);
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
