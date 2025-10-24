const WebSocket = require('ws');

// Token provided by user
const PROVIDED_TOKEN = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpYXQiOjE3NjEyMjc1MzIsIm5iZiI6MTc2MTIyNzUzMiwiZXhwIjoxNzYxMzEzOTMyLCJpc3MiOiJodHRwczovL2Nsb3VkLnRpcHRhcC5kZXYiLCJhdWQiOiJ5a284Mnc3OSJ9.1IYXEI5BVvZKmaYo5vRR1jrykN8_JJje3LEe0_3QQUI';

// Decode the token to see its structure
function decodeJWT(token) {
  const parts = token.split('.');
  const header = JSON.parse(Buffer.from(parts[0], 'base64').toString());
  const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
  return { header, payload };
}

console.log('=== Decoding Provided Token ===\n');
const decoded = decodeJWT(PROVIDED_TOKEN);
console.log('Header:', JSON.stringify(decoded.header, null, 2));
console.log('Payload:', JSON.stringify(decoded.payload, null, 2));

// Convert timestamps to readable dates
console.log('\nTimestamps:');
console.log('iat:', new Date(decoded.payload.iat * 1000).toISOString());
console.log('nbf:', new Date(decoded.payload.nbf * 1000).toISOString());
console.log('exp:', new Date(decoded.payload.exp * 1000).toISOString());

// Test WebSocket connection
async function testConnection() {
  console.log('\n=== Testing WebSocket Connection with Provided Token ===\n');

  const url = 'wss://cloud.tiptap.dev/yko82w79';

  console.log('Connecting to:', url);
  console.log('Token (first 50 chars):', PROVIDED_TOKEN.substring(0, 50) + '...');

  const ws = new WebSocket(url, {
    headers: {
      'Authorization': `Bearer ${PROVIDED_TOKEN}`
    }
  });

  ws.on('open', () => {
    console.log('✅ WebSocket opened successfully!');

    // Try sending a test message
    ws.send(JSON.stringify({
      type: 'auth',
      token: PROVIDED_TOKEN
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