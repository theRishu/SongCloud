#!/bin/bash

# SongCloud Remote Deployment Trigger
# Run this LOCALLY to update the VPS

SERVER_IP="66.23.199.133"
SERVER_PASS="rishu"

echo "------------------------------------------------"
echo "🌐 Triggering Remote Deployment on VPS..."
echo "------------------------------------------------"

# Check for sshpass
if ! command -v /opt/homebrew/bin/sshpass &> /dev/null && ! command -v sshpass &> /dev/null; then
    echo "❌ sshpass not found. Install it first: brew install sshpass"
    exit 1
fi

SSHPASS_PATH=$(command -v /opt/homebrew/bin/sshpass || command -v sshpass)

$SSHPASS_PATH -p "$SERVER_PASS" ssh -o StrictHostKeyChecking=no root@$SERVER_IP "cd SongCloud && git pull origin main && ./deploy.sh"

echo "------------------------------------------------"
echo "✅ Remote Deployment Triggered Successfully."
echo "------------------------------------------------"
