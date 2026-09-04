/**
 * Returns the URL only if it is an ordinary web address, otherwise undefined.
 *
 * Link targets ingested from third-party feeds (news, events, police reports,
 * council meetings, appointment booking) are rendered straight into `href`
 * attributes. A `javascript:` or `data:` URL there would execute in the
 * visitor's browser, and the deployed CSP allows inline script, so it would not
 * be blocked. Passing the value through here first means an `<a>` fed a
 * non-web scheme renders as plain, non-clickable content instead.
 *
 * A value with no scheme at all is a relative path and cannot carry a
 * dangerous one, so it passes through unchanged.
 */
export function safeUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const { protocol } = new URL(url);
    return protocol === 'http:' || protocol === 'https:' ? url : undefined;
  } catch {
    return url;
  }
}
