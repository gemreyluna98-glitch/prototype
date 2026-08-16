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
      inventoryData,     // legacy: full-array replace (still supported)
      changedItems,      // new: only the items that actually changed
      deletedCodes,       // new: item codes to remove
      transactionHistory,
      palletCapacities,
    } = await request.json();

    const saves = [];

    if (changedItems !== undefined || deletedCodes !== undefined) {
      // ---- Partial (per-item) update path ----
      const changed = changedItems || [];
      const deleted = deletedCodes || [];

      // Write only the items that changed.
      for (const item of changed) {
        saves.push(env.COHIN_KV.put(`item:${item.code}`, JSON.stringify(item)));
      }
      // Remove any deleted items.
      for (const code of deleted) {
        saves.push(env.COHIN_KV.delete(`item:${code}`));
      }

      if (changed.length > 0 || deleted.length > 0) {
        // Keep item_index in sync (small key, cheap to rewrite).
        const indexStr = await env.COHIN_KV.get('item_index');
        let itemCodes = indexStr ? JSON.parse(indexStr) : [];
        const codeSet = new Set(itemCodes);
        for (const item of changed) codeSet.add(item.code);
        for (const code of deleted) codeSet.delete(code);
        itemCodes = Array.from(codeSet);
        saves.push(env.COHIN_KV.put('item_index', JSON.stringify(itemCodes)));
      }
    } else if (inventoryData !== undefined) {
      // ---- Legacy full-array replace path ----
      // Used for operations that legitimately touch everything (import,
      // restore from backup, clear all). Rewrites every item key plus
      // the index in one go, and cleans up any item keys that no longer
      // appear in the new data (e.g. items removed by a restore).
      const oldIndexStr = await env.COHIN_KV.get('item_index');
      const oldCodes = oldIndexStr ? JSON.parse(oldIndexStr) : [];

      const itemCodes = [];
      for (const item of inventoryData) {
        itemCodes.push(item.code);
        saves.push(env.COHIN_KV.put(`item:${item.code}`, JSON.stringify(item)));
      }

      const newCodeSet = new Set(itemCodes);
      for (const oldCode of oldCodes) {
        if (!newCodeSet.has(oldCode)) {
          saves.push(env.COHIN_KV.delete(`item:${oldCode}`));
        }
      }

      saves.push(env.COHIN_KV.put('item_index', JSON.stringify(itemCodes)));
      // Clean up the old single-blob key so we don't keep two copies around.
      saves.push(env.COHIN_KV.delete('cohin_inventoryData'));
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
