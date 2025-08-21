#!/bin/bash

# Build script for simplified Kilocode Zed extension

set -e

echo "🔨 Building Simplified Kilocode Zed Extension..."

# Copy the simple version to lib.rs
echo "📋 Using simplified extension code..."
cp src/lib-simple.rs src/lib.rs

# Build the Rust extension
echo "🦀 Building Rust extension..."
cargo build --release

echo "✅ Build complete!"
echo ""
echo "The extension has been built successfully."
echo ""
echo "To install in Zed:"
echo "  1. Open Zed"
echo "  2. Open Extensions (cmd-shift-x)"
echo "  3. Click 'Install Dev Extension'"
echo "  4. Select this directory: $(pwd)"
echo ""
echo "Note: This is a simplified version that demonstrates the sidecar concept."
echo "The sidecar server at http://localhost:3001 provides the actual AI functionality."