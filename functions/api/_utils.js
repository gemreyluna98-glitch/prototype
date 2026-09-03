// =============================================================================
// Cohin Inventory System — Shared API Utilities
// =============================================================================

// --- CORS Configuration ---
// Replace ALLOWED_ORIGIN with your actual Cloudflare Pages domain after deployment.
const ALLOWED_ORIGIN = '*'; // TODO: Set to 'https://your-project.pages.dev' before production

export const corsHeaders = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization',
};

export function corsResponse(status = 200, body = null) {
  const init = { status, headers: corsHeaders };
  return body ? Response.json(body, init) : new Response(null, init);
}

// --- Authentication Helpers ---

/**
 * Verify the Authorization header against a signed session token (see
 * createSessionToken/verifySessionToken below) — NOT the raw password. The
 * frontend exchanges the password for a token once via /api/verify-password,
 * then sends that token as the Bearer credential on every later request.
 * Returns { ok: true } or { ok: false, response } with a ready-to-return 401.
 */
export async function verifyAuth(request, env) {
  if (!env.SYSTEM_PASSWORD) {
    return { ok: false, response: corsResponse(500, { error: 'Server misconfigured: SYSTEM_PASSWORD is not set.' }) };
  }
  const authHeader = request.headers.get('Authorization');
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) {
    return { ok: false, response: corsResponse(401, { error: 'Unauthorized. Please log in again.' }) };
  }
  const result = await verifySessionToken(token, env);
  if (!result.valid) {
    return { ok: false, response: corsResponse(401, { error: 'Session expired or invalid. Please log in again.' }) };
  }

  // Single-active-session check: if someone has logged in since this token
  // was issued, this device's sid will no longer match the current one.
  if (env.DB && result.sid) {
    try {
      const row = await env.DB.prepare('SELECT session_id FROM active_session WHERE id = 1').first();
      if (row && row.session_id && row.session_id !== result.sid) {
        return {
          ok: false,
          response: corsResponse(401, {
            error: 'You were logged out because someone logged in from another device.',
            reason: 'session_replaced',
          }),
        };
      }
    } catch {
      // If the check itself fails (e.g. table not migrated yet), fail open on
      // this specific check rather than locking everyone out.
    }
  }

  return { ok: true };
}

// --- Input Validation ---

const MAX_CODE_LENGTH = 100;
const MAX_QTY_LENGTH = 500;
const MAX_REMARKS_JSON_LENGTH = 5000; // remarks/locations are stored as a JSON-encoded array string, one entry per breakdown part

/**
 * Validate a single inventory item for save operations.
 * Returns { valid: true } or { valid: false, error: string }.
 */
export function validateItem(item) {
  if (!item || typeof item !== 'object') {
    return { valid: false, error: 'Item must be an object.' };
  }
  if (!item.code || typeof item.code !== 'string' || item.code.trim().length === 0) {
    return { valid: false, error: 'Item code is required.' };
  }
  if (item.code.length > MAX_CODE_LENGTH) {
    return { valid: false, error: `Item code exceeds max length (${MAX_CODE_LENGTH}).` };
  }
  if (item.stockingQty !== undefined && item.stockingQty !== null) {
    if (typeof item.stockingQty !== 'string') {
      return { valid: false, error: 'Stocking quantity must be a string.' };
    }
    if (item.stockingQty.length > MAX_QTY_LENGTH) {
      return { valid: false, error: `Stocking quantity exceeds max length (${MAX_QTY_LENGTH}).` };
    }
  }
  if (item.remarks !== undefined && item.remarks !== null) {
    if (typeof item.remarks !== 'string') {
      return { valid: false, error: 'Remarks must be a JSON-encoded string.' };
    }
    if (item.remarks.length > MAX_REMARKS_JSON_LENGTH) {
      return { valid: false, error: `Remarks exceeds max length (${MAX_REMARKS_JSON_LENGTH}).` };
    }
  }
  if (item.locations !== undefined && item.locations !== null) {
    if (typeof item.locations !== 'string') {
      return { valid: false, error: 'Locations must be a JSON-encoded string.' };
    }
    if (item.locations.length > MAX_REMARKS_JSON_LENGTH) {
      return { valid: false, error: `Locations exceeds max length (${MAX_REMARKS_JSON_LENGTH}).` };
    }
  }
  return { valid: true };
}

/**
 * Validate a transaction history log entry.
 */
export function validateLogEntry(log) {
  if (!log || typeof log !== 'object') return { valid: false, error: 'Log entry must be an object.' };
  if (!log.timestamp || typeof log.timestamp !== 'string') return { valid: false, error: 'Log timestamp is required.' };
  if (!log.action || typeof log.action !== 'string') return { valid: false, error: 'Log action is required.' };
  if (log.action.length > 100) return { valid: false, error: 'Log action exceeds max length.' };
  if (log.details && typeof log.details === 'string' && log.details.length > 2000) {
    return { valid: false, error: 'Log details exceeds max length (2000).' };
  }
  return { valid: true };
}

