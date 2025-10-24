const crypto = require('crypto');

const TIPTAP_APP_SECRET = 'f6d9a7d903b990ce6b707be28ae19bf6941dcdc29a0137cd6233cd015a64fffe';

function base64urlEncode(str) {
  return Buffer.from(str)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

function generateMinimalJWT() {
  const header = {
    alg: 'HS256',
    typ: 'JWT'
  };

  const now = Math.floor(Date.now() / 1000);

  // Minimal payload - just what the docs say is required
  const payload = {
    sub: 'test-user-123', // Required
    allowedDocumentNames: ['test-doc'], // Optional but useful
    iat: now,
    exp: now + (24 * 60 * 60),
  };

  const encodedHeader = base64urlEncode(JSON.stringify(header));
  const encodedPayload = base64urlEncode(JSON.stringify(payload));
  const message = `${encodedHeader}.${encodedPayload}`;

  const signature = crypto
    .createHmac('sha256', TIPTAP_APP_SECRET)
    .update(message)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');

  const token = `${message}.${signature}`;

  console.log('Generated Minimal JWT:');
  console.log(token);
  console.log('\nDecoded Payload:', JSON.stringify(payload, null, 2));

  return token;
}

generateMinimalJWT();