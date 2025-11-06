#!/usr/bin/env node

/**
 * Test script for verifying runWithTools implementation
 * This connects to a new document ID to get a fresh Durable Object
 */

const WebSocket = require('ws');

const WS_URL = 'wss://tourvision-chat.mads-9b9.workers.dev';
// Use a unique document ID with timestamp to ensure fresh Durable Object
const DOCUMENT_ID = `test-runwithtools-${Date.now()}`;
const USER_ID = 'test-user-123';

console.log('Testing runWithTools implementation...');
console.log('Connecting to document:', DOCUMENT_ID);
console.log('WebSocket URL:', `${WS_URL}/chat/${DOCUMENT_ID}`);

const ws = new WebSocket(`${WS_URL}/chat/${DOCUMENT_ID}`);

let messageCount = 0;
let toolRequestReceived = false;

ws.on('open', () => {
  console.log('\n✅ Connected to WebSocket');

  // Wait a moment for history message
  setTimeout(() => {
    console.log('\n📤 Sending test message that should trigger tool calling...');
    const message = {
      type: 'chat_message',
      content: 'Show me the route from Copenhagen to Paris by car',
      user_id: USER_ID
    };
    ws.send(JSON.stringify(message));
    console.log('Message sent:', message.content);
  }, 1000);
});

ws.on('message', (data) => {
  messageCount++;
  const message = JSON.parse(data);

  console.log(`\n📥 Message ${messageCount}:`, message.type);

  switch (message.type) {
    case 'history':
      console.log('   → Received history (empty for new document)');
      break;

    case 'message':
      if (message.message.role === 'user') {
        console.log('   → User message echoed back');
      } else if (message.message.role === 'assistant') {
        if (message.message.metadata?.processing) {
          console.log('   → AI processing acknowledgment');
        } else {
          console.log('   → AI response received');
        }
      }
      break;

    case 'ai_chunk':
      if (message.done) {
        console.log('   → AI response complete');
        console.log('\nFinal message content preview:');
        console.log(message.message?.content?.substring(0, 200) + '...');

        if (!toolRequestReceived) {
          console.log('\n⚠️  No tool_request messages received!');
          console.log('This suggests runWithTools may not be calling the toolExecutor.');
        } else {
          console.log('\n✅ Tool requests were received and handled!');
        }

        // Close connection after response
        setTimeout(() => {
          ws.close();
        }, 2000);
      } else {
        // Don't log every chunk, just count them
        if (!message.chunk) {
          console.log('   → Empty chunk');
        }
      }
      break;

    case 'tool_request':
      toolRequestReceived = true;
      console.log('   → 🔧 TOOL REQUEST RECEIVED!');
      console.log('      Tool:', message.tool_name);
      console.log('      Args:', JSON.stringify(message.args));
      console.log('      Tool ID:', message.tool_id);

      // Send mock tool response
      const toolResponse = {
        type: 'tool_result',
        tool_id: message.tool_id,
        result: message.tool_name === 'geocode'
          ? {
              place_name: message.args.location,
              lat: 48.8566 + Math.random() * 0.1,
              lng: 2.3522 + Math.random() * 0.1,
              source: 'test'
            }
          : {
              from: { place_name: message.args.fromLocation, lat: 55.6761, lng: 12.5683 },
              to: { place_name: message.args.toLocation, lat: 48.8566, lng: 2.3522 },
              profile: 'driving',
              distance: 1200000,
              duration: 43200,
              waypoints: []
            }
      };

      console.log('   → 📤 Sending tool result back');
      ws.send(JSON.stringify(toolResponse));
      break;

    case 'error':
      console.log('   → ❌ ERROR:', message.error);
      break;

    default:
      console.log('   → Unknown message type');
  }
});

ws.on('error', (error) => {
  console.error('\n❌ WebSocket error:', error);
});

ws.on('close', (code, reason) => {
  console.log('\n🔌 WebSocket closed');
  console.log('   Code:', code);
  console.log('   Reason:', reason || '(no reason)');
  console.log('\n📊 Summary:');
  console.log('   Messages received:', messageCount);
  console.log('   Tool requests:', toolRequestReceived ? 'Yes ✅' : 'No ❌');

  if (!toolRequestReceived) {
    console.log('\n❗ The runWithTools implementation may not be working correctly.');
    console.log('   Expected to see tool_request messages for geocode and route tools.');
  }

  process.exit(0);
});

// Timeout after 30 seconds
setTimeout(() => {
  console.log('\n⏱️ Test timeout after 30 seconds');
  ws.close();
}, 30000);