#!/usr/bin/env node

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://unocjfiipormnaujsuhk.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVub2NqZmlpcG9ybW5hdWpzdWhrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MTIxNTY5MCwiZXhwIjoyMDc2NzkxNjkwfQ.Nwx4TbcvbfwfinAMAmHV2PomT0fqtV_oylOUEREOCL0';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function checkAIUser() {
  console.log('🔍 Checking for AI user...\n');

  // Check documents table
  const { data: documents, error: docsError } = await supabase
    .from('documents')
    .select('id, title, created_by')
    .limit(5);

  if (docsError) {
    console.error('Error fetching documents:', docsError);
  } else {
    console.log('📄 Sample documents:');
    documents.forEach(doc => {
      console.log(`  - ${doc.title} (created_by: ${doc.created_by})`);
    });
    console.log('');
  }

  // Check document_chats table
  const { data: chats, error: chatsError } = await supabase
    .from('document_chats')
    .select('id, user_id, role, content')
    .eq('role', 'assistant')
    .limit(3);

  if (chatsError) {
    console.error('Error fetching chats:', chatsError);
  } else {
    console.log('💬 Sample assistant messages:');
    chats.forEach(chat => {
      console.log(`  - User ID: ${chat.user_id}`);
      console.log(`    Content: ${chat.content.substring(0, 50)}...`);
    });
    console.log('');
  }

  // Suggest creating an AI user
  console.log('💡 Recommendation:');
  console.log('   For AI responses, you can either:');
  console.log('   1. Use the document owner\'s user_id (replies as themselves)');
  console.log('   2. Create a dedicated AI user account');
  console.log('   3. Use a system user ID');
}

checkAIUser().catch(console.error);