// --- Timing-safe password comparison ---

/**
 * SHA-256 hash a string, returning the raw digest bytes.
 */
async function sha256Bytes(str) {
  const data = new TextEncoder().encode(str);
  const hashBuf = await crypto.subtle.digest('SHA-256', data);
  return new Uint8Array(hashBuf);
}

/**
 * Constant-time comparison of two equal-length byte arrays — always walks
 * every byte (no early exit), so it doesn't leak how many leading
 * characters matched via response timing.
 */
function timingSafeEqualBytes(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

/**
 * Timing-safe equality check for the system password. Compares SHA-256
 * digests (fixed 32-byte length either way) rather than the raw strings,
 * so a plain `!==` can't short-circuit on the first mismatched character.
 */
export async function passwordsMatch(provided, expected) {
  const [providedHash, expectedHash] = await Promise.all([
    sha256Bytes(provided ?? ''),
    sha256Bytes(expected ?? ''),
  ]);
  return timingSafeEqualBytes(providedHash, expectedHash);
}

// --- Session Token Helpers (HMAC-SHA256) ---

const TOKEN_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

function bytesToBase64Url(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlToBytes(b64url) {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64 + '='.repeat((4 - b64.length % 4) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * Parse a short human-readable device label from a User-Agent string, e.g.
 * "Chrome on Windows". Best-effort only — used for the single-session
 * conflict warning, not for any security decision.
 */
export function parseDeviceLabel(userAgent) {
  if (!userAgent) return 'Unknown device';
  const ua = userAgent;
  let browser = 'Unknown browser';
  if (/Edg\//.test(ua)) browser = 'Edge';
  else if (/OPR\/|Opera/.test(ua)) browser = 'Opera';
  else if (/Chrome\//.test(ua)) browser = 'Chrome';
  else if (/CriOS\//.test(ua)) browser = 'Chrome';
  else if (/Firefox\//.test(ua)) browser = 'Firefox';
  else if (/Safari\//.test(ua) && /Version\//.test(ua)) browser = 'Safari';

  let os = 'Unknown OS';
  if (/Windows/.test(ua)) os = 'Windows';
  else if (/iPhone|iPad|iPod/.test(ua)) os = /iPad/.test(ua) ? 'iPadOS' : 'iOS';
  else if (/Mac OS X/.test(ua)) os = 'macOS';
  else if (/Android/.test(ua)) os = 'Android';
  else if (/Linux/.test(ua)) os = 'Linux';

  return `${browser} on ${os}`;
}

/**
 * Generate a session token: base64url(JSON payload).base64url(raw hmac signature bytes)
 * Payload includes both the expiry and a random session ID, so verifyAuth can
 * detect when a *different* login has since taken over (single-session enforcement).
 */
export async function createSessionToken(env, sid = crypto.randomUUID()) {
  const expiry = Date.now() + TOKEN_EXPIRY_MS;
  const payloadStr = JSON.stringify({ exp: expiry, sid });
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(env.SESSION_SECRET || env.SYSTEM_PASSWORD),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sigBuf = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payloadStr));
  const token = `${bytesToBase64Url(new TextEncoder().encode(payloadStr))}.${bytesToBase64Url(new Uint8Array(sigBuf))}`;
  return { token, sid, expiry };
}

/**
 * Verify a session token. Returns { valid: true, expiry, sid } or { valid: false }.
 */
export async function verifySessionToken(token, env) {
  if (!token || !token.includes('.')) return { valid: false };
  try {
    const [b64Payload, b64Sig] = token.split('.');
    const payloadStr = new TextDecoder().decode(base64UrlToBytes(b64Payload));
    const payload = JSON.parse(payloadStr);
    const expiry = payload.exp;
    if (!expiry || isNaN(expiry) || Date.now() > expiry) return { valid: false };

    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(env.SESSION_SECRET || env.SYSTEM_PASSWORD),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );
    const sigBytes = base64UrlToBytes(b64Sig);
    const valid = await crypto.subtle.verify('HMAC', key, sigBytes, new TextEncoder().encode(payloadStr));
    return valid ? { valid: true, expiry, sid: payload.sid } : { valid: false };
  } catch {
    return { valid: false };
  }
}

// --- Validation helpers for bulk operations ---

/**
 * Validate bulk delivery/withdrawal items array.
 */
export function validateBulkItems(items, maxItems = 200) {
  if (!Array.isArray(items)) return { valid: false, error: 'Items must be an array.' };
  if (items.length === 0) return { valid: false, error: 'Items array is empty.' };
  if (items.length > maxItems) return { valid: false, error: `Too many items (max ${maxItems}).` };
  for (let i = 0; i < items.length; i++) {
    const v = validateItem(items[i]);
    if (!v.valid) return { valid: false, error: `Item ${i + 1}: ${v.error}` };
  }
  return { valid: true };
}
