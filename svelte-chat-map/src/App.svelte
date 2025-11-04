<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import mapboxgl from 'mapbox-gl';
  import 'mapbox-gl/dist/mapbox-gl.css';

  // Mapbox token
  const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN || 'pk.eyJ1IjoibWFkc2JlcnRlbHNlbiIsImEiOiJja2tjeDgxZWYwNHU5MnhtaTVndWRmeHpzIn0.Zs-SFtuSE9I1XAG-TG2fsw';

  // WebSocket URL - matches Expo app configuration
  const WS_URL = 'wss://tourvision-chat.your-subdomain.workers.dev';

  // Chat state
  interface ChatMessage {
    id?: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    metadata?: any;
  }

  let messages: ChatMessage[] = [];
  let inputMessage = '';
  let isConnected = false;
  let isStreaming = false;
  let streamingContent = '';
  let error: string | null = null;

  // Map instance
  let map: mapboxgl.Map | null = null;
  let mapContainer: HTMLDivElement;

  // WebSocket instance
  let ws: WebSocket | null = null;
  let reconnectTimeout: number | null = null;
  let reconnectAttempts = 0;
  const MAX_RECONNECT_ATTEMPTS = 5;
  const RECONNECT_DELAY = 2000;

  // WebSocket connection
  function connectWebSocket() {
    try {
      console.log('[WebSocket] Connecting to:', WS_URL);
      ws = new WebSocket(WS_URL);

      ws.onopen = () => {
        console.log('[WebSocket] Connected');
        isConnected = true;
        error = null;
        reconnectAttempts = 0;
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          switch (data.type) {
            case 'history':
              // Initial chat history
              messages = data.messages;
              break;

            case 'message':
              // New message from another user
              messages = [...messages, data.message];
              break;

            case 'ai_chunk':
              // AI response streaming
              if (data.done) {
                // Streaming complete
                isStreaming = false;
                if (data.message) {
                  // Remove processing messages and add final AI message
                  messages = [
                    ...messages.filter(msg => !msg.metadata?.processing),
                    data.message
                  ];
                }
                streamingContent = '';
              } else {
                // Streaming in progress
                isStreaming = true;
                streamingContent += data.chunk;
              }
              break;

            case 'error':
              console.error('[WebSocket] Error:', data.error);
              error = data.error;
              break;

            default:
              console.warn('[WebSocket] Unknown message type:', data.type);
          }
        } catch (err) {
          console.error('[WebSocket] Failed to parse message:', err);
        }
      };

      ws.onerror = (event) => {
        console.error('[WebSocket] WebSocket error:', event);
        error = 'Connection error';
      };

      ws.onclose = () => {
        console.log('[WebSocket] Disconnected');
        isConnected = false;
        ws = null;

        // Attempt to reconnect
        if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
          reconnectAttempts += 1;
          console.log(
            `[WebSocket] Reconnecting... (attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`
          );

          reconnectTimeout = window.setTimeout(() => {
            connectWebSocket();
          }, RECONNECT_DELAY);
        } else if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
          error = 'Failed to connect after multiple attempts';
        }
      };
    } catch (err) {
      console.error('[WebSocket] Connection error:', err);
      error = 'Failed to establish connection';
    }
  }

  function disconnectWebSocket() {
    if (reconnectTimeout) {
      clearTimeout(reconnectTimeout);
      reconnectTimeout = null;
    }

    if (ws) {
      ws.close();
      ws = null;
    }

    isConnected = false;
  }

  // Send message via WebSocket
  function sendMessage() {
    if (!inputMessage.trim()) return;

    if (!ws || ws.readyState !== WebSocket.OPEN) {
      console.warn('[WebSocket] Cannot send message - not connected');
      error = 'Not connected to chat server';
      return;
    }

    const userMessage = inputMessage.trim();
    inputMessage = '';

    // Add user message optimistically
    messages = [...messages, { role: 'user', content: userMessage }];

    // Send message to server
    const message = {
      type: 'chat_message',
      content: userMessage,
      metadata: {},
    };

    ws.send(JSON.stringify(message));
  }

  // Handle Enter key
  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  }

  // Initialize map
  onMount(() => {
    mapboxgl.accessToken = MAPBOX_TOKEN;

    map = new mapboxgl.Map({
      container: mapContainer,
      style: 'mapbox://styles/mapbox/light-v11',
      center: [12.5700, 55.6867], // Copenhagen
      zoom: 12
    });

    // Add navigation controls
    map.addControl(new mapboxgl.NavigationControl(), 'top-right');

    // Connect WebSocket
    connectWebSocket();

    return () => {
      map?.remove();
      disconnectWebSocket();
    };
  });

  onDestroy(() => {
    disconnectWebSocket();
  });
