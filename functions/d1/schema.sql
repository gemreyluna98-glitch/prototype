
CREATE TABLE IF NOT EXISTS items (
  code TEXT PRIMARY KEY,
  stocking_qty TEXT,
  remarks TEXT,      
  locations TEXT,     
  sort_order INTEGER DEFAULT 0
) STRICT;
CREATE INDEX IF NOT EXISTS idx_items_sort_order ON items(sort_order);

CREATE TABLE IF NOT EXISTS transaction_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp TEXT,
  action TEXT NOT NULL,
  code TEXT,
  details TEXT,
  meta TEXT,
  client_id TEXT
) STRICT;
CREATE INDEX IF NOT EXISTS idx_history_code ON transaction_history(code);
-- Lets a retried save (after a partial failure, e.g. a network blip right
-- after the write committed but before the client saw the response) safely
-- resend the same log entry without duplicating it — see save-data.js's
-- `INSERT ... ON CONFLICT(client_id) DO NOTHING`. NULL client_id (older
-- clients, or rows saved before this column existed) is never treated as a
-- duplicate of another NULL by SQLite's UNIQUE, so this is fully backward
-- compatible.
CREATE UNIQUE INDEX IF NOT EXISTS idx_history_client_id ON transaction_history(client_id);

CREATE TABLE IF NOT EXISTS pallet_capacities (
  code TEXT PRIMARY KEY,
  capacity TEXT
) STRICT;


CREATE TABLE IF NOT EXISTS active_session (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  session_id TEXT NOT NULL,
  issued_at TEXT NOT NULL,
  device_label TEXT
) STRICT;

-- Marks a full-replace save (Restore/Import/Clear History/Clear All) as
-- fully completed, so a retry of the same request (e.g. after a network
-- blip right after the write committed but before the client saw the
-- response) can be recognized as already-done and short-circuited to a
-- plain success instead of redoing the whole insert-then-cleanup swap —
-- see save-data.js.
CREATE TABLE IF NOT EXISTS save_operations (
  operation_id TEXT PRIMARY KEY,
  completed_at TEXT NOT NULL
) STRICT;
