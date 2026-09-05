import { getCorsHeaders, verifyAuth } from './_utils.js';

// Called by lockSystem() on the frontend when the user locks the screen (or
// the inactivity timer fires) — clears this device's row from
// active_session so the *same* device doesn't get a false "someone else is
// logged in" conflict the next time it unlocks with the correct password.
// Bug 1 fix: previously lockSystem() only cleared the token locally and
// never told the server, so the D1 row (and thus the conflict check in
// verify-password.js) outlived the "logout" for up to 24h.
export async function onRequestPost(context) {
  const { request, env } = context;
  const corsHeaders = getCorsHeaders(env);

  const auth = await verifyAuth(request, env);
  if (!auth.ok) {
    // Token already invalid/expired, or already replaced by a newer login
    // elsewhere — either way there's nothing of *this* device's to clean up
    // (a replaced session's row already belongs to the other device, so
    // leave it alone). Report success regardless: the frontend's local lock
    // has already happened by the time this fires, and the person doesn't
    // need to see an error for a background cleanup call.
    return Response.json({ success: true }, { headers: corsHeaders });
  }

  if (env.DB) {
    try {
      await env.DB.prepare('DELETE FROM active_session WHERE id = 1').run();
    } catch {
      // Best-effort — if this fails, the row just expires naturally after
      // 24h (see verify-password.js's stillActive check), so don't block
      // the lock action over it.
    }
  }

  return Response.json({ success: true }, { headers: corsHeaders });
}
