const corsHeaders = {
  'Access-Control-Allow-Credentials': 'true',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,OPTIONS',
  'Access-Control-Allow-Headers': 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization',
};

// Helper: chunk an array into batches of size n
function chunkArray(arr, n) {
  const res = [];
  for (let i = 0; i < arr.length; i += n) res.push(arr.slice(i, i + n));
  return res;
}

export async function onRequestGet(context) {
  const { env } = context;

  // Check if KV namespace is bound
  if (!env.COHIN_KV) {
    return Response.json(
      { error: 'KV namespace COHIN_KV is not bound. Please set it up in Cloudflare Pages settings.' },
      { status: 500, headers: corsHeaders }
    );
  }

  try {
    // Snapshot+overlay approach:
    // - cohin_inventoryData = baseline blob (written only on restore/import/clear)
    // - cohin_snapshot = numeric snapshot version (ms since epoch)
    // - item:{code} = small delta objects { data: {...}, baseSnapshot, deleted, updatedAt }
    // - item_index (optional) lists known codes for efficient delta lookup

    const [blobStr, snapshotStr, itemIndexStr, transactionHistoryStr, palletCapacitiesStr] = await Promise.all([
      env.COHIN_KV.get('cohin_inventoryData'),
      env.COHIN_KV.get('cohin_snapshot'),
      env.COHIN_KV.get('item_index'),
      env.COHIN_KV.get('cohin_transactionHistory'),
      env.COHIN_KV.get('cohin_palletCapacities'),
    ]);

    const snapshot = snapshotStr ? Number(snapshotStr) : 0;

    // Build base items map from the blob (fast)
    let itemsMap = new Map();
    if (blobStr) {
      const baseArr = JSON.parse(blobStr);
      if (Array.isArray(baseArr)) {
        for (const it of baseArr) {
          if (it && it.code) itemsMap.set(it.code, it);
        }
      }
    }

    // Determine which item codes to check for deltas.
    // If we have item_index, use it. Otherwise fall back to blob's keys.
    let itemCodes = null;
    if (itemIndexStr) {
      try { itemCodes = JSON.parse(itemIndexStr); } catch (e) { itemCodes = null; }
    }
    if (!itemCodes) itemCodes = Array.from(itemsMap.keys());

    // Fetch deltas in batches to avoid too many parallel GETs
    const BATCH_SIZE = 50;
    const batches = chunkArray(itemCodes, BATCH_SIZE);

    for (const batch of batches) {
      const values = await Promise.all(batch.map(code => env.COHIN_KV.get(`item:${code}`)));
      for (let i = 0; i < batch.length; i++) {
        const code = batch[i];
        const v = values[i];
        if (!v) continue;
        try {
          const delta = JSON.parse(v);
          const baseSnapshot = Number(delta.baseSnapshot || 0);
          // Apply only deltas that are relative to the current baseline snapshot
          if (baseSnapshot >= snapshot) {
            if (delta.deleted) {
              // tombstone hides the item
              itemsMap.delete(code);
            } else if (delta.data) {
              // overlay/replace
              itemsMap.set(code, delta.data);
            }
          }
        } catch (e) {
          // ignore malformed delta
          console.error(`Malformed delta for item:${code}`, e);
        }
      }
    }

    // Final inventory array
    const inventoryData = Array.from(itemsMap.values());

    return Response.json(
      {
        inventoryData,
        transactionHistory: transactionHistoryStr ? JSON.parse(transactionHistoryStr) : null,
        palletCapacities: palletCapacitiesStr ? JSON.parse(palletCapacitiesStr) : null,
        snapshot,
      },
      { headers: corsHeaders }
    );
  } catch (error) {
    console.error('Error fetching data from KV:', error);
    return Response.json(
      { error: 'Failed to fetch data from KV', details: error.message },
      { status: 500, headers: corsHeaders }
    );
  }
}

export async function onRequestOptions() {
  return new Response(null, { status: 200, headers: corsHeaders });
}
