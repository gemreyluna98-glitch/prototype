import { corsHeaders, verifyAuth } from './_utils.js';

export async function onRequestGet(context) {
  const { request, env } = context;

  if (!env.DB) {
    return Response.json(
      { error: 'D1 database DB is not bound. Add the binding in Pages > Settings > Bindings.' },
      { status: 500, headers: corsHeaders }
    );
  }

  const auth = await verifyAuth(request, env);
  if (!auth.ok) return auth.response;

  try {
    // Optional server-side pagination for transaction history (not yet used by
    // the frontend, which still requests the full list) — capped at 5,000 rows
    // even without pagination params, as a safety net against unbounded growth.
    const url = new URL(request.url);
    const historyPage = parseInt(url.searchParams.get('historyPage') || '0', 10);
    const historyLimit = Math.min(parseInt(url.searchParams.get('historyLimit') || '5000', 10), 5000);
    const historyOffset = historyPage * historyLimit;

    const [itemsResult, historyResult, palletResult] = await Promise.all([
      env.DB.prepare('SELECT code, stocking_qty, remarks, locations FROM items ORDER BY sort_order').all(),
      env.DB.prepare('SELECT timestamp, action, code, details, meta FROM transaction_history ORDER BY id DESC LIMIT ? OFFSET ?').bind(historyLimit, historyOffset).all(),
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
      if (r.meta) {
        try { log.meta = JSON.parse(r.meta); } catch (e) { log.meta = null; }
      }
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
