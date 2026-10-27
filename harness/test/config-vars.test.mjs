import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { PRODUCT_CONFIG_VARS } from '../lib/guard.mjs';
import { REPO } from '../lib/paths.mjs';

function sourceFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(full));
    else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

/** Names read as process.env.NAME, process.env['NAME'] or import.meta.env.NAME. */
function namesRead(files) {
  const names = new Set();
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    for (const m of text.matchAll(/process\.env\.([A-Z][A-Z0-9_]*)/g)) names.add(m[1]);
    for (const m of text.matchAll(/process\.env\[\s*['"]([A-Z][A-Z0-9_]*)['"]\s*\]/g)) names.add(m[1]);
    for (const m of text.matchAll(/import\.meta\.env\.(VITE_[A-Z0-9_]*)/g)) names.add(m[1]);
  }
  return names;
}

describe('PRODUCT_CONFIG_VARS', () => {
  it('lists every variable the server reads by name', () => {
    const read = namesRead(sourceFiles(path.join(REPO.server, 'src')));
    const missing = [...read].filter((n) => !PRODUCT_CONFIG_VARS.includes(n));
    assert.deepEqual(missing, [], 'add these to PRODUCT_CONFIG_VARS in harness/lib/guard.mjs');
    assert.ok(read.size > 5, 'the scan found the server\'s reads');
  });

  it('lists every model and effort variable llm-client.ts reads through its table', () => {
    const text = fs.readFileSync(path.join(REPO.server, 'src', 'lib', 'llm-client.ts'), 'utf8');
    const names = new Set();
    for (const m of text.matchAll(/(?:modelEnv|effortEnv):\s*(\[[^\]]*\]|'[^']*')/g)) {
      for (const n of m[1].matchAll(/'([A-Z][A-Z0-9_]*)'/g)) names.add(n[1]);
    }
    assert.ok(names.size >= 6);
    for (const name of names) assert.ok(PRODUCT_CONFIG_VARS.includes(name), name);
  });

  it('lists every VITE_ variable the web app reads', () => {
    const read = namesRead([...sourceFiles(path.join(REPO.web, 'src')), path.join(REPO.web, 'vite.config.ts')]);
    const vite = [...read].filter((n) => n.startsWith('VITE_'));
    assert.ok(vite.includes('VITE_API_BASE'));
    for (const name of vite) assert.ok(PRODUCT_CONFIG_VARS.includes(name), name);
  });
});
