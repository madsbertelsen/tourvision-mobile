# Docker Setup for TourVision

## Installation Progress
Docker Desktop is currently being installed via Homebrew...

## After Docker Installation

1. **Start Docker Desktop**
   - Open Docker Desktop from Applications
   - Wait for Docker to fully start (whale icon in menu bar)

2. **Start Local Supabase**
   ```bash
   npx supabase start
   ```
   
   This will start:
   - PostgreSQL on port 54322
   - Supabase API on port 54321
   - Supabase Studio on port 54323

3. **Get Local Credentials**
   After Supabase starts, run:
   ```bash
   npx supabase status
   ```
   
   Copy the `API URL` and `anon key` to your `.env.local`:
   ```
   EXPO_PUBLIC_SUPABASE_URL=http://localhost:54321
   EXPO_PUBLIC_SUPABASE_ANON_KEY=<your-local-anon-key>
   ```

4. **Apply Database Migrations**
   ```bash
   npx supabase db push
   ```

5. **Restart Expo App**
   ```bash
   npx expo start --clear --web
   ```

## Supabase Studio
Access the local Supabase Studio at http://localhost:54323

## Stop Local Supabase
```bash
npx supabase stop
```

## Useful Commands
- `npx supabase status` - Check status and credentials
- `npx supabase db reset` - Reset database
- `npx supabase migration new <name>` - Create new migration
- `docker ps` - List running containers