/**
 * The preview token for Hamburg Tourismus' events, which the API serves only
 * with it until HHT approves the integration (packages/server/src/lib/hht-gate.ts).
 * A review link with `?preview=<token>` stores it for the tab; the events and
 * bootstrap requests then send it in the X-Preview-Token header.
 */
const PREVIEW_KEY = 'hht-preview';
export const PREVIEW_TOKEN_HEADER = 'X-Preview-Token';

/** For a browser that blocks storage: the token then lasts until the page reloads. */
let inMemory: string | null = null;

/**
 * Takes `?preview=` from the address: a token is kept for the tab, an empty
 * value ends the preview. The parameter is then removed from the address bar,
 * so the token does not travel on in a copied link or a screenshot.
 */
export function capturePreviewToken(location: Location = window.location, history: History = window.history): void {
  const params = new URLSearchParams(location.search);
  if (!params.has('preview')) return;
  const token = params.get('preview')!.trim();
  inMemory = token || null;
  try {
    if (token) sessionStorage.setItem(PREVIEW_KEY, token);
    else sessionStorage.removeItem(PREVIEW_KEY);
  } catch {
    // Storage blocked: the in-memory copy serves this page load
  }
  params.delete('preview');
  const search = params.toString();
  try {
    history.replaceState(history.state, '', `${location.pathname}${search ? `?${search}` : ''}${location.hash}`);
  } catch {
    // An address that cannot be rewritten keeps the parameter; the token still works
  }
}

export function previewToken(): string | null {
  if (inMemory) return inMemory;
  try {
    return sessionStorage.getItem(PREVIEW_KEY);
  } catch {
    return null;
  }
}

/** The header to send with requests that return events; none without a token. */
export function previewHeaders(): Record<string, string> {
  const token = previewToken();
  return token ? { [PREVIEW_TOKEN_HEADER]: token } : {};
}

/** Tests only: forget the in-memory copy. */
export function resetPreviewTokenForTests(): void {
  inMemory = null;
}
