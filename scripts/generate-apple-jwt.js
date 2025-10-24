#!/usr/bin/env node

/**
 * Generate Apple JWT Secret for Supabase OAuth
 *
 * Usage:
 *   node scripts/generate-apple-jwt.js path/to/AuthKey_XXX.p8 TEAM_ID KEY_ID
 *
 * Example:
 *   node scripts/generate-apple-jwt.js ~/Downloads/AuthKey_ABC123.p8 589242RZ8A ABC123
 */

const fs = require('fs');
const crypto = require('crypto');

// Get arguments
const [,, p8FilePath, teamId, keyId] = process.argv;

if (!p8FilePath || !teamId || !keyId) {
  console.error('Usage: node generate-apple-jwt.js <p8-file-path> <team-id> <key-id>');
  console.error('');
  console.error('Example: node generate-apple-jwt.js ~/Downloads/AuthKey_ABC123.p8 589242RZ8A ABC123');
  console.error('');
  console.error('Where:');
  console.error('  - p8-file-path: Path to your downloaded .p8 file');
  console.error('  - team-id: Your Apple Team ID (found in Apple Developer portal)');
  console.error('  - key-id: The ID from your .p8 filename (e.g., ABC123 from AuthKey_ABC123.p8)');
  process.exit(1);
}

// Read the .p8 file
let privateKey;
try {
  privateKey = fs.readFileSync(p8FilePath, 'utf8');
} catch (error) {
  console.error(`Error reading .p8 file: ${error.message}`);
  process.exit(1);
}

// Generate JWT
function generateJWT() {
  const now = Math.floor(Date.now() / 1000);

  // JWT Header
  const header = {
    alg: 'ES256',
    kid: keyId
  };

  // JWT Payload (Apple requires max 6 months expiration)
  const payload = {
    iss: teamId,
    iat: now,
    exp: now + (180 * 24 * 60 * 60), // 6 months (maximum allowed by Apple)
    aud: 'https://appleid.apple.com',
    sub: 'io.mapstory.tourvision.auth' // Your Service ID for OAuth
  };

  // Encode header and payload
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));

  // Create signature
  const signatureInput = `${encodedHeader}.${encodedPayload}`;
  const signature = crypto
    .createSign('sha256')
    .update(signatureInput)
    .sign(privateKey, 'base64');

  const encodedSignature = base64UrlEncode(signature, true);

  return `${signatureInput}.${encodedSignature}`;
}

function base64UrlEncode(input, isBase64 = false) {
  let base64;
  if (isBase64) {
    base64 = input;
  } else {
    base64 = Buffer.from(input).toString('base64');
  }

  return base64
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

// Generate and display JWT
try {
  const jwt = generateJWT();

  console.log('✅ Apple JWT Secret Generated Successfully!');
  console.log('');
  console.log('Copy this JWT and paste it into Supabase Dashboard:');
  console.log('(Authentication → Providers → Apple → Secret Key)');
  console.log('');
  console.log('─'.repeat(80));
  console.log(jwt);
  console.log('─'.repeat(80));
  console.log('');
  console.log('⚠️  This JWT is valid for 6 months (maximum allowed by Apple).');
  console.log('    You will need to regenerate it after expiration.');

  // Calculate expiration date
  const expirationDate = new Date((Math.floor(Date.now() / 1000) + (180 * 24 * 60 * 60)) * 1000);
  console.log(`    Expires on: ${expirationDate.toLocaleDateString()} ${expirationDate.toLocaleTimeString()}`);
  console.log('');
  console.log('Configuration Summary:');
  console.log(`  Team ID: ${teamId}`);
  console.log(`  Key ID: ${keyId}`);
  console.log(`  Service ID (OAuth): io.mapstory.tourvision.auth`);
  console.log(`  App ID (Native): io.mapstory.tourvision`);

} catch (error) {
  console.error(`Error generating JWT: ${error.message}`);
  process.exit(1);
}
