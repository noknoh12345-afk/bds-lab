// Bundles src/main.js with esbuild, inlines it into src/index.html and writes
// dist/index.html + dist/index.html.gz (the .gz is embedded into the mod).
// The licenses of every bundled package are embedded too (Studio > 状態 > ライセンス)
// and written to dist/THIRD_PARTY_LICENSES.txt.
import { build } from "esbuild";
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from "node:fs";
import { gzipSync, constants } from "node:zlib";

const r = await build({
  entryPoints: ["src/main.js"], bundle: true, minify: true, format: "iife", target: "es2020",
  write: false, metafile: true, legalComments: "none", define: { "process.env.NODE_ENV": '"production"' },
});
const pkgs = new Set();
for (const k of Object.keys(r.metafile.inputs)) {
  const m = /node_modules\/((?:@[^/]+\/)?[^/]+)/.exec(k);
  if (m) pkgs.add(m[1]);
}
let licenses = "ScriptEval Studio bundles the following packages.\n";
for (const p of [...pkgs].sort()) {
  const dir = `node_modules/${p}`;
  const j = JSON.parse(readFileSync(`${dir}/package.json`, "utf8"));
  const f = readdirSync(dir).find(n => /^(licen[cs]e|copying)(\.|$)/i.test(n));
  licenses += `\n==== ${p} ${j.version} (${j.license}) ====\n`;
  licenses += f ? readFileSync(`${dir}/${f}`, "utf8").trim() + "\n" : `License: ${j.license} (no license file in the package)\n`;
}
const esc = s => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
const js = r.outputFiles[0].text.replace(/<\/script/gi, "<\\/script").replace(/<!--/g, "<\\!--");
const html = readFileSync("src/index.html", "utf8")
  .replace("<!--SCRIPT-->", () => `<script type="text/plain" id="licenses">${esc(licenses)}</script>\n<script>${js}</script>`);
mkdirSync("dist", { recursive: true });
writeFileSync("dist/index.html", html);
writeFileSync("dist/THIRD_PARTY_LICENSES.txt", licenses);
const gz = gzipSync(Buffer.from(html), { level: constants.Z_BEST_COMPRESSION });
writeFileSync("dist/index.html.gz", gz);
console.log(`dist/index.html ${(html.length / 1024).toFixed(1)} KB, gzip ${(gz.length / 1024).toFixed(1)} KB, ${pkgs.size} bundled packages`);
