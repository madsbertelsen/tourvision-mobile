// Simple WebSocket test for chat worker
const WebSocket = require('ws');

const WS_URL = 'wss://tourvision-chat.mads-9b9.workers.dev/chat/test-document';

console.log('Connecting to:', WS_URL);

const ws = new WebSocket(WS_URL);

ws.on('open', () => {
  console.log('✅ Connected!');

  // Send a test message
  setTimeout(() => {
    const message = {
      type: 'chat_message',
      content: 'Hello from test script',
      user_id: 'test-user-123',
      metadata: {}
    };

    console.log('Sending message:', message);
    ws.send(JSON.stringify(message));
  }, 1000);
});

ws.on('message', (data) => {
  console.log('📨 Received:', data.toString());

  try {
    const parsed = JSON.parse(data.toString());
    console.log('   Type:', parsed.type);
    if (parsed.type === 'ai_chunk') {
      console.log('   Chunk:', parsed.chunk);
      console.log('   Done:', parsed.done);
    }
  } catch (err) {
    console.error('Failed to parse:', err);
  }
});

ws.on('error', (error) => {
  console.error('❌ Error:', error);
});

ws.on('close', (code, reason) => {
  console.log(`🔌 Closed: ${code} - ${reason}`);
  process.exit(0);
});

// Keep alive for 30 seconds
setTimeout(() => {
  console.log('Timeout - closing connection');
  ws.close();
}, 30000);
