const corsHeaders = {
  'Access-Control-Allow-Credentials': 'true',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
  'Access-Control-Allow-Headers': 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization',
};

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!env.COHIN_KV) {
    return Response.json(
      { error: 'KV namespace COHIN_KV is not bound. Please set it up in Cloudflare Pages settings.' },
      { status: 500, headers: corsHeaders }
    );
  }

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
      inventoryData,     // full-replace: Restore / Import / Clear All
      changedItems,      // day-to-day: only the items that actually changed
      deletedCodes,      // day-to-day: item codes removed
      transactionHistory,
      palletCapacities,
    } = await request.json();

    const saves = [];

    if (inventoryData !== undefined) {
      // ---- Full-replace path (Restore, Import, Clear All) ----
      // These operations legitimately touch every item, but KV's free
      // tier only allows 1,000 writes/day -- so we must NEVER turn this
      // into "one write per item". Instead: write the whole array as a
      // single snapshot blob (1 write), and reset item_index to empty
      // (1 write) so reads fall back entirely to the fresh snapshot.
      // Any previously-touched "item:{code}" keys are simply orphaned
      // (no longer referenced by item_index) -- harmless, and they'll
      // just be overwritten again next time that item is individually
      // edited. Cost: always exactly 2 writes, regardless of inventory size.
      saves.push(env.COHIN_KV.put('cohin_inventoryData', JSON.stringify(inventoryData)));
      saves.push(env.COHIN_KV.put('item_index', JSON.stringify([])));
    } else if (changedItems !== undefined || deletedCodes !== undefined) {
      // ---- Partial (per-item) update path ----
      // Single edits, bulk delivery/withdraw, bulk clear of a subset.
      // Only the touched items cost a write -- cheap for normal day-to-day
      // volume (a handful to a few dozen writes per action).
      const changed = changedItems || [];
      const deleted = deletedCodes || [];

      for (const item of changed) {
        saves.push(env.COHIN_KV.put(`item:${item.code}`, JSON.stringify(item)));
      }
      for (const code of deleted) {
        // Tombstone instead of KV delete: a delete would make the item
        // fall through to whatever the snapshot blob still has for that
        // code, silently "undeleting" it on the next read. The tombstone
        // makes the removal explicit and durable until the next full snapshot.
        saves.push(env.COHIN_KV.put(`item:${code}`, JSON.stringify({ code, deleted: true })));
      }

      if (changed.length > 0 || deleted.length > 0) {
        const indexStr = await env.COHIN_KV.get('item_index');
        const codeSet = new Set(indexStr ? JSON.parse(indexStr) : []);
        for (const item of changed) codeSet.add(item.code);
        for (const code of deleted) codeSet.add(code);
        saves.push(env.COHIN_KV.put('item_index', JSON.stringify(Array.from(codeSet))));
      }
    }

    if (transactionHistory !== undefined) {
      saves.push(env.COHIN_KV.put('cohin_transactionHistory', JSON.stringify(transactionHistory)));
    }
    if (palletCapacities !== undefined) {
      saves.push(env.COHIN_KV.put('cohin_palletCapacities', JSON.stringify(palletCapacities)));
    }

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
