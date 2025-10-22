#!/usr/bin/env node
// Build script for ProseMirror WebView bundle
// This script:
// 1. Bundles prosemirror-bundle-src.js with esbuild
// 2. Inserts it into the HTML template
// 3. Exports as a JS module

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const assetsDir = path.join(__dirname, 'assets');
const sourcePath = path.join(assetsDir, 'prosemirror-bundle-src.js');
const htmlTemplatePath = path.join(assetsDir, 'prosemirror-editor-bundled.html');
const tempBundlePath = path.join(assetsDir, 'prosemirror-bundle-temp.js');
const outputPath = path.join(assetsDir, 'prosemirror-editor-bundled-final.js');

console.log('[Build] Starting ProseMirror bundle build...');

// Step 1: Bundle with esbuild
console.log('[Build] Bundling ProseMirror with esbuild...');
try {
  execSync(
    `npx esbuild ${sourcePath} --bundle --format=iife --global-name=PMBundle --outfile=${tempBundlePath} --external:react --external:react-dom --external:react-native`,
    { stdio: 'inherit' }
  );
  console.log('[Build] ✓ esbuild bundle created');
} catch (error) {
  console.error('[Build] ✗ esbuild failed:', error.message);
  process.exit(1);
}

// Step 2: Read the HTML template
console.log('[Build] Reading HTML template...');
const htmlTemplate = fs.readFileSync(htmlTemplatePath, 'utf8');

// Step 3: Read the bundled JavaScript
console.log('[Build] Reading bundled JavaScript...');
const bundledJS = fs.readFileSync(tempBundlePath, 'utf8');

// Step 4: Insert the bundle into the HTML
console.log('[Build] Inserting bundle into HTML...');
const finalHTML = htmlTemplate.replace(
  '<script id="prosemirror-bundle">\n    // This will be replaced with the actual bundle content\n    console.log(\'[WebView] ProseMirror bundle placeholder\');\n  </script>',
  `<script id="prosemirror-bundle">\n${bundledJS}\n  </script>`
);

// Step 5: Export as JS module
console.log('[Build] Creating final output module...');
const outputJS = `// Auto-generated file - do not edit directly
// Generated from: prosemirror-editor-bundled.html + prosemirror-bundle-src.js
// To rebuild: node build-prosemirror.js

export default ${JSON.stringify(finalHTML)};
`;

fs.writeFileSync(outputPath, outputJS, 'utf8');
console.log('[Build] ✓ Final bundle written to:', outputPath);

// Step 6: Clean up temp file
fs.unlinkSync(tempBundlePath);
console.log('[Build] ✓ Cleaned up temporary files');

// Print file sizes
const finalSize = (fs.statSync(outputPath).size / 1024).toFixed(1);
console.log(`[Build] Final bundle size: ${finalSize} KB`);
console.log('[Build] ✓ Build complete!');
