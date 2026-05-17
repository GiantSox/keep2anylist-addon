#!/usr/local/bin/python3
"""
keep_sync.py — Read/wipe/write items in a Google Keep list for two-way sync.

Subcommands:
  --read   Read current Keep items, write /tmp/keep_read.json:
             {"new_items": [...], "synced_items": [...]}
           new_items:    items WITHOUT ' [S]' suffix (user-added), title-cased
           synced_items: items WITH ' [S]' suffix (prev synced), suffix stripped
  --wipe   Delete all unchecked items from the Keep list
  --write  Read /tmp/anylist_items.json, write each item to Keep with ' [S]' suffix
"""

import json
import sys
import logging
import os
import gkeepapi

_OPTIONS_CANDIDATES = ["/data/options.json", os.path.join(os.path.dirname(__file__), "options.json")]
OPTIONS_FILE = next((p for p in _OPTIONS_CANDIDATES if os.path.exists(p)), _OPTIONS_CANDIDATES[0])

KEEP_READ_FILE = "/tmp/keep_read.json"
ANYLIST_ITEMS_FILE = "/tmp/anylist_items.json"
LAST_SYNCED_FILE = "/data/last_synced_to_keep.json"
SUFFIX = " [S]"

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)


def load_options():
    with open(OPTIONS_FILE) as f:
        return json.load(f)


def authenticate(opts):
    keep = gkeepapi.Keep()
    keep.authenticate(opts["GOOGLE_USERNAME"], opts["GOOGLE_MASTER_TOKEN"])
    keep.sync()
    return keep


def find_list(keep, list_name):
    results = keep.find(query=list_name)
    for node in results:
        if node.title.strip().lower() == list_name.strip().lower():
            return node
    raise ValueError(f"Could not find Keep list: '{list_name}'")


def _list_items(node):
    if hasattr(node, "items"):
        return node.items
    return [c for c in node.children if hasattr(c, "checked")]


def read_keep_items(opts):
    """
    Read Keep items and split by [S] suffix.
    Writes /tmp/keep_read.json.
    """
    keep = authenticate(opts)
    note = find_list(keep, opts["KEEP_LIST_NAME"])

    new_items = []
    synced_items = []

    for item in _list_items(note):
        text = item.text.strip()
        if item.checked or not text:
            continue
        if text.endswith(SUFFIX):
            # Previously synced from AnyList — strip suffix
            synced_items.append(text[: -len(SUFFIX)].strip())
        else:
            # User-added item — title-case it before pushing to AnyList
            new_items.append(text.title())

    log.info(f"Keep read: {len(new_items)} new item(s), {len(synced_items)} synced item(s)")

    data = {"new_items": new_items, "synced_items": synced_items}
    with open(KEEP_READ_FILE, "w") as f:
        json.dump(data, f, indent=2)
    log.info(f"Wrote {KEEP_READ_FILE}")


def wipe_keep_list(opts):
    """Delete all unchecked items from the Keep list."""
    keep = authenticate(opts)
    note = find_list(keep, opts["KEEP_LIST_NAME"])

    deleted = 0
    for item in list(_list_items(note)):
        if not item.checked:
            item.delete()
            deleted += 1

    keep.sync()
    log.info(f"Wiped {deleted} unchecked item(s) from Keep list '{opts['KEEP_LIST_NAME']}'")


def write_items_to_keep(opts):
    """Wipe Keep list, then write all items from /tmp/anylist_items.json with ' [S]' suffix."""
    try:
        with open(ANYLIST_ITEMS_FILE) as f:
            items = json.load(f)
    except FileNotFoundError:
        log.error(f"{ANYLIST_ITEMS_FILE} not found — cannot write to Keep")
        sys.exit(1)

    keep = authenticate(opts)
    note = find_list(keep, opts["KEEP_LIST_NAME"])

    # Wipe all unchecked items first
    deleted = 0
    for item in list(_list_items(note)):
        if not item.checked:
            item.delete()
            deleted += 1
    log.info(f"Wiped {deleted} unchecked item(s) from Keep list '{opts['KEEP_LIST_NAME']}'")

    # Write fresh items with [S] suffix
    for item_name in items:
        note.add(f"{item_name}{SUFFIX}", False)

    keep.sync()
    log.info(f"Wrote {len(items)} item(s) to Keep list '{opts['KEEP_LIST_NAME']}' with '{SUFFIX}' suffix")

    # Persist the snapshot so anylist_sync.mjs knows which items were written to
    # Keep this cycle. Written *after* keep.sync() so it only records what
    # actually made it into Keep — used next run to identify user-deleted items.
    try:
        with open(LAST_SYNCED_FILE, "w") as f:
            json.dump(items, f, indent=2)
        log.info(f"Saved sync state → {LAST_SYNCED_FILE}")
    except Exception as e:
        log.warning(f"Could not save sync state to {LAST_SYNCED_FILE}: {e}")


if __name__ == "__main__":
    opts = load_options()
    if "--read" in sys.argv:
        read_keep_items(opts)
    elif "--wipe" in sys.argv:
        wipe_keep_list(opts)
    elif "--write" in sys.argv:
        write_items_to_keep(opts)
    else:
        print("Usage: keep_sync.py [--read | --wipe | --write]")
        sys.exit(1)
