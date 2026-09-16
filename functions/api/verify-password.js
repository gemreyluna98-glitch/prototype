import { getCorsHeaders, createSessionToken, parseDeviceLabel, passwordsMatch } from './_utils.js';

export async function onRequestPost(context) {
  const { request, env } = context;
  const corsHeaders = getCorsHeaders(env);

  try {
    const { password, force } = await request.json();

    if (!env.SYSTEM_PASSWORD) {
      return Response.json(
        { error: 'Server misconfigured: SYSTEM_PASSWORD is not set. Refusing to authenticate with a default password.' },
        { status: 500, headers: corsHeaders }
      );
    }

    if (!(await passwordsMatch(password, env.SYSTEM_PASSWORD))) {
      return Response.json(
        { success: false, error: 'Incorrect password' },
        { status: 401, headers: corsHeaders }
      );
    }

    // Issue a signed, short-lived session token instead of handing back the
    // password itself — this is what the frontend stores and sends as the
    // Bearer credential on every later request (see _utils.js verifyAuth).
    const { token, sid, expiry } = await createSessionToken(env);
    const deviceLabel = parseDeviceLabel(request.headers.get('User-Agent'));
    const issuedAt = new Date(expiry - 24 * 60 * 60 * 1000).toISOString();

    if (env.DB) {
      // Single-active-session check + claim, done as ONE atomic conditional
      // upsert instead of a separate "check for conflict" read followed by
      // an unconditional write. The old two-step version had a real gap:
      // two logins racing each other (or a stale in-flight check) could
      // both pass the read and both write, so the loser believed it had
      // logged in successfully but got silently kicked on its very next
      // request. This row is only actually claimed if it's empty, the
      // existing session is >24h old, or the caller confirmed `force` — any
      // other case leaves the row untouched (0 rows changed) and we report
      // it as a conflict, exactly like the old pre-check did.
      let claim = null;
      try {
        claim = await env.DB.prepare(
          `INSERT INTO active_session (id, session_id, issued_at, device_label) VALUES (1, ?1, ?2, ?3)
           ON CONFLICT(id) DO UPDATE SET
             session_id = excluded.session_id,
             issued_at = excluded.issued_at,
             device_label = excluded.device_label
           WHERE ?4 = 1
              OR active_session.session_id IS NULL
              OR (unixepoch('now') - unixepoch(active_session.issued_at)) > 86400`
        ).bind(sid, issuedAt, deviceLabel, force ? 1 : 0).run();
      } catch (err) {
        if (!/no such table/i.test(String((err && err.message) || err))) {
          // A real DB failure, not just an unmigrated table — don't let the
          // login through if we can't actually record it, that would leave
          // the client believing it's the active session when the server
          // has no matching row, causing an immediate, confusing "logged
          // out from another device" on the very next request.
          return Response.json(
            { error: 'Could not start session (database error). Please try again.' },
            { status: 503, headers: corsHeaders }
          );
        }
        // Table doesn't exist yet on this DB — degrade gracefully, same as
        // before: skip single-session enforcement rather than blocking login.
      }

      if (claim && claim.meta.changes === 0) {
        let existing = null;
        try {
          existing = await env.DB.prepare(
            'SELECT issued_at, device_label FROM active_session WHERE id = 1'
          ).first();
        } catch {
          // Fall through with existing=null — still report a conflict below,
          // just without the device/time details.
        }
        return Response.json(
          {
            conflict: true,
            deviceLabel: (existing && existing.device_label) || 'Unknown device',
            issuedAt: existing && existing.issued_at,
          },
          { headers: corsHeaders }
        );
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
