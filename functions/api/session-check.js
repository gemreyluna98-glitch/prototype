// =============================================================================
// Cohin Inventory System — Session Check
// Lightweight endpoint polled periodically by unlocked clients so they find
// out promptly (not just on their next save/load) when a newer login from
// another device has taken over the single active session.
// =============================================================================

import { corsHeaders, verifyAuth } from './_utils.js';

export async function onRequestGet(context) {
  const { request, env } = context;

  const auth = await verifyAuth(request, env);
  if (!auth.ok) {
    // Pass through whatever verifyAuth decided (expired vs. session_replaced)
    // so the frontend can tell the two cases apart.
    return auth.response;
  }

  return Response.json({ ok: true }, { headers: corsHeaders });
}
