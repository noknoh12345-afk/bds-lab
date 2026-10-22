import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const isDir = (p: string) => { try { return fs.statSync(p).isDirectory(); } catch { return false; } };
const subdirs = (p: string) => { try { return fs.readdirSync(p, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => path.join(p, e.name)); } catch { return []; } };
const MOJANG = ['games', 'com.mojang', 'minecraftWorlds'];

/**
 * このマシンの Minecraft 統合版のワールドのフォルダ（minecraftWorlds/<id>）のうち、名前（levelname.txt）が name のもの。
 * roots 省略時は worldRoots()（Windows・macOS・Linux の既知の場所。存在するものだけ）。
 */
export function findWorldFolders(name: string, roots?: string[]): string[] {
  const want = String(name ?? '').trim();
  if (!want) return [];
  const out: string[] = [];
  for (const root of roots ?? worldRoots()) {
    for (const d of subdirs(root)) {
      let level = '';
      try { level = fs.readFileSync(path.join(d, 'levelname.txt'), 'utf8').trim(); } catch { continue; }
      if (level === want) out.push(d);
    }
  }
  return [...new Set(out)].sort();
}

/** ワールドの置き場所の候補（存在するものだけ） */
export function worldRoots(env: NodeJS.ProcessEnv = process.env, home: string = os.homedir()): string[] {
  const c: string[] = [];
  const local = env.LOCALAPPDATA, roaming = env.APPDATA;
  if (local) {
    // (the Microsoft Store versions: release and Preview)
    for (const pkg of ['Microsoft.MinecraftUWP_8wekyb3d8bbwe', 'Microsoft.MinecraftWindowsBeta_8wekyb3d8bbwe']) c.push(path.join(local, 'Packages', pkg, 'LocalState', ...MOJANG));
  }
  if (roaming) {
    // (the GDK versions, 1.21.120 on: one folder a signed-in user; "Shared" for the worlds of no account)
    for (const app of ['Minecraft Bedrock', 'Minecraft Bedrock Preview']) {
      for (const u of subdirs(path.join(roaming, app, 'Users'))) c.push(path.join(u, ...MOJANG));
    }
  }
  // (Linux / macOS: mcpelauncher, the unofficial launcher; Flatpak's own data folder too)
  c.push(path.join(home, '.local', 'share', 'mcpelauncher', ...MOJANG));
  c.push(path.join(home, '.var', 'app', 'io.mrarm.mcpelauncher', 'data', 'mcpelauncher', ...MOJANG));
  c.push(path.join(home, 'Library', 'Application Support', 'mcpelauncher', ...MOJANG));
  return [...new Set(c)].filter(isDir);
}
