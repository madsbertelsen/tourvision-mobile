#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const distPath = path.join(__dirname, '..', 'dist');

// Create _worker.js for proper asset serving
const workerContent = `export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Directly serve static assets without SPA fallback
    if (
      url.pathname.startsWith('/assets/') ||
      url.pathname.startsWith('/_expo/') ||
      url.pathname.match(/\\.(js|css|png|jpg|jpeg|gif|svg|ico|ttf|woff|woff2|otf|eot|map)$/)
    ) {
      return env.ASSETS.fetch(request);
    }

    // For all other routes, try to serve the file first
    let response = await env.ASSETS.fetch(request);

    // If not found and not a file extension, serve index.html for SPA routing
    if (response.status === 404 && !url.pathname.includes('.')) {
      response = await env.ASSETS.fetch(new URL('/index.html', request.url));
    }

    return response;
  }
};
`;

fs.writeFileSync(path.join(distPath, '_worker.js'), workerContent);
console.log('✅ Created _worker.js');

// Create _headers for proper MIME types
const headersContent = `/.well-known/apple-app-site-association
  Content-Type: application/json
  Access-Control-Allow-Origin: *
  Cache-Control: public, max-age=3600

/.well-known/assetlinks.json
  Content-Type: application/json
  Access-Control-Allow-Origin: *
  Cache-Control: public, max-age=3600

/assets/*.ttf
  Content-Type: font/ttf
  Cache-Control: public, max-age=31536000, immutable

/assets/*.woff
  Content-Type: font/woff
  Cache-Control: public, max-age=31536000, immutable

/assets/*.woff2
  Content-Type: font/woff2
  Cache-Control: public, max-age=31536000, immutable

/_expo/*.js
  Content-Type: application/javascript
  Cache-Control: public, max-age=31536000, immutable

/_expo/*.css
  Content-Type: text/css
  Cache-Control: public, max-age=31536000, immutable
`;

fs.writeFileSync(path.join(distPath, '_headers'), headersContent);
console.log('✅ Created _headers with AASA configuration');

console.log('✅ Cloudflare deployment files prepared');
