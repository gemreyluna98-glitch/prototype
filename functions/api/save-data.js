import { corsHeaders, verifyAuth, validateBulkItems, validateItem, validateLogEntry } from './_utils.js';

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!env.DB) {
    return Response.json(
      { error: 'D1 database DB is not bound. Add the binding in Pages > Settings > Bindings.' },
      { status: 500, headers: corsHeaders }
    );
  }

  const auth = await verifyAuth(request, env);
  if (!auth.ok) return auth.response;

  try {
    const {
      inventoryData,       // full-replace: Restore / Import / Clear All
      changedItems,        // day-to-day: only items that changed
      deletedCodes,        // day-to-day: item codes removed
      newHistoryEntries,   // day-to-day: only the newly-logged entries
      transactionHistory,  // full-replace: Restore / Clear History
      palletCapacities,    // full-replace: Restore
      changedPalletCapacity, // day-to-day: single code that changed
    } = await request.json();

    // Validate payloads before touching the database — reject the whole
    // request on the first bad entry rather than partially applying it.
    if (inventoryData !== undefined) {
      if (!Array.isArray(inventoryData)) {
        return Response.json({ error: 'Invalid inventoryData: must be an array.' }, { status: 400, headers: corsHeaders });
      }
      if (inventoryData.length > 20000) {
        return Response.json({ error: 'Invalid inventoryData: too many items (max 20000).' }, { status: 400, headers: corsHeaders });
      }
      for (let i = 0; i < inventoryData.length; i++) {
        const v = validateItem(inventoryData[i]);
        if (!v.valid) return Response.json({ error: `Invalid inventoryData[${i}]: ${v.error}` }, { status: 400, headers: corsHeaders });
      }
    }
    if (changedItems !== undefined && changedItems.length > 0) {
      const v = validateBulkItems(changedItems, 5000);
      if (!v.valid) return Response.json({ error: `Invalid changedItems: ${v.error}` }, { status: 400, headers: corsHeaders });
    }
    if (newHistoryEntries !== undefined) {
      for (let i = 0; i < newHistoryEntries.length; i++) {
        const v = validateLogEntry(newHistoryEntries[i]);
        if (!v.valid) return Response.json({ error: `Invalid newHistoryEntries[${i}]: ${v.error}` }, { status: 400, headers: corsHeaders });
      }
    }
    if (transactionHistory !== undefined) {
      for (let i = 0; i < transactionHistory.length; i++) {
        const v = validateLogEntry(transactionHistory[i]);
        if (!v.valid) return Response.json({ error: `Invalid transactionHistory[${i}]: ${v.error}` }, { status: 400, headers: corsHeaders });
      }
    }
    if (changedPalletCapacity !== undefined) {
      if (!changedPalletCapacity.code || typeof changedPalletCapacity.code !== 'string') {
        return Response.json({ error: 'Invalid changedPalletCapacity: code is required.' }, { status: 400, headers: corsHeaders });
      }
    }

    const statements = [];

    if (inventoryData !== undefined) {
      // Full-replace path (Restore, Import, Clear All).
      // sort_order = position in the incoming array, so export order matches
      // exactly what was loaded/imported.
      statements.push(env.DB.prepare('DELETE FROM items'));
      inventoryData.forEach((item, index) => {
        statements.push(
          env.DB.prepare('INSERT OR REPLACE INTO items (code, stocking_qty, remarks, locations, sort_order) VALUES (?, ?, ?, ?, ?)')
            .bind(item.code, item.stockingQty ?? '', item.remarks ?? '[]', item.locations ?? '[]', index)
        );
      });
    } else if (changedItems !== undefined || deletedCodes !== undefined) {
      // Partial path: single edit, bulk delivery/withdraw, bulk clear qty.
      // Uses an UPSERT that preserves the existing sort_order on updates
      // (so editing an item no longer moves it to the end of the export).
      // New items get the next available sort_order, appended at the end.
      if (changedItems && changedItems.length > 0) {
        const maxRow = await env.DB.prepare('SELECT COALESCE(MAX(sort_order), -1) AS maxOrder FROM items').first();
        let nextOrder = (maxRow?.maxOrder ?? -1) + 1;

        for (const item of changedItems) {
          statements.push(
            env.DB.prepare(`
              INSERT INTO items (code, stocking_qty, remarks, locations, sort_order)
              VALUES (?, ?, ?, ?, ?)
              ON CONFLICT(code) DO UPDATE SET
                stocking_qty = excluded.stocking_qty,
                remarks = excluded.remarks,
                locations = excluded.locations
            `).bind(item.code, item.stockingQty ?? '', item.remarks ?? '[]', item.locations ?? '[]', nextOrder)
          );
          nextOrder++;
        }
      }
      for (const code of (deletedCodes || [])) {
        statements.push(env.DB.prepare('DELETE FROM items WHERE code = ?').bind(code));
      }
    }

    if (newHistoryEntries !== undefined) {
      // Incremental path: just insert the new log entries (day-to-day).
      for (const log of newHistoryEntries) {
        statements.push(
          env.DB.prepare('INSERT INTO transaction_history (timestamp, action, code, details, meta) VALUES (?, ?, ?, ?, ?)')
            .bind(log.timestamp, log.action, log.code ?? '-', log.details ?? '', log.meta ? JSON.stringify(log.meta) : null)
        );
      }
    } else if (transactionHistory !== undefined) {
      // Full-replace path (Restore, Clear History).
      statements.push(env.DB.prepare('DELETE FROM transaction_history'));
      const chronological = transactionHistory.slice().reverse(); // newest-first -> oldest-first for correct id ordering
      for (const log of chronological) {
        statements.push(
          env.DB.prepare('INSERT INTO transaction_history (timestamp, action, code, details, meta) VALUES (?, ?, ?, ?, ?)')
            .bind(log.timestamp, log.action, log.code ?? '-', log.details ?? '', log.meta ? JSON.stringify(log.meta) : null)
        );
      }
    }

    if (changedPalletCapacity !== undefined) {
      // Partial path: single code changed (auto-detect from remarks, or manual
      // entry during bulk delivery) — upsert just that one row.
      statements.push(
        env.DB.prepare('INSERT OR REPLACE INTO pallet_capacities (code, capacity) VALUES (?, ?)')
          .bind(changedPalletCapacity.code, changedPalletCapacity.capacity)
      );
    } else if (palletCapacities !== undefined) {
      // Full-replace path (Restore).
      statements.push(env.DB.prepare('DELETE FROM pallet_capacities'));
      for (const code of Object.keys(palletCapacities)) {
        statements.push(
          env.DB.prepare('INSERT OR REPLACE INTO pallet_capacities (code, capacity) VALUES (?, ?)')
            .bind(code, palletCapacities[code])
        );
      }
    }

    if (statements.length > 0) {
      // D1 caps batch() at 10,000 statements per request — chunk defensively
      // so a large Import/Restore (which can be 1 DELETE + N INSERTs) never
      // hits that ceiling, even well before N gets anywhere close to it.
      const BATCH_CHUNK_SIZE = 5000;
      for (let i = 0; i < statements.length; i += BATCH_CHUNK_SIZE) {
        await env.DB.batch(statements.slice(i, i + BATCH_CHUNK_SIZE));
      }
    }

    return Response.json({ success: true, message: 'Data saved successfully' }, { headers: corsHeaders });
  } catch (error) {
    console.error('Error saving data to D1:', error);
    return Response.json(
      { error: 'Failed to save data', details: error.message },
      { status: 500, headers: corsHeaders }
    );
  }
}
