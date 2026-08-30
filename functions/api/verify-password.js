import { corsHeaders, createSessionToken } from './_utils.js';

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const { password } = await request.json();

    if (!env.SYSTEM_PASSWORD) {
      return Response.json(
        { error: 'Server misconfigured: SYSTEM_PASSWORD is not set. Refusing to authenticate with a default password.' },
        { status: 500, headers: corsHeaders }
      );
    }

    if (password === env.SYSTEM_PASSWORD) {
      // Issue a signed, short-lived session token instead of handing back the
      // password itself — this is what the frontend stores and sends as the
      // Bearer credential on every later request (see _utils.js verifyAuth).
      const token = await createSessionToken(env);
      return Response.json({ success: true, token }, { headers: corsHeaders });
    } else {
      return Response.json(
        { success: false, error: 'Incorrect password' },
        { status: 401, headers: corsHeaders }
      );
    }
  } catch (error) {
    return Response.json(
      { error: 'Invalid request body' },
      { status: 400, headers: corsHeaders }
    );
  }
}
