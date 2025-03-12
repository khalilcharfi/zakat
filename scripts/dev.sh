#!/bin/bash

# Watch for changes and rebuild
echo "👀 Starting development watcher..."
npx rollup -c rollup.config.mjs -w &

# Start live server
echo "🚀 Launching development server..."
npx live-server dist --port=3000 --host=localhost