#!/bin/bash

# SongCloud Multi-Stage Professional Deployment Script (dep.sh)
# Logic: 1. Push to GitHub -> 2. Remote VPS Pull -> 3. PM2 Reload

SERVER_IP="66.23.199.133"
SERVER_PASS="rishu"

echo "------------------------------------------------"
echo "🚀 STAGE 1: Pushing Local Changes to GitHub..."
echo "------------------------------------------------"

git add .
git commit -m "update: automated deployment sync" || echo "No local changes to commit"
git push origin main

echo "------------------------------------------------"
echo "🌐 STAGE 2: Triggering VPS Sync..."
echo "------------------------------------------------"

# Check for sshpass locally
SSHPASS_CMD=$(command -v /opt/homebrew/bin/sshpass || command -v sshpass)

if [ -z "$SSHPASS_CMD" ]; then
    echo "❌ Error: sshpass is not installed locally. Run 'brew install sshpass' first."
    exit 1
fi

$SSHPASS_CMD -p "$SERVER_PASS" ssh -o StrictHostKeyChecking=no root@$SERVER_IP "cd SongCloud && ./deploy.sh"

echo "------------------------------------------------"
echo "✨ ALL STAGES COMPLETE: App is live and synced!"
echo "------------------------------------------------"
