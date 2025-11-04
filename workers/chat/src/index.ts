export interface Env {
  AI: any; // Cloudflare Workers AI binding
  CHAT_ROOM: DurableObjectNamespace;
}

interface ChatMessage {
  id: string;
  document_id: string;
  user_id: string;
  role: "user" | "assistant";
  content: string;
  metadata?: any;
  created_at: string;
}

export class ChatRoomV2 {
  private state: DurableObjectState;
  private env: Env;
  private sessions: Set<WebSocket>;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
    this.sessions = new Set();
  }

  async fetch(request: Request): Promise<Response> {
    // Expect WebSocket upgrade
    const upgradeHeader = request.headers.get("Upgrade");
    if (upgradeHeader !== "websocket") {
      return new Response("Expected WebSocket", { status: 426 });
    }

    // Create WebSocket pair
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    // Accept WebSocket connection
    this.state.acceptWebSocket(server);
    this.sessions.add(server);

    console.log(`[ChatRoom] WebSocket connection accepted. Total sessions: ${this.sessions.size}`);

    // Send empty chat history (no persistence)
    server.send(JSON.stringify({
      type: "history",
      messages: []
    }));

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    console.log('[ChatRoom] Received message:', message);
    try {
      const data = JSON.parse(message as string);
      const documentId = this.state.id.toString();
      console.log('[ChatRoom] Parsed message type:', data.type);

      switch (data.type) {
        case "chat_message":
          await this.handleChatMessage(data, ws, documentId);
          break;

        case "request_history":
          ws.send(JSON.stringify({
            type: "history",
            messages: []
          }));
          break;

        default:
          console.warn(`[ChatRoom] Unknown message type: ${data.type}`);
      }
    } catch (error) {
      console.error("[ChatRoom] Error processing message:", error);
      ws.send(JSON.stringify({
        type: "error",
        error: "Failed to process message"
      }));
    }
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string, wasClean: boolean) {
    this.sessions.delete(ws);
    console.log(`[ChatRoom] WebSocket closed. Code: ${code}, Reason: ${reason}. Total sessions: ${this.sessions.size}`);
  }

  async webSocketError(ws: WebSocket, error: any) {
    console.error("[ChatRoom] WebSocket error:", error);
    this.sessions.delete(ws);
  }

  private async handleChatMessage(data: any, sender: WebSocket, documentId: string) {
    console.log('[ChatRoom] handleChatMessage called');
    const { content, user_id, metadata } = data;

    if (!content || !user_id) {
      console.log('[ChatRoom] Missing required fields');
      sender.send(JSON.stringify({
        type: "error",
        error: "Missing required fields: content, user_id"
      }));
      return;
    }

    console.log('[ChatRoom] Creating user message');
    // Create user message (in-memory only)
    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      document_id: documentId,
      user_id,
      role: "user",
      content,
      metadata,
      created_at: new Date().toISOString()
    };

    console.log('[ChatRoom] Broadcasting user message');
    // Broadcast user message to all clients
    this.broadcast(JSON.stringify({
      type: "message",
      message: userMessage
    }));

    // Send immediate acknowledgment that AI is processing
    const ackMessageId = crypto.randomUUID();
    const ackMessage: ChatMessage = {
      id: ackMessageId,
      document_id: documentId,
      user_id: user_id,
      role: "assistant",
      content: "...",
      metadata: { processing: true },
      created_at: new Date().toISOString()
    };

    console.log('[ChatRoom] Broadcasting acknowledgment message');
    this.broadcast(JSON.stringify({
      type: "message",
      message: ackMessage
    }));

    console.log('[ChatRoom] Generating AI response');
    // Generate AI response with streaming
    await this.generateAIResponse(documentId, user_id, content);
    console.log('[ChatRoom] AI response complete');
  }

  private async generateAIResponse(documentId: string, userId: string, userMessage: string) {
    try {
      const messages = [
        {
          role: "system",
          content: "You are a helpful travel planning assistant. Help users plan their trips, suggest destinations, and provide travel advice."
        },
        { role: "user", content: userMessage }
      ];

      console.log('[ChatRoom] Calling Cloudflare Workers AI...');

      // Stream AI response
      const response = await this.env.AI.run("@cf/meta/llama-3.1-8b-instruct", {
        messages,
        stream: true
      });

      let fullResponse = "";
      const messageId = crypto.randomUUID();
      let chunkCount = 0;

      // Send streaming chunks
      for await (const chunk of response) {
        chunkCount++;

        // Handle different response formats
        let textChunk = "";

        // Check if chunk has 'response' property (old format)
        if (chunk.response) {
          textChunk = chunk.response;
        }
        // Check if chunk is a Uint8Array or similar (new format)
        else if (typeof chunk === 'object' && chunk !== null) {
          // Convert object with numeric keys to string
          const bytes = Object.values(chunk).filter(v => typeof v === 'number');
          if (bytes.length > 0) {
            textChunk = new TextDecoder().decode(new Uint8Array(bytes));

            // Extract actual response from SSE format "data: {json}\n\n"
            const match = textChunk.match(/data: ({.*})\n/);
            if (match) {
              try {
                const parsed = JSON.parse(match[1]);
                if (parsed.response) {
                  textChunk = parsed.response;
                }
              } catch (e) {
                console.warn('[ChatRoom] Failed to parse SSE data:', e);
              }
            }
          }
        }

        if (textChunk) {
          console.log(`[ChatRoom] Chunk ${chunkCount}:`, textChunk);

          // Skip metadata chunks (those that don't contain actual response text)
          // These are chunks like "data: [DONE]" or usage stats
          if (!textChunk.startsWith('data: ')) {
            fullResponse += textChunk;
            this.broadcast(JSON.stringify({
              type: "ai_chunk",
              message_id: messageId,
              chunk: textChunk,
              done: false
            }));
          }
        }
      }

      console.log(`[ChatRoom] AI complete. Total chunks: ${chunkCount}, Response length: ${fullResponse.length}`);

      // Fallback if AI returned empty response
      if (!fullResponse.trim()) {
        console.warn('[ChatRoom] AI returned empty response, using fallback');
        fullResponse = "I apologize, but I'm having trouble generating a response right now. Please try again.";
      }

      // Create complete AI message
      const aiMessage: ChatMessage = {
        id: messageId,
        document_id: documentId,
        user_id: userId,
        role: "assistant",
        content: fullResponse,
        metadata: { model: "llama-3.1-8b-instruct" },
        created_at: new Date().toISOString()
      };

      // Send completion
      this.broadcast(JSON.stringify({
        type: "ai_chunk",
        message_id: messageId,
        chunk: "",
        done: true,
        message: aiMessage
      }));
    } catch (error) {
      console.error("[ChatRoom] Error generating AI response:", error);
      this.broadcast(JSON.stringify({
        type: "error",
        error: "Failed to generate AI response"
      }));
    }
  }

  private broadcast(message: string) {
    // Get all WebSockets managed by this Durable Object
    const webSockets = this.state.getWebSockets();
    console.log(`[ChatRoom] Broadcasting to ${webSockets.length} WebSockets`);

    for (const ws of webSockets) {
      try {
        console.log('[ChatRoom] Sending to WebSocket');
        ws.send(message);
      } catch (error) {
        console.error("[ChatRoom] Error broadcasting to WebSocket:", error);
      }
    }
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Health check endpoint
    if (url.pathname === "/health") {
      return new Response(
        JSON.stringify({
          status: "ok",
          service: "tourvision-chat",
          timestamp: new Date().toISOString()
        }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    // WebSocket upgrade for chat rooms
    const chatMatch = url.pathname.match(/^\/chat\/(.+)$/);
    if (chatMatch && request.headers.get("Upgrade") === "websocket") {
      const documentId = chatMatch[1];

      // Get or create Durable Object for this document
      const id = env.CHAT_ROOM.idFromName(documentId);
      const stub = env.CHAT_ROOM.get(id);

      // Forward the WebSocket request to the Durable Object
      return stub.fetch(request);
    }

    return new Response("Not Found", { status: 404 });
  }
} satisfies ExportedHandler<Env>;
