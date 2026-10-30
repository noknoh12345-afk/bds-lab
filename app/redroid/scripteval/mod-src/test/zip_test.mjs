// Run by test/zip_test.py: node zip_test.mjs <fixture dir> <path to studio/src/zip.js>
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const [dir, zipJs] = process.argv.slice(2);
const { readZip, findPacks, parseLenientJson } = await import(pathToFileURL(zipJs).href);
const expect = JSON.parse(readFileSync(`${dir}/expect.json`, "utf8"));
let failures = 0;
const check = (name, ok, detail = "") => {
  console.log((ok ? "  ok   " : "*** EXPECTATION FAILED: ") + name + (ok ? "" : `  -- ${detail}`));
  if (!ok) failures++;
};
const file = name => {
  const data = readFileSync(`${dir}/${name}`);
  return { path: name, size: data.length, read: async () => new Uint8Array(data) };
};

console.log("zip.js");
check("lenient JSON", JSON.stringify(parseLenientJson('﻿{ // c\n "a": [1, 2,], /* x */ "b": "http://x//y", }')) === '{"a":[1,2],"b":"http://x//y"}');

{
  const r = await findPacks([file("plain.mcpack")]);
  const p = r.packs[0];
  check("plain .mcpack: one pack", r.packs.length === 1 && r.skipped.length === 0, JSON.stringify(r.skipped));
  check("name from texts/en_US.lang without § codes", p.name === "Fancy Pack", p.name);
  check("uuid / version / kind", p.uuid === "11111111-2222-4333-8444-555555555555" && p.version === "1.2.3" && p.kind === "resources", JSON.stringify(p));
  check("subpacks", JSON.stringify(p.subpacks) === '["low"]', JSON.stringify(p.subpacks));
  const rels = p.files.map(f => f.rel).sort();
  check("junk dropped, paths relative to the pack root", !rels.some(x => x.includes("MACOSX") || x.includes(".DS_Store")) && rels.includes("manifest.json") && rels.includes("textures/blocks/stone.png"), rels.join(","));
  const big = await p.files.find(f => f.rel === "textures/blocks/stone.png").read();
  check("deflate entry inflates exactly", big.length === expect.bigLen && expect.bigHead.every((b, i) => big[i] === b) && expect.bigTail.every((b, i) => big[big.length - 16 + i] === b), big.length);
  const png = await p.files.find(f => f.rel === "pack_icon.png").read();
  check("stored entry", png.length === expect.png && png[0] === 0x89);
  const empty = await p.files.find(f => f.rel === "empty.txt").read();
  check("empty file", empty.length === 0);
}
{
  const r = await findPacks([file("wrapped.zip")]);
  check("folder inside the zip becomes the root", r.packs.length === 1 && r.packs[0].root === "wrapped/Wrapped Pack/" && r.packs[0].files.some(f => f.rel === "manifest.json"), JSON.stringify(r.packs.map(p => p.root)));
}
{
  const r = await findPacks([file("both.mcaddon")]);
  const kinds = r.packs.map(p => `${p.uuid.slice(0, 8)}:${p.kind}`).sort().join(",");
  check(".mcaddon: nested .mcpack files are opened", kinds === "bbbbbbbb:resources,cccccccc:behavior", kinds);
}
{
  const entries = await readZip(new Blob([readFileSync(`${dir}/many.zip`)]));
  check("ZIP64 (66001 entries)", entries.length === 66001, entries.length);
  const r = await findPacks([file("many.zip")]);
  const t = r.packs[0]?.files.find(f => f.rel === "t/65999.txt");
  check("ZIP64 entry readable", t && new TextDecoder().decode(await t.read()) === "65999");
}
{
  const r = await findPacks([file("nopack.zip")]);
  check("zip without manifest is reported", r.packs.length === 0 && r.skipped.length === 1 && /manifest/.test(r.skipped[0].reason), JSON.stringify(r));
  let threw = false;
  try { await readZip(new Blob([new Uint8Array(100)])); } catch { threw = true; }
  check("garbage is rejected", threw);
}
{
  // a dropped folder: paths come from the file system
  const mk = (path, text) => ({ path, size: text.length, read: async () => new TextEncoder().encode(text) });
  const r = await findPacks([
    mk("MyFolder/manifest.json", '{"header":{"name":"Folder pack","uuid":"eeeeeeee-2222-4333-8444-555555555555","version":"2.0.1"},"modules":[{"type":"resources"}]}'),
    mk("MyFolder/textures/x.png", "x"),
    mk("MyFolder/../evil.txt", "x"),
  ]);
  const p = r.packs[0];
  check("folder drop with a string version", r.packs.length === 1 && p.version === "2.0.1" && p.name === "Folder pack", JSON.stringify(r));
  check("'..' paths are dropped", !p.files.some(f => f.rel.includes("..")), p.files.map(f => f.rel).join(","));
}
console.log(`${failures} failure(s)`);
process.exit(failures ? 1 : 0);
