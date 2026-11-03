/**
 * Opt-out switches for data sources (.context/deployment.md, "Source opt-outs").
 * A source is on by default; setting `<NAME>=false` on the server (any case,
 * surrounding spaces ignored) turns it off. Any other value, or none, leaves it on.
 */
export function isSourceEnabled(name: string, env: NodeJS.ProcessEnv = process.env): boolean {
  return env[name]?.trim().toLowerCase() !== 'false';
}
