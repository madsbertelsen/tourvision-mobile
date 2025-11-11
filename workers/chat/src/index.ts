import { CLIENT_TOOLS } from "./client-tools";

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
  private pendingToolCalls: Map<string, {resolve: (result: any) => void; reject: (error: Error) => void; timeout: NodeJS.Timeout}>;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
    this.sessions = new Set();
    this.pendingToolCalls = new Map();
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

        case "assist_request":
          await this.handleAssistRequest(data, ws);
          break;

        case "tool_result":
          await this.handleToolResult(data);
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

  /**
   * Handle tool result from client
   */
  private async handleToolResult(data: any) {
    const { tool_id, result, error } = data;
    console.log('[ChatRoom] Received tool result for:', tool_id);

    const pending = this.pendingToolCalls.get(tool_id);
    if (!pending) {
      console.warn('[ChatRoom] No pending tool call found for:', tool_id);
      return;
    }

    // Clear timeout
    clearTimeout(pending.timeout);
    this.pendingToolCalls.delete(tool_id);

    // Resolve or reject based on result
    if (error) {
      pending.reject(new Error(error));
    } else {
      pending.resolve(result);
    }
  }

  /**
   * Request a tool execution from the client and wait for result
   */
  private async requestClientTool(toolName: string, args: any): Promise<any> {
    const toolId = crypto.randomUUID();

    console.log('[ChatRoom] Requesting client tool:', toolName, 'with args:', args);

    // Create promise that will be resolved when client sends result
    const toolPromise = new Promise((resolve, reject) => {
      // Set timeout (10 seconds)
      const timeout = setTimeout(() => {
        this.pendingToolCalls.delete(toolId);
        reject(new Error(`Tool call timeout: ${toolName}`));
      }, 10000);

      this.pendingToolCalls.set(toolId, { resolve, reject, timeout });
    });

    // Send tool request to all connected clients
    this.broadcast(JSON.stringify({
      type: 'tool_request',
      tool_id: toolId,
      tool_name: toolName,
      args: args
    }));

    // Wait for result
    return toolPromise;
  }

  /**
   * Handle assist request - generate structured document with tool delegation
   */
  private async handleAssistRequest(data: any, ws: WebSocket) {
    console.log('[ChatRoom] handleAssistRequest called');
    const { html, user_id } = data;

    if (!html) {
      ws.send(JSON.stringify({
        type: 'error',
        error: 'HTML is required for assist request'
      }));
      return;
    }

    console.log('[ChatRoom] Processing HTML for location extraction:', html);

    try {
      // Extract plain text from HTML for LLM to analyze
      const plainText = html.replace(/<[^>]*>/g, '');

      // Build system prompt that understands HTML with geo-marks
      const systemPrompt = `You are a travel itinerary assistant. The user will provide HTML that may contain already-marked locations in <span class="geo-mark"> tags.

Your task: Extract ONLY NEW locations that are NOT already inside geo-mark spans.

CRITICAL: If text is inside <span class="geo-mark">...</span>, it is ALREADY MARKED. DO NOT extract it again!

Return ONLY valid JSON in this format:
{
  "locations": [
    {
      "name": "Copenhagen",
      "displayText": "Copenhagen"
    }
  ],
  "template": "I want to go to {0}"
}

RULES:
1. SKIP any text inside <span class="geo-mark">...</span> tags - these are already marked locations
2. ONLY extract plain text locations NOT in spans
3. If ALL locations are in spans, return {"locations": [], "template": ""}
4. Extract ONLY locations explicitly mentioned - do not invent locations
5. Template uses {0}, {1}, {2} as placeholders for NEW locations only
6. Keep exact wording from user's text

Examples:

Example 1 - Plain text (no marks):
Input: "I want to go to Copenhagen"
Output: {"locations": [{"name": "Copenhagen", "displayText": "Copenhagen"}], "template": "I want to go to {0}"}

Example 2 - Already marked (SKIP IT!):
Input: "I want to go to <span class="geo-mark" data-geo-id="loc-123">Copenhagen</span>"
Output: {"locations": [], "template": ""}

Example 3 - Mix of marked and unmarked:
Input: "I want to go to <span class="geo-mark">Copenhagen</span> and then to Aarhus"
Output: {"locations": [{"name": "Aarhus", "displayText": "Aarhus"}], "template": "I want to go to Copenhagen and then to {0}"}

Example 4 - Two already marked locations (SKIP BOTH!):
Input: "<span class="geo-mark">Lejre</span> <span class="geo-mark">Copenhagen</span>fr"
Output: {"locations": [], "template": ""}

Example 5 - One marked, one unmarked:
Input: "<span class="geo-mark">Lejre</span> and then Roskilde"
Output: {"locations": [{"name": "Roskilde", "displayText": "Roskilde"}], "template": "Lejre and then {0}"}

Return ONLY the JSON, no markdown, no explanation.`;

      // Use LLM to identify locations and their relationships
      const aiResponse = await this.env.AI.run(
        "@hf/nousresearch/hermes-2-pro-mistral-7b",
        {
          messages: [
            {
              role: "system",
              content: systemPrompt
            },
            {
              role: "user",
              content: `Extract NEW locations from this HTML (skip locations already in geo-mark spans):\n\n${html}`
            }
          ]
        }
      );

      console.log('[ChatRoom] AI response:', aiResponse);

      // Parse the AI response
      let locationsData = null;
      try {
        let content = aiResponse.response || aiResponse.content || '';
        console.log('[ChatRoom] Raw LLM content before cleaning:', content);
        content = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        console.log('[ChatRoom] Cleaned content:', content);
        locationsData = JSON.parse(content);

        if (!locationsData || !Array.isArray(locationsData.locations) || typeof locationsData.template !== 'string') {
          throw new Error('Invalid locations data structure');
        }
      } catch (parseError) {
        console.error('[ChatRoom] Failed to parse AI response:', parseError);
        console.error('[ChatRoom] Attempted to parse:', aiResponse.response || aiResponse.content);
        ws.send(JSON.stringify({
          type: 'error',
          error: 'Failed to parse LLM response'
        }));
        return;
      }

      console.log('[ChatRoom] Found', locationsData.locations.length, 'NEW locations to geocode');

      // If no new locations, return empty array (all locations already marked)
      if (locationsData.locations.length === 0) {
        console.log('[ChatRoom] No new locations found - all locations already marked');
        ws.send(JSON.stringify({
          type: 'assist_complete',
          replacements: [],
          locations: []
        }));
        return;
      }

      // Geocode each location using client tool delegation
      const geocodedLocations: any[] = [];
      for (const location of locationsData.locations) {
        try {
          const result = await this.requestClientTool('geocode', {
            location: location.name
          });

          geocodedLocations.push({
            ...location,
            lat: result.lat,
            lng: result.lng,
            placeName: result.place_name,
            geoId: `loc-${crypto.randomUUID()}`
          });

          console.log('[ChatRoom] Geocoded', location.name, '→', result.place_name);
        } catch (error) {
          console.error('[ChatRoom] Failed to geocode', location.name, ':', error);
          // Continue with other locations even if one fails
        }
      }

      // Build array of replacements (target text → geo-mark HTML)
      const replacements: Array<{ find: string; replaceWith: string }> = [];

      geocodedLocations.forEach((location, index) => {
        const colorIndex = index % 10; // We have 10 colors
        const geoMarkAttrs: any = {
          'data-geo-id': location.geoId,
          'data-place-name': location.placeName,
          'data-lat': location.lat,
          'data-lng': location.lng,
          'data-color-index': colorIndex,
          'data-coord-source': 'nominatim'
        };

        // Add transport info for non-first locations
        if (location.transportFrom) {
          geoMarkAttrs['data-transport-from'] = location.transportFrom;
        }
        if (location.transportMode) {
          geoMarkAttrs['data-transport-profile'] = location.transportMode;
        }

        const attrsString = Object.entries(geoMarkAttrs)
          .map(([key, value]) => `${key}="${value}"`)
          .join(' ');

        const geoMarkHtml = `<span class="geo-mark" ${attrsString}>${location.displayText}</span>`;

        // Add replacement instruction
        replacements.push({
          find: location.displayText, // The text to find (e.g., "Copenhagen")
          replaceWith: geoMarkHtml    // The geo-mark span to replace it with
        });
      });

      // Send replacements back to client
      ws.send(JSON.stringify({
        type: 'assist_complete',
        replacements: replacements,  // Array of {find, replaceWith}
        locations: geocodedLocations
      }));

    } catch (error) {
      console.error('[ChatRoom] Error in handleAssistRequest:', error);
      ws.send(JSON.stringify({
        type: 'error',
        error: error instanceof Error ? error.message : 'Unknown error'
      }));
    }
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
          content: `You are a helpful travel planning assistant. When users mention specific locations, use the geocode tool to get accurate coordinates.

IMPORTANT: Always respond in the SAME LANGUAGE as the user's message. If the user writes in Danish, respond in Danish. If they write in English, respond in English.

Format your responses as HTML paragraphs. After getting coordinates from the geocode tool, wrap location names in geo-mark spans with unique geo-ids:

For single locations:
<p>Here is <span class="geo-mark" data-geo-id="loc1" data-place-name="Paris, France" data-lat="48.8588897" data-lng="2.320041" data-color-index="0">Paris</span>.</p>

For routes between locations, geocode both locations and add transport attributes to the DESTINATION:
<p>Route from <span class="geo-mark" data-geo-id="loc1" data-place-name="Copenhagen, Denmark" data-lat="55.67" data-lng="12.56" data-color-index="0">Copenhagen</span> to <span class="geo-mark" data-geo-id="loc2" data-place-name="Roskilde, Denmark" data-lat="55.64" data-lng="12.08" data-color-index="1" data-transport-from="Copenhagen" data-transport-profile="driving">Roskilde</span> by car.</p>

IMPORTANT:
- Use SHORT display names inside the span (just "Copenhagen", not "Copenhagen, Denmark")
- Keep the full place name in data-place-name attribute
- For data-transport-from, you can use either the geo-id OR the simple display name (the system will match it)
- Add data-color-index incrementing from 0 for each unique location

Transport profiles: "driving" for car, "walking" for on foot, "cycling" for bike, "transit" for public transport.`
        },
        { role: "user", content: userMessage }
      ];

      console.log('[ChatRoom] Calling Cloudflare Workers AI...');

      // Convert CLIENT_TOOLS to tools format (Hermes model doesn't need type/function wrapper)
      const tools = CLIENT_TOOLS.map(({ name, description, parameters }) => ({
        name,
        description,
        parameters
      }));

      // Traditional function calling approach with loop
      let currentMessages = [...messages];
      const maxIterations = 5; // Prevent infinite loops
      let iterations = 0;
      let finalResponse = "";
      const messageId = crypto.randomUUID();

      while (iterations < maxIterations) {
        iterations++;
        console.log(`[ChatRoom] AI call iteration ${iterations}`);

        // Call AI with current messages and tools
        const response = await this.env.AI.run(
          "@hf/nousresearch/hermes-2-pro-mistral-7b",
          {
            messages: currentMessages,
            tools: tools
          }
        );

        console.log('[ChatRoom] AI response:', response);

        // Check if there are tool calls
        if (response.tool_calls && response.tool_calls.length > 0) {
          console.log(`[ChatRoom] Processing ${response.tool_calls.length} tool calls`);

          // Add assistant's message with tool calls
          currentMessages.push({
            role: "assistant",
            content: JSON.stringify(response.tool_calls)
          });

          // Execute all tool calls in parallel
          const toolPromises = response.tool_calls.map(async (toolCall) => {
            console.log(`[ChatRoom] Executing tool: ${toolCall.name}`, toolCall.arguments);

            try {
              // Request tool execution from client
              const toolResult = await this.requestClientTool(
                toolCall.name,
                toolCall.arguments
              );

              console.log(`[ChatRoom] Tool ${toolCall.name} result:`, toolResult);

              return {
                role: "tool",
                name: toolCall.name,
                content: JSON.stringify(toolResult)
              };
            } catch (error) {
              console.error(`[ChatRoom] Tool ${toolCall.name} error:`, error);
              return {
                role: "tool",
                name: toolCall.name,
                content: JSON.stringify({ error: error.message || String(error) })
              };
            }
          });

          // Wait for all tool results
          const toolResults = await Promise.all(toolPromises);

          // Add all tool results to messages
          for (const result of toolResults) {
            currentMessages.push(result);
          }

          // Continue loop to get final response with tool results
          continue;
        }

        // No tool calls, we have the final response
        if (response.response) {
          finalResponse = response.response;
          console.log('[ChatRoom] Final response received');
          break;
        } else {
          console.warn('[ChatRoom] No response or tool_calls in AI response');
          break;
        }
      }

      if (iterations >= maxIterations) {
        console.error('[ChatRoom] Max iterations reached, stopping');
        finalResponse = "I apologize, but I encountered an issue processing your request. Please try again.";
      }

      console.log('[ChatRoom] Full AI response:', finalResponse);

      // Send the complete response
      if (finalResponse) {
        const chunkMessage = {
          type: "ai_chunk",
          message_id: messageId,
          chunk: finalResponse,
          done: false
        };
        console.log('[ChatRoom] Sending chunk to client:', JSON.stringify(chunkMessage));
        this.broadcast(JSON.stringify(chunkMessage));
      }

      // Fallback if AI returned empty response
      if (!finalResponse.trim()) {
        console.warn('[ChatRoom] AI returned empty response, using fallback');
        finalResponse = "I apologize, but I'm having trouble generating a response right now. Please try again.";
      }

      // Also process HTML comment tool calls (fallback for models that don't use native function calling)
      let processedResponse = await this.processToolCalls(finalResponse);
      console.log('[ChatRoom] Response after processToolCalls:', processedResponse);

      // Post-process: Wrap plain text response in HTML if model didn't follow format
      if (!processedResponse.includes('<p>') && !processedResponse.includes('<h')) {
        console.log('[ChatRoom] Response is plain text, wrapping in HTML paragraphs');
        // Split by double newlines (paragraph breaks)
        const paragraphs = processedResponse.split(/\n\n+/).filter(p => p.trim());
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

      console.log('[ChatRoom] Final enhanced response being sent:', enhancedResponse);

      // Create complete AI message
      const aiMessage: ChatMessage = {
        id: messageId,
        document_id: documentId,
        user_id: userId,
        role: "assistant",
        content: enhancedResponse,
        metadata: { model: "hermes-2-pro-mistral-7b" },
        created_at: new Date().toISOString()
      };

      // Send completion
      const completionMessage = {
        type: "ai_chunk",
        message_id: messageId,
        chunk: "",
        done: true,
        message: aiMessage
      };
      console.log('[ChatRoom] Sending completion to client:', JSON.stringify(completionMessage));
      this.broadcast(JSON.stringify(completionMessage));
    } catch (error) {
      console.error("[ChatRoom] Error generating AI response:", error);
      this.broadcast(JSON.stringify({
        type: "error",
        error: "Failed to generate AI response"
      }));
    }
  }

  /**
   * Repair common JSON formatting errors from LLM
   * Fixes: {"key:value"} -> {"key":"value"}
   */
  private repairJSON(json: string): string {
    // Fix missing quotes after keys: {"key:value"} -> {"key":"value"}
    // Pattern: {" followed by word characters, then : without closing quote
    const fixedJson = json.replace(/\{"(\w+):([^"}]+)"\}/g, (match, key, value) => {
      // If value doesn't start with a quote, add quotes
      const quotedValue = value.trim().startsWith('"') ? value : `"${value.trim()}"`;
      return `{"${key}":${quotedValue}}`;
    });

    return fixedJson;
  }

  /**
   * Process tool calls in the LLM response
   * Detects <!-- TOOL:name:args --> patterns, executes them via client, and replaces with results
   */
  private async processToolCalls(response: string): Promise<string> {
    const toolCallPattern = /<!-- TOOL:(\w+):(.*?) -->/g;
    let processedResponse = response;
    const toolCalls: Array<{match: string; toolName: string; args: any}> = [];

    // Extract all tool calls
    let match: RegExpExecArray | null;
    while ((match = toolCallPattern.exec(response)) !== null) {
      try {
        const toolName = match[1];
        let argsJson = match[2];

        // Try to repair common JSON errors
        argsJson = this.repairJSON(argsJson);

        // Try to parse JSON
        const args = JSON.parse(argsJson);

        toolCalls.push({
          match: match[0],
          toolName,
          args
        });
      } catch (error) {
        console.error('[ChatRoom] Failed to parse tool call:', match[0]);
        console.error('[ChatRoom] Original JSON:', match[2]);
        console.error('[ChatRoom] After repair:', this.repairJSON(match[2]));
        console.error('[ChatRoom] Error:', error);

        // Still remove the malformed tool call from output
        processedResponse = processedResponse.replace(match[0], '');
      }
    }

    // Execute each tool call sequentially
    for (const toolCall of toolCalls) {
      try {
        console.log('[ChatRoom] Executing tool:', toolCall.toolName, 'with args:', toolCall.args);

        // Request tool execution from client
        const result = await this.requestClientTool(toolCall.toolName, toolCall.args);

        console.log('[ChatRoom] Tool result:', result);

        // Replace tool call with result (or empty string to remove the comment)
        // The LLM should generate geo-marks after receiving tool results
        processedResponse = processedResponse.replace(toolCall.match, '');
      } catch (error) {
        console.error('[ChatRoom] Tool execution failed:', error);
        // Remove the failed tool call from response
        processedResponse = processedResponse.replace(toolCall.match, '');
      }
    }

    return processedResponse;
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

    // Extract locations endpoint - uses LLM to detect locations in text
    if (url.pathname === "/api/extract-locations" && request.method === "POST") {
      try {
        const { text, existingLocations } = await request.json();

        if (!text || typeof text !== 'string') {
          return new Response(
            JSON.stringify({ error: 'Invalid request: text field required' }),
            { status: 400, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
          );
        }

        console.log('[ExtractLocations] Processing text:', text);
        console.log('[ExtractLocations] Existing locations:', existingLocations);

        // Build system prompt with existing locations info
        let systemPrompt = `You are a travel itinerary assistant. Convert the user's text into a structured ProseMirror document with geo-marks for locations and transportation information.

Return ONLY valid JSON in this exact ProseMirror format:
{
  "type": "doc",
  "content": [
    {
      "type": "paragraph",
      "content": [
        {"type": "text", "text": "I will cycle from "},
        {
          "type": "geoMark",
          "attrs": {
            "geoId": "loc-1",
            "placeName": "Lejre",
            "colorIndex": 0
          },
          "content": [{"type": "text", "text": "Lejre"}]
        },
        {"type": "text", "text": " to "},
        {
          "type": "geoMark",
          "attrs": {
            "geoId": "loc-2",
            "placeName": "Copenhagen",
            "colorIndex": 1,
            "transportFrom": "Lejre",
            "transportProfile": "cycling"
          },
          "content": [{"type": "text", "text": "Copenhagen"}]
        }
      ]
    }
  ]
}

Rules:
- Create unique geoId for each location (loc-1, loc-2, etc.)
- Set colorIndex starting from 0 and incrementing
- For destinations, add transportFrom (previous location name) and transportProfile
- Transport profiles: "walking", "driving", "cycling", "transit", "flight"
- Keep the original text's natural language
- Do not include lat/lng - frontend will geocode using placeName
- Do NOT add any extra marks to text nodes, only plain text and geoMark nodes`;

        // Add existing locations info if provided
        if (existingLocations && Array.isArray(existingLocations) && existingLocations.length > 0) {
          systemPrompt += `\n\nIMPORTANT: The following locations are ALREADY MARKED in the document with geo-marks. DO NOT create new geo-marks for these locations:
${existingLocations.map((loc: string) => `- ${loc}`).join('\n')}

When you see these location names in the text, leave them as plain text nodes (not geo-marks). Only create geo-marks for NEW locations that are not in this list.`;
        }

        systemPrompt += `\n\nReturn ONLY the JSON, no markdown, no explanation.`;

        // Call AI to extract locations
        const response = await env.AI.run(
          "@hf/nousresearch/hermes-2-pro-mistral-7b",
          {
            messages: [
              {
                role: "system",
                content: systemPrompt
              },
              {
                role: "user",
                content: `Convert to ProseMirror format:\n\n"${text}"`
              }
            ]
          }
        );

        console.log('[ExtractLocations] AI response:', response);

        // Parse the AI response
        let document = null;
        try {
          // The response might be wrapped in markdown code blocks
          let content = response.response || response.content || '';

          // Remove markdown code blocks if present
          content = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

          document = JSON.parse(content);

          // Validate it's a ProseMirror document
          if (!document || document.type !== 'doc') {
            console.error('[ExtractLocations] Invalid document structure');
            document = null;
          }
        } catch (parseError) {
          console.error('[ExtractLocations] Failed to parse AI response:', parseError);
          document = null;
        }

        console.log('[ExtractLocations] Generated document:', JSON.stringify(document));

        return new Response(
          JSON.stringify({ document }),
          {
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*"
            }
          }
        );
      } catch (error) {
        console.error('[ExtractLocations] Error:', error);
        return new Response(
          JSON.stringify({ error: 'Internal server error', locations: [] }),
          {
            status: 500,
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*"
            }
          }
        );
      }
    }

    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type"
        }
      });
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

    // WebSocket upgrade for assist (same as chat, uses same Durable Object)
    const assistMatch = url.pathname.match(/^\/assist\/(.+)$/);
    if (assistMatch && request.headers.get("Upgrade") === "websocket") {
      const documentId = assistMatch[1];

      // Get or create Durable Object for this document
      const id = env.CHAT_ROOM.idFromName(documentId);
      const stub = env.CHAT_ROOM.get(id);

      // Forward the WebSocket request to the Durable Object
      return stub.fetch(request);
    }

    return new Response("Not Found", { status: 404 });
  }
};
