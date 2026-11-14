// origin (a card in 「準備」): the other GitHub Pages sites that share the panel's origin, and the ways out (lib/origin.mjs).
// Reads the owner's public repositories; writes nothing.
import { h, link, failView } from './dom.mjs';
import { sharedOrigin, WAYS_OUT } from '../lib/origin.mjs';

const MARK = { ok: '✅', warn: '⚠️', unknown: '❔' };

/** ctx: { api, lab: { slug }, hostname? (tests; else location.hostname) } → an element that draws itself */
export function originCard(ctx) {
  const body = h('div', { role: 'status' }, '読んでいます…');
  const card = h('div', { class: 'card', 'data-card': 'origin' }, h('h3', {}, '🔒 このパネルと保管場所を分け合うサイト'), body);
  const hostname = ctx.hostname ?? globalThis.location?.hostname ?? '';
  const draw = async () => {
    let repos = null;
    const owner = /^([a-z0-9-]+)\.github\.io$/i.exec(hostname)?.[1];
    if (owner) { try { repos = await ctx.api.ownerRepos(owner); } catch (e) { if (e.status !== 404 && e.status !== 403) return body.replaceChildren(failView(e, draw)); } }
    const v = sharedOrigin({ hostname, lab: ctx.lab.slug, repos });
    return body.replaceChildren(h('p', { class: v.level === 'warn' ? 'warn' : '' }, `${MARK[v.level]} `, v.say),
      v.others.length ? h('ul', {}, v.others.map((o) => h('li', {}, link(o.url, o.name)))) : null,
      v.shared && v.level !== 'ok' ? [h('p', {}, '分け合わないようにするには（上から効き目の大きい順）:'), h('ol', {}, WAYS_OUT.map((w) => h('li', {}, w)))] : null);
  };
  draw();
  return card;
}
