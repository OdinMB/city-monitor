/**
 * Headless Chromium through Playwright, which is not a dependency of this
 * repository: it loads from --playwright, the checkout, NODE_PATH or the
 * global folder of the running Node. Every request not to the run's own web
 * server is aborted and counted by host, except the base map's style, which
 * the routes answer from memory without sending it (lib/map-style.mjs);
 * anything that slips past the routes (browser-internal traffic, a service
 * worker, a WebSocket) meets a proxy on a closed loopback port.
 */

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { localResponse } from './map-style.mjs';

/** Folders that may hold the Playwright package, in the order they are tried. */
export function playwrightCandidates({ explicit, repoRoot, nodePath = process.env.NODE_PATH ?? '', execPath = process.execPath, platform = process.platform }) {
  if (explicit) return [path.resolve(explicit)];
  const prefix = path.dirname(path.dirname(execPath));
  const globalDir = platform === 'win32' ? path.join(path.dirname(execPath), 'node_modules') : path.join(prefix, 'lib', 'node_modules');
  return [
    path.join(repoRoot, 'node_modules', 'playwright'),
    ...nodePath.split(path.delimiter).filter(Boolean).map((dir) => path.join(dir, 'playwright')),
    path.join(globalDir, 'playwright'),
  ];
}

export function loadPlaywright(options) {
  const tried = playwrightCandidates(options);
  for (const dir of tried) {
    if (!fs.existsSync(path.join(dir, 'package.json'))) continue;
    const playwright = createRequire(path.join(dir, 'package.json'))(dir);
    if (playwright?.chromium) return { playwright, dir };
  }
  throw new Error(`Playwright not found (tried ${tried.join(', ')}). Install it globally or pass --playwright <dir>; it is not a dependency of this repository.`);
}

/** True for a URL on one of the run's own origins, which the browser may load. */
export function isAllowedUrl(url, allowedOrigins) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol === 'data:' || parsed.protocol === 'blob:') return true;
  return allowedOrigins.includes(parsed.origin);
}

function hostOf(url) {
  try {
    return new URL(url).host || new URL(url).protocol;
  } catch {
    return 'invalid-url';
  }
}

/**
 * What the browser does with a request to `url`: `continue` to one of the
 * run's own origins, `fulfil` it from memory (the base map's style), or
 * `abort` it. Nothing else is ever sent.
 */
export function decideRoute(url, allowedOrigins) {
  if (isAllowedUrl(url, allowedOrigins)) return { action: 'continue' };
  const local = localResponse(url);
  if (local) return { action: 'fulfil', key: local.key, response: local.fulfil };
  return { action: 'abort', host: hostOf(url) };
}

