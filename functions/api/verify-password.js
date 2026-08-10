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
    const expectedPassword = env.SYSTEM_PASSWORD || '101010';

    if (password === expectedPassword) {
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
