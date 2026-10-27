import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HARNESS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// The entry points run as soon as they load, so the tests read their imports
// instead and check each named import exists.
describe('entry points', () => {
  for (const entry of ['see.mjs', 'lib/product-child.mjs', 'lib/web-build.mjs']) {
    it(`${entry} imports only names its harness modules export`, async () => {
      const file = path.join(HARNESS, entry);
      const text = fs.readFileSync(file, 'utf8');
      const imports = [...text.matchAll(/^import \{([^}]+)\} from '(\.[^']+)';$/gm)];
      assert.ok(imports.length > 0);
      for (const [, names, spec] of imports) {
        const mod = await import(pathToFileURL(path.resolve(path.dirname(file), spec)).href);
        for (const name of names.split(',').map((n) => n.trim()).filter(Boolean)) {
          assert.ok(name in mod, `${entry}: ${spec} has no export ${name}`);
        }
      }
    });
  }
});
