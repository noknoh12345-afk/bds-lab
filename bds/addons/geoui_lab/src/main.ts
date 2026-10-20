// GeoUI の検証用の最小構成。RP（rp/）が HUD の live_player_renderer に板とバーを映し、
// ここ（BP）はその値を player のプロパティ（client_sync）に書くだけ。
import { world, system, Player } from '@minecraft/server';
import { cmd, every, ready } from './kit';

const NS = 'glab';
const OBJ = 'glab_bar';

/** バーの値（0〜100）。範囲外は書かずに理由を返す（setProperty は範囲外で例外になる） */
function setBar(p: Player, n: number): string {
  if (!Number.isInteger(n) || n < 0 || n > 100) return `GLAB bar must be 0..100 (got ${n})`;
  p.setProperty(`${NS}:bar`, n);
  return `GLAB bar ${n}`;
}

cmd('glab:bar', 'GeoUI のバーの値（0〜100）', { n: 'int' }, (p, a) => setBar(p, a.n));
cmd('glab:show', 'GeoUI の表示・非表示', { on: 'bool' }, (p, a) => { p.setProperty(`${NS}:on`, a.on); return `GLAB show ${a.on}`; });
// 値の読み出しは1tick後（setProperty は同じtickの getProperty に反映されない）
cmd('glab:size', 'GeoUI 全体の大きさ（10〜1000 %）', { n: 'int' }, (p, a) => {
  if (a.n < 10 || a.n > 1000) return `GLAB size must be 10..1000 (got ${a.n})`;
  p.setProperty(`${NS}:size`, a.n); return `GLAB size ${a.n}`;
});
cmd('glab:get', 'GeoUI のプロパティを表示', {}, (p) => `GLAB bar=${p.getProperty(`${NS}:bar`)} on=${p.getProperty(`${NS}:on`)}`);

// スコアボード glab_bar があれば、その値を2tickごとにプロパティへ写す（変わったときだけ書く）
ready(() => {
  world.scoreboard.getObjective(OBJ) ?? world.scoreboard.addObjective(OBJ, 'GeoUI bar');
});
every(2, (p) => {
  const o = world.scoreboard.getObjective(OBJ);
  // getScore はスコアの無いプレイヤーで例外になるので、先に hasParticipant を見る
  if (!o || !o.hasParticipant(p)) return;
  const s = o.getScore(p);
  if (s === undefined) return;
  const n = Math.max(0, Math.min(100, s));
  if (p.getProperty(`${NS}:bar`) !== n) p.setProperty(`${NS}:bar`, n);
});
