const corsHeaders = {
  'Access-Control-Allow-Credentials': 'true',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
  'Access-Control-Allow-Headers': 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization',
};

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!env.DB) {
    return Response.json(
      { error: 'D1 database DB is not bound. Add the binding in Pages > Settings > Bindings.' },
      { status: 500, headers: corsHeaders }
    );
  }

  const authHeader = request.headers.get('Authorization');
  const expectedPassword = env.SYSTEM_PASSWORD || '101010';
  if (!authHeader || authHeader !== `Bearer ${expectedPassword}`) {
    return Response.json({ error: 'Unauthorized. Incorrect password.' }, { status: 401, headers: corsHeaders });
  }

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

    const statements = [];

    if (inventoryData !== undefined) {
      // Full-replace path (Restore, Import, Clear All).
      statements.push(env.DB.prepare('DELETE FROM items'));
      for (const item of inventoryData) {
        statements.push(
          env.DB.prepare('INSERT OR REPLACE INTO items (code, stocking_qty, remarks, locations) VALUES (?, ?, ?, ?)')
            .bind(item.code, item.stockingQty ?? '', item.remarks ?? '[]', item.locations ?? '[]')
        );
      }
    } else if (changedItems !== undefined || deletedCodes !== undefined) {
      // Partial path: single edit, bulk delivery/withdraw, bulk clear qty.
      for (const item of (changedItems || [])) {
        statements.push(
          env.DB.prepare('INSERT OR REPLACE INTO items (code, stocking_qty, remarks, locations) VALUES (?, ?, ?, ?)')
            .bind(item.code, item.stockingQty ?? '', item.remarks ?? '[]', item.locations ?? '[]')
        );
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
      await env.DB.batch(statements);
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

export async function onRequestOptions() {
  return new Response(null, { status: 200, headers: corsHeaders });
}
