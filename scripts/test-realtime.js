#!/usr/bin/env node

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://unocjfiipormnaujsuhk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVub2NqZmlpcG9ybW5hdWpzdWhrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjEyMTU2OTAsImV4cCI6MjA3Njc5MTY5MH0.GAMDmtZOvoHzJ2sesN7NC24Q8FYVuEHZlsvYvsQQEBU';

console.log('🧪 Testing Supabase Realtime Connection');
console.log('📡 URL:', SUPABASE_URL);

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Test a simple channel first
const testChannel = supabase
  .channel('test-channel')
  .subscribe((status, error) => {
    console.log('📡 Test channel status:', status);
    if (error) {
      console.error('❌ Test channel error:', error);
    }
    if (status === 'SUBSCRIBED') {
      console.log('✅ Basic realtime connection works!');
      console.log('Now testing document_chats table...');

      // Now test the actual table subscription
      const tableChannel = supabase
        .channel('document-chats-test')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'document_chats'
          },
          (payload) => {
            console.log('📨 Received change:', payload);
          }
        )
        .subscribe((tableStatus, tableError) => {
          console.log('📡 Table subscription status:', tableStatus);
          if (tableError) {
            console.error('❌ Table subscription error:', JSON.stringify(tableError, null, 2));
          }
          if (tableStatus === 'SUBSCRIBED') {
            console.log('✅ document_chats subscription works!');
          } else if (tableStatus === 'CHANNEL_ERROR') {
            console.error('❌ Table subscription failed - realtime might not be enabled for document_chats');
          }
        });
    } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
      console.error('❌ Basic realtime connection failed!');
      console.error('This means there is a problem with the Supabase realtime service or network');
    }
  });

// Keep script running
process.stdin.resume();

// Exit after 30 seconds
setTimeout(() => {
  console.log('\n⏰ Test complete');
  process.exit(0);
}, 30000);
