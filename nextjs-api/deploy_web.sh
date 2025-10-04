#!/bin/sh -x

# Build script for deploying Expo web app + Next.js API as unified application
# This script:
# 1. Exports Expo web app as static files
# 2. Copies Expo dist to Next.js public folder
# 3. Builds Next.js application

echo "🚀 Starting unified build process..."

# Step 1: Export Expo web app
echo "📦 Building Expo web app..."
cd ../expo-app
npm install
npx expo export -p web

# Step 2: Copy Expo dist to Next.js public folder
echo "📁 Copying Expo build to Next.js public folder..."
cd ../nextjs-api
rm -rf ./public/*
cp -a ../expo-app/dist/. ./public/

# Step 3: Build Next.js
echo "🏗️  Building Next.js application..."
pnpm install
pnpm next build

echo "✅ Build complete!"
