import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { SHARED_SOURCES } from '../lib/shared-source-hook.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));

describe('shared-source-hook', () => {
  it('maps both shared entry points to their TypeScript sources', () => {
    assert.match(SHARED_SOURCES['@city-monitor/shared'], /\/shared\/types\.ts$/);
    assert.match(SHARED_SOURCES['@city-monitor/shared/schemas.js'], /\/shared\/schemas\.ts$/);
    for (const url of Object.values(SHARED_SOURCES)) assert.ok(fs.existsSync(fileURLToPath(url)), url);
  });

  it('lets a process load the shared schemas without shared/dist', () => {
    // tsx keeps its cache in the temporary folder; give it its own and remove it
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-test-'));
    try {
      const out = execFileSync(process.execPath, [path.join(here, 'helpers', 'import-shared.mjs')], {
        env: { PATH: process.env.PATH ?? '', HOME: tmp, TMPDIR: tmp },
        encoding: 'utf8',
        timeout: 60_000,
      });
      assert.deepEqual(JSON.parse(out.trim().split('\n').pop()), { schemaParses: true, typesLoaded: true });
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
