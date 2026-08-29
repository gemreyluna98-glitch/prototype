export async function onRequestPost(context) {
  const { request, env } = context;

  const corsHeaders = {
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST,OPTIONS',
    'Access-Control-Allow-Headers': 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization',
  };

  try {
    const { password } = await request.json();

    if (!env.SYSTEM_PASSWORD) {
      return Response.json(
        { error: 'Server misconfigured: SYSTEM_PASSWORD is not set. Refusing to authenticate with a default password.' },
        { status: 500, headers: corsHeaders }
      );
    }

    if (password === env.SYSTEM_PASSWORD) {
      return Response.json({ success: true }, { headers: corsHeaders });
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

export async function onRequestOptions() {
  return new Response(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST,OPTIONS',
      'Access-Control-Allow-Headers': 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization',
    },
  });
}
