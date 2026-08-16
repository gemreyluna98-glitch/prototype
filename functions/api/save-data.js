const corsHeaders = {
  'Access-Control-Allow-Credentials': 'true',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
  'Access-Control-Allow-Headers': 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization',
};

export async function onRequestPost(context) {
  const { request, env } = context;

  // Check if KV namespace is bound
  if (!env.COHIN_KV) {
    return Response.json(
      { error: 'KV namespace COHIN_KV is not bound. Please set it up in Cloudflare Pages settings.' },
      { status: 500, headers: corsHeaders }
    );
  }

  // Authentication check
  const authHeader = request.headers.get('Authorization');
  const expectedPassword = env.SYSTEM_PASSWORD || '101010';

  if (!authHeader || authHeader !== `Bearer ${expectedPassword}`) {
    return Response.json(
      { error: 'Unauthorized. Incorrect password.' },
      { status: 401, headers: corsHeaders }
    );
  }

  try {
    const {
      inventoryData,    // legacy/full snapshot (write rarely on restore/import/clear all)
      changedItems,     // small per-item deltas (normal edits)
      deletedCodes,     // tombstones (normal deletes)
      transactionHistory,
      palletCapacities,
    } = await request.json();

    // We'll collect small per-item delta writes here, plus a few small index/snapshot writes.
    const saves = [];

    // Current baseline snapshot that read-path uses
    const currentSnapshotStr = await env.COHIN_KV.get('cohin_snapshot');
    const currentSnapshot = currentSnapshotStr ? Number(currentSnapshotStr) : 0;
    const now = Date.now();

    if (changedItems !== undefined || deletedCodes !== undefined) {
      // ---- Partial (per-item) update path using snapshot+overlay ----
      const changed = changedItems || [];
      const deleted = deletedCodes || [];

      // Write per-item deltas (small writes). Each delta includes baseSnapshot so
      // read-path knows whether to apply it on top of the current blob snapshot.
      for (const item of changed) {
        const delta = {
          data: item,
          baseSnapshot: currentSnapshot,
          deleted: false,
          updatedAt: now,
        };
        saves.push(env.COHIN_KV.put(`item:${item.code}`, JSON.stringify(delta)));
      }

      // Tombstone deletes instead of deleting the key immediately.
      for (const code of deleted) {
        const tomb = {
          baseSnapshot: currentSnapshot,
          deleted: true,
          updatedAt: now,
        };
        saves.push(env.COHIN_KV.put(`item:${code}`, JSON.stringify(tomb)));
      }

      // Keep item_index in sync (small key, cheap to rewrite).
      if (changed.length > 0 || deleted.length > 0) {
        const indexStr = await env.COHIN_KV.get('item_index');
        let itemCodes = indexStr ? JSON.parse(indexStr) : [];
        const codeSet = new Set(itemCodes);
        for (const item of changed) codeSet.add(item.code);
        for (const code of deleted) codeSet.delete(code);
        itemCodes = Array.from(codeSet);
        saves.push(env.COHIN_KV.put('item_index', JSON.stringify(itemCodes)));

        // ALSO update delta_index (small key) so read-path can fetch only changed codes
        const deltaIndexStr = await env.COHIN_KV.get('delta_index');
        let deltaCodes = deltaIndexStr ? JSON.parse(deltaIndexStr) : [];
        const deltaSet = new Set(deltaCodes);
        for (const item of changed) deltaSet.add(item.code);
        for (const code of deleted) deltaSet.add(code);
        deltaCodes = Array.from(deltaSet);
        saves.push(env.COHIN_KV.put('delta_index', JSON.stringify(deltaCodes)));
      }
    } else if (inventoryData !== undefined) {
      // ---- Full snapshot replace path (used only for restore/import/clear all) ----
      // Snapshot+overlay strategy: write the full baseline blob and bump the snapshot.
      // We DO NOT attempt to delete every per-item delta key here; old deltas will be ignored
      // by the read path because their baseSnapshot < newSnapshot.
      const newSnapshot = Date.now();

      // persist baseline blob and new snapshot
      saves.push(env.COHIN_KV.put('cohin_inventoryData', JSON.stringify(inventoryData)));
      saves.push(env.COHIN_KV.put('cohin_snapshot', String(newSnapshot)));

      // update item_index to reflect the baseline content (small write)
      const itemCodes = inventoryData.map(it => it.code);
      saves.push(env.COHIN_KV.put('item_index', JSON.stringify(itemCodes)));

      // Clear delta_index since snapshot supersedes old deltas
      saves.push(env.COHIN_KV.put('delta_index', JSON.stringify([])));

      // Note: do NOT mass-delete item:{code} keys here — that would blow write quota.
      // Old deltas with baseSnapshot < newSnapshot will automatically be ignored by readers.
    }

    if (transactionHistory !== undefined) {
      saves.push(env.COHIN_KV.put('cohin_transactionHistory', JSON.stringify(transactionHistory)));
    }
    if (palletCapacities !== undefined) {
      saves.push(env.COHIN_KV.put('cohin_palletCapacities', JSON.stringify(palletCapacities)));
    }

    // Run all small writes in parallel. If a write fails it will throw and be returned as error.
    await Promise.all(saves);

    return Response.json(
      { success: true, message: 'Data saved successfully' },
      { headers: corsHeaders }
    );
  } catch (error) {
    console.error('Error saving data to KV:', error);
    return Response.json(
      { error: 'Failed to save data', details: error.message },
      { status: 500, headers: corsHeaders }
    );
  }
}

export async function onRequestOptions() {
  return new Response(null, { status: 200, headers: corsHeaders });
}
