const jwt = require('jsonwebtoken');

const TIPTAP_APP_SECRET = 'f6d9a7d903b990ce6b707be28ae19bf6941dcdc29a0137cd6233cd015a64fffe';

function generateTiptapJWT() {
  const payload = {
    // The payload contains claims like the user ID, which can be used to identify the user
    sub: 'test-user-123',

    // Optional: restrict to specific documents
    allowedDocumentNames: ['test-document'],
  };

  // Sign with the secret key - this is the official way per Tiptap docs
  const token = jwt.sign(payload, TIPTAP_APP_SECRET);

  console.log('Generated JWT using jsonwebtoken library:');
  console.log(token);
  console.log('\nDecoded payload:');

  // Verify and decode
  try {
    const decoded = jwt.verify(token, TIPTAP_APP_SECRET);
    console.log(JSON.stringify(decoded, null, 2));
  } catch (error) {
    console.error('Failed to verify token:', error.message);
  }

  return token;
}

// Test the JWT
const token = generateTiptapJWT();

// Now test the WebSocket connection
const WebSocket = require('ws');

async function testConnection() {
  console.log('\n=== Testing WebSocket Connection ===\n');

  // Try the standard Tiptap Cloud URL format
  const url = 'wss://cloud.tiptap.dev/yko82w79';

  console.log('Connecting to:', url);
  console.log('Token (first 50 chars):', token.substring(0, 50) + '...');

  const ws = new WebSocket(url, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });

  ws.on('open', () => {
    console.log('✅ WebSocket opened successfully!');
    console.log('The JWT format is correct!');

    // Try sending a test message
    ws.send(JSON.stringify({
      type: 'auth',
      token: token
    }));
  });

  ws.on('message', (data) => {
    console.log('📨 Received message:', data.toString());
  });

  ws.on('error', (error) => {
    console.error('❌ WebSocket error:', error.message);
  });

  ws.on('close', (code, reason) => {
    console.log(`🔌 WebSocket closed with code ${code}`);
    if (reason) {
      console.log('   Reason:', reason.toString());
    }
  });

  // Keep running for 5 seconds
  setTimeout(() => {
    console.log('\nClosing connection...');
    ws.close();
    process.exit(0);
  }, 5000);
}

testConnection().catch(console.error);