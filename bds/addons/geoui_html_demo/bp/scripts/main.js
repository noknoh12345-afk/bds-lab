// GeoUI page (HTML → GeoUI, bds-lab bds/geoui/html): GeoUI HTML Demo — made by bds/geoui/html/convert.mjs: change the page, not this file.
// /scriptevent ghd:open [page] · ghd:close · ghd:page <id> · ghd:set <name> <number> · ghd:show <name> 0|1 · ghd:sens <units a degree>
// /ghd:open [page] · /ghd:t <text> (typed into the text field in focus). No form: the turn of the head is the mouse,
// W A S D (a stick, the touch pad) the arrows, jump Enter, sneak Escape, the hotbar's wheel and keys 1–9; a left click (a swing) clicks.
// What happens goes out as /scriptevent ghd:on_<open|close|page|click|change|event> <json> (system.sendScriptEvent) for another pack.
import { world, system, Player, InputButton, ButtonState, InputPermissionCategory, HudVisibility, HudElement, CommandPermissionLevel, CustomCommandParamType, CustomCommandStatus } from '@minecraft/server';
import './screen_nav.js';
import './screen_input.js';
const CFG = {"title":"GeoUI HTML Demo","hold":"free","sens":4,"ns":"ghd","design":{"w":1280,"h":720,"g":0.25},"range":180,"step":0.088,"start":0,"pages":[{"id":"play"},{"id":"items"},{"id":"settings"}],"controls":[{"i":0,"id":"c0","kind":"tab","page":-1,"rect":{"x":-150,"y":-63,"w":50,"h":13},"action":"page:play","slot":1,"group":"tabs","name":null,"checked":true,"disabled":false,"min":0,"max":100,"step":1,"value":null,"prop":null,"label":"あそぶ","frameValues":null,"frame":null},{"i":1,"id":"c1","kind":"tab","page":-1,"rect":{"x":-97,"y":-63,"w":50,"h":13},"action":"page:items","slot":2,"group":"tabs","name":null,"checked":false,"disabled":false,"min":0,"max":100,"step":1,"value":null,"prop":null,"label":"もちもの","frameValues":null,"frame":null},{"i":2,"id":"c2","kind":"tab","page":-1,"rect":{"x":-44,"y":-63,"w":50,"h":13},"action":"page:settings","slot":3,"group":"tabs","name":null,"checked":false,"disabled":false,"min":0,"max":100,"step":1,"value":null,"prop":null,"label":"せってい","frameValues":null,"frame":null},{"i":3,"id":"c3","kind":"button","page":0,"rect":{"x":-142,"y":-24.203125,"w":60,"h":16},"action":"event:stage1","slot":null,"group":"stages","name":null,"checked":null,"disabled":false,"min":0,"max":100,"step":1,"value":null,"prop":null,"label":"1. 草原","frameValues":null,"frame":null},{"i":4,"id":"c4","kind":"button","page":0,"rect":{"x":-78,"y":-24.203125,"w":60,"h":16},"action":"event:stage2","slot":null,"group":"stages","name":null,"checked":null,"disabled":false,"min":0,"max":100,"step":1,"value":null,"prop":null,"label":"2. 洞くつ","frameValues":null,"frame":null},{"i":5,"id":"c5","kind":"button","page":0,"rect":{"x":-14,"y":-24.203125,"w":60,"h":16},"action":"event:stage3","slot":null,"group":"stages","name":null,"checked":null,"disabled":false,"min":0,"max":100,"step":1,"value":null,"prop":null,"label":"3. ネザー","frameValues":null,"frame":null},{"i":6,"id":"c6","kind":"button","page":0,"rect":{"x":-142,"y":-4.203125,"w":60,"h":16},"action":"event:stage4","slot":null,"group":"stages","name":null,"checked":null,"disabled":false,"min":0,"max":100,"step":1,"value":null,"prop":null,"label":"4. 海の底","frameValues":null,"frame":null},{"i":7,"id":"c7","kind":"button","page":0,"rect":{"x":-78,"y":-4.203125,"w":60,"h":16},"action":"event:stage5","slot":null,"group":"stages","name":null,"checked":null,"disabled":false,"min":0,"max":100,"step":1,"value":null,"prop":null,"label":"5. 空の島","frameValues":null,"frame":null},{"i":8,"id":"c8","kind":"button","page":0,"rect":{"x":-14,"y":-4.203125,"w":60,"h":16},"action":"","slot":null,"group":"stages","name":null,"checked":null,"disabled":true,"min":0,"max":100,"step":1,"value":null,"prop":null,"label":"6. ？？？","frameValues":null,"frame":null},{"i":9,"id":"c9","kind":"button","page":0,"rect":{"x":67,"y":38,"w":75,"h":20},"action":"event:start","slot":null,"group":"auto:16","name":null,"checked":null,"disabled":false,"min":0,"max":100,"step":1,"value":null,"prop":null,"label":"スタート","frameValues":null,"frame":null},{"i":10,"id":"c10","kind":"button","page":1,"rect":{"x":-142,"y":-24.203125,"w":24,"h":24},"action":"event:item1","slot":1,"group":"slots","name":null,"checked":null,"disabled":false,"min":0,"max":100,"step":1,"value":null,"prop":null,"label":"×3","frameValues":null,"frame":null},{"i":11,"id":"c11","kind":"button","page":1,"rect":{"x":-115.5,"y":-24.203125,"w":24,"h":24},"action":"event:item2","slot":2,"group":"slots","name":null,"checked":null,"disabled":false,"min":0,"max":100,"step":1,"value":null,"prop":null,"label":"×12","frameValues":null,"frame":null},{"i":12,"id":"c12","kind":"button","page":1,"rect":{"x":-89,"y":-24.203125,"w":24,"h":24},"action":"event:item3","slot":3,"group":"slots","name":null,"checked":null,"disabled":false,"min":0,"max":100,"step":1,"value":null,"prop":null,"label":"1","frameValues":null,"frame":null},{"i":13,"id":"c13","kind":"button","page":1,"rect":{"x":-62.5,"y":-24.203125,"w":24,"h":24},"action":"event:item4","slot":4,"group":"slots","name":null,"checked":null,"disabled":false,"min":0,"max":100,"step":1,"value":null,"prop":null,"label":"×5","frameValues":null,"frame":null},{"i":14,"id":"c14","kind":"button","page":1,"rect":{"x":-36,"y":-24.203125,"w":24,"h":24},"action":"event:item5","slot":5,"group":"slots","name":null,"checked":null,"disabled":false,"min":0,"max":100,"step":1,"value":null,"prop":null,"label":"×64","frameValues":null,"frame":null},{"i":15,"id":"c15","kind":"button","page":1,"rect":{"x":-9.5,"y":-24.203125,"w":24,"h":24},"action":"event:item6","slot":6,"group":"slots","name":null,"checked":null,"disabled":false,"min":0,"max":100,"step":1,"value":null,"prop":null,"label":"1","frameValues":null,"frame":null},{"i":16,"id":"c16","kind":"button","page":1,"rect":{"x":17,"y":-24.203125,"w":24,"h":24},"action":"event:item7","slot":7,"group":"slots","name":null,"checked":null,"disabled":false,"min":0,"max":100,"step":1,"value":null,"prop":null,"label":"","frameValues":null,"frame":null},{"i":17,"id":"c17","kind":"button","page":1,"rect":{"x":43.5,"y":-24.203125,"w":24,"h":24},"action":"event:item8","slot":8,"group":"slots","name":null,"checked":null,"disabled":false,"min":0,"max":100,"step":1,"value":null,"prop":null,"label":"","frameValues":null,"frame":null},{"i":18,"id":"c18","kind":"button","page":1,"rect":{"x":70,"y":-24.203125,"w":24,"h":24},"action":"event:item9","slot":9,"group":"slots","name":null,"checked":null,"disabled":false,"min":0,"max":100,"step":1,"value":null,"prop":null,"label":"","frameValues":null,"frame":null},{"i":19,"id":"c19","kind":"checkbox","page":2,"rect":{"x":-72,"y":-24.203125,"w":24,"h":11},"action":"","slot":null,"group":"auto:47","name":null,"checked":true,"disabled":false,"min":0,"max":100,"step":1,"value":null,"prop":"music","label":"","frameValues":null,"frame":null},{"i":20,"id":"c20","kind":"checkbox","page":2,"rect":{"x":-72,"y":-7.703125,"w":24,"h":11},"action":"","slot":null,"group":"auto:50","name":null,"checked":false,"disabled":false,"min":0,"max":100,"step":1,"value":null,"prop":"sfx","label":"","frameValues":null,"frame":null},{"i":21,"id":"c21","kind":"radio","page":2,"rect":{"x":-72,"y":8.796875,"w":37.5,"h":11},"action":"","slot":null,"group":"level","name":"level","checked":false,"disabled":false,"min":0,"max":100,"step":1,"value":null,"prop":null,"label":"やさしい","frameValues":null,"frame":null},{"i":22,"id":"c22","kind":"radio","page":2,"rect":{"x":-29.5,"y":8.796875,"w":37.5,"h":11},"action":"","slot":null,"group":"level","name":"level","checked":true,"disabled":false,"min":0,"max":100,"step":1,"value":null,"prop":null,"label":"ふつう","frameValues":null,"frame":null},{"i":23,"id":"c23","kind":"radio","page":2,"rect":{"x":13,"y":8.796875,"w":37.5,"h":11},"action":"","slot":null,"group":"level","name":"level","checked":false,"disabled":false,"min":0,"max":100,"step":1,"value":null,"prop":null,"label":"むずかしい","frameValues":null,"frame":null},{"i":24,"id":"c24","kind":"slider","page":2,"rect":{"x":-72,"y":25.296875,"w":105,"h":11},"action":"","slot":null,"group":"auto:58","name":null,"checked":null,"disabled":false,"min":1,"max":10,"step":1,"value":4,"prop":"sens","label":"4","frameValues":[1,2,3,4,5,6,7,8,9,10],"frame":{"prop":"vf0","shift":0}}],"dynamic":[{"i":0,"kind":"number","prop":"score","page":-1,"min":0,"max":100,"value":0,"digits":6,"bit":null,"frameValues":null,"frame":null},{"i":1,"kind":"gauge","prop":"progress","page":2,"min":0,"max":100,"value":60,"digits":null,"bit":null,"frameValues":[0,10,20,30,40,50,60,70,80,90,100],"frame":{"prop":"vf0","shift":4}}]};
const createScreens = function createScreens(CFG, io, GS) {
    const ns = CFG.ns, players = new Map(), clamp = (v, a, b) => Math.min(b, Math.max(a, v));
    const B = CFG.design ? { x0: -CFG.design.w * CFG.design.g / 2, y0: -CFG.design.h * CFG.design.g / 2, x1: CFG.design.w * CFG.design.g / 2, y1: CFG.design.h * CFG.design.g / 2 } : { x0: -160, y0: -90, x1: 160, y1: 90 };
    const pageIdx = (id) => CFG.pages.findIndex((p) => p.id === id);
    const ctlById = (id) => CFG.controls.find((c) => c.id === id) || null;
    function st(p) {
      let s = players.get(p.id);
      if (!s) {
        s = { open: false, page: CFG.start || 0, history: [], checked: {}, values: {}, shows: {}, numbers: {}, last: {}, via: 'keys', pressT: null, hintsUntil: 0, tick: 0,
          ctl: GS.input.createController({ bounds: B, sens: CFG.sens || 4, focusFollowsPointer: true, targets: [] }) };
        // (each control's own first state, from the page; then what the player last chose, kept in the world)
        for (const c of CFG.controls) { if (c.checked !== null && c.checked !== undefined) s.checked[c.i] = Boolean(c.checked); if (c.kind === 'slider') s.values[c.i] = Number(c.value) || 0; }
        for (const d of CFG.dynamic || []) { if (d.kind === 'gauge') s.values[`d${d.i}`] = Number(d.value) || 0; if (d.kind === 'number') s.numbers[d.i] = Number(d.value) || 0; }
        try { const kept = io.load && io.load(p, `${ns}:state`); if (kept) { const o = JSON.parse(kept); Object.assign(s.checked, o.checked || {}); Object.assign(s.values, o.values || {}); } } catch (e) { /* (none kept) */ }
        players.set(p.id, s);
      }
      return s;
    }
    const keep = (p, s) => { try { if (io.save) io.save(p, `${ns}:state`, JSON.stringify({ checked: s.checked, values: s.values })); } catch (e) { /* (this session only) */ } };
    const set = (p, s, name, v) => { if (s.last[name] === v) return; s.last[name] = v; io.setProp(p, `${ns}:${name}`, v); };
    /** the controls the focus can move over on a page: its own and those on every page, not disabled */
    function targetsOf(s) { return CFG.controls.filter((c) => (c.page === s.page || c.page < 0) && !c.disabled).map((c) => ({ id: c.id, rect: c.rect, group: c.group })); }
    const indexOf = (id) => { const c = ctlById(id); return c ? c.i : -1; };
    /** the frame drawn for a value: the nearest of the frames the browser drew (their values), else of 11 even ones */
    function frameOf(c, v) {
      if (Array.isArray(c.frameValues) && c.frameValues.length) { let best = 0; c.frameValues.forEach((f, k) => { if (Math.abs(f - v) < Math.abs(c.frameValues[best] - v)) best = k; }); return best; }
      const lo = Number(c.min) || 0, hi = Number(c.max), span = (Number.isFinite(hi) ? hi : 100) - lo; return span > 0 ? clamp(Math.round((v - lo) / span * 10), 0, 10) : 0;
    }
    /** every property from the state (only what changed is sent) */
    function sync(p, s) {
      const r = s.ctl.state, foc = indexOf(r.focus), hov = indexOf(r.hover), act = s.pressT !== null ? indexOf(s.pressT) : -1;
      set(p, s, 'pg', s.open ? s.page + 1 : 0);
      set(p, s, 'fha', (foc + 1) + (hov + 1) * 256 + (act + 1) * 65536);
      const q = (v) => clamp(Math.round((v + CFG.range) / CFG.step), 0, 4095);
      set(p, s, 'cur', q(r.pointer[0]) + q(r.pointer[1]) * 4096);
      const showHints = s.open && r.focus !== null && (s.via === 'keys' || s.tick < s.hintsUntil);
      const h = showHints ? s.ctl.hints() : { W: null, A: null, S: null, D: null };
      set(p, s, 'hint', ['W', 'A', 'S', 'D'].reduce((n, k, j) => n + (indexOf(h[k]) + 1) * 64 ** j, 0));
      set(p, s, 'flg', (s.open && s.via === 'pointer' ? 1 : 0) | (showHints ? 2 : 0));
      const chk = {};
      for (const c of CFG.controls) if (s.checked[c.i]) { const k = Math.floor(c.i / 24); chk[k] = (chk[k] || 0) + 2 ** (c.i % 24); }
      for (let k = 0; k * 24 < CFG.controls.length; k++) set(p, s, `chk${k}`, chk[k] || 0);
      const vf = {};
      for (const c of CFG.controls) if (c.frame) vf[c.frame.prop] = (vf[c.frame.prop] || 0) + frameOf(c, s.values[c.i]) * 2 ** c.frame.shift;
      for (const d of CFG.dynamic || []) if (d.frame) vf[d.frame.prop] = (vf[d.frame.prop] || 0) + frameOf(d, s.values[`d${d.i}`]) * 2 ** d.frame.shift;
      for (const [k, v] of Object.entries(vf)) set(p, s, k, v);
      let shw = 0;
      for (const d of CFG.dynamic || []) if (d.kind === 'show' && s.shows[d.prop]) shw += 2 ** d.bit;
      if ((CFG.dynamic || []).some((d) => d.kind === 'show')) set(p, s, 'shw', shw);
      for (const d of CFG.dynamic || []) if (d.kind === 'number') set(p, s, `n${d.i}`, clamp(Math.round(s.numbers[d.i] || 0), -8388607, 8388607));
    }
    function goPage(p, s, k, push) {
      if (k < 0 || k >= CFG.pages.length || k === s.page) return;
      if (push) s.history.push(s.page);
      s.page = k;
      s.ctl.setTargets(targetsOf(s));
      // (the focus to the page's first control under the pointer or first in it: a key goes on from there)
      const t = targetsOf(s), f = GS.nav.first(t, s.ctl.state.pointer);
      s.ctl.focus(f); s.hintsUntil = s.tick + 40;
      io.emit(p, 'page', { page: CFG.pages[k].id });
    }
    function open(p, page) {
      const s = st(p);
      const k = page !== undefined && page !== null && page !== '' ? (Number.isInteger(+page) ? +page : pageIdx(String(page))) : s.page;
      s.page = clamp(k < 0 ? 0 : k, 0, Math.max(0, CFG.pages.length - 1)); s.history = [];
      s.open = true; s.via = 'keys'; s.pressT = null;
      const smp = io.sample(p) || {};
      s.ctl.setTargets(targetsOf(s)); s.ctl.reset(smp.rot, smp.slot); s.ctl.pointerTo(0, 0);
      s.ctl.focus(GS.nav.first(targetsOf(s), null)); s.hintsUntil = s.tick + 60;
      io.freeze(p, true);
      sync(p, s);
      io.emit(p, 'open', { page: CFG.pages[s.page] ? CFG.pages[s.page].id : null });
    }
    function close(p) {
      const s = st(p);
      if (!s.open) return;
      s.open = false; s.pressT = null;
      io.freeze(p, false);
      sync(p, s);
      io.emit(p, 'close', {});
    }
    /** what activating a control does (a click, Enter) */
    function activate(p, s, c) {
      if (!c || c.disabled) return;
      const a = String(c.action || '');
      const change = () => { keep(p, s); io.emit(p, 'change', { id: c.id, checked: Boolean(s.checked[c.i]), value: s.values[c.i] }); };
      if (c.kind === 'checkbox' && (!a || a === 'toggle')) { s.checked[c.i] = !s.checked[c.i]; change(); return; }
      if (c.kind === 'radio' || c.kind === 'tab') {
        // (one of its name — a radio — or of its group — a tab — is on)
        for (const o of CFG.controls) if (o !== c && o.kind === c.kind && (c.kind === 'radio' ? o.name && o.name === c.name : o.group === c.group)) s.checked[o.i] = false;
        s.checked[c.i] = true; change();
      }
      if (a.startsWith('page:')) { goPage(p, s, pageIdx(a.slice(5)), true); return; }
      if (a.startsWith('open:')) { goPage(p, s, pageIdx(a.slice(5)), false); return; }
      if (a === 'back') { back(p, s); return; }
      if (a === 'close') { close(p); return; }
      if (a === 'toggle') { s.checked[c.i] = !s.checked[c.i]; change(); return; }
      if (a.startsWith('cmd:')) { io.run(p, a.slice(4)); io.emit(p, 'click', { id: c.id }); return; }
      if (a.startsWith('set:')) { const [k, v] = a.slice(4).split('='); s.shows[k] = v !== '0' && v !== 'false'; io.emit(p, 'click', { id: c.id }); return; }
      if (a.startsWith('event:')) { io.emit(p, 'event', { name: a.slice(6), id: c.id }); return; }
      if (c.kind === 'radio' || c.kind === 'tab') return;
      if (c.kind === 'text') { io.say(p, `「${c.label || c.id}」: /${ns}:t <文字> で入力`); return; }
      io.emit(p, 'click', { id: c.id });
    }
    function back(p, s) { if (s.history.length) goPage(p, s, s.history.pop(), false); else close(p); }
    function adjust(p, s, c, steps) {
      const step = Number(c.step) > 0 ? Number(c.step) : 1, lo = Number(c.min) || 0, hi = Number.isFinite(Number(c.max)) ? Number(c.max) : 100;
      const v = clamp((s.values[c.i] || 0) + steps * step, lo, hi);
      if (v !== s.values[c.i]) { s.values[c.i] = v; keep(p, s); io.emit(p, 'change', { id: c.id, value: v }); }
    }
    function tick() {
      for (const p of io.players()) {
        const s = st(p);
        s.tick++;
        if (!s.open) continue;
        const smp = io.sample(p);
        if (!smp) continue;
        const focusedBefore = ctlById(s.ctl.state.focus);
        // (a slider in focus takes A and D itself, as a range input takes the arrow keys: W and S still move away from it)
        let move = smp.move;
        if (focusedBefore && focusedBefore.kind === 'slider' && move && Math.abs(move.x) > 0.35 && Math.abs(move.x) >= Math.abs(move.y)) {
          const dir = move.x > 0 ? -1 : 1;   // (+x is left in the move input)
          if (!s.slide || s.tick >= s.slide) { adjust(p, s, focusedBefore, dir); s.slide = s.tick + (s.slideHeld ? 3 : 8); s.slideHeld = true; }
          move = { x: 0, y: 0 };
        } else { s.slide = 0; s.slideHeld = false; }
        const out = s.ctl.step({ tick: s.tick, rot: smp.rot, move, jump: smp.jump, sneak: smp.sneak, slot: smp.slot, swings: smp.swings || 0, uses: smp.uses || 0, mode: smp.mode });
        for (const a of out.actions) if (a.type === 'setRotation') io.setRotation(p, a.rotation);
        let wheeled = false;
        for (const e of out.events) {
          if (e.type === 'pointer') s.via = 'pointer';
          else if (e.type === 'nav' || e.type === 'key') s.via = 'keys';
          else if (e.type === 'down' && e.button === 'primary') s.pressT = e.target;
          else if (e.type === 'up' && e.button === 'primary') s.pressT = null;
          else if (e.type === 'click' && e.button === 'primary') activate(p, s, ctlById(e.target));
          else if (e.type === 'back' || (e.type === 'click' && e.button === 'secondary')) { back(p, s); if (!s.open) break; }
          else if (e.type === 'wheel') {
            const f = ctlById(s.ctl.state.focus), slots = CFG.controls.filter((c) => c.slot && (c.page === s.page || c.page < 0));
            // (a slider in focus takes one notch of the wheel — one slot either way in a tick — and that slot is not chosen; a
            //  bigger change is a number key: the slot's control is)
            if (f && f.kind === 'slider' && Math.abs(e.delta) === 1) { adjust(p, s, f, -e.delta); wheeled = true; }
            else if (!slots.length) {
              // (no control on a slot: the wheel is Tab and Shift+Tab — the next one in the page's order)
              const t = targetsOf(s);
              if (t.length) { const i = Math.max(0, t.findIndex((x) => x.id === s.ctl.state.focus)), n = t[((i + e.delta) % t.length + t.length) % t.length]; s.ctl.focus(n.id); s.via = 'keys'; }
            }
          } else if (e.type === 'slot' && !wheeled) {
            const c = CFG.controls.find((x) => x.slot === e.index + 1 && (x.page === s.page || x.page < 0) && !x.disabled);
            if (c) { s.ctl.focus(c.id); s.via = 'keys'; if (c.kind === 'tab') activate(p, s, c); }
          }
        }
        if (s.open) sync(p, s);
      }
    }
    /** /scriptevent <ns>:<verb> … — open [page] · close · page <id> · set <prop> <value> · show <prop> 0|1 · value <prop> <n>
     *  · sens <units a degree> · focus <id>; returns '' or why not */
    function command(p, verb, args) {
      const s = st(p);
      if (verb === 'open') { open(p, args[0]); return ''; }
      if (verb === 'close') { close(p); return ''; }
      if (verb === 'page') { if (!s.open) open(p, args[0]); else goPage(p, s, pageIdx(args[0]), true); return ''; }
      if (verb === 'show') { s.shows[args[0]] = args[1] !== '0'; sync(p, s); return ''; }
      if (verb === 'set' || verb === 'value') {
        const name = args[0], v = Number(args[1]);
        if (!Number.isFinite(v)) return `${ns}: ${verb} <名前> <数>`;
        let hit = false;
        for (const d of CFG.dynamic || []) if (d.prop === name) { hit = true; if (d.kind === 'number') s.numbers[d.i] = v; else if (d.kind === 'gauge') s.values[`d${d.i}`] = v; else if (d.kind === 'show') s.shows[name] = v !== 0; }
        for (const c of CFG.controls) if (c.prop === name || c.id === name) { hit = true; if (c.kind === 'slider') s.values[c.i] = v; else if (c.checked !== null && c.checked !== undefined) s.checked[c.i] = v !== 0; }
        if (!hit) return `${ns}: ${name} という値はありません`;
        sync(p, s); return '';
      }
      if (verb === 'sens') { const v = Number(args[0]); if (!(v > 0 && v < 50)) return `${ns}: sens <0.1…50>`; s.ctl.cfg.sens = v; try { io.save && io.save(p, `${ns}:sens`, v); } catch (e) { /* (kept for now) */ } return ''; }
      if (verb === 'focus') { if (ctlById(args[0])) { s.ctl.focus(args[0]); s.via = 'keys'; sync(p, s); return ''; } return `${ns}: ${args[0]} という操作できる物はありません`; }
      if (verb === 'text') { const c = ctlById(s.ctl.state.focus); const text = args.join(' '); if (c && c.kind === 'text') { s.values[c.i] = text; io.say(p, `${c.label || c.id}: ${text}`); io.emit(p, 'change', { id: c.id, value: text }); return ''; } return `${ns}: 文字を入れる欄に焦点がありません`; }
      return `${ns}: 知らない命令 ${verb}（open close page show set value sens focus text）`;
    }
    /** a player who left: what the engine held for them is dropped (open or not; their choices stay in the world) */
    function forget(p) { players.delete(p.id); }
    return { open, close, tick, command, forget, state: st, isOpen: (p) => st(p).open };
  };
