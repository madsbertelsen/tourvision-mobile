# OAuth Setup Guide for Local Development

This guide explains how to configure Google and Apple OAuth authentication for local Supabase development.

## Overview

OAuth authentication has been configured in the local Supabase setup to allow users to sign in with Google or Apple accounts. The configuration files have been updated with placeholder values that you need to replace with actual OAuth credentials.

## Configuration Files

The following files have been configured for OAuth:

1. **`/supabase/config.toml`** - Supabase OAuth provider configuration
2. **`/supabase/.env.local`** - Environment variables for OAuth secrets
3. **`/expo-app/lib/supabase/auth-context.tsx`** - Auth context with OAuth methods
4. **`/expo-app/app/(auth)/login.tsx`** - Login screen with OAuth buttons

## Setup Steps

### 1. Google OAuth Setup

#### Create Google OAuth Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Create a new project or select an existing one
3. Click "Create Credentials" → "OAuth 2.0 Client ID"
4. Choose "Web application" as the application type
5. Add these authorized redirect URIs:
   - `http://localhost:54321/auth/v1/callback`
   - `http://localhost:8082`
6. Save and copy your:
   - **Client ID** (looks like: `xxxxx.apps.googleusercontent.com`)
   - **Client Secret**

#### Update Environment Variables

Edit `/supabase/.env.local` and replace the placeholder values:

```bash
SUPABASE_AUTH_GOOGLE_CLIENT_ID=your-actual-client-id.apps.googleusercontent.com
SUPABASE_AUTH_GOOGLE_SECRET=your-actual-client-secret
```

### 2. Apple OAuth Setup

#### Create Apple Service ID

1. Go to [Apple Developer](https://developer.apple.com/account/resources/identifiers/list/serviceId)
2. Click the "+" button to create a new identifier
3. Select "Services IDs" and click "Continue"
4. Register a Service ID:
   - Description: "TourVision Local Dev"
   - Identifier: `com.yourdomain.tourvision.local` (must be unique)
5. Enable "Sign in with Apple"
6. Configure domains and redirect URLs:
   - Domains: `localhost`
   - Return URLs: `http://localhost:54321/auth/v1/callback`

#### Generate Apple Secret Key

Apple OAuth requires a JWT token as the secret. You'll need to:

1. Create an App ID if you don't have one
2. Enable "Sign in with Apple" for the App ID
3. Create a Key:
   - Go to Keys section in Apple Developer
   - Create new key with "Sign in with Apple" enabled
   - Download the `.p8` key file (you can only download it once!)
4. Generate JWT token using the key (see Apple's documentation)

#### Update Environment Variables

Edit `/supabase/.env.local` and replace the placeholder values:

```bash
SUPABASE_AUTH_APPLE_CLIENT_ID=com.yourdomain.tourvision.local
SUPABASE_AUTH_EXTERNAL_APPLE_SECRET=your-generated-jwt-token
```

### 3. Restart Supabase

After updating the environment variables, restart Supabase to apply the changes:

```bash
# From project root
npx supabase stop
npx supabase start
```

## Testing OAuth

### Start the Development Servers

1. **Start Supabase** (if not already running):
   ```bash
   npx supabase start
   ```

2. **Start Expo app**:
   ```bash
   cd expo-app
   npx expo start --web --port 8082
   ```

3. **Open browser** to `http://localhost:8082`

### Test Google Sign-In

1. Navigate to the login screen
2. Click "Continue with Google"
3. You should be redirected to Google's OAuth consent screen
4. Authorize the app
5. You should be redirected back to the app and logged in

### Test Apple Sign-In

1. Navigate to the login screen
2. Click "Continue with Apple"
3. You should be redirected to Apple's OAuth consent screen
4. Authorize the app
5. You should be redirected back to the app and logged in

## Troubleshooting

### OAuth redirect doesn't work

**Check these:**
- Verify the redirect URI in config.toml matches exactly: `http://localhost:54321/auth/v1/callback`
- Ensure the redirect URI is added in Google Cloud Console / Apple Developer portal
- Check that `site_url` in config.toml is set to `http://localhost:8082`
- Verify `additional_redirect_urls` includes both callback URLs

### "Invalid client" error

**Causes:**
- Wrong Client ID in `.env.local`
- OAuth credentials not configured in provider console
- Supabase not restarted after changing `.env.local`

**Solution:**
- Double-check Client ID and Secret values
- Restart Supabase: `npx supabase stop && npx supabase start`

### Google OAuth shows "Error 400: redirect_uri_mismatch"

**Cause:** The redirect URI configured in Google Cloud Console doesn't match the one Supabase is using

**Solution:**
1. Check Supabase logs to see the exact redirect URI being used
2. Add that exact URI to Google Cloud Console authorized redirect URIs
3. Common URIs to add:
   - `http://localhost:54321/auth/v1/callback`
   - `http://127.0.0.1:54321/auth/v1/callback`

### Apple OAuth not working

**Common issues:**
- Apple OAuth requires HTTPS in production but localhost can use HTTP
- JWT secret might be expired (Apple tokens are time-limited)
- Service ID must match exactly the one in `.env.local`
- Return URL must be added to Service ID configuration

## Configuration Reference

### config.toml Settings

```toml
[auth]
site_url = "http://localhost:8082"
additional_redirect_urls = ["http://localhost:8082", "http://localhost:8082/(mock)"]

[auth.external.google]
enabled = true
client_id = "env(SUPABASE_AUTH_GOOGLE_CLIENT_ID)"
secret = "env(SUPABASE_AUTH_GOOGLE_SECRET)"
redirect_uri = "http://localhost:54321/auth/v1/callback"
skip_nonce_check = true  # Required for local development

[auth.external.apple]
enabled = true
client_id = "env(SUPABASE_AUTH_APPLE_CLIENT_ID)"
secret = "env(SUPABASE_AUTH_EXTERNAL_APPLE_SECRET)"
redirect_uri = "http://localhost:54321/auth/v1/callback"
skip_nonce_check = true  # Required for local development
```

### Important Notes

- `skip_nonce_check = true` is required for Google and Apple OAuth in local development
- The redirect_uri must be `http://localhost:54321/auth/v1/callback` (Supabase's auth callback endpoint)
- Environment variables in config.toml use the `env(VARIABLE_NAME)` syntax
- Changes to `.env.local` require a Supabase restart to take effect

## Production Considerations

When deploying to production, you'll need to:

1. Create production OAuth credentials with your production domain
2. Update redirect URIs to use your production URL (e.g., `https://yourdomain.com/auth/v1/callback`)
3. Set `skip_nonce_check = false` for better security
4. Use proper environment variable management (don't commit secrets to git!)
5. Update `site_url` and `additional_redirect_urls` to your production URLs

## Security Notes

- **Never commit OAuth secrets to git!** The `.env.local` file should be in `.gitignore`
- Keep your OAuth secrets secure and rotate them regularly
- For production, use proper environment variable management (Vercel env vars, AWS Secrets Manager, etc.)
- The placeholders in `.env.local` are intentionally fake to prevent accidental exposure
- Each developer should have their own OAuth credentials for local development

## Resources

- [Google OAuth 2.0 Setup](https://developers.google.com/identity/protocols/oauth2)
- [Apple Sign In Setup](https://developer.apple.com/sign-in-with-apple/)
- [Supabase OAuth Documentation](https://supabase.com/docs/guides/auth/social-login)
- [Supabase Local Development](https://supabase.com/docs/guides/cli/local-development)
