// The LeviLamina lab's import and brief: a person's LegacyScriptEngine plugin — a LiteLoader-era single file (X.js, X.lxl.js,
// with its data folder X/ beside it: LSE migrates such files itself when they sit in plugins/), a LeviLamina mod folder
// (manifest.json, type lse-quickjs / lse-nodejs), a .zip of either, a GitHub repository (gh:owner/repo) — becomes ll/mods/<name>/
// with its name, entry and version kept, read without running it (TypeScript's parser over its JavaScript): its commands
// (mc.newCommand, mc.regPlayerCmd, mc.regConsoleCmd), events (mc.listen), timers, what it could do outside the game
// (processes, network, files), the plugins it needs (ll.require / ll.import), its data, and the calls LSE's own types do not
// have (a checkJs pass against @levimc-lse/types); then a draft tests.txt that runs each way in once.
//   node lab.mjs ll import <file.js|.zip|folder|gh:owner/repo[@ref]> ["<what the person asked>"] [--name n] [--file <one .js of several>]
//   node lab.mjs ll brief
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const exists = (f) => fs.existsSync(f);
const SKIP = new Set(['.git', 'node_modules', '.github', '.vscode', '.idea', 'screenshots', 'screenshot', 'images', 'docs', 'test', 'tests', '__tests__', 'dist']);
const walk = (d, acc = [], root = d) => { let es = []; try { es = fs.readdirSync(d, { withFileTypes: true }); } catch { return acc; } for (const e of es) { const f = path.join(d, e.name); if (e.isDirectory()) { if (!SKIP.has(e.name)) walk(f, acc, root); } else acc.push(path.relative(root, f)); } return acc; };
const JS = /\.(m?js|cjs)$/i, KEEP_OUT = /^(readme|license|licence|changelog)(\.[a-z]+)?$/i;
const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, '')); } catch { return null; } };

