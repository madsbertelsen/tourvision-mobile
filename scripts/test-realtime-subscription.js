#!/usr/bin/env node

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: 'expo-app/.env.local' });

// Configuration - read from environment
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVub2NqZmlpcG9ybW5hdWpzdWhrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MTIxNTY5MCwiZXhwIjoyMDc2NzkxNjkwfQ.Nwx4TbcvbfwfinAMAmHV2PomT0fqtV_oylOUEREOCL0';

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('❌ Missing required environment variables');
  console.error('   Make sure expo-app/.env.local has EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY');
  process.exit(1);
}

// Test document ID
const TEST_DOCUMENT_ID = '48e89c28-a4bc-4a60-a04b-667e1db038d8';
const TEST_USER_ID = '40bd2cb5-e813-4fcd-9605-f8945122b923';

console.log('🧪 Realtime Subscription Test');
console.log('=' .repeat(50));
console.log('');

// Create client for subscriptions (service role key for full access)
const supabaseRealtime = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  realtime: {
    params: {
      eventsPerSecond: 10
    }
  },
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

// Create client for data operations (use service role key)
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

let eventReceived = false;
let receivedPayload = null;
let testMessageId = null;

async function runTest() {
  console.log('📡 Step 1: Setting up realtime subscription...');
  console.log('   Note: This test will monitor for ANY new message inserted via the UI or API');

  // Set up the subscription
  const channel = supabaseRealtime
    .channel('test-document-chats')
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'document_chats'
      },
      (payload) => {
        console.log('\n✅ EVENT RECEIVED!');
        console.log('   Payload:', JSON.stringify(payload, null, 2));
        eventReceived = true;
        receivedPayload = payload;
      }
    );

  // Subscribe and wait for connection
  await new Promise((resolve, reject) => {
    channel.subscribe((status, error) => {
      console.log(`   Subscription status: ${status}`);

      if (error) {
        console.error('   ❌ Subscription error:', error);
        reject(error);
      }

      if (status === 'SUBSCRIBED') {
        console.log('   ✅ Successfully subscribed to document_chats');
        resolve();
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        reject(new Error(`Subscription failed with status: ${status}`));
      }
    });
  });

  // Wait a moment to ensure subscription is fully ready
  console.log('\n⏳ Step 2: Waiting 2 seconds for subscription to stabilize...');
  await new Promise(resolve => setTimeout(resolve, 2000));

  console.log('\n⏳ Step 3: Waiting for a message to be sent (waiting 30 seconds)...');
  console.log('   💡 TIP: Open http://localhost:8082/document/48e89c28-a4bc-4a60-a04b-667e1db038d8');
  console.log('   💡 TIP: Send a message in the chat to trigger the realtime event');
  console.log('');

  // Wait for the event to be received
  const maxWaitTime = 30000;
  const startTime = Date.now();

  while (!eventReceived && (Date.now() - startTime) < maxWaitTime) {
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  console.log('\n📊 Test Results:');
  console.log('=' .repeat(50));

  if (eventReceived) {
    console.log('✅ SUCCESS: Realtime event was received!');
    console.log('');
    console.log('   Event Details:');
    console.log(`   - Event Type: ${receivedPayload.eventType}`);
    console.log(`   - Table: ${receivedPayload.table}`);
    console.log(`   - Schema: ${receivedPayload.schema}`);
    console.log(`   - Message ID: ${receivedPayload.new.id}`);
    console.log(`   - Content: "${receivedPayload.new.content}"`);
    console.log('');
    console.log('   ✅ The listener pattern is working correctly!');
  } else {
    console.log('❌ FAILURE: Realtime event was NOT received');
    console.log('');
    console.log('   Possible causes:');
    console.log('   1. Realtime not enabled on the table (check publication)');
    console.log('   2. RLS policies blocking the subscription');
    console.log('   3. WebSocket connection issues');
    console.log('   4. Event filtering not matching');
    console.log('');
    console.log('   Debug steps:');
    console.log('   - Check if publication exists:');
    console.log('     SELECT * FROM pg_publication_tables WHERE tablename = \'document_chats\';');
    console.log('   - Verify RLS policies allow SELECT for anonymous role');
    console.log('   - Check network/firewall settings');
  }

  // Cleanup
  console.log('\n🧹 Step 4: Cleaning up...');

  // Unsubscribe
  await channel.unsubscribe();
  console.log('   ✅ Unsubscribed from channel');

  console.log('\n' + '='.repeat(50));
  console.log(eventReceived ? '✅ TEST PASSED' : '❌ TEST FAILED');
  console.log('='.repeat(50));

  process.exit(eventReceived ? 0 : 1);
}

// Handle errors
process.on('unhandledRejection', (error) => {
  console.error('\n❌ Unhandled error:', error);
  process.exit(1);
});

// Run the test
runTest().catch((error) => {
  console.error('\n❌ Test failed with error:', error);
  process.exit(1);
});
