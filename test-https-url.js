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
    iat: now,
    nbf: now,
    exp: now + (24 * 60 * 60),
    iss: 'https://cloud.tiptap.dev',
    aud: TIPTAP_APP_ID
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

async function testHttpsUrl() {
  const documentName = 'test-doc-' + Date.now();
  const token = generateJWT(documentName);

  console.log('Testing with HTTPS URLs for Tiptap Cloud...');
  console.log('App ID:', TIPTAP_APP_ID);
  console.log('Document name:', documentName);
  console.log('Token (first 50 chars):', token.substring(0, 50) + '...');
  console.log('');

  // Create Y.Doc
  const ydoc = new Y.Doc();

  // Test different URL formats - with HTTPS
  const urlsToTest = [
    `https://${TIPTAP_APP_ID}.collab.tiptap.cloud`,  // HTTPS version
    `https://collab.tiptap.cloud`,  // Base HTTPS URL
    `wss://${TIPTAP_APP_ID}.collab.tiptap.cloud`,  // WebSocket version we know works
  ];

  for (const url of urlsToTest) {
    console.log(`\nTrying URL: ${url}`);
    console.log('=' .repeat(50));

    try {
      const provider = new HocuspocusProvider({
        url: url,
        name: documentName,
        token: token,
        document: ydoc,
        WebSocketPolyfill: WebSocket,

        onConnect: () => {
          console.log('✅ SUCCESS! Connected to:', url);
          console.log('This is the correct URL format!');

          // Try to set some content
          const ytext = ydoc.getText('content');
          ytext.insert(0, 'Hello from Node.js with correct URL!');

          setTimeout(() => {
            console.log('Document content:', ytext.toString());
            provider.destroy();
            process.exit(0);
          }, 2000);
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
          console.log('✅ Document synced! State:', state);
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

      // If not connected, destroy and try next URL
      provider.destroy();

    } catch (error) {
      console.error('❌ Failed to create provider:', error.message);
    }
  }

  console.log('\n\n❌ Could not connect to any of the tested URLs.');
  console.log('\nThe HocuspocusProvider might internally convert HTTPS to WSS.');

  process.exit(1);
}

testHttpsUrl().catch(console.error);