const corsHeaders = {
  'Access-Control-Allow-Credentials': 'true',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,OPTIONS',
  'Access-Control-Allow-Headers': 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization',
};

export async function onRequestGet(context) {
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
    const [itemsResult, historyResult, palletResult] = await Promise.all([
      env.DB.prepare('SELECT code, stocking_qty, remarks, locations FROM items ORDER BY sort_order').all(),
      env.DB.prepare('SELECT timestamp, action, code, details, meta FROM transaction_history ORDER BY id DESC').all(),
      env.DB.prepare('SELECT code, capacity FROM pallet_capacities').all(),
    ]);

    const inventoryData = itemsResult.results.map(r => ({
      code: r.code,
      stockingQty: r.stocking_qty,
      remarks: r.remarks,
      locations: r.locations,
    }));

    const transactionHistory = historyResult.results.map(r => {
      const log = { timestamp: r.timestamp, action: r.action, code: r.code, details: r.details };
      if (r.meta) log.meta = JSON.parse(r.meta);
      return log;
    });

    const palletCapacities = {};
    palletResult.results.forEach(r => { palletCapacities[r.code] = r.capacity; });

    return Response.json(
      { inventoryData, transactionHistory, palletCapacities },
      { headers: corsHeaders }
    );
  } catch (error) {
    console.error('Error fetching data from D1:', error);
    return Response.json(
      { error: 'Failed to fetch data from D1', details: error.message },
      { status: 500, headers: corsHeaders }
    );
  }
}

export async function onRequestOptions() {
  return new Response(null, { status: 200, headers: corsHeaders });
}
