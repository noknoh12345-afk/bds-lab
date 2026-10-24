#!/usr/bin/env python3
"""
inject_mod.py — 実行中の Minecraft(com.mojang.minecraftpe)に libscripteval.so を注入し、初期化を呼ぶ。

scripteval 0.3.0 は mcpelauncher mod として作られており、エントリは mod_preinit / mod_init(JNI_OnLoad は無い)。
素の Android APK には誰も mod_init を呼ぶ者がいないので、Frida で Module.load した後に自分で呼ぶ。
これは「既存の Module.load 注入」に mod_init 呼び出しを一手足しただけ。新しい注入機構は作らない。
ロード済みの libminecraftpe を前提にするため、起動済み(ワールド内)の MC に attach する(ローダーのフックはしない)。

前提:
  - redroid 内で frida-server が 0.0.0.0:27042 で稼働、host から adb forward tcp:27042 tcp:27042 済み。
  - .so は端末の /data/local/tmp/libscripteval.so に push 済み(abi 一致)。
  - MC は既に起動してワールドに入っている(libminecraftpe.so がロード済み)。

  python3 inject_mod.py [--so /data/local/tmp/libscripteval.so] [--pkg com.mojang.minecraftpe] [--host 127.0.0.1:27042]
"""
import argparse
import sys
import time

import frida

JS = r"""
'use strict';
rpc.exports.load = function (soPath) {
  var out = { ok: false, steps: [] };
  try {
    // 既にロード済みなら再利用、無ければ dlopen(Module.load)
    var m = null;
    try { m = Process.getModuleByName(soPath.split('/').pop()); } catch (e) {}
    if (!m) { m = Module.load(soPath); }
    out.base = m.base.toString();
    out.steps.push('loaded ' + m.name + ' @ ' + m.base);
    // mcpelauncher mod のエントリを呼ぶ(libminecraftpe ロード後に呼ぶのが前提)
    for (var i = 0; i < 2; i++) {
      var name = (i === 0) ? 'mod_preinit' : 'mod_init';
      var ex = null;
      try { ex = m.getExportByName(name); } catch (e) {}
      if (!ex) { out.steps.push(name + ': export なし'); continue; }
      var fn = new NativeFunction(ex, 'void', []);
      try { fn(); out.steps.push(name + ': 呼び出しOK'); }
      catch (e) { out.steps.push(name + ': 例外 ' + (e && e.message || e)); }
    }
    out.ok = true;
  } catch (e) {
    out.error = (e && e.message || String(e));
    if (e && e.stack) out.stack = e.stack;
  }
  return out;
};
"""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--so", default="/data/local/tmp/libscripteval.so")
    ap.add_argument("--pkg", default="com.mojang.minecraftpe")
    ap.add_argument("--host", default="127.0.0.1:27042")
    a = ap.parse_args()

    dev = frida.get_device_manager().add_remote_device(a.host)
    try:
        session = dev.attach(a.pkg)
    except Exception as e:
        print(f"[inject] attach 失敗({a.pkg}): {e}", file=sys.stderr)
        print("[inject] MC が起動していません。先にゲームをワールドまで入れてから実行してください。", file=sys.stderr)
        return 2

    script = session.create_script(JS)
    logs = []
    script.on("message", lambda msg, data: logs.append(msg))
    script.load()
    res = script.exports_sync.load(a.so)

    for s in res.get("steps", []):
        print(f"[inject] {s}")
    if not res.get("ok"):
        print(f"[inject] FAILED: {res.get('error')}", file=sys.stderr)
        if res.get("stack"):
            print(res["stack"], file=sys.stderr)
        return 1
    print(f"[inject] libscripteval.so loaded @ {res.get('base')} ; mod_init 呼び出し完了")
    # REPL が listen を開始するまで少し待つ(mod_init 内で thread 起動)
    time.sleep(2)
    return 0


if __name__ == "__main__":
    sys.exit(main())
