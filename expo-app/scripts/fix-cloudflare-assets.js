#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Move fonts from node_modules path to a Cloudflare-friendly location
const distPath = path.join(__dirname, '..', 'dist');
const fontsSource = path.join(distPath, 'assets', 'node_modules', '@expo', 'vector-icons', 'build', 'vendor', 'react-native-vector-icons', 'Fonts');
const fontsTarget = path.join(distPath, 'assets', 'fonts');

if (fs.existsSync(fontsSource)) {
  // Create target directory
  fs.mkdirSync(fontsTarget, { recursive: true });

  // Copy all font files
  const files = fs.readdirSync(fontsSource);
  files.forEach(file => {
    const src = path.join(fontsSource, file);
    const dest = path.join(fontsTarget, file);
    fs.copyFileSync(src, dest);
    console.log(`✅ Copied ${file}`);
  });

  // Remove the node_modules directory
  fs.rmSync(path.join(distPath, 'assets', 'node_modules'), { recursive: true, force: true });
  console.log('✅ Removed assets/node_modules directory');

  // Update the entry.js to reference the new font paths
  const entryFiles = fs.readdirSync(path.join(distPath, '_expo', 'static', 'js', 'web'));
  const entryFile = entryFiles.find(f => f.startsWith('entry-'));

  if (entryFile) {
    const entryPath = path.join(distPath, '_expo', 'static', 'js', 'web', entryFile);
    let content = fs.readFileSync(entryPath, 'utf8');

    // Replace the old font paths with new ones
    content = content.replace(
      /assets\/node_modules\/@expo\/vector-icons\/build\/vendor\/react-native-vector-icons\/Fonts\//g,
      'assets/fonts/'
    );

    fs.writeFileSync(entryPath, content);
    console.log(`✅ Updated font paths in ${entryFile}`);
  }

  console.log('✅ Cloudflare asset fix complete');
} else {
  console.log('ℹ️  No fonts found, skipping');
}
