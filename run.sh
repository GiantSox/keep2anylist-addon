#!/bin/bash
LOG_FILE="/data/keep2anylist.log"
touch "$LOG_FILE"

# Read sync interval from options
INTERVAL=$(python3 -c "import json; print(json.load(open('/data/options.json')).get('SYNC_INTERVAL_MINUTES', 60))")
# Clamp to minimum of 5 minutes
if [ "$INTERVAL" -lt 5 ]; then INTERVAL=5; fi
# Write crontab dynamically
printf 'PATH=/usr/local/sbin:/usr/local/bin:/sbin:/bin:/usr/sbin:/usr/bin\n*/%s * * * * root /app/sync.sh >> /data/keep2anylist.log 2>&1\n' "$INTERVAL" > /etc/cron.d/keep2anylist
chmod 0644 /etc/cron.d/keep2anylist

cron
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Container started. Running initial sync..." | tee -a "$LOG_FILE"
/app/sync.sh >> "$LOG_FILE" 2>&1
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Initial sync complete. Cron will run every $INTERVAL minutes." | tee -a "$LOG_FILE"
exec tail -f "$LOG_FILE"
