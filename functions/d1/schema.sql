-- Cohin Inventory System — D1 schema
-- Run this once via: wrangler d1 execute cohin-db --file=functions/d1/schema.sql --remote
-- (or paste into the D1 "Console" tab in the Cloudflare dashboard)

CREATE TABLE IF NOT EXISTS items (
  code TEXT PRIMARY KEY,
  stocking_qty TEXT,
  remarks TEXT,      -- JSON-encoded array, same format the app already uses
  locations TEXT,     -- JSON-encoded array, same format the app already uses
  sort_order INTEGER DEFAULT 0  -- display/export order; preserved on update, appended for new items
) STRICT;
CREATE INDEX IF NOT EXISTS idx_items_sort_order ON items(sort_order);

CREATE TABLE IF NOT EXISTS transaction_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,  -- source of truth for ordering (timestamps can tie during bulk actions)
  timestamp TEXT NOT NULL,
  action TEXT NOT NULL,
  code TEXT,
  details TEXT,
  meta TEXT           -- JSON-encoded object, NULL when the log has no meta
) STRICT;
CREATE INDEX IF NOT EXISTS idx_history_code ON transaction_history(code);

CREATE TABLE IF NOT EXISTS pallet_capacities (
  code TEXT PRIMARY KEY,
  capacity TEXT
) STRICT;
