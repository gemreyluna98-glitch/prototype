const corsHeaders = {
  'Access-Control-Allow-Credentials': 'true',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,OPTIONS',
  'Access-Control-Allow-Headers': 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization',
};

export async function onRequestGet(context) {
  const { env } = context;

  if (!env.COHIN_KV) {
    return Response.json(
      { error: 'KV namespace COHIN_KV is not bound. Please set it up in Cloudflare Pages settings.' },
      { status: 500, headers: corsHeaders }
    );
  }

  try {
    // Schema (built around the KV free-tier's 1,000 writes/day cap):
    //  - "cohin_inventoryData": full snapshot blob. Only (re)written by
    //    full-replace operations (Restore, Import, Clear All) -> ALWAYS
    //    just 1 write, no matter how many items are in it.
    //  - "item_index": codes that have changed since that snapshot was
    //    taken (day-to-day edits, deliveries, withdrawals).
    //  - "item:{code}": the latest data for a changed item, or a
    //    tombstone { code, deleted: true } if it was deleted since the
    //    snapshot. Only these touched items ever cost a write.
    // Read = snapshot, with the touched items layered on top.
    const [snapshotStr, itemIndexStr, transactionHistoryStr, palletCapacitiesStr] = await Promise.all([
      env.COHIN_KV.get('cohin_inventoryData'),
      env.COHIN_KV.get('item_index'),
      env.COHIN_KV.get('cohin_transactionHistory'),
      env.COHIN_KV.get('cohin_palletCapacities'),
    ]);

    const baseItems = snapshotStr ? JSON.parse(snapshotStr) : [];
    const itemMap = new Map(baseItems.map(item => [item.code, item]));

    const changedCodes = itemIndexStr ? JSON.parse(itemIndexStr) : [];
    if (changedCodes.length > 0) {
      const overrideValues = await Promise.all(
        changedCodes.map(code => env.COHIN_KV.get(`item:${code}`))
      );
      changedCodes.forEach((code, i) => {
        const raw = overrideValues[i];
        if (!raw) { itemMap.delete(code); return; }
        const parsed = JSON.parse(raw);
        if (parsed.deleted) { itemMap.delete(code); }
        else { itemMap.set(code, parsed); }
      });
    }

    const inventoryData = Array.from(itemMap.values());

    return Response.json(
      {
        inventoryData,
        transactionHistory: transactionHistoryStr ? JSON.parse(transactionHistoryStr) : null,
        palletCapacities: palletCapacitiesStr ? JSON.parse(palletCapacitiesStr) : null,
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
