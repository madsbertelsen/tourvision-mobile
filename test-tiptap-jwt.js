// Test Tiptap JWT token generation
const crypto = require('crypto');

const TIPTAP_APP_SECRET = 'f6d9a7d903b990ce6b707be28ae19bf6941dcdc29a0137cd6233cd015a64fffe';
const documentName = 'e472cebd-7f3b-4490-a943-597b9bdceda1'; // Trip ID from database
const userId = 'test-user-123';
const userName = 'Test User';

function base64urlEncode(str) {
  return Buffer.from(str)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

function generateTiptapJWT() {
  const header = {
    alg: 'HS256',
    typ: 'JWT'
  };

  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iat: now,
    exp: now + (24 * 60 * 60), // 24 hours
    allowedDocumentNames: [documentName],
    userId: userId,
    userName: userName,
  };

  // Encode header and payload
  const encodedHeader = base64urlEncode(JSON.stringify(header));
  const encodedPayload = base64urlEncode(JSON.stringify(payload));

  // Create signature
  const message = `${encodedHeader}.${encodedPayload}`;
  const signature = crypto
    .createHmac('sha256', TIPTAP_APP_SECRET)
    .update(message)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');

  const token = `${message}.${signature}`;

  console.log('Generated JWT Token:');
  console.log(token);
  console.log('\nDecoded Header:', Buffer.from(encodedHeader, 'base64').toString());
  console.log('Decoded Payload:', Buffer.from(encodedPayload, 'base64').toString());
  console.log('\nTry connecting with:');
  console.log(`wss://cloud.tiptap.dev/yko82w79`);
  console.log(`Document name: ${documentName}`);

  return token;
}

generateTiptapJWT();
