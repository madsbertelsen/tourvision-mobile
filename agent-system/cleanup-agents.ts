import { createAgentDatabase } from './shared/database';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

async function cleanup() {
  const db = createAgentDatabase(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!,
    process.env.SUPABASE_ANON_KEY!
  );

  // Create our own Supabase client for direct access
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );

  // Clean up all existing agents
  console.log('Cleaning up all existing agents...');

  // Get all active agents
  const { data: agents, error } = await supabase
    .from('agent_connections')
    .select('agent_id')
    .in('status', ['connecting', 'active', 'idle']);

  if (error) {
    console.error('Error fetching agents:', error);
    process.exit(1);
  }

  if (agents && agents.length > 0) {
    console.log(`Found ${agents.length} active agents to disconnect`);
    for (const agent of agents) {
      console.log(`  Disconnecting ${agent.agent_id}`);
      await db.disconnectAgent(agent.agent_id, 'System cleanup - restarting fresh');
    }
  } else {
    console.log('No active agents found');
  }

  console.log('Done!');
  process.exit(0);
}

cleanup();