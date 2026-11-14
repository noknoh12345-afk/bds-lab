// A `py` / `lse` test line: a written \n breaks the line where it is code, and stays the string's own escape inside a string
// literal (common/codeline.mjs). Before, `py return "a\nb".split("\n")` became an unterminated string (SyntaxError); proven on
// Endstone 0.11.15: ["a","b"], and `py x = 2\nreturn x * 3` → 6 as before.
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const TOP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { lineBreaks: b } = await import(pathToFileURL(path.join(TOP, 'common', 'codeline.mjs')).href);
let pass = 0, fail = 0;
const eq = (got, want, what) => { if (got === want) { pass++; console.log(`ok   ${what}`); } else { fail++; console.log(`FAIL ${what}\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`); } };
const N = '\\n';   // the two characters written on the line
eq(b(`x = 2${N}return x * 3`), 'x = 2\nreturn x * 3', 'py: \\n between statements is a line break (as before)');
eq(b(`return "a${N}b".split("${N}")`), `return "a${N}b".split("${N}")`, 'py: \\n inside "…" stays the escape');
eq(b(`return 'it\\'s${N}'${N}`), `return 'it\\'s${N}'\n`, "py: an escaped quote does not end the string");
eq(b(`t = """a${N}b"""${N}return t`), `t = """a${N}b"""\nreturn t`, 'py: triple quotes');
eq(b(`return r"C:\\x${N}"${N}`), `return r"C:\\x${N}"\n`, 'py: a raw string keeps its backslashes');
eq(b(`x = 1  # it's${N}return x`), "x = 1  # it's\nreturn x", 'py: a quote in a # comment opens nothing; the comment ends at \\n');
eq(b(`return f"{a}${N}"`), `return f"{a}${N}"`, 'py: f-strings');
eq(b(`let s = \`a${N}b\`${N}s`, 'js'), `let s = \`a${N}b\`\ns`, 'js (lse): template literals');
eq(b(`x = 1 // don't${N}x`, 'js'), "x = 1 // don't\nx", 'js (lse): // comments');
console.log(fail ? `FAIL codeline-offline (${pass}/${pass + fail})` : `PASS codeline-offline (${pass}/${pass})`);
process.exit(fail ? 1 : 0);
