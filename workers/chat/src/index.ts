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
          content: `You are a helpful travel planning assistant.

Your role is to:
- Answer questions about their trip
- Provide helpful suggestions and recommendations
- Help them refine their travel plans
- Be concise and friendly

CRITICAL OUTPUT FORMAT REQUIREMENT:
You MUST format ALL responses as valid ProseMirror HTML. The schema supports these elements:

Block Elements:
- <p>Paragraph text</p> - Standard paragraph
- <h1>, <h2>, <h3>, <h4>, <h5>, <h6> - Headings (level 1-6)
- <blockquote> - Quoted text
- <ul><li>Item</li></ul> - Bullet list with list items
- <ol><li>Item</li></ol> - Numbered list with list items
- <pre><code>Code</code></pre> - Code block
- <hr> - Horizontal rule

Inline Formatting (marks):
- <strong>Bold</strong> or <b>Bold</b> - Bold text
- <em>Italic</em> or <i>Italic</i> - Italic text
- <code>inline code</code> - Inline code
- <a href="url">Link text</a> - Hyperlink
- <br> - Line break

Location References (geo-marks):
When mentioning specific locations, wrap them as:
<span class="geo-mark" data-place-name="Eiffel Tower, Paris, France" data-lat="48.8584" data-lng="2.2945" data-coord-source="llm">Eiffel Tower</span>

Example response:
<p>I'd recommend visiting <span class="geo-mark" data-place-name="Eiffel Tower, Paris, France" data-lat="48.8584" data-lng="2.2945" data-coord-source="llm">Eiffel Tower</span> in the morning.</p>

<h2>Day 1 Itinerary</h2>
<ul>
<li><strong>Morning:</strong> Breakfast at café</li>
<li><strong>Afternoon:</strong> Visit <span class="geo-mark" data-place-name="Louvre Museum, Paris, France" data-lat="48.8606" data-lng="2.3376" data-coord-source="llm">Louvre</span></li>
<li><strong>Evening:</strong> Dinner near hotel</li>
</ul>

<p>Would you like me to add more details?</p>

FORBIDDEN:
- DO NOT use plain text without HTML tags
- DO NOT use markdown syntax
- DO NOT use <think> tags or reasoning tags
- DO NOT skip wrapping text in <p> tags

Keep responses practical and well-structured.`
        },
        { role: "user", content: userMessage }
      ];

      console.log('[ChatRoom] Calling Cloudflare Workers AI...');

      // Stream AI response with Qwen 2.5 Coder 32B (better at structured output like HTML)
      const response = await this.env.AI.run("@cf/qwen/qwen2.5-coder-32b-instruct", {
        messages,
        stream: true
      });

      let fullResponse = "";
      const messageId = crypto.randomUUID();
      let chunkCount = 0;
      let buffer = ""; // Buffer for incomplete tags/words

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

          // Ensure textChunk is a string
          const chunkStr = String(textChunk);

          // Skip metadata chunks (those that don't contain actual response text)
          // These are chunks like "data: [DONE]" or usage stats
          if (!chunkStr.startsWith('data: ')) {
            fullResponse += chunkStr;
            buffer += chunkStr;

            // Extract complete units (HTML tags or words) from buffer
            const units = this.extractCompleteUnits(buffer);

            if (units.toSend) {
              // Send complete units
              this.broadcast(JSON.stringify({
                type: "ai_chunk",
                message_id: messageId,
                chunk: units.toSend,
                done: false
              }));
            }

            // Keep incomplete portion in buffer
            buffer = units.remaining;
          }
        }
      }

      // Send any remaining buffer content at the end
      if (buffer) {
        this.broadcast(JSON.stringify({
          type: "ai_chunk",
          message_id: messageId,
          chunk: buffer,
          done: false
        }));
      }

      console.log(`[ChatRoom] AI complete. Total chunks: ${chunkCount}, Response length: ${fullResponse.length}`);

      // Fallback if AI returned empty response
      if (!fullResponse.trim()) {
        console.warn('[ChatRoom] AI returned empty response, using fallback');
        fullResponse = "I apologize, but I'm having trouble generating a response right now. Please try again.";
      }

      // Post-process: Wrap plain text response in HTML if model didn't follow format
      let processedResponse = fullResponse;
      if (!fullResponse.includes('<p>') && !fullResponse.includes('<h')) {
        console.log('[ChatRoom] Response is plain text, wrapping in HTML paragraphs');
        // Split by double newlines (paragraph breaks)
        const paragraphs = fullResponse.split(/\n\n+/).filter(p => p.trim());
        processedResponse = paragraphs.map(p => {
          // Handle headings (lines that end with colon or are all caps)
          if (p.trim().endsWith(':') && p.trim().length < 50) {
            return `<h3>${p.trim()}</h3>`;
          }
          // Regular paragraphs
          return `<p>${p.trim().replace(/\n/g, '<br>')}</p>`;
        }).join('\n');
      }

      // Auto-detect and wrap location names in geo-marks
      // Common location patterns: proper nouns, landmarks, places ending in common suffixes
      const locationPatterns = [
        // Named landmarks/buildings
        /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*(?:\s+(?:Palace|Castle|Museum|Gardens?|Park|Square|Tower|Cathedral|Church|Bridge|Statue|Harbor?|Street|Avenue|Center|Centre|Hall|Market|Temple)))\b/g,
        // City districts/neighborhoods
        /\b((?:Old\s+Town|Downtown|[A-Z][a-z]+(?:town|borg|ville|berg)))\b/g,
      ];

      let enhancedResponse = processedResponse;
      for (const pattern of locationPatterns) {
        enhancedResponse = enhancedResponse.replace(pattern, (match) => {
          // Skip if already wrapped in a geo-mark or HTML tag
          const beforeMatch = enhancedResponse.substring(0, enhancedResponse.indexOf(match));
          if (beforeMatch.lastIndexOf('<span class="geo-mark"') > beforeMatch.lastIndexOf('</span>')) {
            return match;
          }
          if (beforeMatch.lastIndexOf('<') > beforeMatch.lastIndexOf('>')) {
            return match;
          }

          // Wrap in geo-mark span (without coordinates - will be enriched client-side if needed)
          return `<span class="geo-mark" data-place-name="${match}" data-coord-source="llm">${match}</span>`;
        });
      }

      // Assign sequential color indices to all geo-marks (using modulo 5 for color cycling)
      let colorIndex = 0;
      enhancedResponse = enhancedResponse.replace(
        /<span class="geo-mark"([^>]*)>/g,
        (match, attributes) => {
          // Only add color-index if not already present
          if (!attributes.includes('data-color-index')) {
            const index = colorIndex % 5; // Cycle through 5 colors
            colorIndex++;
            return `<span class="geo-mark"${attributes} data-color-index="${index}">`;
          }
          return match;
        }
      );

      // Create complete AI message
      const aiMessage: ChatMessage = {
        id: messageId,
        document_id: documentId,
        user_id: userId,
        role: "assistant",
        content: enhancedResponse,
        metadata: { model: "qwen2.5-coder-32b-instruct" },
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

  /**
   * Extract complete HTML tags and words from buffer
   * Returns what can be sent immediately and what should remain buffered
   */
  private extractCompleteUnits(buffer: string): { toSend: string; remaining: string } {
    let toSend = "";
    let i = 0;

    while (i < buffer.length) {
      const char = buffer[i];

      // Check if we're starting an HTML tag
      if (char === '<') {
        // Find the closing >
        const closeTagIndex = buffer.indexOf('>', i);

        if (closeTagIndex === -1) {
          // Incomplete tag, keep in buffer
          break;
        }

        // Complete tag found, extract it
        const tag = buffer.substring(i, closeTagIndex + 1);
        toSend += tag;
        i = closeTagIndex + 1;
      }
      // Regular text (not inside a tag)
      else {
        // Find the next tag start or whitespace
        let wordEnd = i;
        while (
          wordEnd < buffer.length &&
          buffer[wordEnd] !== '<' &&
          buffer[wordEnd] !== ' ' &&
          buffer[wordEnd] !== '\n' &&
          buffer[wordEnd] !== '\t'
        ) {
          wordEnd++;
        }

        // If we hit a tag or whitespace, we have a complete word
        if (wordEnd > i && (
          wordEnd >= buffer.length ||
          buffer[wordEnd] === '<' ||
          buffer[wordEnd] === ' ' ||
          buffer[wordEnd] === '\n' ||
          buffer[wordEnd] === '\t'
        )) {
          // Extract word and include trailing whitespace if present
          const word = buffer.substring(i, wordEnd);
          toSend += word;
          i = wordEnd;

          // Include trailing whitespace
          if (i < buffer.length && (buffer[i] === ' ' || buffer[i] === '\n' || buffer[i] === '\t')) {
            toSend += buffer[i];
            i++;
          }
        } else if (wordEnd === i) {
          // Just whitespace, include it
          toSend += buffer[i];
          i++;
        } else {
          // Incomplete word at end of buffer, keep for next iteration
          break;
        }
      }
    }

    const remaining = buffer.substring(i);

    return { toSend, remaining };
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
