#!/usr/bin/env node

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'http://127.0.0.1:54321';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function testDocumentSync() {
  console.log('🔍 Testing document sync to Supabase...\n');

  try {
    // Login as test user
    console.log('1. Logging in as test user...');
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: 'test@example.com',
      password: 'TestPassword123!'
    });

    if (authError) {
      console.error('❌ Auth error:', authError);
      return;
    }

    console.log('✅ Logged in as:', authData.user.email);
    console.log('   User ID:', authData.user.id);

    // Try to insert a document
    console.log('\n2. Attempting to insert document...');
    const testDocument = {
      id: '00000000-0000-4000-8000-000000000001',
      title: 'Test Document Sync',
      description: 'Testing document sync',
      created_by: authData.user.id,
      status: 'planning',
      is_public: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    console.log('   Document data:', JSON.stringify(testDocument, null, 2));

    const { data, error: dbError } = await supabase
      .from('documents')
      .insert(testDocument)
      .select();

    if (dbError) {
      console.error('❌ Database error:', dbError);
      console.error('   Code:', dbError.code);
      console.error('   Message:', dbError.message);
      console.error('   Details:', dbError.details);
      console.error('   Hint:', dbError.hint);
      return;
    }

    console.log('✅ Document inserted successfully!');
    console.log('   Data:', JSON.stringify(data, null, 2));

    // Verify it exists
    console.log('\n3. Verifying document exists...');
    const { data: verifyData, error: verifyError } = await supabase
      .from('documents')
      .select('id, title, created_by')
      .eq('id', testDocument.id)
      .single();

    if (verifyError) {
      console.error('❌ Verification error:', verifyError);
      return;
    }

    console.log('✅ Document verified in database:');
    console.log('   ID:', verifyData.id);
    console.log('   Title:', verifyData.title);
    console.log('   Created By:', verifyData.created_by);

    // Cleanup
    console.log('\n4. Cleaning up test document...');
    const { error: deleteError } = await supabase
      .from('documents')
      .delete()
      .eq('id', testDocument.id);

    if (deleteError) {
      console.error('❌ Delete error:', deleteError);
      return;
    }

    console.log('✅ Test document deleted');
    console.log('\n✅ All tests passed! Document sync is working correctly.');

  } catch (error) {
    console.error('❌ Unexpected error:', error);
  }
}

testDocumentSync();
