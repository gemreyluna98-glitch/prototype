import { corsHeaders, createSessionToken, parseDeviceLabel } from './_utils.js';

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const { password, force } = await request.json();

    if (!env.SYSTEM_PASSWORD) {
      return Response.json(
        { error: 'Server misconfigured: SYSTEM_PASSWORD is not set. Refusing to authenticate with a default password.' },
        { status: 500, headers: corsHeaders }
      );
    }

    if (password !== env.SYSTEM_PASSWORD) {
      return Response.json(
        { success: false, error: 'Incorrect password' },
        { status: 401, headers: corsHeaders }
      );
    }

    // Single-active-session check: if another device is currently logged in
    // (and that session hasn't already expired) and the caller hasn't
    // confirmed they want to take over, warn instead of logging in.
    if (env.DB && !force) {
      try {
        const existing = await env.DB.prepare(
          'SELECT session_id, issued_at, device_label FROM active_session WHERE id = 1'
        ).first();
        if (existing && existing.session_id) {
          const issuedAtMs = Date.parse(existing.issued_at);
          const stillActive = !isNaN(issuedAtMs) && Date.now() - issuedAtMs < 24 * 60 * 60 * 1000;
          if (stillActive) {
            return Response.json(
              {
                conflict: true,
                deviceLabel: existing.device_label || 'Unknown device',
                issuedAt: existing.issued_at,
              },
              { headers: corsHeaders }
            );
          }
        }
      } catch {
        // Table may not exist yet on an older DB — fail open (no conflict check).
      }
    }

    // Issue a signed, short-lived session token instead of handing back the
    // password itself — this is what the frontend stores and sends as the
    // Bearer credential on every later request (see _utils.js verifyAuth).
    const { token, sid, expiry } = await createSessionToken(env);
    const deviceLabel = parseDeviceLabel(request.headers.get('User-Agent'));

    if (env.DB) {
      try {
        await env.DB.prepare(
          `INSERT INTO active_session (id, session_id, issued_at, device_label) VALUES (1, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET session_id = excluded.session_id, issued_at = excluded.issued_at, device_label = excluded.device_label`
        ).bind(sid, new Date(expiry - 24 * 60 * 60 * 1000).toISOString(), deviceLabel).run();
      } catch {
        // If this write fails, still let the login through rather than
        // blocking access over the session-tracking table.
      }
    }

    return Response.json({ success: true, token }, { headers: corsHeaders });
  } catch (error) {
    return Response.json(
      { error: 'Invalid request body' },
      { status: 400, headers: corsHeaders }
    );
  }
}
