#!/usr/bin/env node
/* global window, document, GeoUITimeline, DataTransfer, ClipboardEvent */
// GeoUI timeline — the editors in a real browser (inspector.js, curve.js, instances.js, pathedit.js), on a fake store and a fake
// preview: a field typed in (one clip, two clips: one batch), a transition and a preset clicked, a key's ease made a Bézier and
// its handle dragged, a number's label dragged, the instances' table (thousands of rows: only those in view in the page; a row
// clicked, a cell edited, rows pasted, a filter, a sort), a path's point dragged / added / taken away and an instance moved on
// the preview (and a click elsewhere left to the preview), then all of it taken off leaving nothing.
// GEOUI_NODE_MODULES=… CHROMIUM=… node bds/geoui/timeline/check-editors.mjs
import { withPage } from './browser.mjs';

const doc = { version: 1, sequences: [{ id: 's', name: 'S', duration: 400, tempo: [{ t: 0, bpm: 120 }],
  paths: [{ id: 'p1', kind: 'linear', points: [[0, 0], [20, 0], [20, 20]] }],
  templates: [{ id: 'tp', name: '円', lead: 0.5, tail: 0.5, params: ['x', 'y'], tracks: [{ id: 'T1', target: 'c', clips: [{ id: 'tc', start: -0.5, end: 0.5, channels: { x: [{ t: 0, v: 'param.x' }], y: [{ t: 0, v: 'param.y' }] } }] }] }],
  instances: Array.from({ length: 3000 }, (_, i) => ({ id: `i${i}`, template: 'tp', t: 1 + i * 0.1, params: { x: (i % 9) - 4, y: i % 5 } })),
  tracks: [{ id: 'A', target: 'e', clips: [{ id: 'c1', start: 1, end: 3, name: 'one', channels: { x: [{ t: 0, v: 0, ease: 'quad-out' }, { t: 1, v: 10 }] } }] },
    { id: 'B', target: 'f', clips: [{ id: 'c2', start: 4, end: 5, name: 'two' }] }] }] };

