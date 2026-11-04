/**
 * JSON in base64url: the form of the setup cookie and the shared-link
 * parameters. Its alphabet needs no escaping in a cookie value or a URL.
 */

export function encodeJson(value: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** The value encoded, or undefined for text that is not base64url of UTF-8 JSON. Never throws. */
export function decodeJson(text: string): unknown {
  if (!/^[A-Za-z0-9_-]+$/.test(text)) return undefined;
  try {
    const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown;
  } catch {
    return undefined;
  }
}
