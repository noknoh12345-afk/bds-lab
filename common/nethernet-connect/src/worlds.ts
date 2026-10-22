/**
 * このマシンの Minecraft 統合版のワールドのフォルダ（minecraftWorlds/<id>）のうち、名前（levelname.txt）が name のもの。
 * roots 省略時は worldRoots()（Windows・macOS・Linux の既知の場所。存在するものだけ）。
 * (lane nc-stores が作る)
 */
export function findWorldFolders(name: string, roots?: string[]): string[] {
  void name; void roots;
  throw new Error('findWorldFolders: まだ作っていません（nethernet-connect v3）');
}

/** ワールドの置き場所の候補（存在するものだけ） */
export function worldRoots(): string[] {
  throw new Error('worldRoots: まだ作っていません（nethernet-connect v3）');
}
