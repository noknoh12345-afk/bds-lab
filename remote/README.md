# remote: bdslab のプレイヤーを本物の鯖に常駐させる

lab の BDS ではなく、人の鯖（オンラインモード・NetherNet も可）に bdslab のプレイヤーを入れっぱなしにします。落ちたら入り直し、死んだらリスポーンし、遊びながら命令を受け付けます。

```sh
./remote/start.sh          # 初回: config.json ができるので host / port / webhook を書いて、もう一度
```

- サインイン: 初回だけ `microsoft.com/link` のコードが出ます（端末・`run/status.json`・Discord）。アカウントは `run/auth/` に残ります。
- 命令: 端末に打つ / `run/inbox/` にファイルを置く（1 行 1 命令）/ `node remote/bot.cjs send "get_iron_ingot 3"`。
  bdslab の動作と verb はすべて使えます（`get_<item>` `mine_<block>` `craft_<item>` `kill_<mob>` `goto x z` `fight_ender_dragon` …）。
- 出入りは最小限: 自分の都合では抜けません（`update` は鯖から出ずに命令の部分 brain.cjs を最新に、エラーでも落ちない、一時的な無通信は切断扱いしない）。鯖に本当に切られたときだけ、少し待って一度入り直します。
- 組み込み: `status` `players`（鯖にいる人の一覧） `survey [r]`（近くの建築と人） `around` `travel x z`（遠くまで歩く） `guard on|off|<半径>` `stop` `clear` `reconnect` `update` `reload` `quit` `help`
- ルール: 人の建築や他のプレイヤーから `guardRadius`（既定 48）以内では、掘る・置く・開ける・攻撃するをしません。作業中に近づいたら止めます。
- 出力: 端末、`run/out.log`、`run/status.json`（毎秒: 位置・次元・体力・空腹・作業中の命令・鯖の人）、`webhook` があれば Discord。
