const WebSocket = require('ws');
const crypto = require('crypto');

const TIPTAP_APP_SECRET = 'f6d9a7d903b990ce6b707be28ae19bf6941dcdc29a0137cd6233cd015a64fffe';
const TIPTAP_APP_ID = 'yko82w79';

function base64urlEncode(str) {
  return Buffer.from(str)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

function generateJWT(documentName) {
  const header = {
    alg: 'HS256',
    typ: 'JWT'
  };

  const now = Math.floor(Date.now() / 1000);
  const payload = {
    sub: 'test-user-123', // Required
    allowedDocumentNames: [documentName],
    iat: now,
    exp: now + (24 * 60 * 60),
  };

  const encodedHeader = base64urlEncode(JSON.stringify(header));
  const encodedPayload = base64urlEncode(JSON.stringify(payload));
  const message = `${encodedHeader}.${encodedPayload}`;

  const signature = crypto
    .createHmac('sha256', TIPTAP_APP_SECRET)
    .update(message)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');

  return `${message}.${signature}`;
}

async function testWebSocketConnection() {
  const documentName = 'test-document-' + Date.now();
  const token = generateJWT(documentName);

  console.log('Testing Tiptap Cloud WebSocket connection...');
  console.log('App ID:', TIPTAP_APP_ID);
  console.log('Document:', documentName);
  console.log('Token:', token.substring(0, 50) + '...');
  console.log('');

  // Tiptap Cloud uses Hocuspocus protocol
  const url = `wss://cloud.tiptap.dev/${TIPTAP_APP_ID}`;

  console.log('Connecting to:', url);
  console.log('');

  const ws = new WebSocket(url, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });

  ws.on('open', () => {
    console.log('✅ WebSocket opened successfully!');

    // Send Hocuspocus handshake message
    // Protocol: https://github.com/ueberdosis/hocuspocus/blob/main/packages/provider/src/HocuspocusProvider.ts
    const handshake = {
      type: 'auth',
      token: token
    };

    console.log('Sending handshake...');
    ws.send(JSON.stringify(handshake));
  });

  ws.on('message', (data) => {
    console.log('📨 Received message:', data.toString());
  });

  ws.on('error', (error) => {
    console.error('❌ WebSocket error:', error.message);
    if (error.message.includes('401')) {
      console.error('   → Authentication failed. Token might be invalid.');
    } else if (error.message.includes('403')) {
      console.error('   → Authorization failed. Check document permissions.');
    }
  });

  ws.on('close', (code, reason) => {
    console.log(`🔌 WebSocket closed with code ${code}`);
    if (reason) {
      console.log('   Reason:', reason.toString());
    }

    // WebSocket close codes
    switch(code) {
      case 1000:
        console.log('   → Normal closure');
        break;
      case 1001:
        console.log('   → Going away');
        break;
      case 1002:
        console.log('   → Protocol error');
        break;
      case 1003:
        console.log('   → Unsupported data');
        break;
      case 1006:
        console.log('   → Abnormal closure (no close frame received)');
        console.log('   → This usually means the server rejected the connection');
        break;
      case 1007:
        console.log('   → Invalid frame payload data');
        break;
      case 1008:
        console.log('   → Policy violation');
        break;
      case 1009:
        console.log('   → Message too big');
        break;
      case 1011:
        console.log('   → Internal server error');
        break;
      case 4000:
        console.log('   → Custom: Bad request');
        break;
      case 4001:
        console.log('   → Custom: Unauthorized');
        break;
      case 4003:
        console.log('   → Custom: Forbidden');
        break;
      default:
        console.log('   → Unknown close code');
    }
  });

  // Keep the script running for 10 seconds to see what happens
  setTimeout(() => {
    console.log('\nClosing connection...');
    ws.close();
    process.exit(0);
  }, 10000);
}

testWebSocketConnection().catch(console.error);