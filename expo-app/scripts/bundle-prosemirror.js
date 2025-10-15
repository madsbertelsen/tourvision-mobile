/**
 * Bundle ProseMirror for WebView
 * This creates a standalone bundle that can be embedded in HTML
 */

const fs = require('fs');
const path = require('path');

// Read the ProseMirror modules
const pmModel = fs.readFileSync(require.resolve('prosemirror-model/dist/index.js'), 'utf8');
const pmState = fs.readFileSync(require.resolve('prosemirror-state/dist/index.js'), 'utf8');
const pmView = fs.readFileSync(require.resolve('prosemirror-view/dist/index.js'), 'utf8');
const pmKeymap = fs.readFileSync(require.resolve('prosemirror-keymap/dist/index.js'), 'utf8');
const pmHistory = fs.readFileSync(require.resolve('prosemirror-history/dist/index.js'), 'utf8');
const pmCommands = fs.readFileSync(require.resolve('prosemirror-commands/dist/index.js'), 'utf8');

// Create a bundled version that exposes window.PM
const bundle = `
(function() {
  'use strict';

  // Create PM namespace
  window.PM = {};

  // Define a simple require function for inter-module dependencies
  const modules = {};
  function require(name) {
    if (modules[name]) return modules[name];
    throw new Error('Module not found: ' + name);
  }

  // ProseMirror Model
  ${pmModel.replace(/export /g, 'window.PM.model = window.PM.model || {}; window.PM.model.')}

  // ProseMirror State
  ${pmState.replace(/export /g, 'window.PM.state = window.PM.state || {}; window.PM.state.')}

  // ProseMirror View
  ${pmView.replace(/export /g, 'window.PM.view = window.PM.view || {}; window.PM.view.')}

  // ProseMirror Keymap
  ${pmKeymap.replace(/export /g, 'window.PM.keymap = window.PM.keymap || {}; window.PM.keymap.')}

  // ProseMirror History
  ${pmHistory.replace(/export /g, 'window.PM.history = window.PM.history || {}; window.PM.history.')}

  // ProseMirror Commands
  ${pmCommands.replace(/export /g, 'window.PM.commands = window.PM.commands || {}; window.PM.commands.')}

  console.log('[ProseMirror Bundle] Loaded successfully', Object.keys(window.PM));
})();
`;

// Write to assets
const outputPath = path.join(__dirname, '../assets/prosemirror-bundle.js');
fs.writeFileSync(outputPath, bundle);

console.log('✅ ProseMirror bundle created at:', outputPath);
console.log('📦 Bundle size:', (bundle.length / 1024).toFixed(2), 'KB');
