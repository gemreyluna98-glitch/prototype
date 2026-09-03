// =============================================================================
// Cohin Inventory System — Pages Functions Middleware
// Handles CORS preflight and rate limiting for sensitive endpoints.
// =============================================================================

import { getCorsHeaders } from './_utils.js';

const RATE_LIMIT_MAX = 30;          // max requests per window for general POST endpoints
const AUTH_RATE_LIMIT_MAX = 10;     // max password-endpoint requests per window — a single login with an
                                     // active-session conflict takes 2 requests (check + confirm), so this
                                     // allows ~5 real login attempts per minute while still being tight
                                     // enough to block brute-force guessing.
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute window

// In-memory rate limit store (resets on cold start, acceptable for this use case)
const rateLimitStore = new Map();

function getClientIp(request) {
  return request.headers.get('cf-connecting-ip')
    || request.headers.get('x-real-ip')
    || 'unknown';
}

function isRateLimited(key, max) {
  const now = Date.now();

  // Lazy cleanup: instead of a background setInterval (unreliable/risky at
  // module scope on the Workers runtime, which doesn't guarantee timers fire
  // outside an active request), occasionally sweep stale entries as a side
  // effect of a normal rate-limit check. Cheap for this app's scale (a small,
  // internal tool with a handful of concurrent IPs at most).
  if (rateLimitStore.size > 500) {
    for (const [k, record] of rateLimitStore) {
      if (now - record.windowStart > RATE_LIMIT_WINDOW_MS * 2) rateLimitStore.delete(k);
    }
  }

  const record = rateLimitStore.get(key);
  if (!record || now - record.windowStart > RATE_LIMIT_WINDOW_MS) {
    rateLimitStore.set(key, { windowStart: now, count: 1 });
    return false;
  }
  record.count++;
  return record.count > max;
}

export async function onRequest(context) {
  const { request, env } = context;
  const corsHeaders = getCorsHeaders(env);
  const path = new URL(request.url).pathname;

  // CORS preflight — short-circuit
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  // Rate limit auth endpoint (verify-password) — tighter limit, since this is
  // the brute-force target. Checked separately from (and instead of) the
  // general POST limit below, so a login attempt only ever counts once.
  if (path === '/api/verify-password' && request.method === 'POST') {
    const ip = getClientIp(request);
    const key = `auth:${ip}`;
    if (isRateLimited(key, AUTH_RATE_LIMIT_MAX)) {
      return Response.json(
        { error: 'Too many authentication attempts. Please try again later.' },
        { status: 429, headers: { ...corsHeaders, 'Retry-After': '60' } }
      );
    }
    return context.next();
  }

  // Looser rate limit for all other POST endpoints
  if (request.method === 'POST') {
    const ip = getClientIp(request);
    const key = `post:${ip}`;
    if (isRateLimited(key, RATE_LIMIT_MAX)) {
      return Response.json(
        { error: 'Too many requests. Please slow down.' },
        { status: 429, headers: { ...corsHeaders, 'Retry-After': '60' } }
      );
    }
  }

  // Continue to the route handler
  return context.next();
}
