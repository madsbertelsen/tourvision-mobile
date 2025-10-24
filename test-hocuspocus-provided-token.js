const { HocuspocusProvider } = require('@hocuspocus/provider');
const Y = require('yjs');
const WebSocket = require('ws');

const PROVIDED_TOKEN = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpYXQiOjE3NjEyMjc1MzIsIm5iZiI6MTc2MTIyNzUzMiwiZXhwIjoxNzYxMzEzOTMyLCJpc3MiOiJodHRwczovL2Nsb3VkLnRpcHRhcC5kZXYiLCJhdWQiOiJ5a284Mnc3OSJ9.1IYXEI5BVvZKmaYo5vRR1jrykN8_JJje3LEe0_3QQUI';
const TIPTAP_APP_ID = 'yko82w79';

async function testHocuspocusConnection() {
  const documentName = 'test-doc-' + Date.now();

  console.log('Testing HocuspocusProvider with provided token...');
  console.log('App ID:', TIPTAP_APP_ID);
  console.log('Document:', documentName);
  console.log('Token (first 50 chars):', PROVIDED_TOKEN.substring(0, 50) + '...');
  console.log('');

  // Create Y.Doc
  const ydoc = new Y.Doc();

  // Test different URL formats - based on Tiptap docs
  const urlsToTry = [
    `wss://cloud.tiptap.dev`,  // Base URL, let provider add the path
    `wss://connect.tiptap.dev`,  // Alternative subdomain
    `wss://collab.tiptap.dev`,  // Another possible subdomain
  ];

  for (const url of urlsToTry) {
    console.log(`\nTrying URL: ${url}`);
    console.log('=' .repeat(50));

    try {
      const provider = new HocuspocusProvider({
        url: url,
        name: documentName,
        document: ydoc,
        token: PROVIDED_TOKEN,
        WebSocketPolyfill: WebSocket,

        onConnect: () => {
          console.log('✅ Connected successfully!');
          console.log('   This is the correct URL format!');

          // Try to sync some data
          const ytext = ydoc.getText('content');
          ytext.insert(0, 'Test from Node.js!');

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

            // Decode close codes
            switch(event.code) {
              case 1000: console.log('   → Normal closure'); break;
              case 1006: console.log('   → Abnormal closure (server rejected connection)'); break;
              case 4000: console.log('   → Bad request'); break;
              case 4001: console.log('   → Unauthorized'); break;
              case 4003: console.log('   → Forbidden'); break;
            }
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

  console.log('\n\nNone of the URLs worked. Possible issues:');
  console.log('1. The WebSocket URL format is different than expected');
  console.log('2. The token needs additional claims (like "sub" for user ID)');
  console.log('3. The app might need specific configuration in Tiptap Cloud dashboard');
  console.log('4. There might be an allowlist/CORS configuration needed');

  process.exit(1);
}

testHocuspocusConnection().catch(console.error);