const TOKEN_EXPIRY_MS = 24 * 60 * 60 * 1000;

export const ADMIN_COOKIE_NAME = 'sl_admin_session';

export async function createSessionToken(password: string): Promise<string> {
  const expiry = Date.now() + TOKEN_EXPIRY_MS;
  const payload = `${expiry}`;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(payload)
  );

  const sigHex = Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  return `${payload}.${sigHex}`;
}

export async function verifySessionToken(
  token: string,
  password: string
): Promise<boolean> {
  if (!token || !password) return false;

  const parts = token.split('.');
  if (parts.length !== 2) return false;

  const [payload, sig] = parts;
  const expiry = parseInt(payload, 10);
  if (isNaN(expiry) || expiry < Date.now()) return false;

  try {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(password),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );

    const sigBytes = new Uint8Array(
      sig.match(/.{1,2}/g)?.map((b) => parseInt(b, 16)) ?? []
    );
    if (sigBytes.length === 0) return false;

    return await crypto.subtle.verify(
      'HMAC',
      key,
      sigBytes,
      encoder.encode(payload)
    );
  } catch {
    return false;
  }
}

export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}
