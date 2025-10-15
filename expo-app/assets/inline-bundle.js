#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Read files
const htmlPath = path.join(__dirname, 'prosemirror-editor-bundled.html');
const bundlePath = path.join(__dirname, 'prosemirror-bundle.js');
const outputPath = path.join(__dirname, 'prosemirror-editor-bundled-final.js');

console.log('Reading HTML from:', htmlPath);
console.log('Reading bundle from:', bundlePath);

const html = fs.readFileSync(htmlPath, 'utf-8');
const bundle = fs.readFileSync(bundlePath, 'utf-8');

console.log('HTML size:', html.length, 'bytes');
console.log('Bundle size:', bundle.length, 'bytes');

// Replace the placeholder script with the actual bundle
const inlinedHtml = html.replace(
  /<script id="prosemirror-bundle">[\s\S]*?<\/script>/,
  `<script id="prosemirror-bundle">\n${bundle}\n  </script>`
);

console.log('Inlined HTML size:', inlinedHtml.length, 'bytes');

// Escape and export as JavaScript module
const escaped = JSON.stringify(inlinedHtml);
const jsModule = `export default ${escaped};`;

fs.writeFileSync(outputPath, jsModule);

console.log('✅ Written to:', outputPath);
console.log('Final module size:', jsModule.length, 'bytes');
