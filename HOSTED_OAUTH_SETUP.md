# OAuth Setup for Hosted Supabase

This guide explains how to configure Google and Apple OAuth authentication for your hosted Supabase project.

## Quick Start Checklist

- [ ] Get Supabase project URL and anon key
- [ ] Update `/expo-app/.env.local` with hosted credentials
- [ ] Configure Site URL and Redirect URLs in Supabase
- [ ] Set up Google OAuth credentials
- [ ] Configure Google provider in Supabase dashboard
- [ ] (Optional) Set up Apple OAuth
- [ ] Test OAuth login

## Step 1: Update Expo App to Use Hosted Supabase

### Find Your Supabase Credentials

1. Go to [app.supabase.com](https://app.supabase.com)
2. Select your project
3. Navigate to **Settings → API**
4. Copy:
   - **Project URL** (looks like: `https://xxxxx.supabase.co`)
   - **anon public key** (starts with `eyJ...`)

### Update Environment Variables

Edit `/expo-app/.env.local`:

```bash
# Replace with your hosted Supabase credentials
EXPO_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...your-actual-anon-key

# Keep these existing values
EXPO_PUBLIC_MAPBOX_TOKEN=pk.eyJ1IjoibWFkc2JlcnRlbHNlbiIsImEiOiJja2tjeDgxZWYwNHU5MnhtaTVndWRmeHpzIn0.Zs-SFtuSE9I1XAG-TG2fsw
EXPO_PUBLIC_GOOGLE_PLACES_API_KEY=AIzaSyBQPFHIpx-61dTzR5QnGfjTAqCsUmmtnoA
EXPO_PUBLIC_NEXTJS_API_URL=http://localhost:3001
EXPO_PUBLIC_COLLAB_SERVER_URL=http://localhost:3003
```

**Important:** After updating, restart your Expo development server:
```bash
cd expo-app
npx expo start --web --clear --port 8082
```

## Step 2: Configure Supabase Authentication Settings

### Set Site URL and Redirect URLs

1. Go to your Supabase dashboard at [app.supabase.com](https://app.supabase.com)
2. Select your project
3. Navigate to **Authentication → URL Configuration**
4. Configure:

**Site URL:**
```
http://localhost:8082
```
(For production, use your production domain: `https://yourdomain.com`)

**Redirect URLs** (add all of these):
```
http://localhost:8082
http://localhost:8082/(mock)
http://localhost:8081
```
(For production, add your production URLs like `https://yourdomain.com/(mock)`)

5. Click **Save**

## Step 3: Set Up Google OAuth

### 3.1 Create Google OAuth Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials)

2. **Create or Select a Project**
   - Click the project dropdown at the top
   - Create a new project or select existing one
   - Name: "TourVision" (or any name)

3. **Configure OAuth Consent Screen** (if first time)
   - Go to **APIs & Services → OAuth consent screen**
   - User Type: **External**
   - Click **Create**
   - Fill in required fields:
     - App name: "TourVision"
     - User support email: Your email
     - Developer contact: Your email
   - Click **Save and Continue**
   - Scopes: Click **Add or Remove Scopes**
     - Add: `email`, `profile`, `openid`
     - Click **Update** then **Save and Continue**
   - Test users: Add your email for testing
   - Click **Save and Continue**

4. **Create OAuth Client ID**
   - Go to **APIs & Services → Credentials**
   - Click **+ Create Credentials → OAuth 2.0 Client ID**
   - Application type: **Web application**
   - Name: "TourVision Web"
   - **Authorized redirect URIs** - Add this exact URL:
     ```
     https://your-project-ref.supabase.co/auth/v1/callback
     ```
     (Replace `your-project-ref` with your actual Supabase project reference from Step 1)
   - Click **Create**

5. **Save Your Credentials**
   - You'll see a dialog with your Client ID and Client Secret
   - **Copy both** - you'll need them in the next step
   - Client ID format: `xxxxx.apps.googleusercontent.com`
   - Client Secret format: `GOCSPX-xxxxx`

### 3.2 Configure Google in Supabase Dashboard

1. In your Supabase dashboard, navigate to **Authentication → Providers**
2. Scroll to find **Google** and click to expand
3. Toggle **Enable Google provider** to ON
4. Enter your credentials:
   - **Client ID**: Paste your Google Client ID
   - **Client Secret**: Paste your Google Client Secret
5. Click **Save**

## Step 4: Set Up Apple OAuth (Optional)

Apple OAuth is more complex and requires an Apple Developer account ($99/year). Skip this if you only want Google authentication.

### 4.1 Prerequisites

- Apple Developer account ($99/year)
- Access to [developer.apple.com](https://developer.apple.com)

### 4.2 Create Apple App ID

1. Go to [Apple Developer Portal](https://developer.apple.com/account/)
2. Navigate to **Certificates, Identifiers & Profiles → Identifiers**
3. Click the **+** button to create new identifier
4. Select **App IDs**, click **Continue**
5. Select **App**, click **Continue**
6. Fill in:
   - Description: "TourVision"
   - Bundle ID: `com.yourdomain.tourvision` (must be unique)
7. Scroll to **Sign in with Apple** and check it
8. Click **Continue**, then **Register**

### 4.3 Create Apple Services ID

1. Go back to **Identifiers** and click **+** again
2. Select **Services IDs**, click **Continue**
3. Fill in:
   - Description: "TourVision Web Auth"
   - Identifier: `com.yourdomain.tourvision.web` (must be unique)
4. Check **Sign in with Apple**
5. Click **Configure** next to Sign in with Apple:
   - **Primary App ID**: Select the App ID you created above
   - **Domains and Subdomains**: Enter your Supabase domain
     ```
     your-project-ref.supabase.co
     ```
   - **Return URLs**: Enter your Supabase callback URL
     ```
     https://your-project-ref.supabase.co/auth/v1/callback
     ```
   - Click **Next**, then **Done**, then **Continue**, then **Register**

### 4.4 Create Apple Key

1. Go to **Keys** section in Apple Developer Portal
2. Click **+** to create new key
3. Fill in:
   - Key Name: "TourVision Auth Key"
   - Check **Sign in with Apple**
4. Click **Configure** next to Sign in with Apple:
   - Select your primary App ID
   - Click **Save**
5. Click **Continue**, then **Register**
6. **Download the key file** (.p8 file) - you can only do this once!
7. Note the **Key ID** (10-character string)
8. Note your **Team ID** (found in top-right of Developer Portal)

### 4.5 Generate Apple Client Secret (JWT)

Apple requires a JWT token as the client secret. Use Supabase's helper tool:

1. Go to this URL: https://supabase.com/docs/guides/auth/social-login/auth-apple#generate-a-client_secret
2. Fill in the form:
   - **Team ID**: Your Apple Team ID (10-character string)
   - **Client ID**: Your Services ID (e.g., `com.yourdomain.tourvision.web`)
   - **Key ID**: The Key ID from when you created the key
   - **Private Key**: Open the .p8 file in a text editor and paste the contents
3. Click **Generate JWT**
4. Copy the generated JWT token (it's long, starts with `eyJ...`)

**Note:** This JWT expires after 6 months. You'll need to regenerate it periodically.

### 4.6 Configure Apple in Supabase Dashboard

1. In your Supabase dashboard, navigate to **Authentication → Providers**
2. Scroll to find **Apple** and click to expand
3. Toggle **Enable Apple provider** to ON
4. Enter your credentials:
   - **Client ID**: Your Services ID (e.g., `com.yourdomain.tourvision.web`)
   - **Client Secret**: The JWT token you generated in step 4.5
5. Click **Save**

## Step 5: Test OAuth Authentication

### Start the App

```bash
cd expo-app
npx expo start --web --port 8082
```

Open browser to: `http://localhost:8082`

### Test Google Sign In

1. Navigate to the login screen
2. Click **"Continue with Google"**
3. You should be redirected to Google's sign-in page
4. Sign in with a Google account (must be added as test user if app is in development mode)
5. Authorize the app
6. You should be redirected back to `http://localhost:8082/(mock)` and be logged in

### Test Apple Sign In (if configured)

1. Navigate to the login screen
2. Click **"Continue with Apple"**
3. You should be redirected to Apple's sign-in page
4. Sign in with your Apple ID
5. Choose whether to share your real email or use Apple's privacy relay
6. You should be redirected back to `http://localhost:8082/(mock)` and be logged in

## Troubleshooting

### "Access blocked: This app's request is invalid"

**Cause:** OAuth consent screen not configured or app not published

**Solution:**
1. Go to Google Cloud Console → OAuth consent screen
2. Complete all required fields
3. Add your email as a test user
4. For public use, click "Publish App" (requires verification for production)

### "Error 400: redirect_uri_mismatch"

**Cause:** The redirect URI in Google Cloud Console doesn't match what Supabase is using

**Solution:**
1. Check the error message for the exact redirect URI being used
2. Go to Google Cloud Console → Credentials → Your OAuth Client
3. Add the exact redirect URI shown in the error:
   - Should be: `https://your-project-ref.supabase.co/auth/v1/callback`
4. Save and try again

### "Invalid client" error

**Cause:** Wrong Client ID or Client Secret

**Solution:**
1. Verify your credentials in Google Cloud Console
2. Re-copy the Client ID and Secret
3. Update them in Supabase dashboard
4. Clear browser cache and try again

### OAuth works but user not redirected properly

**Cause:** Redirect URL not whitelisted in Supabase

**Solution:**
1. Go to Supabase → Authentication → URL Configuration
2. Verify these are in the **Redirect URLs** list:
   - `http://localhost:8082`
   - `http://localhost:8082/(mock)`
3. Save and try again

### Apple OAuth: "invalid_client" error

**Cause:** JWT token expired or incorrect

**Solution:**
1. Regenerate the JWT token using the Supabase tool
2. Update the Client Secret in Supabase dashboard
3. Apple JWTs expire after 6 months - you'll need to regenerate periodically

### After OAuth login, session not persisting

**Cause:** Cookie/storage issues

**Solution:**
1. Check browser console for errors
2. Verify Supabase client is configured correctly
3. Check that `localStorage` is not blocked
4. Try in incognito mode to rule out extension conflicts

## Production Deployment

When deploying to production, update these settings:

### 1. Supabase URL Configuration

In Supabase dashboard → Authentication → URL Configuration:
- **Site URL**: `https://yourdomain.com`
- **Redirect URLs**: Add your production URLs

### 2. Google OAuth

In Google Cloud Console → Credentials → Your OAuth Client:
- Add production redirect URI:
  - `https://your-project-ref.supabase.co/auth/v1/callback` (same as dev)
- Update Authorized JavaScript origins if needed

### 3. Apple OAuth

In Apple Developer Portal → Services ID Configuration:
- Domains: Add your production domain
- Return URLs: Keep the Supabase callback URL (same for dev and prod)

### 4. Environment Variables

For production deployment (Vercel, Netlify, etc.):
- Set `EXPO_PUBLIC_SUPABASE_URL` to your Supabase project URL
- Set `EXPO_PUBLIC_SUPABASE_ANON_KEY` to your anon key
- Never commit these values to git!

## Security Best Practices

1. **Never commit OAuth secrets to git**
   - Keep `.env.local` in `.gitignore`
   - Use environment variables in production

2. **Use HTTPS in production**
   - OAuth providers require HTTPS for production
   - Localhost HTTP is only allowed for development

3. **Restrict OAuth consent screen**
   - Only add necessary scopes (email, profile, openid)
   - Keep user data access minimal

4. **Monitor OAuth usage**
   - Check Supabase dashboard for auth activity
   - Review Google Cloud Console for unusual traffic

5. **Rotate secrets regularly**
   - Regenerate OAuth credentials periodically
   - Update in Supabase dashboard after rotation

## Summary

Your app now supports:
- ✅ Email/password authentication
- ✅ Google OAuth sign-in
- ✅ Apple OAuth sign-in (if configured)
- ✅ Protected routes with automatic redirect
- ✅ Logout functionality

The OAuth implementation is already complete in the code. You just need to:
1. Update `/expo-app/.env.local` with your hosted Supabase credentials
2. Configure OAuth providers in Google Cloud Console and Supabase dashboard
3. Test the login flow

## Resources

- [Supabase Auth Documentation](https://supabase.com/docs/guides/auth)
- [Google OAuth Documentation](https://developers.google.com/identity/protocols/oauth2)
- [Apple Sign In Documentation](https://developer.apple.com/sign-in-with-apple/)
- [Supabase OAuth Providers](https://supabase.com/docs/guides/auth/social-login)
