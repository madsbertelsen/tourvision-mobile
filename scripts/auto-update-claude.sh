#!/bin/bash

# Auto-update script for Claude Code
# This script checks for and installs updates to Claude Code

echo "🔍 Checking for Claude Code updates..."

# Store current version
CURRENT_VERSION=$(claude --version 2>/dev/null | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)
echo "📌 Current version: $CURRENT_VERSION"

# Update via Bun
echo "⬆️  Updating Claude Code..."
bun update -g claude-code

# Check new version
NEW_VERSION=$(claude --version 2>/dev/null | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)

if [ "$CURRENT_VERSION" != "$NEW_VERSION" ]; then
  echo "✅ Updated from $CURRENT_VERSION to $NEW_VERSION"
else
  echo "✅ Already on latest version ($CURRENT_VERSION)"
fi
