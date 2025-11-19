import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://unocjfiipormnaujsuhk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVub2NqZmlpcG9ybW5hdWpzdWhrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjEyMTU2OTAsImV4cCI6MjA3Njc5MTY5MH0.5jg9z9x1FggO6Uv2DQr_TiBZhVlJqLdFBNUaPx8XJLw';

console.log('Creating Supabase client...');
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  realtime: {
    params: {
      eventsPerSecond: 10
    },
    timeout: 30000,
    heartbeatIntervalMs: 15000
  }
});

console.log('Subscribing to document_activity...');
const channel = supabase
  .channel('test-activity')
  .on(
    'postgres_changes',
    {
      event: 'INSERT',
      schema: 'public',
      table: 'document_activity'
    },
    (payload) => {
      console.log('✅ Received event:', payload);
    }
  )
  .subscribe((status, err) => {
    console.log('Subscription status:', status);
    if (err) {
      console.error('Subscription error:', err);
    }
  });

// Keep script running
console.log('Waiting for events (Ctrl+C to exit)...');
setTimeout(() => {
  console.log('Test complete - exiting');
  supabase.removeChannel(channel);
  process.exit(0);
}, 60000); // 60 seconds
