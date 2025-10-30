#!/usr/bin/env node

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://unocjfiipormnaujsuhk.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVub2NqZmlpcG9ybW5hdWpzdWhrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MTIxNTY5MCwiZXhwIjoyMDc2NzkxNjkwfQ.Nwx4TbcvbfwfinAMAmHV2PomT0fqtV_oylOUEREOCL0';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function createAIUser() {
  console.log('🤖 Creating AI Assistant user...\n');

  try {
    // Create the AI user with service role key (bypasses email confirmation)
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: 'ai-assistant@tourvision.internal',
      password: 'ai-assistant-secure-password-' + Math.random().toString(36).substring(7),
      email_confirm: true, // Skip email confirmation
      user_metadata: {
        full_name: 'AI Assistant',
        is_ai_user: true
      }
    });

    if (authError) {
      console.error('❌ Error creating auth user:', authError);
      return;
    }

    console.log('✅ Auth user created:', authData.user.id);
    console.log('   Email:', authData.user.email);
    console.log('   Email confirmed:', authData.user.email_confirmed_at ? 'Yes' : 'No');

    // Check if profile was auto-created by trigger
    const { data: profileData, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', authData.user.id)
      .single();

    if (profileError && profileError.code !== 'PGRST116') {
      console.error('⚠️ Error checking profile:', profileError);
    }

    if (profileData) {
      console.log('✅ Profile already exists (created by trigger)');
      console.log('   Full name:', profileData.full_name);
    } else {
      // Create profile manually if trigger didn't create it
      console.log('📝 Creating profile manually...');
      const { data: newProfile, error: insertError } = await supabase
        .from('profiles')
        .insert({
          id: authData.user.id,
          email: authData.user.email,
          full_name: 'AI Assistant'
        })
        .select()
        .single();

      if (insertError) {
        console.error('❌ Error creating profile:', insertError);
      } else {
        console.log('✅ Profile created:', newProfile.full_name);
      }
    }

    console.log('\n🎉 AI Assistant user created successfully!');
    console.log('\nUser ID to use in document-chat-listener.js:');
    console.log('  ', authData.user.id);
    console.log('\nYou can now update the listener to use this user ID for AI responses.');

  } catch (error) {
    console.error('❌ Unexpected error:', error);
  }
}

createAIUser().catch(console.error);
