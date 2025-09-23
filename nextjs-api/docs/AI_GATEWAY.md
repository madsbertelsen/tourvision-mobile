# Vercel AI Gateway Configuration

This project is configured to optionally use Vercel AI Gateway for AI API calls, providing caching, rate limiting, and observability.

## Features

When enabled, Vercel AI Gateway provides:
- **Response Caching**: Cache AI responses to reduce costs and latency
- **Rate Limiting**: Protect against abuse and manage API quotas
- **Observability**: Monitor usage, costs, and performance
- **Provider Abstraction**: Switch between AI providers without code changes
- **Automatic Retries**: Built-in retry logic for failed requests

## Setup

### 1. Enable AI Gateway in Vercel Dashboard

1. Go to your [Vercel Dashboard](https://vercel.com/dashboard)
2. Navigate to **Storage** → **AI Gateway**
3. Create a new gateway or select an existing one
4. Copy your gateway URL (e.g., `https://gateway.vercel.sh/v1`)

### 2. Configure Environment Variable

Add your gateway URL to `.env.local`:

```env
# Vercel AI Gateway configuration
VERCEL_AI_GATEWAY_URL=https://gateway.vercel.sh/v1
```

### 3. Deploy or Run Locally

The application will automatically use the AI Gateway when the environment variable is set.

## How It Works

The implementation in `/app/api/generate-prosemirror-proposal/route.ts` checks for the `VERCEL_AI_GATEWAY_URL` environment variable:

```typescript
const gatewayUrl = process.env.VERCEL_AI_GATEWAY_URL;
const baseURL = gatewayUrl
  ? `${gatewayUrl}/mistral`  // Use gateway
  : 'https://api.mistral.ai/v1';  // Direct API

const mistral = createMistral({
  apiKey: mistralKey,
  baseURL
});
```

## Monitoring

When the gateway is active, you'll see this in your logs:
```
[Info] Using AI provider: Vercel AI Gateway
```

When using direct API:
```
[Info] Using AI provider: Direct Mistral API
```

## Gateway Configuration

In the Vercel dashboard, you can configure:

- **Caching**: Set cache TTL for responses
- **Rate Limits**: Configure requests per minute/hour
- **Allowed Models**: Restrict which models can be used
- **Budget Limits**: Set spending caps
- **Logging**: Control what gets logged

## Benefits

1. **Cost Reduction**: Cache identical requests to avoid redundant API calls
2. **Performance**: Serve cached responses with lower latency
3. **Reliability**: Automatic retries and fallback handling
4. **Security**: Hide API keys from client-side code
5. **Analytics**: Track usage patterns and optimize

## Troubleshooting

If the gateway isn't working:

1. Check that `VERCEL_AI_GATEWAY_URL` is correctly set
2. Verify your gateway is active in the Vercel dashboard
3. Ensure your API key is valid for the provider
4. Check the Vercel dashboard for any rate limit or budget issues

## Disabling the Gateway

To bypass the gateway and use the Mistral API directly, simply comment out or remove the `VERCEL_AI_GATEWAY_URL` from your environment variables.