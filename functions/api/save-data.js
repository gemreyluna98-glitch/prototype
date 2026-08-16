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
    const { inventoryData, transactionHistory, palletCapacities } = await request.json();

    // Save all provided keys to Cloudflare KV in parallel
    const saves = [];

    if (inventoryData !== undefined) {
      saves.push(env.COHIN_KV.put('cohin_inventoryData', JSON.stringify(inventoryData)));
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
