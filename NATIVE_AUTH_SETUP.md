# Native Authentication Setup (iOS/Android)

## Overview

This guide explains how to set up native Apple Authentication using `expo-apple-authentication` for iOS/Android, while maintaining web OAuth functionality.

## Status

- ✅ `expo-apple-authentication` package installed
- ✅ `expo-crypto` package installed (for secure nonce generation)
- ✅ `app.json` configured with plugin and iOS capability
- ✅ Auth context updated with platform-specific implementation
- ✅ Login screen using native Apple button on iOS
- ✅ Bundle identifier updated to `io.mapstory.tourvision`
- ⏳ Apple Developer Account configuration needed (Sign in with Apple capability)
- ⏳ Supabase OAuth provider configuration needed

## Why Native Authentication?

The current implementation uses Supabase's `signInWithOAuth` which works great for web but has limitations on native:
- Requires opening external browser for OAuth flow
- Poor user experience on mobile devices
- Doesn't use native Apple Sign In button (required by App Store guidelines)

The native approach:
- Uses iOS/Android native authentication UI
- Better user experience
- Follows platform guidelines
- Faster authentication flow

## Installation (✅ Complete)

```bash
cd expo-app
npx expo install expo-apple-authentication
```

## Configuration (✅ Complete)

### app.json
```json
{
  "expo": {
    "ios": {
      "usesAppleSignIn": true
    },
    "plugins": [
      "expo-apple-authentication"
    ]
  }
}
```

## Implementation Plan

### 1. Update Auth Context

The `auth-context.tsx` needs to be updated to:
- Detect platform (iOS/Android vs Web)
- Use `expo-apple-authentication` for native platforms
- Keep OAuth flow for web
- Handle Supabase session creation from Apple credentials

**Key Changes Needed:**
```typescript
import * as AppleAuthentication from 'expo-apple-authentication';
import { Platform } from 'react-native';

const signInWithApple = async () => {
  if (Platform.OS === 'web') {
    // Existing OAuth flow
    await supabase.auth.signInWithOAuth({
      provider: 'apple',
      options: {
        redirectTo: window.location.origin,
      },
    });
  } else {
    // Native flow
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    });

    // Send to Supabase
    const { error } = await supabase.auth.signInWithIdToken({
      provider: 'apple',
      token: credential.identityToken,
      nonce: credential.nonce,
    });
  }
};
```

### 2. Apple Developer Configuration

**Required Steps:**
1. **Sign in to Apple Developer Account**
   - Go to https://developer.apple.com/account

2. **Create an App ID**
   - Navigate to "Certificates, Identifiers & Profiles"
   - Create new App ID with bundle identifier: `com.maplegend.tourvisionmobile`
   - Enable "Sign In with Apple" capability

3. **Create a Service ID**
   - Create new Services ID
   - Configure for "Sign In with Apple"
   - Add return URLs (for Supabase callback)

4. **Create a Private Key**
   - Create new key with "Sign In with Apple" enabled
   - Download the `.p8` key file (only available once!)
   - Save the Key ID

### 3. Supabase Configuration

**Dashboard Setup:**
1. Go to Supabase Dashboard → Authentication → Providers
2. Enable "Apple" provider
3. Configure with Apple credentials:
   - **Services ID**: From Apple Developer
   - **Secret Key**: The `.p8` file contents
   - **Key ID**: From Apple Developer
   - **Team ID**: Your Apple Team ID

**Callback URL:**
```
https://[YOUR_PROJECT_REF].supabase.co/auth/v1/callback
```

Add this URL to your Apple Service ID configuration.

### 4. Update Login Screen

The login button should use the native Apple button component on iOS:

```typescript
import * as AppleAuthentication from 'expo-apple-authentication';

// In login.tsx
{Platform.OS === 'ios' ? (
  <AppleAuthentication.AppleAuthenticationButton
    buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
    buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
    cornerRadius={12}
    style={styles.appleButton}
    onPress={handleAppleSignIn}
  />
) : (
  <TouchableOpacity
    style={styles.appleButton}
    onPress={handleAppleSignIn}
  >
    <Feather name="apple" size={20} color="white" />
    <Text style={styles.appleButtonText}>Continue with Apple</Text>
  </TouchableOpacity>
)}
```

