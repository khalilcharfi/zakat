#!/bin/bash

# Clean previous build
echo "🧹 Cleaning old build..."
rm -rf dist/
mkdir -p dist/js

# Copy static assets
echo "📁 Copying static files..."
cp index.html dist/
cp style.css dist/
cp -R js/* dist/js/

# Build with Rollup
echo "🔨 Building application..."
npx rollup -c rollup.config.mjs

# Fix permissions
echo "🔒 Fixing permissions..."
chmod -R 755 dist/

echo "✅ Build complete! Run 'npm run serve' to start the server."