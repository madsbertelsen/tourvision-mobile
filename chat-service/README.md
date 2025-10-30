# Chat Service

TypeScript-based document chat listener service for TourVision.

## Overview

This service listens to realtime changes in the `document_chats` table and automatically generates AI responses using the Mistral API.

## Features

- 📡 Realtime subscription to Supabase document_chats table
- 🤖 AI-powered responses using Mistral Small
- 💬 Context-aware conversation with chat history
- 📝 Support for initial document prompts and regular chat messages
- 🔄 Automatic retry and error handling
- ⚡ Runs natively with Bun (no compilation needed)

## Prerequisites

- [Bun](https://bun.sh) installed on your system
- Mistral API key configured in environment variables

## Setup

1. Install dependencies:
```bash
bun install
```

2. Configure environment variables:
   - Ensure `.env.local` exists in the project root with `MISTRAL_API_KEY`

3. Run the service:

**Start the service:**
```bash
bun start
```

**Development mode (with hot reload):**
```bash
bun run dev
```

**Or run directly:**
```bash
bun run src/index.ts
```

## Architecture

- **Bun Runtime**: Native TypeScript execution without compilation
- **TypeScript**: Fully typed for better developer experience
- **Supabase Realtime**: WebSocket-based subscriptions for instant message processing
- **Mistral AI**: Small, fast language model for chat responses
- **Service Role**: Uses Supabase service key to bypass RLS for system operations

## Scripts

- `bun start` - Run the service
- `bun run dev` - Run with auto-restart on file changes (watch mode)

## Environment Variables

Required in `../.env.local`:
- `MISTRAL_API_KEY` - Your Mistral API key for AI responses

## Notes

- This service replaces the old Edge Functions approach
- Uses direct Mistral API calls instead of streaming Edge Functions
- Runs directly with Bun - no build step required
- AI user ID: `9e33f156-c21d-4234-939f-bc3455e2e5c2`
