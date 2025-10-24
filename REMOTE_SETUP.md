# Remote Supabase Setup Guide

Since automated migration is taking too long, here's a manual approach to set up your remote Supabase database.

## Option 1: Reset via Supabase Dashboard (Recommended)

This is the fastest way to get a clean database with your schema.

### Step 1: Reset Remote Database

1. Go to https://app.supabase.com
2. Select your **TourVision** project
3. Navigate to **Database → Migrations** (in the left sidebar)
4. Click **Reset database** button at the top
5. Confirm the reset (this will wipe all data and tables)

### Step 2: Push Local Migrations

After reset completes, run from your terminal:

```bash
cd /Users/mads/workspace/tourvision-mobile
npx supabase db push
```

This time it should push cleanly since the database is empty.

## Option 2: Manual SQL Execution (If Reset Doesn't Work)

If you can't reset the database, you can manually run the migrations via SQL Editor:

### Step 1: Open SQL Editor

1. Go to https://app.supabase.com
2. Select your **TourVision** project
3. Navigate to **SQL Editor** in the left sidebar
4. Click **New query**

### Step 2: Run Each Migration

Copy and paste each migration file in order:

1. **001_complete_schema.sql** - Creates all tables
2. **002_add_proposal_diff_columns.sql** - Adds diff columns
3. **003_add_proposal_votes_table.sql** - Adds voting
4. **004_add_prosemirror_transaction_columns.sql** - Adds transactions
5. **20250119_fix_proposal_counts.sql** - Fixes counts
6. **20250122_add_trip_sharing.sql** - Adds sharing
7. **20251022_add_yjs_support.sql** - Adds Y.js

For each file:
- Open the file in your editor: `/Users/mads/workspace/tourvision-mobile/supabase/migrations/[filename]`
- Copy the entire contents
- Paste into Supabase SQL Editor
- Click **Run** (or press Cmd+Enter)
- Wait for "Success" message before proceeding to next file

## After Database Setup

Once your database schema is ready (via either option), continue with OAuth configuration:

### Step 1: Get Supabase Credentials

1. In Supabase dashboard, go to **Settings → API**
2. Copy these values:
   - **Project URL**: `https://ivofgzwbzubjdwejfirl.supabase.co`
   - **anon public key**: Long JWT token starting with `eyJ...`

### Step 2: Update Local Environment

Edit `/Users/mads/workspace/tourvision-mobile/expo-app/.env.local`:

```bash
# Replace these lines:
EXPO_PUBLIC_SUPABASE_URL=https://ivofgzwbzubjdwejfirl.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-actual-anon-key-here

# Keep these as-is:
EXPO_PUBLIC_MAPBOX_TOKEN=pk.eyJ1IjoibWFkc2JlcnRlbHNlbiIsImEiOiJja2tjeDgxZWYwNHU5MnhtaTVndWRmeHpzIn0.Zs-SFtuSE9I1XAG-TG2fsw
EXPO_PUBLIC_GOOGLE_PLACES_API_KEY=AIzaSyBQPFHIpx-61dTzR5QnGfjTAqCsUmmtnoA
EXPO_PUBLIC_NEXTJS_API_URL=http://localhost:3001
EXPO_PUBLIC_COLLAB_SERVER_URL=http://localhost:3003
```

### Step 3: Configure Authentication URLs

1. In Supabase dashboard, go to **Authentication → URL Configuration**
2. Set:
   - **Site URL**: `http://localhost:8082`
   - **Redirect URLs**: Add these:
     - `http://localhost:8082`
     - `http://localhost:8082/(mock)`
     - `http://localhost:8081`

### Step 4: Set Up Google OAuth

Follow the detailed guide in `HOSTED_OAUTH_SETUP.md`:

1. Create Google OAuth credentials in Google Cloud Console
2. Add redirect URI: `https://ivofgzwbzubjdwejfirl.supabase.co/auth/v1/callback`
3. Configure in Supabase: **Authentication → Providers → Google**
4. Enter your Client ID and Client Secret

### Step 5: Test Your Setup

```bash
cd /Users/mads/workspace/tourvision-mobile/expo-app
npx expo start --web --clear --port 8082
```

Open browser to `http://localhost:8082` and try:
- Email/password login (you'll need to create an account first)
- Google OAuth login

## Quick Command Reference

```bash
# From project root

# Link to remote (already done)
npx supabase link --project-ref ivofgzwbzubjdwejfirl

# Push migrations after reset
npx supabase db push

# Check migration status
npx supabase migration list

# Start Expo app
cd expo-app && npx expo start --web --port 8082
```

## Troubleshooting

### "Permission denied" errors

If you see permission errors, you may need to:
1. Go to Supabase dashboard → Database → Roles
2. Ensure `postgres` role has proper permissions
3. Try running migrations again

### Migrations still stuck

If migrations hang:
1. Use Option 2 (Manual SQL Execution) above
2. This bypasses the CLI and runs directly in Supabase

### Can't find anon key

- Settings → API → Project API keys → `anon` `public`
- It's the one marked as "anon public"
- Should start with `eyJ...` and be very long

## Next Steps After Setup

Once everything is working:

1. ✅ Create a test user account
2. ✅ Test login/logout functionality
3. ✅ Test Google OAuth (if configured)
4. ✅ Create a test trip
5. ✅ Verify data is saved to remote Supabase
6. 📖 Read `HOSTED_OAUTH_SETUP.md` for OAuth details
7. 🚀 Deploy to production when ready