## Testing

### Prerequisites
- Apple Developer Account (paid - $99/year)
- Physical iOS device (Apple Sign In doesn't work in simulator)
- Xcode installed for building

### Test Steps
1. Build development client: `npx expo run:ios`
2. Sign in with Apple ID on physical device
3. Verify authentication flow
4. Check Supabase dashboard for user creation

## Security Considerations

### Nonce Handling
Apple requires a nonce for security. Generate it using:
```typescript
import * as Crypto from 'expo-crypto';

const nonce = await Crypto.digestStringAsync(
  Crypto.CryptoDigestAlgorithm.SHA256,
  Math.random().toString()
);
```

### Token Storage
- Store refresh tokens securely using `expo-secure-store`
- Never log or expose identity tokens
- Handle token expiration gracefully

## Limitations

### First-Time Credentials
Apple only provides user details (name, email) the first time a user signs in. Subsequent sign-ins only provide the user identifier.

**Solution:**
- Store user details in Supabase profiles table on first sign-in
- Use the Apple user identifier as the key

### Testing Limitations
- Can't test in iOS Simulator
- Need physical device with iOS 13+
- Must be signed in to iCloud on device

### App Store Requirements
If using Apple Sign In, it must be prominently displayed and cannot be behind other sign-in options (App Store Review Guideline 4.8).

## Google Sign In (Similar Approach)

For consistency, Google Sign In should also use native authentication:
- Install: `expo-google-sign-in` or `@react-native-google-signin/google-signin`
- Configure in Google Cloud Console
- Update auth context similar to Apple

## Alternative: Continue with Web OAuth

If native authentication complexity is too high for current phase:
1. Keep existing OAuth implementation
2. Open browser for authentication
3. Handle deep link callback

**Pros:**
- Simpler implementation
- No Apple Developer Account needed for testing
- Works in simulator

**Cons:**
- Poorer UX
- May not pass App Store review
- Slower authentication

## Troubleshooting

### Bundle Identifier Mismatch Error

**Error Code -7026**: "The operation couldn't be completed. (com.apple.AuthenticationServices.AuthorizationError error 1000.)"

**Cause**: The iOS native project is using a different bundle identifier than configured in `app.json`.

**Solution**: Update the bundle identifier without wiping Swift files:

```bash
# Update Xcode project file
cd expo-app/ios
sed -i '' 's/PRODUCT_BUNDLE_IDENTIFIER = com\.oldid\.app;/PRODUCT_BUNDLE_IDENTIFIER = io.mapstory.tourvision;/g' tourvisionmobile.xcodeproj/project.pbxproj

# Update Info.plist if needed
sed -i '' 's/com\.oldid\.app/io.mapstory.tourvision/g' tourvisionmobile/Info.plist

# Verify changes
grep -r "PRODUCT_BUNDLE_IDENTIFIER" tourvisionmobile.xcodeproj/project.pbxproj
```

Then rebuild the app:
```bash
cd expo-app
npx expo run:ios
```

### Icon Name Error

**Error**: "'google' is not a valid icon name for family 'feather'"

**Solution**: Feather icon set doesn't include a Google icon. Replace with a simple placeholder or use a different icon library.

## Next Steps

1. ✅ ~~Implement platform-specific auth logic~~ **COMPLETE**
2. ⏳ Complete Apple Developer setup:
   - Enable "Sign in with Apple" for App ID `io.mapstory.tourvision`
   - Create Service ID and Private Key
3. ⏳ Configure Supabase Apple provider with Apple credentials
4. ⏳ Test on physical iOS device (must be signed in to iCloud)
5. ⏳ Add Google native authentication
6. ⏳ Document testing procedures

## References

- [Expo Apple Authentication Docs](https://docs.expo.dev/versions/latest/sdk/apple-authentication/)
- [Supabase Apple OAuth Setup](https://supabase.com/docs/guides/auth/social-login/auth-apple)
- [Apple Sign In Guidelines](https://developer.apple.com/design/human-interface-guidelines/sign-in-with-apple)
- [App Store Review Guidelines 4.8](https://developer.apple.com/app-store/review/guidelines/#sign-in-with-apple)
