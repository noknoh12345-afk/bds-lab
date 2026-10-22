import { createRequire } from 'node:module';
import path from 'node:path';

/**
 * Which bedrock-protocol this package drives — the caller's own copy, not one beside this package.
 *
 * The lab vendors only dist/ (common/nethernet-connect/dist) and installs bedrock-protocol into its own cache, so it passes a
 * require rooted there: `useBedrockProtocol(createRequire('<cache>/nc/package.json'))`. Standalone (npm install in this
 * folder) nothing has to be passed: the copy beside this package is found. NC_BEDROCK_PROTOCOL=<a folder whose
 * node_modules has bedrock-protocol> does the same for a test run.
 *
 * Everything that reaches into bedrock-protocol (or the `nethernet` package it depends on) goes through here and only when it is
 * first needed, so importing this package never loads it.
 */
type Req = NodeJS.Require;

let req: Req | null = null;
const listeners: Array<() => void> = [];

/** the bedrock-protocol to use from now on (a require that resolves 'bedrock-protocol'). Call before anything connects */
export function useBedrockProtocol(r: Req): void {
  if (typeof r !== 'function' || typeof r.resolve !== 'function') throw new Error('useBedrockProtocol: pass a require (createRequire(...))');
  r.resolve('bedrock-protocol');   // (throws at once when it is not there)
  req = r;
  for (const f of listeners) f();
}

/** called whenever another bedrock-protocol is chosen (the guard's patch follows the copy in use) */
export function onBedrockProtocol(f: () => void): void { listeners.push(f); }

/** the require that resolves bedrock-protocol: the one passed in, else NC_BEDROCK_PROTOCOL's, else the one beside this package */
export function bpRequire(): Req {
  if (req) return req;
  const tries = [process.env.NC_BEDROCK_PROTOCOL ? path.join(process.env.NC_BEDROCK_PROTOCOL, 'package.json') : null, import.meta.url].filter(Boolean) as string[];
  for (const from of tries) {
    try { const r = createRequire(from); r.resolve('bedrock-protocol'); req = r; return r; } catch { /* the next */ }
  }
  throw new Error('bedrock-protocol が見つかりません: useBedrockProtocol(createRequire(<bedrock-protocol を入れたフォルダ>/package.json)) で渡してください');
}

/** the bedrock-protocol module */
export const bedrockProtocol = (): any => bpRequire()('bedrock-protocol');
/** a file inside bedrock-protocol ('src/options', 'src/nethernet/advertisement' …) */
export const bedrockFile = (rel: string): any => createRequire(bpRequire().resolve('bedrock-protocol'))(`./${rel.replace(/^\.?\//, '')}`);
/** the very `nethernet` module bedrock-protocol uses (its Client is what the guard patches) and a file inside it */
export function nethernetModule(rel?: string): any {
  const main = createRequire(bpRequire().resolve('bedrock-protocol')).resolve('nethernet');
  return rel ? createRequire(main)(`./${rel.replace(/^\.?\//, '')}`) : createRequire(main)(main);
}
