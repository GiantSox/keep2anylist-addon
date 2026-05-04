#!/bin/bash
LOG_FILE="/data/keep2anylist.log"
touch "$LOG_FILE"
cron
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Container started. Running initial sync..." | tee -a "$LOG_FILE"
/app/sync.sh >> "$LOG_FILE" 2>&1
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Initial sync complete. Cron will run hourly." | tee -a "$LOG_FILE"
exec tail -f "$LOG_FILE"
