const { HocuspocusProvider } = require('@hocuspocus/provider');
const Y = require('yjs');
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

async function testHocuspocusConnection() {
  const documentName = 'test-doc-' + Date.now();
  const token = generateJWT(documentName);

  console.log('Testing HocuspocusProvider connection to Tiptap Cloud...');
  console.log('App ID:', TIPTAP_APP_ID);
  console.log('Document:', documentName);
  console.log('Token (first 50 chars):', token.substring(0, 50) + '...');
  console.log('');

  // Create Y.Doc
  const ydoc = new Y.Doc();

  // Test different URL formats
  const urlsToTry = [
    `wss://cloud.tiptap.dev/${TIPTAP_APP_ID}`,
    `wss://${TIPTAP_APP_ID}.cloud.tiptap.dev`,
    `wss://cloud.tiptap.dev/collaboration/${TIPTAP_APP_ID}`,
    `wss://cloud.tiptap.dev/api/${TIPTAP_APP_ID}`,
    `wss://collab.tiptap.dev/${TIPTAP_APP_ID}`,
  ];

  for (const url of urlsToTry) {
    console.log(`\nTrying URL: ${url}`);
    console.log('=' .repeat(50));

    try {
      const provider = new HocuspocusProvider({
        url: url,
        name: documentName,
        document: ydoc,
        token: token,
        WebSocketPolyfill: WebSocket,

        onConnect: () => {
          console.log('✅ Connected successfully!');
          console.log('   This is the correct URL format!');
          process.exit(0);
        },

        onDisconnect: ({ event }) => {
          console.log('❌ Disconnected');
          if (event) {
            console.log('   Event:', event.code, event.reason);
          }
        },

        onStatus: ({ status }) => {
          console.log('📡 Status:', status);
        },

        onAuthenticationFailed: ({ reason }) => {
          console.error('🔒 Authentication failed:', reason);
        },

        onSynced: ({ state }) => {
          console.log('✅ Document synced!');
        },

        onError: ({ error }) => {
          console.error('❌ Error:', error.message);
        },

        onClose: ({ event }) => {
          console.log('🔌 Connection closed');
          if (event) {
            console.log('   Code:', event.code);
            console.log('   Reason:', event.reason || '(none)');
          }
        }
      });

      // Give it 3 seconds to connect
      await new Promise(resolve => setTimeout(resolve, 3000));

      // If still not connected, destroy and try next URL
      provider.destroy();

    } catch (error) {
      console.error('❌ Failed to create provider:', error.message);
    }
  }

  console.log('\n\nNone of the URLs worked. The issue might be:');
  console.log('1. JWT token format is incorrect');
  console.log('2. App secret is wrong');
  console.log('3. Tiptap Cloud server is expecting a different protocol');
  console.log('4. The app needs to be configured differently in Tiptap Cloud dashboard');

  process.exit(1);
}

testHocuspocusConnection().catch(console.error);