# Document Chat AI Setup

This guide explains how to set up and run the AI-powered document chat listener.

## Overview

The document chat listener is a Node.js process that:
1. Listens for new messages in the `document_chats` table via Supabase realtime
2. Generates intelligent AI responses using Mistral AI
3. Inserts responses back into the chat for users to see in real-time

## Prerequisites

- Node.js installed
- Supabase project running (local or remote)
- Mistral AI API key ([Get one here](https://console.mistral.ai/))

## Setup Steps

### 1. Configure Environment Variables

Create a `.env.local` file in the project root with your Mistral API key:

\`\`\`bash
echo "MISTRAL_API_KEY=your-mistral-api-key-here" > .env.local
\`\`\`

**Important**: Never commit `.env.local` to git - it's already in `.gitignore`.

### 2. Install Dependencies

\`\`\`bash
npm install
\`\`\`

### 3. Start the Listener

\`\`\`bash
node scripts/document-chat-listener.js
\`\`\`

You should see:
\`\`\`
🚀 Document Chat Listener started
📡 Connecting to Supabase: https://unocjfiipormnaujsuhk.supabase.co
⏳ Listening for new chat messages...
✅ Successfully subscribed to document_chats table
\`\`\`

## How It Works

### Message Flow

1. **User sends message** → Frontend inserts into `document_chats` table
2. **Realtime event fires** → Listener receives INSERT notification
3. **Context gathering** → Fetches recent chat history (10 messages) and current document
4. **AI generation** → Calls Mistral API with conversation context
5. **Response insertion** → Inserts assistant message back to `document_chats`
6. **Frontend update** → User sees AI response in real-time

### AI Response Strategy

- **User ID**: AI responses use the document owner's `user_id`, so they appear as part of the natural conversation
- **Model**: Uses `mistral-small-latest` for fast, cost-effective responses
- **Temperature**: 0.7 for balanced creativity
- **Max tokens**: 500 to keep responses concise
- **Context**: Includes document title, content, and recent chat history

### System Prompt

The AI is configured as a travel planning assistant with this context:

\`\`\`
You are a helpful travel planning assistant. You are helping the user plan their trip "Trip Name".

The current document contains: travel itinerary content.

Your role is to:
- Answer questions about their trip
- Provide helpful suggestions and recommendations
- Help them refine their travel plans
- Be concise and friendly

Keep responses focused and practical.
\`\`\`

## Testing

### 1. Start the Services

Terminal 1 - Start Expo app:
\`\`\`bash
cd expo-app
npx expo start --web --port 8082
\`\`\`

Terminal 2 - Start AI listener:
\`\`\`bash
node scripts/document-chat-listener.js
\`\`\`

### 2. Test Chat

1. Open http://localhost:8082
2. Login and navigate to any document
3. Open the chat panel (💬 icon)
4. Send a message like "What should I do in Paris?"
5. Watch the listener terminal - you should see:
   \`\`\`
   📨 New message received:
      Document: ...
      User: ...
      Content: "What should I do in Paris?"
   🤖 Generating AI response...
   💬 AI Response: ...
   ✅ AI response added to chat
   \`\`\`
6. The response appears instantly in the UI

## Troubleshooting

### "MISTRAL_API_KEY not configured" Error

**Solution**: Make sure `.env.local` exists in project root with valid API key:
\`\`\`bash
cat .env.local
# Should output: MISTRAL_API_KEY=your-key-here
\`\`\`

### Listener Not Receiving Messages

**Symptoms**: Messages sent but no logs appear in listener

**Solutions**:
1. Check listener is running and shows "✅ Successfully subscribed"
2. Verify realtime is enabled on `document_chats` table
3. Check service role key is correct in `document-chat-listener.js`

### AI Responses Not Appearing in UI

**Symptoms**: Listener logs show success but UI doesn't update

**Solutions**:
1. Check browser console for errors
2. Verify `DocumentChat.tsx` component has realtime subscription
3. Check RLS policies allow reading assistant messages

### "Mistral API error" Messages

**Symptoms**: Listener logs show Mistral API errors

**Solutions**:
1. Verify API key is valid (test at https://console.mistral.ai/)
2. Check account has API credits
3. Review rate limits if sending many requests

## Advanced Configuration

### Changing AI Model

Edit `scripts/document-chat-listener.js`:
\`\`\`javascript
model: 'mistral-large-latest', // More capable but slower/expensive
// OR
model: 'mistral-tiny', // Faster and cheaper
\`\`\`

### Adjusting Response Length

\`\`\`javascript
max_tokens: 1000, // Longer responses
// OR
max_tokens: 250, // Shorter, more concise
\`\`\`

### Modifying System Prompt

Update the system message in `processRegularMessage()` to change AI behavior:
\`\`\`javascript
content: \`You are a specialized [role]. Your focus is on [area].\`
\`\`\`

## Production Deployment

### Using PM2 (Recommended)

\`\`\`bash
# Install PM2
npm install -g pm2

# Start listener as daemon
pm2 start scripts/document-chat-listener.js --name "chat-listener"

# View logs
pm2 logs chat-listener

# Restart
pm2 restart chat-listener

# Auto-start on server reboot
pm2 startup
pm2 save
\`\`\`

### Using systemd

Create `/etc/systemd/system/document-chat-listener.service`:
\`\`\`ini
[Unit]
Description=Document Chat AI Listener
After=network.target

[Service]
Type=simple
User=your-user
WorkingDirectory=/path/to/project
ExecStart=/usr/bin/node scripts/document-chat-listener.js
Restart=always
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
\`\`\`

Then:
\`\`\`bash
sudo systemctl enable document-chat-listener
sudo systemctl start document-chat-listener
sudo systemctl status document-chat-listener
\`\`\`

## Monitoring

### Check Listener Status
\`\`\`bash
# Using PM2
pm2 status

# Using systemd
sudo systemctl status document-chat-listener
\`\`\`

### View Logs
\`\`\`bash
# Using PM2
pm2 logs chat-listener --lines 100

# Using systemd
sudo journalctl -u document-chat-listener -f
\`\`\`

### Database Query for Recent Messages
\`\`\`bash
node scripts/check-ai-user.js
\`\`\`

## Cost Considerations

Mistral API pricing (as of 2024):
- **mistral-small-latest**: ~$0.001 per 1K tokens
- **mistral-large-latest**: ~$0.004 per 1K tokens

With 500 max tokens per response:
- ~$0.0005 per response (small model)
- ~$0.002 per response (large model)

**Budget estimate**: 1000 messages/day ≈ $0.50-2.00/day

## Support

- Mistral AI Docs: https://docs.mistral.ai/
- Supabase Realtime: https://supabase.com/docs/guides/realtime
- Issues: Check logs and troubleshooting section above
