#!/bin/bash

# Build Orbit with proper macOS permissions
echo "🚀 Building Orbit with accessibility permissions..."

# Clean previous builds
echo "🧹 Cleaning previous builds..."
rm -rf dist/
rm -rf build/

# Build the app with electron-builder
echo "📦 Building app bundle..."
npm run build

# Check if build succeeded
if [ -d "dist/mac/Orbit.app" ]; then
    echo "✅ Build successful!"
    echo ""
    echo "📍 App location: dist/mac/Orbit.app"
    echo ""
    echo "🔐 The app is now built with the following permissions:"
    echo "   ✅ Accessibility access (for mouse/keyboard control)"
    echo "   ✅ Screen capture (for computer vision)"
    echo "   ✅ Apple Events (for app automation)"
    echo ""
    echo "🎯 To use the app:"
    echo "   1. Open dist/mac/Orbit.app"
    echo "   2. Grant permissions when prompted"
    echo "   3. If needed, manually add to System Preferences > Security & Privacy > Accessibility"
    echo ""
    echo "💡 You can also run: open dist/mac/Orbit.app"
else
    echo "❌ Build failed. Check the output above for errors."
    exit 1
fi