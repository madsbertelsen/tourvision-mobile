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

async function testTiptapProvider() {
  const documentName = 'document.name'; // Using exact format from Tiptap docs
  const token = generateJWT(documentName);

  console.log('Testing Tiptap Collab Provider with exact documentation format...');
  console.log('App ID:', TIPTAP_APP_ID);
  console.log('Document name:', documentName);
  console.log('\nGenerated Token:');
  console.log(token);
  console.log('\nDecoded payload:');
  const parts = token.split('.');
  const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
  console.log(JSON.stringify(payload, null, 2));
  console.log('');

  // Create Y.Doc
  const ydoc = new Y.Doc();

  // According to Tiptap docs, the URL should NOT include the appId
  // The appId is passed as a separate parameter in their cloud provider
  // But since we're using HocuspocusProvider directly, let's try their cloud URL
  const baseUrl = 'wss://cloud.tiptap.dev';

  console.log(`Connecting to: ${baseUrl}`);
  console.log('=' .repeat(50));

  try {
    const provider = new HocuspocusProvider({
      // Using the exact structure from Tiptap docs
      url: baseUrl,
      name: documentName,  // Using 'name' not 'documentName'
      appId: TIPTAP_APP_ID, // This might be the missing piece
      token: token,
      document: ydoc,
      WebSocketPolyfill: WebSocket,

      onConnect: () => {
        console.log('✅ Connected successfully!');

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
        }
      }
    });

    // Give it 5 seconds to connect
    await new Promise(resolve => setTimeout(resolve, 5000));

    // If still not connected, try with appId in URL
    console.log('\n\nFirst attempt didn\'t connect. Trying with appId in URL...');
    provider.destroy();

    // Try with appId in the URL
    const urlWithAppId = `wss://cloud.tiptap.dev/${TIPTAP_APP_ID}`;
    console.log(`\nConnecting to: ${urlWithAppId}`);
    console.log('=' .repeat(50));

    const provider2 = new HocuspocusProvider({
      url: urlWithAppId,
      name: documentName,
      token: token,
      document: ydoc,
      WebSocketPolyfill: WebSocket,

      onConnect: () => {
        console.log('✅ Connected successfully with appId in URL!');
        process.exit(0);
      },

      onAuthenticationFailed: ({ reason }) => {
        console.error('🔒 Authentication failed:', reason);
      },

      onClose: ({ event }) => {
        console.log('🔌 Connection closed');
        if (event) {
          console.log('   Code:', event.code);
          console.log('   Reason:', event.reason || '(none)');
        }
      }
    });

    // Give it 5 seconds to connect
    await new Promise(resolve => setTimeout(resolve, 5000));
    provider2.destroy();

  } catch (error) {
    console.error('❌ Failed to create provider:', error.message);
  }

  console.log('\n\n❌ Could not connect to Tiptap Cloud.');
  console.log('\nPossible issues:');
  console.log('1. The JWT format or secret is incorrect');
  console.log('2. The WebSocket URL format is different than expected');
  console.log('3. The app needs specific configuration in Tiptap dashboard');
  console.log('4. Missing required JWT claims (like sub for user ID)');

  process.exit(1);
}

testTiptapProvider().catch(console.error);