const corsHeaders = {
  'Access-Control-Allow-Credentials': 'true',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,OPTIONS',
  'Access-Control-Allow-Headers': 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization',
};

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
    // item_index holds just the list of material codes that exist.
    // Each item's actual data lives in its own "item:{code}" key, so a
    // single edit no longer has to rewrite (or re-download) every item.
    const [itemIndexStr, transactionHistoryStr, palletCapacitiesStr] = await Promise.all([
      env.COHIN_KV.get('item_index'),
      env.COHIN_KV.get('cohin_transactionHistory'),
      env.COHIN_KV.get('cohin_palletCapacities'),
    ]);

    const itemCodes = itemIndexStr ? JSON.parse(itemIndexStr) : null;

    let inventoryData = null;

    if (itemCodes) {
      // New per-item schema: fetch every item key in parallel.
      const itemValues = await Promise.all(
        itemCodes.map(code => env.COHIN_KV.get(`item:${code}`))
      );
      inventoryData = itemCodes
        .map((code, i) => (itemValues[i] ? JSON.parse(itemValues[i]) : null))
        .filter(Boolean);
    } else {
      // Backward-compat fallback: no item_index yet means this KV store
      // still has data under the old single-blob key (pre-migration).
      const legacyStr = await env.COHIN_KV.get('cohin_inventoryData');
      inventoryData = legacyStr ? JSON.parse(legacyStr) : null;
    }

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
