import { createAgentDatabase } from './shared/database.js';
import * as dotenv from 'dotenv';

dotenv.config();

async function cleanup() {
  const db = createAgentDatabase(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY,
    process.env.SUPABASE_ANON_KEY
  );

  // Clean up all existing agents
  console.log('Cleaning up all existing agents...');
  await db.disconnectAllAgents('System cleanup - restarting fresh');
  console.log('Done!');
  process.exit(0);
}

cleanup();