#!/usr/bin/env node

/**
 * Creates a .env file from Cloudflare Pages environment variables
 * This script runs during Cloudflare build to make env vars available to Expo
 */

const fs = require('fs');
const path = require('path');

const envVars = [
  'EXPO_PUBLIC_SUPABASE_URL',
  'EXPO_PUBLIC_SUPABASE_ANON_KEY',
  'EXPO_PUBLIC_MAPBOX_TOKEN',
  'EXPO_PUBLIC_GOOGLE_PLACES_API_KEY',
  'EXPO_PUBLIC_NEXTJS_API_URL',
  'EXPO_PUBLIC_LIVEBLOCKS_PUBLIC_KEY',
  'EXPO_PUBLIC_TIPTAP_APP_ID'
];

const envContent = envVars
  .map(varName => {
    const value = process.env[varName];
    if (value) {
      return `${varName}=${value}`;
    }
    return null;
  })
  .filter(Boolean)
  .join('\n');

if (envContent) {
  const envPath = path.join(__dirname, '..', '.env');
  fs.writeFileSync(envPath, envContent + '\n');
  console.log('✅ Created .env file with Cloudflare environment variables');
  console.log(`   Variables set: ${envContent.split('\n').map(line => line.split('=')[0]).join(', ')}`);
} else {
  console.log('⚠️  No Cloudflare environment variables found');
}
