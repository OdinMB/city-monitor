/**
 * Temporary: measures the `trust proxy` hop count (TRUST_PROXY_HOPS in app.ts)
 * on each path into the server. Remove this router, lib/connection-check.ts and
 * their tests once the count is set from the measurement.
 *
 * GET /api/connection-check            JSON description of the caller's own request
 * GET /api/connection-check/page       check page: open it in a browser on each address
 * GET /api/connection-check/page.js    the page's script (helmet's CSP blocks inline script)
 *
 * Reads, stores and logs nothing.
 */
import { Router } from 'express';
import { connectionVerdict, describeConnection, FORGED_ADDRESS } from '../lib/connection-check.js';

const PAGE_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<meta name="color-scheme" content="light dark">
<title>Connection check</title>
<style>
  body { font: 16px/1.5 system-ui, sans-serif; max-width: 40rem; margin: 0 auto; padding: 1rem; }
  h1 { font-size: 1.375rem; margin: 0 0 0.5rem; }
  h2 { font-size: 1.125rem; margin: 1.5rem 0 0.5rem; }
  #verdict { font-size: 1.125rem; font-weight: 600; padding: 0.75rem; border: 2px solid currentColor; border-radius: 0.5rem; }
  dt { font-weight: 600; margin-top: 0.75rem; }
  dd { margin: 0; overflow-wrap: anywhere; font-family: ui-monospace, monospace; }
  pre { white-space: pre-wrap; overflow-wrap: anywhere; font-size: 0.8125rem; padding: 0.75rem; border-radius: 0.5rem; background: rgba(127, 127, 127, 0.12); }
</style>
</head>
<body>
<h1>Connection check</h1>
<p>Counts the proxies in front of this server on the address in the address bar. It sends two requests, one plain and one with a forged <code>X-Forwarded-For: ${FORGED_ADDRESS}</code>, and compares the answers. Nothing is stored or logged.</p>
<p id="verdict">Running&hellip;</p>
<dl>
  <dt>Checked on</dt><dd id="host"></dd>
  <dt>Your address, as the server derives it now</dt><dd id="address"></dd>
  <dt>Configured count (trust proxy)</dt><dd id="configured"></dd>
  <dt>Your address at the correct count</dt><dd id="correct-address"></dd>
  <dt>X-Forwarded-For, plain request</dt><dd id="chain-plain"></dd>
  <dt>X-Forwarded-For, forged request</dt><dd id="chain-forged"></dd>
</dl>
<p>Compare your address with what a site such as whatismyip.com shows, in the same address family (IPv4 with IPv4, IPv6 with IPv6). <code>::ffff:1.2.3.4</code> is the same address as <code>1.2.3.4</code>.</p>
<h2>Raw answers</h2>
<pre id="raw"></pre>
<script src="/api/connection-check/page.js"></script>
</body>
</html>
`;

// Plain browser JavaScript. connectionVerdict is the tested server function,
// inlined through toString() so the page and the tests share one copy.
const PAGE_SCRIPT = `'use strict';
const FORGED = ${JSON.stringify(FORGED_ADDRESS)};

${connectionVerdict.toString()}

function show(id, text) {
  document.getElementById(id).textContent = text;
}

function chain(report) {
  return report.forwardedFor.length > 0 ? report.forwardedFor.join(', ') : '(none arrived)';
}

async function ask(forge) {
  const headers = forge ? { 'X-Forwarded-For': FORGED } : {};
  // A unique query string, so no shared cache can answer with another request's description
  const nonce = Date.now().toString(36) + Math.random().toString(36).slice(2);
  const res = await fetch('/api/connection-check?n=' + nonce, { cache: 'no-store', headers: headers });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
}

function verdictText(verdict) {
  switch (verdict.kind) {
    case 'right':
      return 'Right: ' + verdict.configured + ' is the correct count on this address. The forged entry was ignored.';
    case 'too-high':
      return 'Too high (' + verdict.configured + '): set it to ' + verdict.correct + '. At ' + verdict.configured + ' the server believes an address the caller wrote.';
    case 'too-low':
      return 'Too low (' + verdict.configured + '): set it to ' + verdict.correct + '. At ' + verdict.configured + " the server takes a proxy's address for every visitor.";
    default:
      return "Header removed: the forged entry did not reach the server, so the count cannot be read from this answer. Compare the derived address with your own instead. Through the website's /api rewrite, this can mean the visitor's address does not reach the server at all.";
  }
}

async function run() {
  show('host', location.host);
  try {
    const plain = await ask(false);
    const forged = await ask(true);
    const verdict = connectionVerdict(forged, FORGED);
    const atCorrect = 'correct' in verdict ? plain.candidates[verdict.correct] : undefined;
    show('verdict', verdictText(verdict));
    show('address', plain.address === null ? '(unknown)' : plain.address);
    show('configured', String(forged.trustProxy));
    show('correct-address', atCorrect ? String(atCorrect.address) : '-');
    show('chain-plain', chain(plain));
    show('chain-forged', chain(forged));
    show('raw', JSON.stringify({ plain: plain, forged: forged }, null, 2));
  } catch (err) {
    show('verdict', 'The check failed: ' + (err && err.message ? err.message : String(err)));
  }
}

run();
`;

export function createConnectionCheckRouter(trustProxy: number) {
  const router = Router();

  router.get('/connection-check', (req, res) => {
    res.set('Cache-Control', 'private, no-store');
    res.json(describeConnection(req, trustProxy));
  });

  router.get('/connection-check/page', (_req, res) => {
    res.set('Cache-Control', 'no-store');
    res.type('html').send(PAGE_HTML);
  });

  router.get('/connection-check/page.js', (_req, res) => {
    res.set('Cache-Control', 'no-store');
    res.type('js').send(PAGE_SCRIPT);
  });

  return router;
}
