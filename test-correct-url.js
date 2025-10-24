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

  // Match the format from the provided token exactly
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

async function testCorrectUrl() {
  const documentName = 'test-doc-' + Date.now();
  const token = generateJWT(documentName);

  console.log('Testing with correct Tiptap Cloud URL format...');
  console.log('App ID:', TIPTAP_APP_ID);
  console.log('Document name:', documentName);
  console.log('Token (first 50 chars):', token.substring(0, 50) + '...');
  console.log('');

  // Create Y.Doc
  const ydoc = new Y.Doc();

  // According to search results, the URL should be:
  // wss://YOUR_APP_ID.collab.tiptap.cloud/
  const correctUrls = [
    `wss://${TIPTAP_APP_ID}.collab.tiptap.cloud`,
    `wss://${TIPTAP_APP_ID}.collab.tiptap.cloud/`,
    `wss://collab.tiptap.cloud/${TIPTAP_APP_ID}`,
    `wss://connect.tiptap.dev`,  // Alternative subdomain from search
    `wss://${TIPTAP_APP_ID}.connect.tiptap.dev`,
  ];

  for (const url of correctUrls) {
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
          ytext.insert(0, 'Hello from Node.js!');

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

            if (event.code === 1006) {
              console.log('   → Server rejected the connection (likely 404 or wrong URL)');
            }
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
  console.log('\nTested URLs:');
  correctUrls.forEach(url => console.log(`  - ${url}`));

  console.log('\nThe issue might be:');
  console.log('1. Need to use TiptapCollabProvider instead of HocuspocusProvider');
  console.log('2. The app needs to be activated/configured in Tiptap dashboard');
  console.log('3. Missing required JWT claims or wrong secret');
  console.log('4. The WebSocket endpoint requires special headers or parameters');

  process.exit(1);
}

testCorrectUrl().catch(console.error);