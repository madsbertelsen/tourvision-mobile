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

async function applyRLSPolicy() {
  console.log('🔧 Applying RLS policy for AI user...\n');

  try {
    const sql = `
      CREATE POLICY "AI user can insert assistant messages" ON public.document_chats
          FOR INSERT
          TO authenticated
          WITH CHECK (
              user_id = '9e33f156-c21d-4234-939f-bc3455e2e5c2'::uuid
              AND role = 'assistant'
          );
    `;

    const { data, error } = await supabase.rpc('exec', { sql });

    if (error) {
      console.error('❌ Error applying policy:', error);

      // Try alternative approach using direct SQL
      console.log('\n🔄 Trying alternative approach...\n');

      const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_SERVICE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`
        },
        body: JSON.stringify({ query: sql })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Alternative approach failed:', errorText);
        console.log('\n⚠️ Please apply the policy manually in Supabase Dashboard:');
        console.log('\nGo to: https://supabase.com/dashboard/project/unocjfiipormnaujsuhk/database/policies');
        console.log('\nThen run this SQL:\n');
        console.log(sql);
        return;
      }

      console.log('✅ Policy applied successfully via alternative method!');
      return;
    }

    console.log('✅ RLS policy applied successfully!');
    console.log('\nThe AI user can now insert assistant messages.');

  } catch (error) {
    console.error('❌ Unexpected error:', error);
    console.log('\n⚠️ Please apply the policy manually in Supabase Dashboard:');
    console.log('\nGo to: https://supabase.com/dashboard/project/unocjfiipormnaujsuhk/database/policies');
    console.log('\nThen run this SQL:\n');
    console.log(`
CREATE POLICY "AI user can insert assistant messages" ON public.document_chats
    FOR INSERT
    TO authenticated
    WITH CHECK (
        user_id = '9e33f156-c21d-4234-939f-bc3455e2e5c2'::uuid
        AND role = 'assistant'
    );
    `);
  }
}

applyRLSPolicy().catch(console.error);