const GS = globalThis.GeoUIScreen;
// how the body is kept still while the move input is read (SPEC.md 「入力」): free — free: put back each tick;
// speed: the movement attribute 0 too; lock: the Movement permission off (a client may then stop sending the move input)
const HOLD = "free";
const held = new Map(), pend = new Map();
const engine = createScreens(CFG, {
  players: () => world.getAllPlayers(),
  sample: (p) => {
    if (!p.isValid) return null;
    const i = p.inputInfo, q = pend.get(p.id) || { swings: 0, uses: 0 }; pend.set(p.id, { swings: 0, uses: 0 });
    const h = held.get(p.id);
    if (h && HOLD !== 'lock' && Math.hypot(p.location.x - h.loc.x, p.location.z - h.loc.z) > 0.05) { try { p.teleport(h.loc, { keepVelocity: false }); } catch (e) { /* (the next tick) */ } }
    return { rot: p.getRotation(), move: i.getMovementVector(), jump: i.getButtonState(InputButton.Jump) === ButtonState.Pressed, sneak: i.getButtonState(InputButton.Sneak) === ButtonState.Pressed,
      slot: p.selectedSlotIndex, mode: String(i.lastInputModeUsed), swings: q.swings, uses: q.uses };
  },
  setProp: (p, name, v) => { if (p.isValid) p.setProperty(name, v); },
  freeze: (p, on) => {
    if (!p.isValid) return;
    if (on) {
      const rot = p.getRotation();
      held.set(p.id, { loc: { x: p.location.x, y: p.location.y, z: p.location.z } });
      try { p.camera.setCamera('minecraft:free', { location: p.getHeadLocation(), rotation: rot }); } catch (e) { console.warn(e); }
      if (HOLD === 'lock') p.inputPermissions.setPermissionCategory(InputPermissionCategory.Movement, false);
      // (the speed kept in the world too: a player who leaves while it is 0 gets it back when they come back)
      if (HOLD === 'speed') { const m = p.getComponent('minecraft:movement'); if (m) { held.get(p.id).speed = m.currentValue; p.setDynamicProperty(CFG.ns + ':speed', m.currentValue); m.setCurrentValue(0); } }
      // (the HUD's own parts hidden but the touch controls — a phone's jump, sneak and move pad are this page's Enter, Escape and
      //  arrows — and the hotbar when a control is on a slot)
      const hide = ['PaperDoll', 'Armor', 'ToolTips', 'Crosshair', 'Health', 'ProgressBar', 'Hunger', 'AirBubbles', 'HorseHealth', 'StatusEffects', 'ItemText'];
      if (!CFG.controls.some((c) => c.slot)) hide.push('Hotbar');
      try { p.onScreenDisplay.setHudVisibility(HudVisibility.Hide, hide.map((k) => HudElement[k]).filter((v) => v !== undefined)); } catch (e) { /* (an older game) */ }
    } else {
      const h = held.get(p.id);
      try { p.camera.clear(); } catch (e) { console.warn(e); }
      if (HOLD === 'lock') p.inputPermissions.setPermissionCategory(InputPermissionCategory.Movement, true);
      if (HOLD === 'speed' && h && typeof h.speed === 'number') { const m = p.getComponent('minecraft:movement'); if (m) m.setCurrentValue(h.speed); p.setDynamicProperty(CFG.ns + ':speed', undefined); }
      try { p.onScreenDisplay.resetHudElementsVisibility(); } catch (e) { /* (an older game) */ }
      held.delete(p.id);
    }
  },
  setRotation: (p, rot) => { if (p.isValid) p.setRotation(rot); },
  // (each thing that happens: to another pack as a scriptevent, and a line in the server's log — GEOUI <name> <json>)
  // (on_<name>, never a command's own name: the pack listens to its namespace, and an event named like a command would come back
  //  to it as that command — open → on_open, not open again)
  emit: (p, name, data) => { const j = JSON.stringify(Object.assign({ player: p.name }, data)); if (CFG.log !== false) console.warn('GEOUI ' + name + ' ' + j); try { system.sendScriptEvent(CFG.ns + ':on_' + name, j); } catch (e) { /* (no listener) */ } },
  run: (p, command) => { if (p.isValid) p.runCommand(command); },
  say: (p, text) => { if (p.isValid) p.onScreenDisplay.setActionBar(text); },
  load: (p, key) => (p.isValid ? p.getDynamicProperty(key) : undefined),
  save: (p, key, v) => { if (p.isValid) p.setDynamicProperty(key, v); },
}, GS);
world.afterEvents.playerSwingStart.subscribe((e) => { const q = pend.get(e.player.id) || { swings: 0, uses: 0 }; if (String(e.swingSource) === 'Attack') q.swings++; pend.set(e.player.id, q); });
world.afterEvents.itemUse.subscribe((e) => { const q = pend.get(e.source.id) || { swings: 0, uses: 0 }; q.uses++; pend.set(e.source.id, q); });
system.runInterval(() => engine.tick(), 1);
system.afterEvents.scriptEventReceive.subscribe((e) => {
  const verb = e.id.slice(CFG.ns.length + 1);
  if (!['open', 'close', 'page', 'show', 'set', 'value', 'sens', 'focus', 'text'].includes(verb)) return;
  const words = String(e.message).trim().split(/\s+/).filter(Boolean);
  const targets = e.sourceEntity instanceof Player ? [e.sourceEntity] : world.getAllPlayers();
  for (const p of targets) { const why = engine.command(p, verb, words); if (why) console.warn(why); }
}, { namespaces: [CFG.ns] });
system.beforeEvents.startup.subscribe((e) => {
  const reg = e.customCommandRegistry, who = (o) => { const s = o.initiator ?? o.sourceEntity; return s instanceof Player ? s : undefined; };
  reg.registerCommand({ name: CFG.ns + ':open', description: 'GeoUI page: open it', permissionLevel: CommandPermissionLevel.Any, optionalParameters: [{ name: 'page', type: CustomCommandParamType.String }] }, (o, page) => {
    const p = who(o); if (!p) return { status: CustomCommandStatus.Failure, message: 'players only' };
    system.run(() => { if (p.isValid) engine.open(p, page); });
    return { status: CustomCommandStatus.Success };
  });
  reg.registerCommand({ name: CFG.ns + ':t', description: 'GeoUI page: type into the text field in focus', permissionLevel: CommandPermissionLevel.Any, mandatoryParameters: [{ name: 'text', type: CustomCommandParamType.String }] }, (o, text) => {
    const p = who(o); if (!p) return { status: CustomCommandStatus.Failure, message: 'players only' };
    system.run(() => { if (p.isValid) { const why = engine.command(p, 'text', [text]); if (why) p.sendMessage(why); } });
    return { status: CustomCommandStatus.Success };
  });
});
// (a player who leaves with the page open comes back to the world as it was: closed — the camera, the HUD, the move input and
//  the speed given back, and nothing of the old page left in the engine)
world.afterEvents.playerSpawn.subscribe((e) => {
  if (!e.initialSpawn) return;
  const p = e.player;
  engine.forget(p); held.delete(p.id); pend.delete(p.id);
  system.run(() => {
    if (!p.isValid) return;
    try { p.camera.clear(); } catch (x) { /* (none) */ }
    try { p.onScreenDisplay.resetHudElementsVisibility(); } catch (x) { /* (an older game) */ }
    if (HOLD === 'lock') p.inputPermissions.setPermissionCategory(InputPermissionCategory.Movement, true);
    const speed = p.getDynamicProperty(CFG.ns + ':speed');
    if (typeof speed === 'number') { const m = p.getComponent('minecraft:movement'); if (m) m.setCurrentValue(speed); p.setDynamicProperty(CFG.ns + ':speed', undefined); }
    p.setProperty(CFG.ns + ':pg', 0);
  });
});
