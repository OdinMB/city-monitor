// Test helper for shared-source-hook.test.mjs: registers tsx and the hook the
// harness's server processes use, imports `shared` the way the server does and
// prints what loaded. It starts nothing.
import { register } from 'node:module';

const { register: registerTsx } = await import('tsx/esm/api');
registerTsx();
register('../../lib/shared-source-hook.mjs', import.meta.url);

const schemas = await import('@city-monitor/shared/schemas.js');
const types = await import('@city-monitor/shared');
console.log(JSON.stringify({
  schemaParses: typeof schemas.CurrentWeatherSchema?.safeParse === 'function',
  typesLoaded: typeof types === 'object',
}));
