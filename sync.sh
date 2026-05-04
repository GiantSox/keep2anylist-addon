#!/bin/bash
# sync.sh — Full two-way sync between Google Keep and AnyList.
#
# Flow:
#   1. keep_sync.py --read    → /tmp/keep_read.json  (new_items + synced_items)
#   2. anylist_sync.mjs full-sync
#        reads keep_read.json, in one AnyList session:
#          - pushes new items, deletes removed items, reads final list
#        → /tmp/anylist_items.json
#   3. keep_sync.py --write   → wipes Keep, writes all AnyList items with ' [S]' suffix

set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

PYTHON=".venv/bin/python3"

echo "━━━ Step 1: Reading Keep items ━━━"
$PYTHON keep_sync.py --read

echo ""
echo "━━━ Step 2: AnyList full-sync (push new, delete removed, read final) ━━━"
node anylist_sync.mjs full-sync

echo ""
echo "━━━ Step 3: Wipe Keep and write AnyList items back with [S] suffix ━━━"
$PYTHON keep_sync.py --write

echo ""
echo "━━━ Sync complete! ━━━"
