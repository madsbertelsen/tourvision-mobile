# Chat Service

TypeScript-based document chat listener service for TourVision.

## Overview

This service listens to realtime changes in the `document_chats` table and automatically generates AI responses using a locally running Ollama LLM.

## Features

- 📡 Realtime subscription to Supabase document_chats table
- 🤖 AI-powered responses using local Ollama LLM
- 💬 Context-aware conversation with chat history
- 📝 Support for initial document prompts and regular chat messages
- 🔄 Automatic retry and error handling
- ⚡ Runs natively with Bun (no compilation needed)
- 🔒 Privacy-first: All AI processing happens locally
- 💰 Cost-free: No API charges for AI responses
- 🌐 Offline-capable: Works without internet connection

## Prerequisites

- [Bun](https://bun.sh) installed on your system
- [Ollama](https://ollama.ai) installed and running locally

## Setup

1. **Install Ollama** (if not already installed):
```bash
# macOS/Linux
curl -fsSL https://ollama.ai/install.sh | sh

# Or visit https://ollama.ai/download for other platforms
```

2. **Pull an Ollama model**:
```bash
# Pull the default model (llama3.2)
ollama pull llama3.2

# Or pull a different model
ollama pull llama3.1
ollama pull mistral
ollama pull phi3
```

3. **Start Ollama** (if not already running):
```bash
ollama serve
```

4. **Install dependencies**:
```bash
bun install
```

5. **Configure environment variables** (optional):
   - Create `.env.local` in the project root if you want to customize settings:
   ```bash
   # Optional: Custom Ollama server URL (defaults to http://localhost:11434)
   OLLAMA_BASE_URL=http://localhost:11434

   # Optional: Custom model name (defaults to llama3.2)
   OLLAMA_MODEL=llama3.2
   ```

6. **Run the service**:

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
- **Ollama**: Local LLM runtime for private, cost-free AI responses
- **AI SDK v5**: Unified interface for AI model interaction
- **Service Role**: Uses Supabase service key to bypass RLS for system operations

## Scripts

- `bun start` - Run the service
- `bun run dev` - Run with auto-restart on file changes (watch mode)

## Environment Variables

Optional in `../.env.local`:
- `OLLAMA_BASE_URL` - Ollama server URL (defaults to `http://localhost:11434`)
- `OLLAMA_MODEL` - Model to use (defaults to `llama3.2`)

## Notes

- This service replaces the old Edge Functions approach
- Uses local Ollama LLM for privacy and cost savings
- Runs directly with Bun - no build step required
- AI user ID: `9e33f156-c21d-4234-939f-bc3455e2e5c2`
- Works offline once models are pulled

## Troubleshooting

### Ollama Connection Issues

**Error: "Connection refused" or "ECONNREFUSED"**
- Ensure Ollama is running: `ollama serve`
- Check that Ollama is listening on the correct port (default: 11434)
- Verify OLLAMA_BASE_URL matches your Ollama server URL

**Error: "Model not found"**
- Pull the model first: `ollama pull llama3.2`
- List available models: `ollama list`
- Verify OLLAMA_MODEL matches an installed model

**Slow Responses**
- Ollama performance depends on your hardware (CPU/GPU)
- Consider using a smaller model for faster responses (e.g., `phi3`)
- Check CPU/memory usage during generation

### Testing Ollama

Test Ollama directly before running the chat service:
```bash
# Test with curl
curl http://localhost:11434/api/generate -d '{
  "model": "llama3.2",
  "prompt": "Hello, world!",
  "stream": false
}'

# Or use the Ollama CLI
ollama run llama3.2 "Hello, world!"
```
