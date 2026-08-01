#!/bin/bash

# ==============================================================================
# AUTOMATED 2-YEAR LINUX SYSTEM SECURITY & MAINTENANCE SCRIPT
# ==============================================================================

echo "Setting up zero-touch background maintenance..."

# 1. Enable Ubuntu/Debian Automatic Security Patches
sudo apt update -y
sudo apt install unattended-upgrades -y
sudo dpkg-reconfigure -plow unattended-upgrades

# 2. Install & Configure PM2 (Process Manager to ensure app NEVER goes down)
sudo npm install pm2@latest -g

# 3. Start your main server and auto-maintenance worker under PM2
pm2 start server.js --name "chat-server" --max-memory-restart 400M
pm2 start auto-maintenance.js --name "maintenance-worker"

# 4. Save state so the app auto-boots after server restarts or power outages
pm2 save
sudo env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u $USER --hp $HOME

# 5. Create a Cron Job for automated weekly SSL renewal & Log Rotation
(crontab -l 2>/dev/null; echo "0 3 * * 0 certbot renew --quiet && pm2 flush") | crontab -

echo "Zero-touch automation complete! Server will auto-heal, auto-patch, and self-restart."
