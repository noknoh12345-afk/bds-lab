// A tests.txt `js` line reaches the server as `scriptevent lab:js #<code>` (common/core.mjs jsCmd) and BDS's command parser
// refuses <=, >= and ^ anywhere in the message ("Syntax error: Unexpected "<=""; proven on BDS 1.26: `js 1<=2` never ran).
// Such code goes percent-encoded and common/helper.js decodes it: the same code in, nothing the parser refuses on the line.
// Both pieces are taken from their files as they are, not copied here.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TOP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const ok = (c, what, detail = '') => { if (c) { pass++; console.log(`ok   ${what}`); } else { fail++; console.log(`FAIL ${what}${detail ? `\n     ${detail}` : ''}`); } };
const core = fs.readFileSync(path.join(TOP, 'common', 'core.mjs'), 'utf8'), helper = fs.readFileSync(path.join(TOP, 'common', 'helper.js'), 'utf8');
const enc = /^const jsCmd = (\(code\) => .+);$/m.exec(core)?.[1], dec = /const m0=(e\.message\.replace\(\/\^#\/,""\)),src=(m0\.startsWith\("%"\)\?decodeURIComponent\(m0\.slice\(1\)\):m0);/.exec(helper);
ok(enc && dec, 'core.mjs has jsCmd and helper.js decodes a #% message');
if (enc && dec) {
  const jsCmd = new Function(`return ${enc}`)(), decode = new Function('e', `const m0=${dec[1]};return ${dec[2]};`);
  const cases = ['1<=2', '3>=2 && 5%3==2', '6^3', "'<= 100%'", '[1,2].length', "'%41'", 'a=>a>=b', "p('A').location.y<=-59", '1 < 2', "'日本語§ ^^'", '100%', "'%'", 'x %= 3'];
  for (const c of cases) {
    const cmd = jsCmd(c), msg = cmd.replace(/^scriptevent lab:js /, '');
    ok(cmd.startsWith('scriptevent lab:js #') && !/[<>]=|\^/.test(msg) && decode({ message: msg }) === c, `${JSON.stringify(c)} → ${JSON.stringify(msg)} → the same code back, nothing the parser refuses`, decode({ message: msg }));
  }
  ok(jsCmd('[1,2].length') === 'scriptevent lab:js #[1,2].length' && jsCmd('1 < 2') === 'scriptevent lab:js #1 < 2', 'code the parser takes goes as it is (no longer, no harder to read in the log)');
}
console.log(fail ? `FAIL jsline-offline (${pass}/${pass + fail})` : `PASS jsline-offline (${pass}/${pass})`);
process.exit(fail ? 1 : 0);
