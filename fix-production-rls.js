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

async function fixRLSPolicies() {
  console.log('🔧 Fixing RLS infinite recursion on PRODUCTION database...\n');

  try {
    // Drop problematic policies
    const dropSQL = `
      DROP POLICY IF EXISTS "Users can view own and shared documents" ON public.documents;
      DROP POLICY IF EXISTS "Users can update own documents and shared documents with edit p" ON public.documents;
      DROP POLICY IF EXISTS "Users can delete own documents" ON public.documents;
      DROP POLICY IF EXISTS "Users can insert own documents" ON public.documents;
      DROP POLICY IF EXISTS "Document owners can manage shares" ON public.document_shares;
      DROP POLICY IF EXISTS "Trip owners can create shares" ON public.document_shares;
      DROP POLICY IF EXISTS "Users can view shares for their documents" ON public.document_shares;
    `;

    console.log('Dropping problematic RLS policies...');
    const { data, error } = await supabase.rpc('exec', { sql: dropSQL });

    if (error) {
      console.error('❌ Error:', error);
      console.log('\n⚠️  The SQL may need to be run manually in Supabase Dashboard SQL Editor:');
      console.log('Dashboard URL: https://supabase.com/dashboard/project/unocjfiipormnaujsuhk/sql');
      console.log('\nSQL to run:\n');
      console.log(dropSQL);
      return;
    }

    console.log('✅ RLS policies fixed successfully!');
    console.log('\nRemaining policies keep simple, non-recursive checks:');
    console.log('  - trips_select_policy');
    console.log('  - trips_insert_policy');
    console.log('  - trips_update_policy');
    console.log('  - trips_delete_policy');

  } catch (error) {
    console.error('❌ Unexpected error:', error);
    console.log('\n⚠️  Please run the SQL manually in Supabase Dashboard.');
  }
}

fixRLSPolicies();
