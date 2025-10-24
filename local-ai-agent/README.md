# TourVision Local AI Agent

This is a local Node.js service that handles AI-powered trip generation with real-time collaboration through Tiptap Cloud.

## Why a Local Agent?

Supabase Edge Functions don't support persistent WebSocket connections, which are required for:
- Real-time Y.js collaboration via Tiptap Cloud
- Streaming AI responses directly into collaborative documents

This local agent runs on your machine (or a VPS) and can maintain WebSocket connections to Tiptap Cloud.

## Architecture

```
Frontend (Expo App)
    ↓
Triggers trip generation (sets flag in database)
    ↓
Local AI Agent (polls database)
    ↓
Connects to Tiptap Cloud via WebSocket
    ↓
Streams AI response from OpenAI
    ↓
Writes incrementally to Y.js document
    ↓
All connected clients see updates in real-time
```

## Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure environment variables:**

   Edit `.env` file:
   ```bash
   # Supabase Configuration
   SUPABASE_URL=https://unocjfiipormnaujsuhk.supabase.co
   SUPABASE_SERVICE_KEY=your-service-role-key-here

   # OpenAI Configuration
   OPENAI_API_KEY=your-openai-key-here

   # Tiptap Cloud Configuration
   TIPTAP_APP_ID=yko82w79
   TIPTAP_APP_SECRET=f6d9a7d903b990ce6b707be28ae19bf6941dcdc29a0137cd6233cd015a64fffe
   ```

3. **Get your Supabase Service Role Key:**
   - Go to https://supabase.com/dashboard/project/unocjfiipormnaujsuhk/settings/api
   - Copy the `service_role` key (NOT the `anon` key)
   - Add it to `.env`

## Running the Agent

```bash
# Development mode (with auto-reload)
npm run dev

# Production mode
npm run build
npm start
```

## How It Works

### Polling

The agent polls the `trips` table every 5 seconds for trips that have:
- `ai_generation_requested = true`

When found, it:
1. Sets `ai_generation_in_progress = true`
2. Generates a Tiptap Cloud JWT token
3. Connects to the trip's Y.js document via Tiptap Cloud
4. Streams AI response from OpenAI
5. Incrementally writes to the document
6. Sets `ai_generation_in_progress = false` when done

### Real-Time Collaboration

The agent acts as a regular collaborator on the document:
- Connects to Tiptap Cloud WebSocket
- Gets synced with current document state
- Writes incrementally as AI generates content
- All connected users see the updates in real-time

## Database Schema

You'll need to add these columns to the `trips` table:

```sql
ALTER TABLE trips
ADD COLUMN ai_generation_requested BOOLEAN DEFAULT false,
ADD COLUMN ai_generation_in_progress BOOLEAN DEFAULT false;
```

## Triggering Generation

From your frontend, update a trip to trigger generation:

```typescript
await supabase
  .from('trips')
  .update({ ai_generation_requested: true })
  .eq('id', tripId);
```

The local agent will pick it up within 5 seconds.

## Monitoring

The agent logs all activity to console:
- Connection status to Tiptap Cloud
- AI generation progress
- Errors and issues

## Deployment

### Local Machine
Just run `npm run dev` and keep it running.

### VPS (Recommended)
Deploy to a VPS like Digital Ocean, AWS EC2, or similar:

1. Clone the repo
2. Install dependencies
3. Configure `.env`
4. Use a process manager like PM2:
   ```bash
   npm install -g pm2
   pm2 start npm --name "tourvision-ai-agent" -- start
   pm2 save
   pm2 startup
   ```

### Docker (Alternative)
```dockerfile
FROM node:18
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build
CMD ["npm", "start"]
```

## Troubleshooting

**Agent not picking up requests:**
- Check database columns exist
- Verify `SUPABASE_SERVICE_KEY` is correct
- Check agent logs for errors

**Tiptap Cloud connection fails:**
- Verify `TIPTAP_APP_SECRET` is correct
- Check network connectivity
- Ensure JWT token generation is working

**AI responses not appearing:**
- Check OpenAI API key
- Verify Y.js document structure
- Check Tiptap Cloud sync status in logs
