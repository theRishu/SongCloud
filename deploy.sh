#!/bin/bash

# SongCloud Deployment Script for VPS
# This script pulls the latest changes, builds, and restarts the PM2 process.

# Exit on any error
set -e

# Configuration
APP_NAME="songcloud"
PORT=8086

echo "------------------------------------------------"
echo "🚀 SongCloud Production Deployment"
echo "------------------------------------------------"

# 1. Pull latest changes
echo "📥 1/4: Pulling latest changes from GitHub..."
git pull origin main

# 2. Install dependencies
echo "📦 2/4: Installing dependencies..."
npm install --production=false

# 3. Build the application
echo "🏗️ 3/4: Building the application..."
npm run build

# 4. Restart PM2 process
echo "🔄 4/4: Synchronizing PM2 process..."

# Check if pm2 is installed
if ! command -v pm2 &> /dev/null; then
    echo "❌ Error: PM2 is not installed. Please install it with: npm install -g pm2"
    exit 1
fi

# Try to restart, or start if it doesn't exist
if pm2 list | grep -q "$APP_NAME"; then
    echo "✅ Process '$APP_NAME' found. Restarting..."
    pm2 restart "$APP_NAME"
else
    echo "⚠️ Process '$APP_NAME' not found. Starting a new one on port $PORT..."
    # We use 'npm start' to run the production build
    PORT=$PORT pm2 start npm --name "$APP_NAME" -- start
fi

# Save PM2 state
pm2 save

echo "------------------------------------------------"
echo "✨ Deployment Successful! Your app is live."
echo "------------------------------------------------"