/** a plugin's source read with TypeScript's parser (pure but for ts): its registration, commands, events, timers, risks, needs */
export function readSource(ts, files) {
  const r = { plugin: null, commands: [], consoleCommands: [], events: [], timers: [], risky: [], needs: [], data: [], bugs: [], enums: {} };
  const dotted = (n) => { const p = []; while (n && ts.isPropertyAccessExpression(n)) { p.unshift(n.name.text); n = n.expression; } if (n && (ts.isIdentifier(n) || n.kind === ts.SyntaxKind.ThisKeyword)) { p.unshift(ts.isIdentifier(n) ? n.text : 'this'); return p.join('.'); } return null; };
  const RISK = { 'system.cmd': 'runs a system command', 'system.newProcess': 'starts a program', 'system.shell': 'runs a shell command', 'network.httpGet': 'talks HTTP', 'network.httpPost': 'talks HTTP',
    'network.httpGetSync': 'talks HTTP (and waits on the server thread)', 'network.httpPostSync': 'talks HTTP (and waits)', 'File.writeTo': 'writes a file', 'File.writeLine': 'writes a file', 'File.delete': 'deletes files',
    'File.rename': 'moves files', 'File.copy': 'copies files', 'File.createDir': 'makes folders', 'File.mkdir': 'makes folders', 'eval': 'runs text as code', 'mc.runcmd': 'runs a server command', 'mc.runcmdEx': 'runs a server command',
    'll.eval': 'runs text as code in another plugin', 'Function': 'makes code from text' };
  const NODE_RISK = { child_process: 'starts programs', http: 'talks HTTP', https: 'talks HTTPS', net: 'opens sockets', dgram: 'opens sockets', fs: 'reads and writes files', 'fs/promises': 'reads and writes files', vm: 'runs text as code' };
  for (const [rel, text] of files) {
    const sf = ts.createSourceFile(rel, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    const at = (n) => `${rel}:${sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1}`;
    // constants the file names: const X = 'a', static Meta = { Name: 'a', Version: [1, 0, 0] } → "X", "Meta.Name" (this.Meta.Name and Cls.Meta.Name alike)
    const known = new Map();
    const keep = (key, v) => { if (ts.isStringLiteral(v) || ts.isNoSubstitutionTemplateLiteral(v)) known.set(key, v.text); else if (ts.isArrayLiteralExpression(v) && v.elements.every(ts.isNumericLiteral)) known.set(key, v.elements.map((e) => e.text).join('.')); else if (ts.isObjectLiteralExpression(v)) for (const pr of v.properties) if (ts.isPropertyAssignment(pr) && (ts.isIdentifier(pr.name) || ts.isStringLiteral(pr.name))) keep(`${key}.${pr.name.text}`, pr.initializer); };
    const collect = (n) => { if ((ts.isVariableDeclaration(n) || ts.isPropertyDeclaration(n)) && n.initializer && n.name && ts.isIdentifier(n.name)) keep(n.name.text, n.initializer); ts.forEachChild(n, collect); };
    collect(sf);
    const str = (n) => {
      if (!n) return null;
      if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) return n.text;
      if (ts.isArrayLiteralExpression(n) && n.elements.every(ts.isNumericLiteral)) return n.elements.map((e) => e.text).join('.');
      const d = dotted(n); if (!d) return null;
      const parts = d.split('.'); for (let i = 0; i < parts.length; i++) { const k = parts.slice(i).join('.'); if (known.has(k)) return known.get(k); }
      return null;
    };
    const byVar = new Map();   // let c = mc.newCommand(..): the command c's later calls (mandatory, overload, setEnum) belong to (the latest one by that name)
    const outs = [];           // the output parameter of each setCallback((cmd, origin, output, result) => ..) being read
    const cb = [];             // [command, output name] / [event, player name] whose callback is being read: the texts it answers with
    // a text as a regex: 'home ' + r.name + ' set' / `home ${r.name} set` → home .* set (null when nothing of it is fixed)
    const pattern = (n) => {
      const esc = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const parts = (x) => (ts.isStringLiteral(x) || ts.isNoSubstitutionTemplateLiteral(x) ? [esc(x.text)] : ts.isTemplateExpression(x) ? [esc(x.head.text), ...x.templateSpans.flatMap((sp) => ['.*', esc(sp.literal.text)])]
        : ts.isBinaryExpression(x) && x.operatorToken.kind === ts.SyntaxKind.PlusToken ? [...parts(x.left), ...parts(x.right)] : ts.isParenthesizedExpression(x) ? parts(x.expression) : ['.*']);
      const re = parts(n).join('').replace(/(\.\*)+/g, '.*').replace(/^\.\*|\.\*$/g, '').trim();
      return re.replace(/\.\*/g, '').trim().length >= 3 ? re : null;
    };
    const visit = (n) => {
      let pushedOut = false, pushedCb = false;
      if (ts.isCallExpression(n) || ts.isNewExpression(n)) {
        const f = dotted(n.expression), a = n.arguments ?? [];
        if (f === 'll.registerPlugin' || f === 'll.register') r.plugin ??= { name: str(a[0]), description: str(a[1]), version: str(a[2]), at: at(n) };
        else if (f === 'mc.newCommand') {
          const c = { name: str(a[0]), description: str(a[1]), perm: a[2] ? a[2].getText(sf) : null, at: at(n), how: 'newCommand', params: {}, overload: null };
          r.commands.push(c);
          if (ts.isVariableDeclaration(n.parent) && ts.isIdentifier(n.parent.name)) byVar.set(n.parent.name.text, c);
          else if (ts.isBinaryExpression(n.parent) && n.parent.operatorToken.kind === ts.SyntaxKind.EqualsToken && ts.isIdentifier(n.parent.left)) byVar.set(n.parent.left.text, c);
        } else if (f === 'mc.regPlayerCmd') r.commands.push({ name: str(a[0])?.replace(/^\//, ''), description: str(a[1]), perm: a[3] ? a[3].getText(sf) : null, at: at(n), how: 'regPlayerCmd' });
        else if (f === 'mc.regConsoleCmd') r.consoleCommands.push({ name: str(a[0])?.replace(/^\//, ''), at: at(n) });
        else if (f === 'mc.listen') { const e = { name: str(a[0]), at: at(n), answers: [] }; r.events.push(e); const fn = a[1]; if (fn && (ts.isArrowFunction(fn) || ts.isFunctionExpression(fn)) && fn.parameters[0] && ts.isIdentifier(fn.parameters[0].name)) { cb.push([e, fn.parameters[0].name.text, 'tell']); pushedCb = true; } }
        else if (f === 'setInterval' || f === 'setTimeout') r.timers.push({ at: at(n), repeat: f === 'setInterval' });
        else if (f === 'll.require' || f === 'll.import' || f === 'll.imports') r.needs.push({ what: str(a[0]) ?? a[0]?.getText(sf), at: at(n) });
        else if (['JsonConfigFile', 'IniConfigFile', 'KVDatabase', 'DBSession', 'data.openDB', 'data.openConfig'].includes(f)) r.data.push({ what: f, file: str(a[0]), at: at(n) });
        else if (f === 'require' && str(a[0])) { const m = str(a[0]).replace(/^node:/, ''); if (NODE_RISK[m]) r.risky.push({ at: at(n), what: `require('${str(a[0])}'): ${NODE_RISK[m]}` }); }
        if (f && RISK[f]) r.risky.push({ at: at(n), what: `${f}(): ${RISK[f]}` });
        // what the command or event answers with: output.success('..') / output.error('..') / player.tell('..')
        if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && ts.isIdentifier(n.expression.expression) && a[0]) {
          const who = n.expression.expression.text, m = n.expression.name.text;
          for (let k = cb.length - 1; k >= 0; k--) { const [owner, name, kind] = cb[k]; if (who === name && (kind === 'tell' ? ['tell', 'sendText'].includes(m) : ['success', 'error', 'addMessage'].includes(m))) { const re = pattern(a[0]); if (re && !(owner.answers ??= []).includes(re)) owner.answers.push(re); break; } }
        }
        // c.mandatory('x', ParamType.Int[, 'EnumName']) / c.optional / c.overload(['x']) / c.setEnum('E', ['a', 'b'])
        if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && ts.isIdentifier(n.expression.expression)) {
          const c = byVar.get(n.expression.expression.text), m = n.expression.name.text;
          if (c && (m === 'mandatory' || m === 'optional')) c.params[str(a[0])] = { type: a[1] ? a[1].getText(sf).replace(/^ParamType\./, '') : null, enumName: str(a[2]), optional: m === 'optional' };
          if (c && m === 'overload' && !c.overload) c.overload = a[0] && ts.isArrayLiteralExpression(a[0]) ? a[0].elements.map(str) : [];
          if (m === 'setEnum' && a[1] && ts.isArrayLiteralExpression(a[1])) r.enums[str(a[0])] = a[1].elements.map(str).filter(Boolean);
          if (m === 'setCallback' && a[0] && (ts.isArrowFunction(a[0]) || ts.isFunctionExpression(a[0])) && a[0].parameters[2] && ts.isIdentifier(a[0].parameters[2].name)) { outs.push(a[0].parameters[2].name.text); pushedOut = true; if (c) { cb.push([c, a[0].parameters[2].name.text]); pushedCb = true; } }
        }
      }
      // output.error(..) and then more statements: the command carries on and does its work anyway (a return was meant)
      if (ts.isExpressionStatement(n) && ts.isCallExpression(n.expression) && ts.isPropertyAccessExpression(n.expression.expression) && n.expression.expression.name.text === 'error'
        && ts.isIdentifier(n.expression.expression.expression) && outs.includes(n.expression.expression.expression.text) && ts.isBlock(n.parent)) {
        const sts = n.parent.statements, i = sts.indexOf(n);
        if (i < sts.length - 1 && !ts.isReturnStatement(sts[i + 1])) r.bugs.push(`${at(n)} the command carries on after ${n.expression.expression.getText(sf)}(..): it still does its work (return after it)`);
        else if (i === sts.length - 1 && ts.isIfStatement(n.parent.parent) && !n.parent.parent.elseStatement) {
          const ob = n.parent.parent.parent; if (ts.isBlock(ob) && ob.statements.indexOf(n.parent.parent) < ob.statements.length - 1) r.bugs.push(`${at(n)} the command carries on after ${n.expression.expression.getText(sf)}(..): it still does its work (return after it)`);
        }
      }
      // xs.filter(..) != null: an array is never null, so the test is always the same
      if (ts.isBinaryExpression(n) && [ts.SyntaxKind.ExclamationEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken, ts.SyntaxKind.EqualsEqualsToken, ts.SyntaxKind.EqualsEqualsEqualsToken].includes(n.operatorToken.kind)
        && (n.right.kind === ts.SyntaxKind.NullKeyword || (ts.isIdentifier(n.right) && n.right.text === 'undefined'))) {
        let l = n.left; if (ts.isIdentifier(l)) { const d = ((s) => { let x = n; while (x && !ts.isBlock(x) && !ts.isSourceFile(x)) x = x.parent; return x?.statements?.flatMap((st) => (ts.isVariableStatement(st) ? st.declarationList.declarations : [])).find((v) => ts.isIdentifier(v.name) && v.name.text === s); })(l.text); l = d?.initializer ?? l; }
        if (ts.isCallExpression(l) && ts.isPropertyAccessExpression(l.expression) && ['filter', 'map', 'slice', 'concat', 'split'].includes(l.expression.name.text)) r.bugs.push(`${at(n)} ${n.getText(sf).replace(/\s+/g, ' ').slice(0, 60)}: .${l.expression.name.text}(..) gives an array, never null — always ${/^!/.test(n.operatorToken.getText(sf)) ? 'true' : 'false'} (.length was meant)`);
      }
      ts.forEachChild(n, visit);
      if (pushedOut) outs.pop();
      if (pushedCb) cb.pop();
    };
    visit(sf);
  }
  return r;
}

// a sample value for each LSE ParamType (the shortest call that runs)
const SAMPLE = { Int: '1', Float: '1.5', Bool: 'true', String: 'x', RawText: 'hello', Message: 'hello', Player: 'A', Actor: 'A', BlockPos: '0 -60 0', Vec3: '0 -60 0', Item: 'stone', Block: 'stone', ActorType: 'pig', Effect: 'speed', Enchant: 'sharpness', Json: '{}', Command: 'help', Dimension: 'overworld' };
export function sampleArgs(cmd, r) {
  const ps = cmd.params ?? {}, names = (cmd.overload ?? Object.keys(ps)).filter((k) => ps[k] && !ps[k].optional);
  return names.map((k) => (ps[k].type === 'Enum' ? (r.enums?.[ps[k].enumName]?.[0] ?? 'a') : SAMPLE[ps[k].type] ?? 'x')).join(' ');
}
// each LSE event → the player actions that make it happen once
const EVENT_ACTIONS = [
  [/^on(PreJoin|Join|ConsumeTotem)$/, 'a second player joins', ['@B join']], [/^onLeft$/, 'a player leaves', ['@B join', '@B leave']], [/^onChat$/, 'a player chats', ['@A chat hello']],
  [/^onPlayerCmd$/, 'a player runs a command', ['@A cmd /me waves']], [/^on(PlayerDie|Respawn)$/, 'a player dies and respawns', ['kill A', 'wait 1500']],
  [/^onDestroyBlock$|^onStartDestroyBlock$/, 'a block is broken', ['setblock 2 -60 2 stone', 'wait 300', '@A dig 2 -60 2']], [/^onPlaceBlock$|^afterPlaceBlock$/, 'a block is placed', ['give A dirt', 'wait 300', '@A place dirt 2 -60 2']],
  [/^onUseItemOn$|^onBlockInteracted$/, 'a player clicks a block', ['@A useon 0 -61 2']], [/^onUseItem$/, 'a player uses an item', ['give A stone', 'wait 300', '@A select stone', '@A use']],
  [/^onAttackEntity$|^onMobHurt$|^onMobDie$/, 'a mob is hit and dies', ['summon pig 2 -60 2', 'wait 300', '@A attack pig', 'kill @e[type=pig]']], [/^onJump$|^onSneak$|^onSprint$/, 'a player moves', ['@A walk forward 3', '@A jump']],
  [/^onDropItem$/, 'a player drops an item', ['give A stone', 'wait 300', '@A select stone', '@A drop']], [/^onTakeItem$/, 'a player picks up an item', ['summon item 0 -60 1', 'wait 1000']],
  [/^onChangeDim$/, 'a player changes dimension', ['execute in nether run tp A 0 64 0', 'wait 1500', 'execute in overworld run tp A 0 -60 0']], [/^onEat$/, 'a player eats', ['give A bread', 'wait 300', '@A select bread', '@A eat']],
  [/^onServerStarted$/, 'the server started', []],
];
export function draftTests(name, r) {
  const out = ['# draft from the plugin\'s code (node lab.mjs import): each section runs one way in once; a script error there fails it.',
    '# Under each, add what the request wants (= ~ ! !~); drop what the request does not need.', '## loads', 'll list', `~ ${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`];
  const sec = (t, lines) => out.push('', `## ${t}`, ...lines, 'wait 500');
  let joined = false; const join = () => (joined ? [] : ((joined = true), ['@A join']));
  const seen = new Set();
  // (what it may answer, from its code: a hint to turn into the section's expectation once the path it takes is known)
  const hints = (who, xs) => (xs ?? []).slice(0, 3).map((re) => `# it may answer: ~ ^@${who} .*${re}`);
  for (const c of (r?.commands ?? []).filter((x) => x.name)) { const k = c.name.split(/\s+/)[0]; if (seen.has(k)) continue; seen.add(k); const args = sampleArgs(c, r); sec(`/${k} runs`, [...join(), `@A cmd /${c.name}${args ? ' ' + args : ''}`, ...hints('A', c.answers)]); }
  for (const c of (r?.consoleCommands ?? []).filter((x) => x.name)) sec(`the console command ${c.name} runs`, [c.name]);
  const done = new Set();
  for (const e of r?.events ?? []) { const hit = EVENT_ACTIONS.find(([re]) => re.test(e.name ?? '')); if (!hit || done.has(hit[1]) || !hit[2].length) continue; done.add(hit[1]); const who = /@B /.test(hit[2].join(' ')) ? 'B' : 'A'; sec(`${hit[1]} (${e.name})`, [...join(), ...hit[2], ...hints(who, (r.events ?? []).filter((x) => x.name === e.name).flatMap((x) => x.answers ?? []))]); }
  if ((r?.timers ?? []).some((t) => t.repeat)) sec('its repeating timer runs for a while', [...join(), 'wait 3000']);
  sec('a restart keeps it working', ['restart', 'll list', `~ ${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`]);
  return out.join('\n') + '\n';
}

// the calls LSE's own types do not have: a checkJs pass over src/ against @levimc-lse/types (only "no such member/name" and
// "wrong number of arguments": legacy JavaScript is untyped, everything else would be noise)
export function apiMisses(ts, unitDir, typesDir) {
  const src = path.join(unitDir, 'src'), names = walk(src).filter((f) => JS.test(f)).map((f) => path.join(src, f));
  if (!names.length || !typesDir || !exists(path.join(typesDir, 'src', 'index.d.ts'))) return null;
  const prog = ts.createProgram([...names, path.join(typesDir, 'src', 'index.d.ts')], { allowJs: true, checkJs: true, noEmit: true, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler, skipLibCheck: true, types: [], lib: ['lib.es2022.d.ts'], strict: false, noImplicitAny: false });
  const out = [];
  for (const d of ts.getPreEmitDiagnostics(prog)) {
    if (![2339, 2551, 2305, 2724].includes(d.code) || !d.file || !names.includes(path.resolve(d.file.fileName))) continue;
    const msg = ts.flattenDiagnosticMessageText(d.messageText, ' ');
    // (only the engine's own objects: a plugin's own object missing a member is its own business, not LSE's)
    if (engineHas(msg)) continue;
    // (a feature test is not a bug: mc.getTPS ? mc.getTPS() : null, if (mc.x), typeof mc.x, mc.x && mc.x())
    const tokenAt = (sf, pos) => { let hit = null; const go = (x) => { if (pos >= x.getStart(sf) && pos < x.getEnd()) { hit = x; ts.forEachChild(x, go); } }; go(sf); return hit; };
    let nd = tokenAt(d.file, d.start ?? 0); while (nd && !ts.isPropertyAccessExpression(nd)) nd = nd.parent;
    const up = nd?.parent, txt = nd?.getText(d.file);
    // (and the access under that test: mc.getTPS ? mc.getTPS() : null, if (mc.x) mc.x(), mc.x && mc.x())
    let guarded = false;
    for (let x = nd?.parent; x && !guarded && !ts.isFunctionLike(x); x = x.parent) {
      const test = ts.isConditionalExpression(x) ? x.condition : ts.isIfStatement(x) ? x.expression : ts.isBinaryExpression(x) && x.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken ? x.left : null;
      if (test && test !== nd && test.getText(d.file).includes(txt) && !(test.pos <= nd.pos && nd.end <= test.end)) guarded = true;
    }
    if (guarded) continue;
    if (up && ((ts.isConditionalExpression(up) && up.condition === nd) || (ts.isIfStatement(up) && up.expression === nd) || ts.isTypeOfExpression(up) || (ts.isBinaryExpression(up) && up.left === nd && [ts.SyntaxKind.AmpersandAmpersandToken, ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken].includes(up.operatorToken.kind)) || (ts.isPrefixUnaryExpression(up) && up.operator === ts.SyntaxKind.ExclamationToken))) continue;
    if (!/(typeof (mc|ll|File|network|system|data|logger|money|colorLog|PermType|ParamType)|on type '(Player|Entity|Block|Item|Container|Device|CommandOutput|CommandOrigin|Command|NbtCompound|IntPos|FloatPos|Objective|JsonConfigFile|KVDatabase|DBSession|SimpleForm|CustomForm|Packet|Dimension)')/.test(msg)) continue;
    const line = `${path.relative(unitDir, d.file.fileName).split(path.sep).join('/')}:${d.file.getLineAndCharacterOfPosition(d.start ?? 0).line + 1} TS${d.code} ${msg.replace(/\s+/g, ' ').slice(0, 220)} (not in LSE's API: its .d.ts and its engine source alike)`;
    if (!out.includes(line)) out.push(line);
  }
  return out;
}

// the names LSE really has at run time, read from its source (C++ defineClass(..) builders and BaseLib.js): its .d.ts lacks some
// (data.openConfig, Player.getMoney, ll.export ...), so a type error on a name the engine has is not a finding
export function runtimeNames(srcDir) {
  const out = {};
  const api = path.join(srcDir, 'src', 'legacy', 'api');
  for (const f of fs.readdirSync(api).filter((x) => x.endsWith('.cpp'))) {
    const t = fs.readFileSync(path.join(api, f), 'utf8');
    for (const m of t.matchAll(/defineClass(?:<[^>]*>)?\(\s*"(\w+)"\s*\)([\s\S]*?)\.build\(\)/g)) {
      const names = (out[m[1].replace(/^LLSE_/, '')] ??= []);   // (LLSE_Player is Player to plugins)
      for (const n of m[2].matchAll(/\.(?:function|instanceFunction|property|instanceProperty)\(\s*"(\w+)"/g)) if (!names.includes(n[1])) names.push(n[1]);
    }
  }
  const base = path.join(srcDir, 'src', 'baselib', 'BaseLib.js');
  if (exists(base)) for (const m of fs.readFileSync(base, 'utf8').matchAll(/^\s*(\w+)(?:\.prototype)?\.(\w+)\s*=/gm)) { const names = (out[m[1]] ??= []); if (!names.includes(m[2])) names.push(m[2]); }
  for (const k of Object.keys(out)) out[k].sort();
  return out;
}
let RUNTIME;
const runtime = () => (RUNTIME ??= readJson(path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')), 'data', 'lse-runtime.json'))?.classes ?? {});
// "Property 'x' does not exist on type 'typeof mc'" / "on type 'Player'": does the engine have it anyway?
export function engineHas(msg, names = runtime()) {
  const m = /Property '(\w+)' does not exist on type '(?:typeof )?(\w+)'/.exec(msg);
  return !!m && (names[m[2]] ?? []).includes(m[1]);
}

export function briefLines(L, m, r, misses) {
  const o = [];
  const few = (xs, f, n = 8) => xs.slice(0, n).map(f).join(' · ') + (xs.length > n ? ` · … ${xs.length - n} more` : '');
  o.push(`mod ${m.name}: LSE ${m.engine ?? m.type} ${m.version ?? '?'} · entry ${m.entry}${r?.plugin ? ` · ll.registerPlugin ${r.plugin.at}${r.plugin.name ? ` ("${r.plugin.name}")` : ''}` : ''}${m.legacy ? ' · a LiteLoader-era plugin (LSE migrates it: manifest written here)' : ''}`);
  if (r?.commands?.length) o.push(`commands (${r.commands.length}): ${r.commands.map((c) => `/${c.name ?? '?'}${c.perm ? ` [${c.perm.replace(/^PermType\./, '')}]` : ''} ${c.at}`).join(' · ')}`);
  else o.push('commands: none found (a command built from a variable name is not read: node lab.mjs run shows `ll list` and what it registered)');
  if (r?.consoleCommands?.length) o.push(`console commands: ${r.consoleCommands.map((c) => `${c.name} ${c.at}`).join(' · ')}`);
  if (r?.events?.length) { const ev = [...new Map(r.events.map((e) => [e.name, e])).values()]; o.push(`events (${ev.length}): ${few(ev, (e) => `${e.name} ${e.at}`, 16)}`); }
  if (r?.timers?.length) o.push(`timers (${r.timers.length}, ${r.timers.filter((t) => t.repeat).length} repeating): ${few(r.timers, (t) => `${t.at} ${t.repeat ? 'repeating' : 'once'}`)}`);
  if (r?.data?.length) o.push(`its data: ${few(r.data, (d) => `${d.what}${d.file ? ` ${d.file}` : ''} ${d.at}`)}`);
  if (r?.needs?.length) o.push(`other plugins it needs: ${few([...new Map(r.needs.map((x) => [x.what, x])).values()], (x) => `${x.what} ${x.at}`)} (without them it fails at load: put them in ll/mods too)`);
  if (r?.risky?.length) o.push(`what it could do outside the game (someone else's code: read these lines before it runs): ${few(r.risky, (x) => `${x.at} ${x.what}`, 12)}`);
  const bugs = [...(r?.bugs ?? [])];
  const own = (f) => !f || !/^\.?\/?plugins\//.test(f) || f.replace(/^\.?\//, '').split('/')[1] === m.name;
  const off = (r?.data ?? []).filter((d) => !own(d.file));
  if (off.length) o.push(`  (its data is outside its own folder plugins/${m.name}/: ${[...new Set(off.map((d) => d.file.replace(/^\.?\//, '').split('/').slice(0, 2).join('/')))].join(', ')} — keep it there for servers that have it; the lab's restart keeps all of plugins/)`);
  if (misses === null) bugs.push('the API check did not run (LSE\'s types could not be had: node lab.mjs ll api mc fetches them)');
  for (const x of misses ?? []) bugs.push(x);
  if ((r?.timers ?? []).length && (r?.risky ?? []).some((x) => /Sync\(/.test(x.what))) bugs.push('a synchronous HTTP call: it holds the server thread while it waits (every player freezes) — the async network.httpGet');
  if (bugs.length) { o.push('bugs found before any server (fix them all in the first round):'); for (const b of bugs.slice(0, 40)) o.push(`  ${b}`); }
  return o;
}

// ---- where the plugin is in what was given
function findPlugins(root, ts) {
  const all = walk(root);
  const mans = all.filter((f) => path.basename(f) === 'manifest.json').map((f) => ({ f, m: readJson(path.join(root, f)) })).filter((x) => /^lse-/.test(String(x.m?.type ?? '')) && x.m?.entry);
  if (mans.length) return mans.sort((a, b) => a.f.split(path.sep).length - b.f.split(path.sep).length).map((x) => ({ kind: 'mod', dir: path.join(root, path.dirname(x.f)), manifest: x.m }));
  // LiteLoader-era: a .js that registers itself or uses the engine (X.lxl.js first), its data folder X/ beside it
  const js = all.filter((f) => JS.test(f) && !/\.min\.js$/.test(f));
  const use = js.filter((f) => { const t = fs.readFileSync(path.join(root, f), 'utf8'); return /\bll\.register(Plugin)?\s*\(|\bmc\.(listen|newCommand|regPlayerCmd)\s*\(/.test(t); });
  return use.sort((a, b) => Number(/\.lxl\.js$/.test(b)) - Number(/\.lxl\.js$/.test(a))).map((f) => ({ kind: 'legacy', dir: root, file: f }));
}

export async function importMod(L, args, env) {
  const flag = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
  const pos = args.filter((a, k) => !a.startsWith('--') && !['--name', '--file'].includes(args[k - 1]));
  const given = pos[0], request = pos.slice(1).join(' ').trim();
  const cands = given ? [path.resolve(process.env.LAB_CALLER_CWD ?? process.cwd(), given), path.resolve(L.TOP, given), path.resolve(given)] : [];
  let src = cands.find(exists);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lab-llimport-'));
  try {
    const gh = /^(?:gh:|(?:https?:\/\/)?github\.com\/)([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:@([\w./-]+))?\/?$/.exec(given ?? '');
    if (!src && gh) {
      L.out(`  downloading ${gh[1]}/${gh[2]}${gh[3] ? `@${gh[3]}` : ''} from GitHub (nothing of it runs here)`);
      const to = path.join(tmp, 'gh');
      const g = spawnSync('git', ['clone', '-q', '--depth', '1', ...(gh[3] ? ['--branch', gh[3]] : []), `https://github.com/${gh[1]}/${gh[2]}.git`, to], { encoding: 'utf8', env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }, timeout: 180000 });
      if (g.status !== 0) L.die(`gh: ${gh[1]}/${gh[2]} could not be cloned (${String(g.stderr).trim().split('\n').pop()})`);
      fs.rmSync(path.join(to, '.git'), { recursive: true, force: true }); src = to;
    }
    if (!src) L.die(`usage: node lab.mjs import <plugin.js|.zip|folder|gh:<owner>/<repo>[@ref]> ["<what the person asked>"] [--name n] [--file <one .js of several>]   (a LegacyScriptEngine plugin: a LiteLoader-era .js / .lxl.js, or a LeviLamina mod folder with manifest.json)${given ? ` (no ${given} here)` : ''}`);
    const work = path.join(tmp, 'in');
    if (fs.statSync(src).isDirectory()) fs.cpSync(src, work, { recursive: true, filter: (f) => !/[\\/]\.git([\\/]|$)/.test(f) });
    else if (JS.test(src)) { fs.mkdirSync(work, { recursive: true }); fs.copyFileSync(src, path.join(work, path.basename(src))); const data = src.replace(/(\.lxl)?\.m?js$/i, ''); if (exists(data) && fs.statSync(data).isDirectory()) fs.cpSync(data, path.join(work, path.basename(data)), { recursive: true }); }
    else { const buf = fs.readFileSync(src); if (buf.readUInt32LE(0) !== 0x04034b50) L.die(`${path.basename(src)}: not a .js, a zip or a folder`); L.unzip(buf, work); }
    const ts = env.ts();
    let found = findPlugins(work, ts);
    const pick = flag('--file');
    if (pick) found = found.filter((x) => (x.file ?? '').replace(/\\/g, '/').endsWith(pick.replace(/\\/g, '/')));
    if (!found.length) L.die(pick ? `--file ${pick}: not one of the plugins in ${given}` : `no LegacyScriptEngine plugin in ${given}: no manifest.json of type lse-*, no .js calling ll.registerPlugin / mc.listen / mc.newCommand (a native .dll mod: the lab needs its source, xmake.lua)`);
    if (found.length > 1 && found[0].kind === 'legacy' && !pick) L.die(`${found.length} plugins in ${given}: take one with --file <it> (${found.map((x) => x.file.replace(/\\/g, '/')).join(', ')})`);
    const p = found[0];
    // its files: a mod folder as it is; a single plugin with its data folder (X/ beside X.js) — scripts into src/, the rest assets/
    const base = p.kind === 'mod' ? p.dir : work;
    const entryRel = p.kind === 'mod' ? p.manifest.entry : p.file;
    const stem = path.basename(entryRel).replace(/(\.lxl)?\.m?js$/i, '');
    let files = walk(base);
    if (p.kind === 'legacy') { const dataDir = path.join(path.dirname(p.file), stem); files = files.filter((f) => f === p.file || f.startsWith(dataDir + path.sep) || (!JS.test(f) && path.dirname(f) === path.dirname(p.file) && (KEEP_OUT.test(path.basename(f)) || /\.(json|txt|ya?ml|toml|ini)$/i.test(f)))); }
    const srcText = new Map(files.filter((f) => JS.test(f)).map((f) => [f.split(path.sep).join('/'), fs.readFileSync(path.join(base, f), 'utf8')]));
    const r = readSource(ts, p.kind === 'legacy' ? new Map([[p.file.split(path.sep).join('/'), srcText.get(p.file.split(path.sep).join('/'))]]) : srcText);
    // (a LiteLoader-era file: LSE moves X.js into plugins/X/ and names the mod after the file, not ll.registerPlugin's name)
    const display = p.kind === 'mod' ? p.manifest.name : stem.replace(/[^\w-]+/g, '_');
    const name = String(flag('--name') ?? display).replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '').replace(/^(\d)/, 'mod_$1') || 'imported';
    const dir = path.join(L.ADDONS, name);
    if (exists(dir)) L.die(`mods/${name} exists (use --name <other>)`);
    const engine = p.kind === 'mod' ? String(p.manifest.type).replace(/^lse-/, '') : 'quickjs';
    for (const f of files) {
      if (path.basename(f) === 'manifest.json' && path.dirname(f) === '.' && p.kind === 'mod') continue;
      if (KEEP_OUT.test(path.basename(f)) && path.dirname(f) === (p.kind === 'legacy' ? path.dirname(p.file) : '.')) { fs.mkdirSync(dir, { recursive: true }); fs.copyFileSync(path.join(base, f), path.join(dir, path.basename(f))); continue; }
      if (f === 'package.json' || f === 'package-lock.json') { fs.mkdirSync(dir, { recursive: true }); fs.copyFileSync(path.join(base, f), path.join(dir, f)); continue; }
      // (a legacy plugin's data folder X/ is its folder at run time: plugins/<name>/ — its contents go beside the bundle)
      const rel = p.kind === 'legacy' && f.startsWith(path.join(path.dirname(p.file), stem) + path.sep) ? path.relative(path.join(path.dirname(p.file), stem), f) : f;
      const to = path.join(dir, JS.test(f) ? 'src' : 'assets', rel);
      fs.mkdirSync(path.dirname(to), { recursive: true }); fs.copyFileSync(path.join(base, f), to);
    }
    const entryIn = p.kind === 'legacy' ? path.basename(p.file) : entryRel;
    // the lab bundles src/main.js (or index.js): one that imports the plugin's own entry as it is
    if (!['main.js', 'index.js'].includes(entryIn.split(/[\\/]/).join('/'))) fs.writeFileSync(path.join(dir, 'src', 'main.js'), `// written by bds-lab's import: the lab bundles src/main.js; the plugin's own entry is ${entryIn}\nimport './${entryIn.split(path.sep).join('/')}';\n`);
    const manifest = p.kind === 'mod' ? { ...p.manifest } : { name: display, entry: `${stem}.js`, type: 'lse-quickjs', version: r.plugin?.version || '0.1.0', description: r.plugin?.description ?? '', dependencies: [{ name: 'legacy-script-engine-quickjs' }] };
    if (!/\.js$/.test(manifest.entry)) manifest.entry = `${stem}.js`;
    L.writeJson(path.join(dir, 'manifest.json'), manifest);
    if (!exists(path.join(dir, '.gitignore'))) fs.writeFileSync(path.join(dir, '.gitignore'), 'node_modules/\ntsconfig.json\n');
    fs.writeFileSync(path.join(dir, 'tests.txt'), draftTests(display, r));
    L.writeJson(path.join(dir, 'imported.json'), { from: path.basename(src), name: display, version: manifest.version, legacy: p.kind === 'legacy', request: request || null });
    fs.writeFileSync(path.join(dir, 'TASK.md'), L.TASK_MD(name, `${request ? `${request}\n\n` : ''}(a person's LegacyScriptEngine plugin, imported from ${path.basename(src)}: keep its name "${display}", its entry and its version line, so their servers update in place)`));
    L.useAddon(name, true);
    const typesDir = env.types();   // (LSE's types: npm, else GitHub)
    const misses = apiMisses(ts, dir, typesDir);
    for (const l of briefLines(L, { ...manifest, engine, legacy: p.kind === 'legacy' }, readUnit(ts, dir), misses)) L.out(l);   // (read again where it now is: the lines say src/..., as go and brief do)
    if (exists(path.join(dir, 'package.json')) && Object.keys(readJson(path.join(dir, 'package.json'))?.dependencies ?? {}).length) L.out(`  its npm packages: ${Object.keys(readJson(path.join(dir, 'package.json')).dependencies).join(' ')} → node lab.mjs lib add <each> (the bundle carries them)`);
    L.out(`OK ll/mods/${name}/ ("${display}", LSE ${engine} ${manifest.version}), now the current mod; tests.txt: a draft that runs each way in once${request ? '' : '; put the request in TASK.md'}; next: node lab.mjs go`);
    return true;
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

const readUnit = (ts, dir) => { const src = path.join(dir, 'src'); return readSource(ts, new Map(walk(src).filter((f) => JS.test(f) || /\.ts$/.test(f)).map((f) => [`src/${f.split(path.sep).join('/')}`, fs.readFileSync(path.join(src, f), 'utf8')]))); };
export async function briefMod(L, args, env) {
  const m = readJson(path.join(L.ADDON, 'manifest.json')) ?? {}, ts = env.ts(), r = readUnit(ts, L.ADDON);
  for (const l of briefLines(L, { ...m, engine: String(m.type ?? '').replace(/^lse-/, '') }, r, apiMisses(ts, L.ADDON, env.types()))) L.out(l);
  return true;
}
