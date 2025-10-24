# TourVision Web Deployment Guide

This guide covers deploying the TourVision Expo web app to Cloudflare Pages.

## Prerequisites

1. **Cloudflare Account**: Sign up at [cloudflare.com](https://cloudflare.com)
2. **Domain**: `tourvision.com` added to Cloudflare
3. **Wrangler CLI**: Install globally
   ```bash
   npm install -g wrangler
   ```

## Quick Deploy

### Manual Deployment (One-Time)

```bash
# 1. Build the static site
npm run build:web

# 2. Login to Cloudflare
wrangler login

# 3. Deploy to production
npm run deploy

# Output will be in dist/ directory
```

### Automatic Deployment (Recommended)

Set up Git integration for automatic deployments:

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com)
2. Navigate to **Workers & Pages** > **Create Application** > **Pages** > **Connect to Git**
3. Select your repository
4. Configure build settings:
   - **Build command**: `npm run build:web`
   - **Build output directory**: `dist`
   - **Root directory**: `expo-app`
   - **Branch**: `main` (for production)

Every push to `main` will trigger a new deployment.

## Custom Domain Setup

### Add tourvision.com to your Pages project:

1. Go to **Workers & Pages** > **tourvision** > **Settings** > **Custom domains**
2. Click **Set up a custom domain**
3. Enter `tourvision.com`
4. Click **Activate domain**
5. Repeat for `www.tourvision.com`

### DNS Configuration (if not using Cloudflare DNS):

If your domain DNS is managed elsewhere, add these records:

```
Type: A
Name: @
Value: 76.76.21.21

Type: CNAME
Name: www
Value: tourvision.pages.dev

Type: CNAME
Name: _cf-custom-hostname
Value: <provided-by-cloudflare>
```

### Using Cloudflare DNS (Recommended):

Cloudflare will automatically configure DNS when you add the custom domain.

## Deep Linking Setup

### Files Included in Build

The following files are automatically included in the build:

- `public/.well-known/apple-app-site-association` - iOS Universal Links
- `public/.well-known/assetlinks.json` - Android App Links

### Verify Deep Link Files

After deployment, test these URLs:

```bash
# Should return JSON
curl https://tourvision.com/.well-known/apple-app-site-association
curl https://tourvision.com/.well-known/assetlinks.json
```

### Apple App Site Association Validator

Test iOS universal links:
https://search.developer.apple.com/appsearch-validation-tool/

Enter: `tourvision.com`

## Environment Variables

### Production Environment

Set these in Cloudflare Pages dashboard under **Settings** > **Environment variables**:

```
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
EXPO_PUBLIC_MAPBOX_TOKEN=your-mapbox-token
```

## Preview Deployments

Create preview deployments for testing:

```bash
npm run deploy:preview
```

Or push to a branch other than `main` (if using Git integration).

## Rollback

### Via Cloudflare Dashboard:

1. Go to **Workers & Pages** > **tourvision** > **Deployments**
2. Find the previous working deployment
3. Click **...** > **Rollback to this deployment**

### Via CLI:

```bash
# List deployments
wrangler pages deployment list --project-name tourvision

# Rollback (promote an old deployment)
wrangler pages deployment create dist --project-name tourvision
```

## Monitoring

### View Deployment Logs:

```bash
wrangler pages deployment tail --project-name tourvision
```

### Analytics:

Available in Cloudflare Dashboard under **Workers & Pages** > **tourvision** > **Analytics**

## Troubleshooting

### Build Fails

```bash
# Clear Expo cache and rebuild
npx expo start --clear
npm run build:web
```

### Deep Link Files Not Found

Verify files are in `public/.well-known/`:

```bash
ls -la public/.well-known/
```

Should show:
- `apple-app-site-association`
- `assetlinks.json`

### Custom Domain Not Working

1. Check DNS propagation: https://dnschecker.org
2. Verify SSL certificate is active (can take up to 24 hours)
3. Clear browser cache and try incognito mode

## Production Checklist

Before going live:

- [ ] Environment variables set in Cloudflare
- [ ] Custom domain configured (tourvision.com)
- [ ] SSL certificate active
- [ ] Deep link files accessible at URLs
- [ ] Test login/authentication
- [ ] Test invitation links
- [ ] Verify iOS/Android app deep linking works

## Cost

**Cloudflare Pages Free Tier:**
- Unlimited bandwidth
- Unlimited requests
- 500 builds/month
- 100 custom domains

**Paid Plan ($20/month):**
- 5,000 builds/month
- Advanced features

For TourVision, the **free tier should be sufficient** for MVP and early growth.

## Support

- Cloudflare Pages Docs: https://developers.cloudflare.com/pages/
- Expo Static Export: https://docs.expo.dev/router/reference/static-rendering/
- GitHub Issues: Your repository
