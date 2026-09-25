// First step of every workspace build script (shared, packages/server, packages/web).
//
// The Render API service sets NODE_ENV=production, which makes npm omit
// devDependencies. The builds need them (the pinned TypeScript, @types/*, Vite),
// and so does the API start command's db:migrate (drizzle-kit). If any direct
// devDependency of the root or a workspace is missing, this installs them at the
// repo root from package-lock.json. If none is missing (every local, CI and
// `npm ci --include=dev` build) it runs nothing, which also keeps turbo's
// parallel server and web builds from racing two npm installs.
// See .context/deployment.md.
import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const lock = JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8'));

function missingDevDeps() {
  const missing = new Set();
  // Lockfile keys outside node_modules/ are the root ("") and the workspaces.
  for (const [dir, entry] of Object.entries(lock.packages)) {
    if (dir.includes('node_modules/')) continue;
    for (const name of Object.keys(entry.devDependencies ?? {})) {
      const installed = [join(root, dir, 'node_modules', name), join(root, 'node_modules', name)]
        .some((p) => existsSync(join(p, 'package.json')));
      if (!installed) missing.add(name);
    }
  }
  return [...missing];
}

const missing = missingDevDeps();
if (missing.length === 0) {
  console.log('ensure-dev-deps: all devDependencies are installed');
  process.exit(0);
}

console.log(
  `ensure-dev-deps: ${missing.length} devDependencies missing (NODE_ENV=${process.env.NODE_ENV ?? ''}), ` +
    `e.g. ${missing.slice(0, 4).join(', ')}. Running npm install --include=dev --no-save at the repo root.`,
);

// npm passes some of its own config to scripts as npm_config_* variables. A
// --prefix or --workspace given to the outer npm would redirect or narrow this
// install, so drop them.
const env = { ...process.env };
for (const key of Object.keys(env)) {
  if (/^npm_config_(prefix|workspaces?|include_workspace_root)$/i.test(key)) delete env[key];
}

try {
  execSync('npm install --include=dev --no-save --no-audit --no-fund', { cwd: root, env, stdio: 'inherit' });
} catch (err) {
  process.exit(err.status ?? 1); // npm has already printed its error
}

const stillMissing = missingDevDeps();
if (stillMissing.length > 0) {
  console.error(`ensure-dev-deps: still missing after npm install: ${stillMissing.join(', ')}`);
  process.exit(1);
}
