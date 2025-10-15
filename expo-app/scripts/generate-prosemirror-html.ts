/**
 * Script to generate ProseMirror HTML with shared CSS styles
 * Run with: npx tsx scripts/generate-prosemirror-html.ts
 */

import fs from 'fs';
import path from 'path';
import { PROSE_STYLES, toCSS } from '../styles/prose-styles';

// Read the base HTML template
const htmlPath = path.join(__dirname, '../assets/prosemirror-editor-bundled.html');
const html = fs.readFileSync(htmlPath, 'utf-8');

// Generate CSS from shared config
const sharedCSS = toCSS(PROSE_STYLES);

// Find and replace the style section
const styleStart = html.indexOf('.ProseMirror h1');
const styleEnd = html.indexOf('.ProseMirror .geo-mark:hover {', styleStart);
const hoverEnd = html.indexOf('}', styleEnd) + 1;

if (styleStart === -1 || styleEnd === -1) {
  console.error('Could not find style section to replace');
  process.exit(1);
}

// Replace the styles
const before = html.substring(0, styleStart);
const after = html.substring(hoverEnd);
const updatedHTML = before + sharedCSS + after;

// Write back to file
fs.writeFileSync(htmlPath, updatedHTML, 'utf-8');

console.log('✅ Updated prosemirror-editor-bundled.html with shared styles');
console.log('📝 Styles generated from: styles/prose-styles.ts');
