#!/usr/bin/env node
/* global window, document, GeoUITimeline */
// GeoUI timeline — the timeline panel (timeline.js) in a real browser: mounted on a fake store, a clip dragged, an edge
// trimmed, a key dragged, the keys (Space, S, Delete, Ctrl+D, M, \), the context menu, the drawing (not blank, the clips'
// colour where the clips are), unmount leaving nothing. GEOUI_NODE_MODULES=… CHROMIUM=… node bds/geoui/timeline/check-timeline.mjs
import { withPage } from './browser.mjs';

const doc = { version: 1, sequences: [{ id: 's', duration: 10, markers: [{ id: 'm1', t: 6, name: 'M' }], tempo: [{ t: 0, bpm: 120 }],
  templates: [{ id: 'tp', lead: 1, tail: 0.5, tracks: [{ id: 'T1', target: 'c', clips: [{ id: 'tc', start: -1, end: 0.5 }] }] }],
  instances: Array.from({ length: 40 }, (_, i) => ({ id: `i${i}`, template: 'tp', t: 7 + i * 0.05 })),
  tracks: [{ id: 'A', target: 'e', clips: [{ id: 'c1', start: 1, end: 3, channels: { x: [{ t: 0, v: 0 }, { t: 1, v: 10 }] }, transitionIn: { kind: 'fade', duration: 0.3 } }] },
    { id: 'B', target: 'f', clips: [{ id: 'c2', start: 4, end: 5 }] }] }] };

await withPage('check-timeline', ['model.js', 'view.js', 'timeline.js'], doc, async (page, ok) => {
  await page.evaluate(() => { window.__tl = GeoUITimeline.timeline.mount(document.getElementById('host'), window.__store); });
  const v = await page.evaluate(() => window.__tl.view()), box = await page.locator('#host canvas').boundingBox();
  const X = (t) => box.x + v.headerW + (t - v.scroll) * v.pxPerSec, Y = (row, dy = 15) => box.y + v.rulerH + row * v.rowH + dy;
  const last = () => page.evaluate(() => window.__log.filter((x) => x.type).slice(-1)[0] || null);
  const clip = (id) => page.evaluate((i) => window.__store.doc().sequences[0].tracks.flatMap((t) => t.clips).find((c) => c.id === i) || null, id);
  // drawn: the clip's blue where c1 is, the background where nothing is
  const px = (x, y) => page.evaluate(([a, b]) => Array.from(document.querySelector('#host canvas').getContext('2d').getImageData(a, b, 1, 1).data), [x - box.x, y - box.y]);
  const blue = await px(X(2.4), Y(0, 8)), bg = await px(X(8.5), Y(1, 8));
  ok(blue[2] > 150 && blue[0] < 120 && bg[0] < 60 && bg[2] < 60, `drawn: the clip where it is (${blue.slice(0, 3)}), the row's background beside it (${bg.slice(0, 3)})`);
  // a clip dragged half a second later (Alt: exactly, no snapping)
  await page.mouse.move(X(2.4), Y(0, 8)); await page.mouse.down(); await page.keyboard.down('Alt'); await page.mouse.move(X(2.9), Y(0, 8), { steps: 6 }); await page.mouse.up(); await page.keyboard.up('Alt');
  let it = await last(), c1 = await clip('c1');
  ok(it && it.type === 'clip.move' && Math.abs(it.dt - 0.5) < 0.02 && it.snap === false && Math.abs(c1.start - 1.5) < 0.02, 'a clip dragged (Alt): clip.move, the document moved it', JSON.stringify(it));
  // an end edge trimmed (snapping on: onto the marker at 6)
  await page.mouse.move(X(5) - 2, Y(1, 6)); await page.mouse.down(); await page.mouse.move(X(5.97), Y(1, 6), { steps: 6 }); await page.mouse.up();
  it = await last();
  ok(it && it.type === 'clip.trim' && it.edge === 'end' && Math.abs((await clip('c2')).end - 6) < 1e-6, 'an edge trimmed: clip.trim, snapped onto the marker (6 s)', JSON.stringify(it));
  // a key dragged
  await page.mouse.move(X(2.5), Y(0)); await page.mouse.down(); await page.mouse.move(X(2.75), Y(0), { steps: 4 }); await page.mouse.up();
  it = await last();
  ok(it && it.type === 'key.move' && it.keys.length === 1 && Math.abs(it.dt - 0.25) < 0.02, 'a key dragged: key.move', JSON.stringify(it));
  // keys: Space (play), the playhead at 2 s and S (split the selected clip), Ctrl+D (duplicate), M (a marker), Delete
  await page.mouse.click(X(2.2), Y(0, 8));
  await page.keyboard.press('Space');
  ok((await page.evaluate(() => window.__log.some((x) => x.toggle === true))), 'Space: play');
  await page.evaluate(() => window.__store.seek(2.2));
  await page.keyboard.press('s');
  it = await last();
  const parts = await page.evaluate(() => window.__store.doc().sequences[0].tracks[0].clips.length);
  ok(it && it.type === 'clip.split' && parts === 2, 'S: the selected clip cut at the playhead', JSON.stringify(it));
  await page.keyboard.press('Control+d');
  it = await last();
  ok(it && it.type === 'clip.duplicate', 'Ctrl+D: duplicate', JSON.stringify(it));
  await page.keyboard.press('m');
  it = await last();
  ok(it && it.type === 'marker.add' && Math.abs(it.t - 2.2) < 1e-9, 'M: a marker at the playhead');
  await page.keyboard.press('Delete');
  it = await last();
  ok(it && it.type === 'clip.remove', 'Delete: the selection removed', JSON.stringify(it));
  // the context menu: its items, one clicked
  await page.mouse.click(X(4.5), Y(1, 8), { button: 'right' });
  const items = await page.evaluate(() => [...document.querySelectorAll('.geoui-tl-menu > div')].map((d) => d.textContent));
  ok(items.includes('フェードイン') && items.includes('トラックを足す'), 'right click: the menu', items.join(' / '));
  await page.evaluate(() => [...document.querySelectorAll('.geoui-tl-menu > div')].find((d) => d.textContent === 'フェードイン').click());
  it = await last();
  ok(it && it.type === 'clip.set' && it.patch.transitionIn.kind === 'fade', 'its item: clip.set (a fade in)', JSON.stringify(it));
  // zoom to the whole, a template opened from an instance (double click in the lane)
  await page.keyboard.press('\\');
  const v2 = await page.evaluate(() => window.__tl.view());
  ok(Math.abs(v2.pxPerSec - (v2.width - v2.headerW - 20) / 10) < 1e-6, '\\: the whole sequence in view');
  const laneY = box.y + v2.rulerH + 2 * v2.rowH + 8, laneX = box.x + v2.headerW + (7.5 - v2.scroll) * v2.pxPerSec;
  await page.mouse.dblclick(laneX, laneY);
  await page.waitForTimeout(120);   // (it draws on the next frame)
  const crumb = await page.evaluate(() => document.querySelector('.geoui-tl-crumb').textContent);
  ok(/テンプレート/.test(crumb), 'a double click on an instance: its template opened (the crumb)', crumb);
  await page.evaluate(() => window.__tl.unmount());
  ok(await page.evaluate(() => !document.querySelector('.geoui-timeline') && document.querySelectorAll('.geoui-tl-menu').length === 0), 'unmount: nothing left');
});
