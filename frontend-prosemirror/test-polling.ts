/**
 * Simple test script to verify polling mode works
 * Uses hardcoded production credentials
 */

import { createAgentDatabase } from './shared/database.js';

// Hardcoded production credentials
const SUPABASE_URL = 'https://unocjfiipormnaujsuhk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVub2NqZmlpcG9ybW5hdWpzdWhrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjEyMTU2OTAsImV4cCI6MjA3Njc5MTY5MH0.5jg9z9x1FggO6Uv2DQr_TiBZhVlJqLdFBNUaPx8XJLw';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVub2NqZmlpcG9ybW5hdWpzdWhrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MTIxNTY5MCwiZXhwIjoyMDc2NzkxNjkwfQ.Nwx4TbcvbfwfinAMAmHV2PomT0fqtV_oylOUEREOCL0';

console.log('🧪 Testing polling mode...');
console.log('');

// Create database client
const db = createAgentDatabase(SUPABASE_URL, SUPABASE_SERVICE_KEY, SUPABASE_ANON_KEY);

// Start polling
console.log('📊 Starting polling (interval: 3000ms)...');
const unsubscribe = db.pollDocumentActivity(
  (event) => {
    console.log('');
    console.log('📨 Received event:');
    console.log('  Document:', event.document_id);
    console.log('  Event Type:', event.event_type);
    console.log('  User Count:', event.user_count);
    console.log('  Timestamp:', event.timestamp);
    console.log('');
  },
  3000 // Poll every 3 seconds
);

// Run for 60 seconds then exit
console.log('⏱️  Running for 60 seconds...');
console.log('');

setTimeout(() => {
  console.log('');
  console.log('✅ Test complete - stopping polling');
  unsubscribe();
  process.exit(0);
}, 60000);

// Handle Ctrl+C
process.on('SIGINT', () => {
  console.log('');
  console.log('🛑 Interrupted - stopping polling');
  unsubscribe();
  process.exit(0);
});
