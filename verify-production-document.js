#!/usr/bin/env node

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://unocjfiipormnaujsuhk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVub2NqZmlpcG9ybW5hdWpzdWhrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjEyMTU2OTAsImV4cCI6MjA3Njc5MTY5MH0.GAMDmtZOvoHzJ2sesN7NC24Q8FYVuEHZlsvYvsQQEBU';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function verifyDocument() {
  console.log('🔍 Verifying document in PRODUCTION database...\n');

  const documentId = '9d74e59e-5949-4f2e-943d-04df168f8a9b';

  try {
    // Login as test user
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: 'test@example.com',
      password: 'TestPassword123!'
    });

    if (authError) {
      console.error('❌ Auth error:', authError);
      return;
    }

    console.log('✅ Logged in as:', authData.user.email);

    // Check if document exists
    const { data, error } = await supabase
      .from('documents')
      .select('id, title, created_by, created_at')
      .eq('id', documentId)
      .maybeSingle();

    if (error) {
      console.error('❌ Query error:', error);
      return;
    }

    if (!data) {
      console.log('❌ Document NOT found in database');
      return;
    }

    console.log('✅ Document found in production database:');
    console.log('   ID:', data.id);
    console.log('   Title:', data.title);
    console.log('   Created By:', data.created_by);
    console.log('   Created At:', data.created_at);
    console.log('\n✅ SUCCESS! Document sync is working correctly!');

  } catch (error) {
    console.error('❌ Unexpected error:', error);
  }
}

verifyDocument();
