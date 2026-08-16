const corsHeaders = {
  'Access-Control-Allow-Credentials': 'true',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
  'Access-Control-Allow-Headers': 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization',
};

// One-off migration endpoint to create item_index from existing cohin_inventoryData blob.
// POST body: { dry: true } to only preview; otherwise it will write item_index.
// Protect with the same SYSTEM_PASSWORD auth header used elsewhere.

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!env.COHIN_KV) {
    return Response.json({ error: 'KV namespace COHIN_KV is not bound.' }, { status: 500, headers: corsHeaders });
  }

  // Auth check
  const authHeader = request.headers.get('Authorization');
  const expectedPassword = env.SYSTEM_PASSWORD || '101010';
  if (!authHeader || authHeader !== `Bearer ${expectedPassword}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });
  }

  let body = {};
  try {
    body = await request.json().catch(() => ({}));
  } catch (e) {
    body = {};
  }

  const dry = Boolean(body.dry);
  const force = Boolean(body.force);

  try {
    const blobStr = await env.COHIN_KV.get('cohin_inventoryData');
    if (!blobStr) {
      return Response.json({ error: 'No cohin_inventoryData blob found to migrate from.' }, { status: 404, headers: corsHeaders });
    }

    let arr;
    try {
      arr = JSON.parse(blobStr);
    } catch (e) {
      return Response.json({ error: 'Failed to parse cohin_inventoryData (invalid JSON).' }, { status: 500, headers: corsHeaders });
    }

    if (!Array.isArray(arr)) {
      return Response.json({ error: 'cohin_inventoryData is not an array.' }, { status: 500, headers: corsHeaders });
    }

    const codes = arr.map(it => (it && it.code ? String(it.code) : null)).filter(Boolean);
    // dedupe and preserve order
    const seen = new Set();
    const unique = [];
    for (const c of codes) {
      if (!seen.has(c)) { seen.add(c); unique.push(c); }
    }

    const existingIndexStr = await env.COHIN_KV.get('item_index');
    const existingCount = existingIndexStr ? (JSON.parse(existingIndexStr) || []).length : 0;

    const preview = {
      baselineCount: arr.length,
      uniqueCodesCount: unique.length,
      sampleCodes: unique.slice(0, 30),
      existingIndexCount: existingCount,
    };

    if (dry) {
      return Response.json({ dry: true, preview }, { headers: corsHeaders });
    }

    // If existing index exists and force is false, return preview and require force=true to overwrite
    if (existingIndexStr && !force) {
      return Response.json({
        error: 'item_index already exists. Send { "force": true } in the POST body to overwrite.',
        preview,
      }, { status: 409, headers: corsHeaders });
    }

    // Write item_index as a single small KV write.
    await env.COHIN_KV.put('item_index', JSON.stringify(unique));

    return Response.json({ success: true, preview }, { headers: corsHeaders });
  } catch (error) {
    console.error('Migration error:', error);
    return Response.json({ error: 'Migration failed', details: String(error) }, { status: 500, headers: corsHeaders });
  }
}

export async function onRequestOptions() {
  return new Response(null, { status: 200, headers: corsHeaders });
}