</script>

<div class="app-container">
  <!-- Fullscreen Map -->
  <div bind:this={mapContainer} class="map-container"></div>

  <!-- Chat Interface -->
  <div class="chat-container">
    <!-- Connection Status -->
    {#if !isConnected}
      <div class="connection-status">
        {#if error}
          <span class="status-error">⚠️ {error}</span>
        {:else}
          <span class="status-connecting">🔄 Connecting...</span>
        {/if}
      </div>
    {/if}

    <!-- Messages -->
    <div class="messages">
      {#each messages as message}
        <div class="message {message.role === 'user' ? 'message-user' : 'message-assistant'}">
          <div class="message-content">{message.content}</div>
        </div>
      {/each}

      <!-- Streaming AI response -->
      {#if isStreaming && streamingContent}
        <div class="message message-assistant">
          <div class="message-content">{streamingContent}</div>
        </div>
      {/if}
    </div>

    <!-- Input Box -->
    <div class="input-container">
      <input
        bind:value={inputMessage}
        on:keydown={handleKeyDown}
        type="text"
        placeholder="Ask about locations..."
        class="chat-input"
        disabled={!isConnected || isStreaming}
      />
      <button
        on:click={sendMessage}
        class="send-button"
        disabled={!isConnected || isStreaming || !inputMessage.trim()}
      >
        Send
      </button>
    </div>
  </div>
</div>

<style>
  :global(body) {
    margin: 0;
    padding: 0;
    overflow: hidden;
  }

  .app-container {
    position: relative;
    width: 100vw;
    height: 100vh;
    overflow: hidden;
  }

  .map-container {
    width: 100%;
    height: 100%;
  }

  .chat-container {
    position: absolute;
    bottom: 20px;
    right: 20px;
    width: 400px;
    max-height: 500px;
    background: white;
    border-radius: 12px;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1), 0 2px 4px rgba(0, 0, 0, 0.06);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .messages {
    flex: 1;
    overflow-y: auto;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    max-height: 400px;
  }

  .message {
    display: flex;
    flex-direction: column;
  }

  .message-user {
    align-items: flex-end;
  }

  .message-assistant {
    align-items: flex-start;
  }

  .message-content {
    max-width: 80%;
    padding: 12px 16px;
    border-radius: 8px;
    word-wrap: break-word;
  }

  .message-user .message-content {
    background: #3B82F6;
    color: white;
  }

  .message-assistant .message-content {
    background: #F3F4F6;
    color: #111827;
  }

  .input-container {
    display: flex;
    gap: 8px;
    padding: 16px;
    border-top: 1px solid #E5E7EB;
  }

  .chat-input {
    flex: 1;
    padding: 10px 12px;
    border: 1px solid #D1D5DB;
    border-radius: 8px;
    font-size: 14px;
    outline: none;
    transition: border-color 0.2s;
  }

  .chat-input:focus {
    border-color: #3B82F6;
  }

  .chat-input:disabled {
    background: #F3F4F6;
    cursor: not-allowed;
  }

  .send-button {
    padding: 10px 20px;
    background: #3B82F6;
    color: white;
    border: none;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.2s;
  }

  .send-button:hover:not(:disabled) {
    background: #2563EB;
  }

  .send-button:disabled {
    background: #9CA3AF;
    cursor: not-allowed;
  }

  /* Scrollbar styling */
  .messages::-webkit-scrollbar {
    width: 6px;
  }

  .messages::-webkit-scrollbar-track {
    background: #F3F4F6;
  }

  .messages::-webkit-scrollbar-thumb {
    background: #D1D5DB;
    border-radius: 3px;
  }

  .messages::-webkit-scrollbar-thumb:hover {
    background: #9CA3AF;
  }

  .connection-status {
    padding: 8px 16px;
    background: #FEF3C7;
    border-bottom: 1px solid #F59E0B;
    font-size: 13px;
  }

  .status-error {
    color: #DC2626;
  }

  .status-connecting {
    color: #F59E0B;
  }
</style>
