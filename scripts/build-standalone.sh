#!/bin/bash

# Script: Build Standalone Zakat Calculator
# Description: Creates a self-contained, runnable build of the project.

# Variables
PROJECT_ROOT=$(dirname "$(dirname "$(realpath "$0")")")
DIST_DIR="$PROJECT_ROOT/dist"
ZIP_FILE="$PROJECT_ROOT/zakat-calculator.zip"

# Clean previous build
echo "🧹 Cleaning old build..."
rm -rf "$DIST_DIR"
mkdir -p "$DIST_DIR"

# Build with Rollup
echo "🔨 Building application..."
cd "$PROJECT_ROOT" || exit 1
if [ ! -f "rollup.config.mjs" ]; then
  echo "❌ Error: rollup.config.mjs not found in project root!"
  exit 1
fi
npx rollup -c rollup.config.mjs

# Copy assets
echo "📁 Copying static files..."
cp "$PROJECT_ROOT/index.html" "$DIST_DIR/"
cp "$PROJECT_ROOT/style.css" "$DIST_DIR/"

# Create zip archive
echo "📦 Creating zip archive..."
cd "$PROJECT_ROOT" || exit 1
if [ -d "dist" ]; then
  zip -r "$ZIP_FILE" dist/
else
  echo "❌ Error: dist/ directory not found!"
  exit 1
fi

echo "✅ Standalone build complete!"
echo "📂 Output: $ZIP_FILE"