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
    // Fetch all three keys from Cloudflare KV in parallel
    const [inventoryDataStr, transactionHistoryStr, palletCapacitiesStr] = await Promise.all([
      env.COHIN_KV.get('cohin_inventoryData'),
      env.COHIN_KV.get('cohin_transactionHistory'),
      env.COHIN_KV.get('cohin_palletCapacities'),
    ]);

    return Response.json(
      {
        inventoryData: inventoryDataStr ? JSON.parse(inventoryDataStr) : null,
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