/** "/berlin/sources?x=1" to "berlin-sources-x-1"; "/" to "root". */
export function pathSlug(pagePath) {
  const slug = pagePath.replace(/^\/+/, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase();
  return slug || 'root';
}

/** <path>__<WxH>__<lang>__<theme>[__<NN>-<step name>].png */
export function screenshotName({ pagePath, viewport, lang, theme, stepIndex, stepName }) {
  const base = `${pathSlug(pagePath)}__${viewport.width}x${viewport.height}__${lang}__${theme}`;
  if (stepName === undefined) return `${base}.png`;
  return `${base}__${String(stepIndex + 1).padStart(2, '0')}-${stepName}.png`;
}

/** Adds up several { name: count } maps, such as each page's blocked hosts. */
export function sumCounts(maps) {
  const total = {};
  for (const counts of maps) for (const [name, n] of Object.entries(counts ?? {})) total[name] = (total[name] ?? 0) + n;
  return total;
}

/** "a (2), b (1)", or "none". */
export function formatCounts(counts) {
  return Object.entries(counts).map(([name, n]) => `${name} (${n})`).join(', ') || 'none';
}

/** Phone and tablet widths get touch and mobile emulation. */
export function isTouchViewport(viewport) {
  return viewport.width < 768;
}

const LOCALES = { de: 'de-DE', en: 'en-GB', tr: 'tr-TR', ar: 'ar' };

/** Every combination of the run's paths, viewports, languages and themes. */
export function combinations({ paths, viewports, langs, themes }) {
  const out = [];
  for (const pagePath of paths) for (const viewport of viewports) for (const lang of langs) for (const theme of themes) {
    out.push({ pagePath, viewport, lang, theme });
  }
  return out;
}

export async function launchBrowser({ playwright, env, proxyPort }) {
  return playwright.chromium.launch({
    headless: true,
    env,
    // Loopback bypasses the proxy; everything else goes to a closed port.
    proxy: { server: `http://127.0.0.1:${proxyPort}`, bypass: '127.0.0.1,localhost' },
    args: ['--disable-background-networking', '--disable-component-update', '--no-pings', '--disable-domain-reliability'],
  });
}

/**
 * A context that blocks every request outside `allowedOrigins`, counting
 * blocked hosts into `blocked` (host -> count), and answers the base map's
 * style from memory, counting it into `served` (host and path -> count).
 */
export async function newBlockingContext(browser, { allowedOrigins, blocked, served = {}, options = {} }) {
  const context = await browser.newContext({ serviceWorkers: 'block', acceptDownloads: false, ...options });
  await context.route('**/*', (route) => {
    const decision = decideRoute(route.request().url(), allowedOrigins);
    if (decision.action === 'continue') return route.continue();
    if (decision.action === 'fulfil') {
      served[decision.key] = (served[decision.key] ?? 0) + 1;
      return route.fulfill(decision.response);
    }
    blocked[decision.host] = (blocked[decision.host] ?? 0) + 1;
    return route.abort('blockedbyclient');
  });
  await context.routeWebSocket(/.*/, (ws) => {
    const host = hostOf(ws.url());
    blocked[host] = (blocked[host] ?? 0) + 1;
    ws.close();
  });
  return context;
}

/**
 * The negative test inside the browser: one GET to `url` from a blocking
 * context. Resolves true when it was blocked.
 */
export async function probeBrowserNetwork({ browser, url }) {
  const blocked = {};
  const context = await newBlockingContext(browser, { allowedOrigins: [], blocked });
  try {
    const page = await context.newPage();
    try {
      await page.goto(url, { timeout: 15_000 });
      return false;
    } catch {
      return true;
    }
  } finally {
    await context.close();
  }
}

async function scrollFully(page, settleMs) {
  for (let i = 0; i < 80; i += 1) {
    const atBottom = await page.evaluate(() => {
      window.scrollBy(0, Math.max(200, Math.floor(window.innerHeight * 0.8)));
      return window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
    });
    await page.waitForTimeout(300);
    if (atBottom) break;
  }
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(Math.min(settleMs, 1000));
}

function locate(page, step) {
  const base = step.selector !== undefined ? page.locator(step.selector) : page.getByText(step.text, { exact: step.exact === true });
  return base.nth(step.nth ?? 0);
}

async function runStep(page, step, { baseUrl, timeoutMs, shoot }) {
  const timeout = step.timeout ?? timeoutMs;
  switch (step.action) {
    case 'click':
      return locate(page, step).click({ timeout });
    case 'tap':
      return locate(page, step).tap({ timeout });
    case 'hover':
      return locate(page, step).hover({ timeout });
    case 'wait':
      if (step.selector !== undefined || step.text !== undefined) return locate(page, step).waitFor({ state: 'visible', timeout });
      return page.waitForTimeout(step.ms);
    case 'scroll-to':
      if (step.position === 'top') return page.evaluate(() => window.scrollTo(0, 0));
      if (step.position === 'bottom') return page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      return locate(page, step).scrollIntoViewIfNeeded({ timeout });
    case 'press':
      return page.keyboard.press(step.key);
    case 'goto':
      return page.goto(new URL(step.path, baseUrl).href, { waitUntil: 'load', timeout });
    case 'screenshot':
      return shoot(step);
    default:
      throw new Error(`unknown action ${step.action}`);
  }
}

/**
 * Opens every combination in its own context, screenshots it, runs the steps
 * and returns one report entry per combination.
 */
export async function runPages({ browser, baseUrl, combos, steps, scroll, fullPage, settleMs, timezone, shotsDir, runDir, actionTimeoutMs = 15_000 }) {
  const origin = new URL(baseUrl).origin;
  const results = [];
  for (const combo of combos) {
    const { pagePath, viewport, lang, theme } = combo;
    const blocked = {};
    const served = {};
    const entry = {
      path: pagePath,
      viewport: `${viewport.width}x${viewport.height}`,
      lang,
      theme,
      url: new URL(pagePath, baseUrl).href,
      screenshots: [],
      consoleErrors: [],
      pageErrors: [],
      failedRequests: [],
      blockedHosts: blocked,
      servedLocally: served,
      stepErrors: [],
    };
    results.push(entry);
    const touch = isTouchViewport(viewport);
    const context = await newBlockingContext(browser, {
      allowedOrigins: [origin],
      blocked,
      served,
      options: {
        viewport,
        isMobile: touch,
        hasTouch: touch,
        locale: LOCALES[lang],
        colorScheme: theme,
        timezoneId: timezone,
      },
    });
    // The app reads its language and theme from localStorage first; set them once per context.
    await context.addInitScript(({ lang: l, theme: t }) => {
      try {
        if (!sessionStorage.getItem('harness-prefs-set')) {
          localStorage.setItem('language', l);
          localStorage.setItem('theme', t);
          sessionStorage.setItem('harness-prefs-set', '1');
        }
      } catch {
        // storage blocked: the context's locale and color scheme still apply
      }
    }, { lang, theme });

    const page = await context.newPage();
    page.on('console', (msg) => {
      if (msg.type() !== 'error') return;
      const url = msg.location()?.url ?? '';
      entry.consoleErrors.push({ text: msg.text().slice(0, 2000), url, fromBlockedRequest: url !== '' && !isAllowedUrl(url, [origin]) });
    });
    page.on('pageerror', (err) => entry.pageErrors.push(String(err?.message ?? err).slice(0, 2000)));
    page.on('requestfailed', (req) => {
      if (!isAllowedUrl(req.url(), [origin])) return;
      entry.failedRequests.push({ url: req.url(), method: req.method(), failure: req.failure()?.errorText ?? 'failed' });
    });
    page.on('response', (res) => {
      if (res.status() >= 400 && isAllowedUrl(res.url(), [origin])) {
        entry.failedRequests.push({ url: res.url(), method: res.request().method(), status: res.status() });
      }
    });

    const shoot = async (step) => {
      const name = screenshotName({ pagePath, viewport, lang, theme, stepIndex: step?.index, stepName: step?.name });
      const file = path.join(shotsDir, name);
      if (step?.selector !== undefined || step?.text !== undefined) await locate(page, step).screenshot({ path: file, timeout: actionTimeoutMs });
      else await page.screenshot({ path: file, fullPage });
      entry.screenshots.push(path.relative(runDir, file));
    };

    try {
      await page.goto(entry.url, { waitUntil: 'load', timeout: 60_000 });
      await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
      await page.waitForTimeout(settleMs);
      if (scroll) await scrollFully(page, settleMs);
      await shoot();
      for (const [index, step] of steps.entries()) {
        try {
          await runStep(page, step, { baseUrl, timeoutMs: actionTimeoutMs, shoot: (s) => shoot({ ...s, index }) });
          if (step.action !== 'screenshot' && step.action !== 'wait') await page.waitForTimeout(settleMs);
        } catch (err) {
          entry.stepErrors.push({ step: index + 1, action: step.action, error: String(err?.message ?? err).split('\n')[0] });
          await shoot({ index, name: 'error' }).catch(() => {});
          break;
        }
      }
    } catch (err) {
      entry.stepErrors.push({ step: 0, action: 'load', error: String(err?.message ?? err).split('\n')[0] });
    } finally {
      await context.close().catch(() => {});
    }
  }
  return results;
}
