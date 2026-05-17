/**
 * anylist_sync.mjs — Single-session AnyList operations for two-way sync.
 *
 * Command:
 *   full-sync   Reads /tmp/keep_read.json, does all AnyList operations in one
 *               login session, writes /tmp/anylist_items.json.
 *
 *               Operations (in order, one connection):
 *                 1. Push new_items to AnyList (skip duplicates)
 *                 2. Delete items removed from Keep:
 *                      Items that were in last_synced_to_keep AND are no longer
 *                      in synced_items (user deleted the [S] version from Keep).
 *                      Items added directly to AnyList between syncs are NOT in
 *                      last_synced_to_keep and are therefore preserved.
 *                      If last_synced_to_keep doesn't exist (first run), skip
 *                      deletions entirely.
 *                 3. Read full unchecked list → /tmp/anylist_items.json
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { dirname } from "path";
import { fileURLToPath } from "url";
import AnyList from "anylist";
import { chdir } from "process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OPTIONS_FILE = existsSync("/data/options.json")
  ? "/data/options.json"
  : `${__dirname}/options.json`;
const DATA_DIR = existsSync("/data") ? "/data" : __dirname;
chdir(DATA_DIR);

const KEEP_READ_FILE = "/tmp/keep_read.json";
const ANYLIST_ITEMS_FILE = "/tmp/anylist_items.json";
const LAST_SYNCED_FILE = `${DATA_DIR}/last_synced_to_keep.json`;

function loadOptions() {
  return JSON.parse(readFileSync(OPTIONS_FILE, "utf8"));
}

async function fullSync() {
  // ── Read keep_read.json ──────────────────────────────────────────────────
  let keepRead;
  try {
    keepRead = JSON.parse(readFileSync(KEEP_READ_FILE, "utf8"));
  } catch (e) {
    console.error(`Could not read ${KEEP_READ_FILE}:`, e.message);
    process.exit(1);
  }

  const newItems = keepRead.new_items || [];
  const syncedItems = keepRead.synced_items || [];

  const newLower = new Set(newItems.map((s) => s.toLowerCase()));
  const syncedLower = new Set(syncedItems.map((s) => s.toLowerCase()));

  console.log(`Keep read: ${newItems.length} new item(s), ${syncedItems.length} synced item(s)`);

  // Load the snapshot of what was written to Keep at the end of the last sync.
  // Only items in this snapshot are candidates for deletion — items added directly
  // to AnyList between syncs will not be in lastSynced and are therefore safe.
  let lastSynced = [];
  try {
    lastSynced = JSON.parse(readFileSync(LAST_SYNCED_FILE, "utf8"));
    console.log(`Loaded last sync state: ${lastSynced.length} item(s) from ${LAST_SYNCED_FILE}`);
  } catch (e) {
    console.log(`No previous sync state (${LAST_SYNCED_FILE}) — deletions skipped this run.`);
  }
  const lastSyncedLower = new Set(lastSynced.map((s) => s.toLowerCase()));

  // ── Connect (single session) ─────────────────────────────────────────────
  const opts = loadOptions();
  const al = new AnyList({ email: opts.ANYLIST_USERNAME, password: opts.ANYLIST_PASSWORD });
  await al.login();
  await al.getLists();

  const list = al.getListByName(opts.ANYLIST_LIST_NAME);
  if (!list) {
    console.error(`AnyList list "${opts.ANYLIST_LIST_NAME}" not found.`);
    al.teardown();
    process.exit(1);
  }

  // ── Step 1: Push new items ───────────────────────────────────────────────
  if (newItems.length > 0) {
    console.log(`\nPushing ${newItems.length} new item(s)...`);
    const existingLower = new Set(list.items.map((i) => i.name.trim().toLowerCase()));
    let added = 0, skipped = 0;

    for (const name of newItems) {
      if (existingLower.has(name.toLowerCase())) {
        console.log(`  Skip (exists): ${name}`);
        skipped++;
      } else {
        const item = al.createItem({ name });
        await list.addItem(item);
        existingLower.add(name.toLowerCase()); // keep set current
        console.log(`  Added: ${name}`);
        added++;
      }
    }
    console.log(`  Push done — added: ${added}, skipped: ${skipped}`);
  } else {
    console.log("\nNo new items to push.");
  }

  // ── Step 2: Delete items user removed from Keep ──────────────────────────
  // Correct rule: delete an AnyList item only if ALL three hold:
  //   1. It was in AnyList at the end of last sync (present in lastSynced)
  //      — items added directly to AnyList between syncs are NOT in lastSynced
  //        and must never be deleted here.
  //   2. It is NOT in Keep's current synced_items (user deleted the [S] entry)
  //   3. It is NOT a new item being pushed from Keep this cycle
  //
  // If lastSynced is empty (first run, or /data state not yet written) we have
  // no baseline and skip all deletions.
  if (lastSynced.length === 0) {
    console.log("\nNo previous sync state — skipping deletion check.");
  } else {
    const toDelete = list.items.filter(
      (i) =>
        !i.checked &&
        lastSyncedLower.has(i.name.trim().toLowerCase()) &&
        !syncedLower.has(i.name.trim().toLowerCase()) &&
        !newLower.has(i.name.trim().toLowerCase())
    );

    if (toDelete.length > 0) {
      console.log(`\nDeleting ${toDelete.length} item(s) removed from Keep...`);
      for (const item of toDelete) {
        await list.removeItem(item);
        console.log(`  Deleted: ${item.name}`);
      }
    } else {
      console.log("\nNo items to delete from AnyList.");
    }
  }

  // ── Step 3: Read final unchecked list ────────────────────────────────────
  const finalItems = list.items
    .filter((i) => !i.checked)
    .map((i) => i.name.trim())
    .filter(Boolean);

  writeFileSync(ANYLIST_ITEMS_FILE, JSON.stringify(finalItems, null, 2));
  console.log(`\nFinal AnyList (${finalItems.length} item(s)) → ${ANYLIST_ITEMS_FILE}`);
  finalItems.forEach((name) => console.log(`  • ${name}`));

  // ── Done ─────────────────────────────────────────────────────────────────
  al.teardown();
  process.exit(0);
}

const cmd = process.argv[2];
if (cmd !== "full-sync") {
  console.error("Usage: anylist_sync.mjs full-sync");
  process.exit(1);
}

fullSync().catch((e) => {
  console.error("Fatal:", e.message || e);
  process.exit(1);
});