await withPage('check-editors', ['model.js', 'presets.js', 'osu.js', 'view.js', 'curve.js', 'inspector.js', 'instances.js', 'pathedit.js'], doc, async (page, ok) => {
  const last = () => page.evaluate(() => window.__log.filter((x) => x.type).slice(-1)[0] || null);
  const frame = () => page.waitForTimeout(80);
  await page.evaluate(() => { window.__elements = [{ name: 'e' }, { name: 'f' }, { name: 'g' }]; window.__ins = GeoUITimeline.inspector.mount(document.getElementById('side'), window.__store); });
  ok(await page.evaluate(() => !!document.querySelector('.geoui-inspector [data-f="seq.name"]')), 'the inspector: nothing selected, the sequence\'s fields');
  // one clip: its name typed in
  await page.evaluate(() => window.__store.select({ clips: ['c1'] })); await frame();
  ok((await page.inputValue('[data-f="clip.name"]')) === 'one', 'a clip selected: its fields (its name)');
  await page.fill('[data-f="clip.name"]', 'uno'); await page.press('[data-f="clip.name"]', 'Enter');
  let it = await last();
  ok(it && it.type === 'clip.set' && it.id === 'c1' && it.patch.name === 'uno', 'its name typed in: clip.set', JSON.stringify(it));
  // two clips: — and one batch
  await page.evaluate(() => window.__store.select({ clips: ['c1', 'c2'] })); await frame();
  ok((await page.getAttribute('[data-f="clip.name"]', 'placeholder')) === '—' && (await page.inputValue('[data-f="clip.name"]')) === '', 'two clips: a name that differs shows —');
  await page.fill('[data-f="clip.name"]', 'both'); await page.press('[data-f="clip.name"]', 'Enter');
  it = await last();
  ok(it && it.type === 'batch' && it.intents.length === 2 && (await page.evaluate(() => window.__store.doc().sequences[0].tracks.every((t) => t.clips[0].name === 'both'))), 'typed in for both: one batch (one undo), both renamed', JSON.stringify(it));
  // a transition and a preset
  await page.click('[data-tr="zoom:in"]');
  it = await last();
  ok(it && it.type === 'batch' && it.intents.every((x) => x.patch.transitionIn.kind === 'zoom'), 'a transition clicked: onto the selected clips\' starts');
  await page.selectOption('.gi-preset-target', 'g'); await page.evaluate(() => window.__store.seek(7)); await frame();
  await page.click('[data-preset="blink"]');
  it = await last();
  ok(it && it.type === 'preset.apply' && it.at === 7 && it.preset.tracks[0].target === 'g', 'a preset clicked: at the playhead, on the element chosen', JSON.stringify(it && { type: it.type, at: it.at }));
  // a number's label dragged (sent once, when let go)
  await page.evaluate(() => window.__store.select({ clips: ['c1'], keys: [] })); await frame();
  await page.locator('[data-row="clip.offset"] label').scrollIntoViewIfNeeded();
  const lab = await page.locator('[data-row="clip.offset"] label').boundingBox(), n0 = await page.evaluate(() => window.__log.length);
  await page.mouse.move(lab.x + 20, lab.y + 5); await page.mouse.down(); await page.mouse.move(lab.x + 60, lab.y + 5, { steps: 5 }); await page.mouse.up();
  it = await last();
  ok(it && it.type === 'clip.set' && Math.abs(it.patch.offset - 0.5) < 1e-9 && (await page.evaluate(() => window.__log.length)) - n0 === 1, 'a number\'s label dragged 40 px: one clip.set (its step, 0.05, a 4 px)', JSON.stringify(it));
  // a key's ease: a Bézier from the named one, then its handle dragged
  await page.evaluate(() => window.__store.select({ clips: ['c1'], keys: [{ clip: 'c1', prop: 'x', index: 0 }] })); await frame();
  await page.locator('[data-row="key.ease"] button').scrollIntoViewIfNeeded();
  await page.click('[data-row="key.ease"] button');
  ok(await page.evaluate(() => !!document.querySelector('.gi-curve canvas.geoui-curve')), 'the key\'s ease: the curve opened under it');
  await page.locator('.gi-curve button').scrollIntoViewIfNeeded();
  await page.click('.gi-curve button');   // (ベジェにする)
  it = await last();
  ok(it && it.type === 'key.set' && it.patch.ease && Array.isArray(it.patch.ease.bezier), 'a named ease made the Bézier nearest it: key.set', JSON.stringify(it && it.patch));
  await frame();
  await page.locator('.gi-curve canvas.geoui-curve').scrollIntoViewIfNeeded();
  const b0 = it.patch.ease.bezier, cv = await page.locator('.gi-curve canvas.geoui-curve').boundingBox();
  const P = (x, y) => [cv.x + 14 + x * (cv.width - 28), cv.y + 14 + ((1.35 - y) / 1.7) * (cv.height - 28)];
  const [hx, hy] = P(b0[0], b0[1]);
  await page.mouse.move(hx, hy); await page.mouse.down(); await page.mouse.move(hx + 30, hy - 30, { steps: 5 }); await page.mouse.up();
  it = await last();
  ok(it && it.type === 'key.set' && it.patch.ease.bezier[0] > b0[0] + 0.1 && it.patch.ease.bezier[1] > b0[1] + 0.1 && it.patch.ease.bezier[2] === b0[2], 'its first handle dragged: key.set with it moved', JSON.stringify([b0, it && it.patch.ease]));

  // ---- the instances' table
  await page.evaluate(() => { const d = document.createElement('div'); d.id = 'tbl'; d.style.cssText = 'width:420px;height:300px;position:fixed;left:0;top:520px'; document.body.append(d); window.__tbl = GeoUITimeline.instances.mount(d, window.__store); });
  await frame();
  const rows = () => page.evaluate(() => [...document.querySelectorAll('.gin-row')].map((r) => r.getAttribute('data-id')));
  let rs = await rows();
  ok(rs.length > 5 && rs.length < 40 && rs[0] === 'i0', `3000 instances: only the rows in view in the page (${rs.length})`);
  await page.evaluate(() => { document.querySelector('.gin-rows').scrollTop = 20000; document.querySelector('.gin-rows').dispatchEvent(new Event('scroll')); }); await frame();
  rs = await rows();
  ok(rs.includes('i1000') && !rs.includes('i0'), 'scrolled: the rows there (row 1000)', rs.slice(0, 3).join());
  await page.click('.gin-row[data-id="i1005"]');
  ok(await page.evaluate(() => window.__store.selection().instances.join() === 'i1005' && Math.abs(window.__store.time() - 101.5) < 1e-9), 'a row clicked: selected, the playhead at its time');
  await page.dblclick('.gin-row[data-id="i1005"] [data-key="y"]');
  await page.keyboard.press('Control+a'); await page.keyboard.type('7'); await page.keyboard.press('Enter');
  it = await last();
  ok(it && it.type === 'instance.set' && it.id === 'i1005' && it.patch.params.y === 7 && it.patch.params.x === (1005 % 9) - 4, 'a cell edited: instance.set (its other params kept)', JSON.stringify(it));
  await page.evaluate(() => { const dt = new DataTransfer(); dt.setData('text/plain', 't\ttemplate\tx\ty\n500\t円\t1\t2\n501\ttp\t3\t4'); document.querySelector('.gin-rows').dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); });
  it = await last();
  ok(it && it.type === 'instances.import' && it.instances.length === 2 && (await page.evaluate(() => window.__store.doc().sequences[0].instances.length)) === 3002, 'rows pasted (TSV with a header): instances.import, both in', JSON.stringify(it && it.instances));
  await page.fill('.gin-filter', 'x>3'); await frame();
  const count = await page.textContent('.gin-count');
  ok(/3002 個中 \d+ 個/.test(count) && (await page.evaluate(() => [...document.querySelectorAll('.gin-row [data-key="x"]')].every((c) => +c.textContent > 3))), `a filter: the rows that hold (${count})`);
  await page.fill('.gin-filter', ''); await page.click('.gin-head [data-col="x"]'); await page.click('.gin-head [data-col="x"]'); await frame();
  ok(await page.evaluate(() => { const xs = [...document.querySelectorAll('.gin-row [data-key="x"]')].map((c) => +c.textContent); return xs.length && xs.every((x) => x === Math.max(...xs)) && xs[0] === 4; }), 'a header clicked twice: largest x first');

  // ---- the paths and positions on the preview
  await page.evaluate(() => {
    const box = document.createElement('div'); box.id = 'pv'; box.style.cssText = 'position:fixed;left:500px;top:520px;width:600px;height:300px';
    const cv = document.createElement('canvas'); cv.width = 600; cv.height = 300; cv.style.cssText = 'width:600px;height:300px;display:block'; box.append(cv); document.body.append(box);
    window.__camera = 0; cv.addEventListener('pointerdown', () => { window.__camera++; });   // (the preview's own: Blockbench's camera)
    window.__host = { canvas: () => cv, frameRect: () => ({ x: 0, y: 0, w: 600, h: 300 }), elements: () => [{ name: 'e', x: 0, y: 140 }, { name: 'c', x: 0, y: 140 }], screen: () => ({ unitsH: 100, center: [0, 140] }) };
    window.__store.dispatch({ seq: 's', type: 'clip.set', id: 'c1', patch: { path: 'p1' } });
    window.__pe = GeoUITimeline.pathedit.attach(window.__host, window.__store, { grid: 0 });
    window.__store.select({ clips: [], keys: [], instances: [], path: 'p1' });
  });
  await frame();
  const pv = await page.locator('#pv canvas:not(.geoui-pathedit)').boundingBox(), toPx = (x, y) => [pv.x + 300 + x * 3, pv.y + 150 - y * 3];
  ok(await page.evaluate(() => !!document.querySelector('canvas.geoui-pathedit')), 'the drawing over the preview is there');
  let [px, py] = toPx(20, 0);
  await page.mouse.move(px, py); await page.mouse.down(); await page.mouse.move(px + 30, py - 15, { steps: 5 }); await page.mouse.up();
  it = await last();
  ok(it && it.type === 'path.set' && JSON.stringify(it.patch.points[1]) === '[30,5]' && (await page.evaluate(() => window.__camera)) === 0, 'a point dragged 30 px right, 15 up: path.set (10 and 5 units), the preview\'s camera not moved', JSON.stringify(it && it.patch));
  [px, py] = toPx(-40, -30);
  await page.keyboard.down('Control'); await page.mouse.click(px, py); await page.keyboard.up('Control');
  it = await last();
  ok(it && it.type === 'path.set' && it.patch.points.length === 4 && JSON.stringify(it.patch.points[3]) === '[-40,-30]', 'Ctrl+click away from the line: a point added at the end', JSON.stringify(it && it.patch));
  [px, py] = toPx(0, 0);
  await page.keyboard.down('Alt'); await page.mouse.click(px, py); await page.keyboard.up('Alt');
  it = await last();
  ok(it && it.type === 'path.set' && it.patch.points.length === 3 && JSON.stringify(it.patch.points[0]) === '[30,5]', 'Alt+click on a point: taken away', JSON.stringify(it && it.patch));
  const before = await page.evaluate(() => window.__camera);
  await page.mouse.click(pv.x + 50, pv.y + 280);
  ok((await page.evaluate(() => window.__camera)) === before + 1, 'a click on nothing of ours: the preview has it (its camera)');
  // an instance's position dragged (the playhead near it: it is out)
  await page.evaluate(() => { window.__store.seek(1.1); window.__store.select({ path: null, instances: ['i1'] }); }); await frame();
  [px, py] = toPx(-3, 1);   // (i1: x −3, y 1 from the element c at (0, 140))
  await page.mouse.move(px, py); await page.mouse.down(); await page.mouse.move(px - 15, py, { steps: 4 }); await page.mouse.up();
  it = await last();
  ok(it && it.type === 'instance.move' && it.ids.join() === 'i1' && Math.abs(it.dx + 5) < 1e-9 && it.dy === 0, 'an instance\'s dot dragged 15 px left: instance.move (−5 units)', JSON.stringify(it));

  // ---- taken off: nothing left
  await page.evaluate(() => { window.__pe.detach(); window.__tbl.unmount(); window.__ins.unmount(); });
  ok(await page.evaluate(() => !document.querySelector('.geoui-pathedit, .geoui-inspector, .geoui-instances, .geoui-curve-editor')), 'detach / unmount: nothing left in the page');
}, { width: 1200, height: 900 });
