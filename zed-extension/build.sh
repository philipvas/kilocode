#!/bin/bash

# Build script for Kilocode Zed extension

set -e

echo "🔨 Building Kilocode Zed Extension..."

# Build the sidecar first
echo "📦 Building sidecar bridge..."
cd ../services/zed-bridge
npm install
npm run build

# Copy the built server to extension dist
echo "📋 Copying sidecar to extension..."
mkdir -p ../zed-extension/dist
cp dist/server.js ../../zed-extension/dist/

# Build the Rust extension
echo "🦀 Building Rust extension..."
cd ../../zed-extension
cargo build --release

# Create the extension package structure
echo "📁 Creating package structure..."
mkdir -p package
cp target/wasm32-wasi/release/kilocode_zed.wasm package/
cp extension.toml package/
cp -r dist package/

echo "✅ Build complete! Extension package is in ./package/"
echo ""
echo "To install in Zed:"
echo "  1. Open Zed"
echo "  2. Open Extensions (cmd-shift-x)"
echo "  3. Click 'Install Dev Extension'"
echo "  4. Select the zed-extension/package directory"