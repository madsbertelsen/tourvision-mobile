// Script to query and optionally delete trips from the database
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function listTrips() {
  const { data, error } = await supabase
    .from('trips')
    .select('id, title, description, created_by, created_at')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching trips:', error);
    return;
  }

  console.log('\n=== Current Trips ===');
  console.log('Total trips:', data.length);
  console.log('\nTrips:');
  data.forEach((trip, index) => {
    console.log(`${index + 1}. ${trip.title}`);
    console.log(`   ID: ${trip.id}`);
    console.log(`   Created by: ${trip.created_by}`);
    console.log(`   Created at: ${trip.created_at}`);
    console.log(`   Description: ${trip.description || 'N/A'}`);
    console.log('');
  });

  return data;
}

async function deleteAllTrips() {
  console.log('\n=== Deleting all trips ===');

  const { error } = await supabase
    .from('trips')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all (dummy condition)

  if (error) {
    console.error('Error deleting trips:', error);
    return false;
  }

  console.log('✅ All trips deleted successfully');
  return true;
}

// Main execution
const action = process.argv[2];

if (action === 'delete') {
  console.log('⚠️  WARNING: This will delete ALL trips!');
  await deleteAllTrips();
  await listTrips();
} else {
  await listTrips();
  console.log('\nTo delete all trips, run: node scripts/cleanup-trips.js delete');
}
