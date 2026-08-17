const corsHeaders = {
  'Access-Control-Allow-Credentials': 'true',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
  'Access-Control-Allow-Headers': 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization',
};

// One-time migration: KV (snapshot blob + per-item overrides/tombstones) -> D1.
// POST body: { dry: true } to preview only. { force: true } required to
// overwrite if D1 tables already have rows (safety: won't silently clobber).
// Auth: same Bearer password as the other endpoints.

async function readInventoryFromKV(KV) {
  const [snapshotStr, itemIndexStr] = await Promise.all([
    KV.get('cohin_inventoryData'),
    KV.get('item_index'),
  ]);
  const baseItems = snapshotStr ? JSON.parse(snapshotStr) : [];
  const itemMap = new Map(baseItems.map(item => [item.code, item]));

  const changedCodes = itemIndexStr ? JSON.parse(itemIndexStr) : [];
  if (changedCodes.length > 0) {
    const overrideValues = await Promise.all(changedCodes.map(code => KV.get(`item:${code}`)));
    changedCodes.forEach((code, i) => {
      const raw = overrideValues[i];
      if (!raw) { itemMap.delete(code); return; }
      const parsed = JSON.parse(raw);
      if (parsed.deleted) { itemMap.delete(code); }
      else { itemMap.set(code, parsed); }
    });
  }
  return Array.from(itemMap.values());
}

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!env.COHIN_KV) {
    return Response.json({ error: 'KV namespace COHIN_KV is not bound.' }, { status: 500, headers: corsHeaders });
  }
  if (!env.DB) {
    return Response.json({ error: 'D1 database DB is not bound. Add the binding in Pages > Settings > Bindings first.' }, { status: 500, headers: corsHeaders });
  }

  const authHeader = request.headers.get('Authorization');
  const expectedPassword = env.SYSTEM_PASSWORD || '101010';
  if (!authHeader || authHeader !== `Bearer ${expectedPassword}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });
  }

  const body = await request.json().catch(() => ({}));
  const dry = Boolean(body.dry);
  const force = Boolean(body.force);

  try {
    const inventoryData = await readInventoryFromKV(env.COHIN_KV);
    const transactionHistoryStr = await env.COHIN_KV.get('cohin_transactionHistory');
    const transactionHistory = transactionHistoryStr ? JSON.parse(transactionHistoryStr) : [];
    const palletCapacitiesStr = await env.COHIN_KV.get('cohin_palletCapacities');
    const palletCapacities = palletCapacitiesStr ? JSON.parse(palletCapacitiesStr) : {};

    const preview = {
      itemsToMigrate: inventoryData.length,
      historyEntriesToMigrate: transactionHistory.length,
      palletCapacitiesToMigrate: Object.keys(palletCapacities).length,
      sampleItemCodes: inventoryData.slice(0, 10).map(i => i.code),
    };

    if (dry) {
      return Response.json({ dry: true, preview }, { headers: corsHeaders });
    }

    // Safety check: refuse to clobber existing D1 data unless forced.
    const countRow = await env.DB.prepare('SELECT COUNT(*) as c FROM items').first();
    const existingItemsCount = countRow ? countRow.c : 0;
    if (existingItemsCount > 0 && !force) {
      return Response.json({
        error: `D1 "items" table already has ${existingItemsCount} rows. Send { "force": true } to overwrite.`,
        preview,
      }, { status: 409, headers: corsHeaders });
    }

    const statements = [];
    statements.push(env.DB.prepare('DELETE FROM items'));
    statements.push(env.DB.prepare('DELETE FROM transaction_history'));
    statements.push(env.DB.prepare('DELETE FROM pallet_capacities'));

    for (const item of inventoryData) {
      statements.push(
        env.DB.prepare('INSERT OR REPLACE INTO items (code, stocking_qty, remarks, locations) VALUES (?, ?, ?, ?)')
          .bind(item.code, item.stockingQty ?? '', item.remarks ?? '[]', item.locations ?? '[]')
      );
    }

    // transactionHistory is newest-first (unshift order). Insert oldest-first
    // so the autoincrement id matches chronological order -> ORDER BY id DESC
    // on read reproduces the exact same newest-first order the app expects.
    const chronological = transactionHistory.slice().reverse();
    for (const log of chronological) {
      statements.push(
        env.DB.prepare('INSERT INTO transaction_history (timestamp, action, code, details, meta) VALUES (?, ?, ?, ?, ?)')
          .bind(log.timestamp, log.action, log.code ?? '-', log.details ?? '', log.meta ? JSON.stringify(log.meta) : null)
      );
    }

    for (const code of Object.keys(palletCapacities)) {
      statements.push(
        env.DB.prepare('INSERT OR REPLACE INTO pallet_capacities (code, capacity) VALUES (?, ?)')
          .bind(code, palletCapacities[code])
      );
    }

    // D1 batch() runs everything in one atomic transaction -- either it all
    // commits, or none of it does. Chunked to stay well under D1's per-batch
    // statement ceiling; each chunk is still atomic on its own, and every
    // statement here is idempotent (DELETE + INSERT OR REPLACE), so a retry
    // after a partial failure is always safe to re-run from scratch.
    const CHUNK_SIZE = 400;
    for (let i = 0; i < statements.length; i += CHUNK_SIZE) {
      await env.DB.batch(statements.slice(i, i + CHUNK_SIZE));
    }

    return Response.json({ success: true, migrated: preview }, { headers: corsHeaders });
  } catch (error) {
    console.error('Migration error:', error);
    return Response.json({ error: 'Migration failed', details: String(error) }, { status: 500, headers: corsHeaders });
  }
}

export async function onRequestOptions() {
  return new Response(null, { status: 200, headers: corsHeaders });
}
