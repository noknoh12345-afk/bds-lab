import { world, system, Player } from '@minecraft/server';
import { ActionFormData } from '@minecraft/server-ui';
import { registerSkinCommands } from './commands.js';
import { installLogRules } from './log_rules.js';

const logRules = installLogRules(world, system);

// A slot identifies a live player, while epoch prevents stale temp values from
// impersonating a new occupant. A skin match cannot be verified server-side.
const MAX_PLAYERS = 100;
const MAX_EPOCH = 1000000;
const slots = new Map(); // id -> { slot, epoch }
const active = new Map(); // imitator id -> target id
const selectionTokens = new Map(); // each request has distinct cancellation identity
const verified = new Map(); // imitator id -> committed slot/epoch; pending selections are excluded
const pending = new Set();
const recovering = new Map(); // id -> recovery object; retained across death screen
// Immediate leave marker prevents a delayed death/spawn event from reusing a
// prior connection's visual generation before asynchronous cleanup runs.
const retiredRecords = new WeakSet();
const resetRetries = new Set(); // property reset failures are retried without claiming success
const PROP = { original: 'mimic:original_name_tag', written: 'mimic:written_name_tag', id: 'mimic:active_target_id', name: 'mimic:active_target_name' };

function tr(key, ...args) { const value = { translate: 'skin_changer.' + key }; if (args.length) value.with = args.map(String); return value; }
function tell(p, msg) { try { p.sendMessage({ rawtext: [{ text: '§b[Skin Changer]§r ' }, msg] }); } catch (_) {} }
function online() { return world.getAllPlayers(); }
function current(id) { return online().find(p => p.id === id); }
function nextEpoch() {
  // A fresh world's random starting range makes a collision with temp state
  // left by another world less likely. It is not a uniqueness guarantee.
  // Existing counters are never randomized or reset, preserving the journal.
  const stored = world.getDynamicProperty('mimic:epoch_counter');
  const previous = stored === undefined ? Math.floor(Math.random() * 500000) : stored;
  if (typeof previous !== 'number' || !Number.isInteger(previous) || previous < 0 || previous >= MAX_EPOCH)
    throw new Error('epoch counter invalid or exhausted');
  const next = previous + 1;
  world.setDynamicProperty('mimic:epoch_counter', next);
  return next;
}
function write(p, key, value) { p.setProperty('mimic:' + key, value); }
function read(p, key) { return p.getProperty('mimic:' + key); }
function removeDyn(p, key) { try { p.setDynamicProperty(key, undefined); } catch (_) {} }
function clearSelection(p) {
  const previousCommitted = verified.get(p.id);
  let propertyReset = true;
  try { write(p, 'chat_ready', false); } catch (e) { propertyReset = false; console.warn(`[Skin Changer] chat_ready reset: ${String(e)}`); }
  try { write(p, 'target', 0); } catch (e) { propertyReset = false; console.warn(`[Skin Changer] target reset: ${String(e)}`); }
  try { write(p, 'target_epoch', 0); } catch (e) { propertyReset = false; console.warn(`[Skin Changer] target_epoch reset: ${String(e)}`); }
  if (propertyReset) { resetRetries.delete(p.id); removeDyn(p, 'mimic:pending_reset'); }
  else { resetRetries.add(p.id); try { p.setDynamicProperty('mimic:pending_reset', true); } catch (_) {} }
  active.delete(p.id); verified.delete(p.id); selectionTokens.delete(p.id);
  // Preserve the recovery journal on errors; never override another add-on's later change.
  let restoredOrNotOurs = false;
  try {
    const journalOriginal = p.getDynamicProperty(PROP.original), journalWritten = p.getDynamicProperty(PROP.written);
    const original = typeof journalOriginal === 'string' ? journalOriginal : previousCommitted?.originalTag;
    const written = typeof journalWritten === 'string' ? journalWritten : previousCommitted?.targetName;
    if (typeof original === 'string' && typeof written === 'string' && p.nameTag === written) p.nameTag = original;
    restoredOrNotOurs = true;
  } catch (e) { console.warn(`[Skin Changer] tag restore failed; journal retained for next spawn: ${String(e)}`); }
  if (restoredOrNotOurs) { removeDyn(p, PROP.original); removeDyn(p, PROP.written); }
  else { resetRetries.add(p.id); try { p.setDynamicProperty('mimic:pending_reset', true); } catch (_) {} }
  removeDyn(p, PROP.id); removeDyn(p, PROP.name);
  return propertyReset && restoredOrNotOurs;
}
function cancelFollowers(targetId, message) {
  for (const [id, followed] of [...active]) {
    if (followed !== targetId) continue;
    const p = current(id);
    if (p) { const ok = clearSelection(p); tell(p, ok ? message : tr('msg.reset_retry')); }
    else { active.delete(id); verified.delete(id); selectionTokens.delete(id); }
  }
}
function clearOffline() {
  const players = online(), ids = new Set(players.map(p => p.id));
  for (const id of [...slots.keys()]) {
    if (ids.has(id) || recovering.has(id)) continue;
    slots.delete(id);
    active.delete(id); verified.delete(id); selectionTokens.delete(id);
    cancelFollowers(id, tr('msg.target_left'));
  }
  return players;
}
function allocate(p) {
  if (slots.has(p.id)) return slots.get(p.id);
  const used = new Set([...slots.values()].map(s => s.slot));
  let slot = 1; while (slot <= MAX_PLAYERS && used.has(slot)) slot++;
  if (slot > MAX_PLAYERS) return undefined;
  const epoch = nextEpoch();
  try { write(p, 'target', 0); write(p, 'target_epoch', 0); write(p, 'epoch', epoch); write(p, 'slot', slot); }
  catch (e) { try { write(p, 'slot', 0); } catch (_) {} throw e; }
  const record = { slot, epoch };
  slots.set(p.id, record);
  return record;
}
function syncPlayers() {
  const players = clearOffline();
  for (const p of players) {
    let persistedReset = false;
    try { persistedReset = p.getDynamicProperty('mimic:pending_reset') === true; } catch (_) {}
    if (resetRetries.has(p.id) || persistedReset) { if (!clearSelection(p)) continue; tell(p, tr('msg.retry_done')); }
    if (slots.has(p.id)) continue;
    // A persisted journal belongs to this pack. Reset old visual state on reload.
    if (!clearSelection(p)) continue;
    // Non-allocated players must never retain an old sender identity, including
    // when >100 players join after a restart. On failure, retry on the next pass.
    try { write(p, 'slot', 0); write(p, 'epoch', 0); }
    catch (e) { console.warn(`[Skin Changer] slot reset failed; retry next pass: ${String(e)}`); continue; }
    try { allocate(p); } catch (e) { console.warn(`[Skin Changer] allocate: ${String(e)}`); }
  }
  // A scheduler failure cannot be repaired by that same failed scheduler.
  // The already-running periodic sync is an independent recovery path.
  for (const [id, state] of [...recovering]) {
    if (state.needsKick && typeof state.kick === 'function' && recovering.get(id) === state) state.kick();
  }
  // Only validate selections committed after the next-tick sync check.
  for (const [id, expected] of [...verified]) {
    const p = players.find(x => x.id === id), t = players.find(x => x.id === expected.targetId);
    if (recovering.has(id) || recovering.has(expected.targetId)) continue;
    try {
      if (!p || !t || active.get(id) !== expected.targetId ||
          read(p, 'target') !== expected.slot || read(p, 'target_epoch') !== expected.epoch ||
          read(t, 'slot') !== expected.slot || read(t, 'epoch') !== expected.epoch) {
        if (p) { const ok = clearSelection(p); tell(p, ok ? tr('msg.sync_reset') : tr('msg.sync_reset_failed')); }
        else { active.delete(id); verified.delete(id); selectionTokens.delete(id); }
      }
    } catch (e) {
      if (p) { const ok = clearSelection(p); tell(p, ok ? tr('msg.sync_invalid_reset') : tr('msg.sync_invalid_failed')); }
      else { active.delete(id); verified.delete(id); selectionTokens.delete(id); }
    }
  }
  return players;
}
// Preserve a connection-scoped record when this exact player dies. A respawn
// may reuse this visual generation only while that same record is still live.
// Leaving or an initial spawn retires the record; slot reuse always allocates a
// new generation. Texture-handle freshness remains outside server visibility.
function noteDeath(p) {
  if (!p) return;
  const id = p.id, record = slots.get(id);
  if (!record || retiredRecords.has(record)) return;
  recovering.set(id, { phase: 'dead', record });
}
function ensureNameTag(p, expected, target) {
  const original = p.getDynamicProperty(PROP.original);
  const written = p.getDynamicProperty(PROP.written);
  // A new player actor may reset nameTag and may lose dynamic properties.
  // Restore the old journal without treating an unrelated tag as ours.
  const savedOriginal = typeof original === 'string' ? original : expected.originalTag;
  if (typeof savedOriginal !== 'string') throw new Error('original name-tag journal missing');
  const tag = p.nameTag;
  if (tag !== target.name && tag !== savedOriginal && tag !== p.name)
    throw new Error('name tag changed externally');
  if (written !== undefined && written !== target.name) throw new Error('name-tag journal mismatch');
  p.setDynamicProperty(PROP.original, savedOriginal);
  p.setDynamicProperty(PROP.written, target.name);
  p.setDynamicProperty(PROP.id, target.id);
  p.setDynamicProperty(PROP.name, target.name);
  p.nameTag = target.name;
}
function resumeRespawn(p, deathRecord) {
  const id = p.id, previous = slots.get(id);
  if (!previous) { recovering.delete(id); return; }
  // Matching the death record and the unchanged slot ties reuse to this live
  // connection. Preserve the old generation to avoid invalidating the already
  // received peer-side appearance across respawn. Unknown lineage uses a fresh
  // generation and clears the old visual match as before.
  const sameDeath = !retiredRecords.has(previous) && !!deathRecord && deathRecord === previous;
  const fresh = sameDeath ? previous : { slot: previous.slot, epoch: nextEpoch() };
  slots.set(id, fresh);
  const state = { phase: 'repair', attempts: 0, needsKick: false, warnedScheduler: false };
  recovering.set(id, state);
  // Change only selections that still refer to this exact player identity.
  for (const [follower, expected] of verified) {
    if (expected.targetId === id && active.get(follower) === id) expected.epoch = fresh.epoch;
  }
  // Try immediately from the unrestricted playerSpawn after-event. Properties
  // still apply on the following tick; retry/verification must respect that.
  function scheduleTask(callback, delay) {
    if (recovering.get(id) !== state) return;
    try {
      system.runTimeout(callback, delay);
      state.needsKick = false;
      state.warnedScheduler = false;
    } catch (error) {
      state.needsKick = true;
      console.warn(`[Skin Changer] respawn scheduling failed; periodic retry: ${String(error)}`);
      if (!state.warnedScheduler) {
        state.warnedScheduler = true;
        tell(p, tr('msg.respawn_retry'));
      }
    }
  }
  function schedule() { scheduleTask(repair, 1); }
  function recoveryError(error) {
    console.warn(`[Skin Changer] respawn recovery failed; retrying same generation: ${String(error)}`);
    ++state.attempts;
    scheduleTask(repair, state.attempts < 50 ? 1 : 20);
  }
  function repair() {
    if (recovering.get(id) !== state) return;
    try { repairAttempt(); } catch (error) { recoveryError(error); }
  }
  state.kick = () => {
    if (recovering.get(id) !== state || !state.needsKick) return;
    state.needsKick = false;
    repair();
  };
  function repairAttempt() {
    const live = current(id), own = slots.get(id);
    if (!live || !own) { ++state.attempts; scheduleTask(repair, state.attempts < 50 ? 1 : 20); return; }
    let failed = false;
    const writeTick = system.currentTick;
    try { write(live, 'slot', own.slot); write(live, 'epoch', own.epoch); }
    catch (e) { failed = true; console.warn(`[Skin Changer] respawn slot restore: ${String(e)}`); }
    // Restore the respawned player's own disguise if still selected.
    const selfExpected = verified.get(id), targetId = active.get(id);
    if (selfExpected && selfExpected.targetId === targetId) {
      const target = current(targetId), rec = slots.get(targetId);
      if (target && rec) {
        try {
          selfExpected.slot = rec.slot; selfExpected.epoch = rec.epoch;
          write(live, 'target', rec.slot); write(live, 'target_epoch', rec.epoch);
          ensureNameTag(live, selfExpected, target);
          write(live, 'chat_ready', true);
        } catch (e) { failed = true; console.warn(`[Skin Changer] respawn self restore: ${String(e)}`); }
      } else if (!recovering.has(targetId)) failed = true;
    }
    // Update each online follower to the new generation. A simultaneously
    // respawned, still-recovering follower also needs this update: otherwise
    // recovery order can leave it holding a previous generation indefinitely.
    // Dead followers repair themselves when they subsequently respawn.
    for (const [follower, expected] of verified) {
      if (expected.targetId !== id || active.get(follower) !== id || recovering.get(follower)?.phase === 'dead') continue;
      const f = current(follower);
      if (!f) continue;
      try { expected.slot = own.slot; expected.epoch = own.epoch; write(f, 'target', own.slot); write(f, 'target_epoch', own.epoch); }
      catch (e) { if (!recovering.has(follower)) failed = true; console.warn(`[Skin Changer] respawn follower restore: ${String(e)}`); }
    }
    function verify() {
      if (recovering.get(id) !== state) return;
      try { verifyAttempt(); } catch (error) { recoveryError(error); }
    }
    function verifyAttempt() {
      // runTimeout(1) may execute in this tick in some event phases. Never
      // compare a just-written entity property before the following tick.
      if (Number.isFinite(writeTick) && system.currentTick <= writeTick) {
        scheduleTask(verify, 1); return;
      }
      let ok = !failed;
      try {
        if (read(live, 'slot') !== own.slot || read(live, 'epoch') !== own.epoch) ok = false;
        const expected = verified.get(id), targetId = active.get(id);
        if (expected && expected.targetId === targetId && !recovering.has(targetId)) {
          const target = current(targetId), rec = slots.get(targetId);
          if (!target || !rec || read(live, 'target') !== rec.slot || read(live, 'target_epoch') !== rec.epoch ||
              read(live, 'chat_ready') !== true || live.nameTag !== target.name) ok = false;
        }
        for (const [follower, e] of verified) {
          if (e.targetId !== id || active.get(follower) !== id || recovering.has(follower)) continue;
          const f = current(follower);
          if (f && (read(f, 'target') !== own.slot || read(f, 'target_epoch') !== own.epoch)) ok = false;
        }
      } catch (_) { ok = false; }
      if (ok) { recovering.delete(id); return; }
      if (++state.attempts < 50) schedule();
      else {
        if (state.phase !== 'stalled') tell(live, tr('msg.respawn_stalled'));
        state.phase = 'stalled'; scheduleTask(repair, 20);
      }
    }
    scheduleTask(verify, 1);
  }
  repair();
}
function handleInitialSpawn(p) {
  // Initial join is a new session, not a death respawn. Keep existing safe
  // cleanup behavior for stale state from a prior connection.
  recovering.delete(p.id);
  cancelFollowers(p.id, tr('msg.target_rejoined'));
  clearSelection(p);
  slots.delete(p.id);
  try { write(p, 'slot', 0); write(p, 'epoch', 0); } catch (_) {}
}
function commitTag(p, target) {
  const original = p.getDynamicProperty(PROP.original), written = p.getDynamicProperty(PROP.written);
  if (typeof original === 'string' && typeof written === 'string' && p.nameTag !== written)
    throw new Error('name tag changed externally');
  if (typeof original !== 'string') p.setDynamicProperty(PROP.original, p.nameTag);
  // Journal before the mutation; on a failure recovery compares the written tag.
  p.setDynamicProperty(PROP.written, target.name);
  p.setDynamicProperty(PROP.id, target.id);
  p.setDynamicProperty(PROP.name, target.name);
  p.nameTag = target.name;
}
function begin(p, target) {
  const own = slots.get(p.id), theirs = slots.get(target.id);
  if (!own || !theirs) { tell(p, tr('msg.capacity')); return; }
  if (!clearSelection(p)) return tell(p, tr('msg.previous_reset_failed'));
  try { write(p, 'target_epoch', theirs.epoch); write(p, 'target', theirs.slot); }
  catch (e) { clearSelection(p); tell(p, tr('msg.change_failure', String(e))); return; }
  active.set(p.id, target.id);
  const selectionToken = {}; selectionTokens.set(p.id, selectionToken);
  let pendingRepairs = 0;
  function finalizeSelection() {
    try {
      const liveP = current(p.id), liveT = current(target.id);
      if (active.get(p.id) !== target.id || selectionTokens.get(p.id) !== selectionToken) return; // reset or newer selection
      // Selection initiated just before a death should commit as soon as the
      // affected actor's recovery completes, rather than waiting one second.
      if (recovering.has(p.id) || recovering.has(target.id)) { system.runTimeout(finalizeSelection, 1); return; }
      const targetRecord = slots.get(target.id);
      if (liveP && liveT && targetRecord && targetRecord.slot === theirs.slot &&
          (targetRecord.epoch !== theirs.epoch || read(liveP, 'target') !== targetRecord.slot ||
           read(liveP, 'target_epoch') !== targetRecord.epoch)) {
        if (++pendingRepairs > 50) throw new Error('selection synchronization failed');
        theirs.epoch = targetRecord.epoch;
        write(liveP, 'target', theirs.slot); write(liveP, 'target_epoch', theirs.epoch);
        system.runTimeout(finalizeSelection, 1); return;
      }
      if (!liveP || !liveT || active.get(p.id) !== target.id || !targetRecord ||
          targetRecord.slot !== theirs.slot || targetRecord.epoch !== theirs.epoch ||
          read(liveP, 'target') !== theirs.slot || read(liveP, 'target_epoch') !== theirs.epoch ||
          read(liveT, 'slot') !== theirs.slot || read(liveT, 'epoch') !== theirs.epoch)
        throw new Error('target or sync state changed');
      commitTag(liveP, liveT);
      // Only allow chat routing after identity and nameTag commit.
      write(liveP, 'chat_ready', true);
      verified.set(liveP.id, { targetId: liveT.id, slot: theirs.slot, epoch: theirs.epoch, originalTag: liveP.getDynamicProperty(PROP.original), targetName: liveT.name });
      tell(liveP, tr('msg.changed', liveT.name));
    } catch (e) {
      const liveP = current(p.id);
      if (liveP && active.get(p.id) === target.id && selectionTokens.get(p.id) === selectionToken) { const ok = clearSelection(liveP); tell(liveP, ok ? tr('msg.change_aborted', String(e)) : tr('msg.change_abort_retry', String(e))); }
    }
  }
  system.runTimeout(finalizeSelection, 2);
}
async function showMenu(p) {
  if (pending.has(p.id)) return;
  pending.add(p.id);
  try {
    const players = syncPlayers(), own = slots.get(p.id);
    if (!own) return tell(p, tr('msg.capacity'));
    // Freeze the list for the lifetime of the menu: pages must not shift under
    // a player when someone joins or leaves. The record is rechecked on select.
    const choices = players.filter(q => q.id !== p.id && slots.has(q.id)).map(q => {
      const record = slots.get(q.id);
      return { id: q.id, name: q.name, slot: record.slot, epoch: record.epoch };
    });
    const perPage = 20, pageCount = Math.max(1, Math.ceil(choices.length / perPage));
    let page = 0;
    while (true) {
      const actor = current(p.id);
      if (!actor || slots.get(p.id) !== own || retiredRecords.has(own)) return; // stale/rejoined menu owner
      const form = new ActionFormData().title(tr('ui.title')).body({rawtext: [tr('ui.body'), {text: '\n'}, tr('ui.page', page + 1, pageCount)]});
      const actions = [{kind: 'reset'}];
      form.button(tr('ui.reset'));
      for (const choice of choices.slice(page * perPage, (page + 1) * perPage)) {
        actions.push({kind: 'player', choice}); form.button(choice.name);
      }
      if (page > 0) { actions.push({kind: 'previous'}); form.button(tr('ui.previous')); }
      if (page + 1 < pageCount) { actions.push({kind: 'next'}); form.button(tr('ui.next')); }
      const result = await form.show(actor);
      if (result.canceled || result.selection === undefined) {
        if (result.cancelationReason === 'UserBusy') tell(actor, tr('msg.ui_busy'));
        return;
      }
      const liveActor = current(p.id);
      if (!liveActor || slots.get(p.id) !== own || retiredRecords.has(own)) return;
      const action = actions[result.selection];
      if (!action) return;
      if (action.kind === 'reset') {
        const ok = clearSelection(liveActor);
        return tell(liveActor, ok ? tr('msg.reset_ok') : tr('msg.reset_retry'));
      }
      if (action.kind === 'previous' || action.kind === 'next') {
        page += action.kind === 'next' ? 1 : -1;
        // Let the previous form close before opening the next one.
        await new Promise(resolve => system.runTimeout(resolve, 1));
        continue;
      }
      const chosen = action.choice, target = current(chosen.id), record = slots.get(chosen.id);
      if (!target || target.id === liveActor.id || !record || retiredRecords.has(record) || record.slot !== chosen.slot || record.epoch !== chosen.epoch)
        return tell(liveActor, tr('msg.target_unavailable'));
      begin(liveActor, target);
      return;
    }
  } catch (e) { tell(p, tr('msg.ui_error', String(e))); }
  finally { pending.delete(p.id); }
}

world.afterEvents.itemUse.subscribe(e => {
  if (e.itemStack?.typeId === 'mimic:selector' && e.source instanceof Player) system.runTimeout(() => void showMenu(e.source), 3);
});
try { world.afterEvents.entityDie.subscribe(e => {
  try { if (e.deadEntity?.typeId === 'minecraft:player') noteDeath(e.deadEntity); }
  catch (err) { console.warn(`[Skin Changer] death: ${String(err)}`); }
}); } catch (_) { console.warn('[Skin Changer] death event unavailable; respawn continuity may fail'); }
world.afterEvents.playerSpawn.subscribe(e => {
  // Mark immediately to prevent periodic validation in the same tick from
  // seeing a freshly-reset property as corruption.
  const id = e.player.id;
  // A leave already observed always takes the new-connection path even if a
  // late/unusual respawn event says otherwise. This prevents cross-session
  // cache reuse while the asynchronous leave cleanup is still queued.
  const newConnection = e.initialSpawn || retiredRecords.has(slots.get(id));
  const deathState = recovering.get(id);
  const deathRecord = !newConnection && deathState?.phase === 'dead' && deathState.record === slots.get(id) ? deathState.record : undefined;
  const spawnState = !newConnection && slots.has(id) ? { phase: 'spawn', attempts: 0, needsKick: false, warnedScheduler: false } : undefined;
  if (spawnState) recovering.set(id, spawnState);
  const restore = () => { try {
    // A later death, disconnect, or new spawn invalidates a stale retry.
    if (spawnState && recovering.get(id) !== spawnState) return;
    if (newConnection) handleInitialSpawn(e.player); else resumeRespawn(e.player, deathRecord);
    syncPlayers();
  } catch (err) {
    console.warn(`[Skin Changer] spawn: ${String(err)}`);
    if (spawnState && recovering.get(id) === spawnState) {
      ++spawnState.attempts;
      try {
        system.runTimeout(restore, spawnState.attempts < 50 ? 1 : 20);
        spawnState.needsKick = false;
        spawnState.warnedScheduler = false;
      } catch (scheduleError) {
        spawnState.needsKick = true;
        console.warn(`[Skin Changer] spawn retry scheduling failed; periodic retry: ${String(scheduleError)}`);
        if (!spawnState.warnedScheduler) {
          spawnState.warnedScheduler = true;
          tell(e.player, tr('msg.respawn_schedule'));
        }
      }
    }
  } };
  if (spawnState) spawnState.kick = () => {
    if (recovering.get(id) !== spawnState || !spawnState.needsKick) return;
    spawnState.needsKick = false;
    restore();
  };
  restore();
});
system.runInterval(() => { try { syncPlayers(); } catch (e) { console.warn(`[Skin Changer] sync: ${String(e)}`); } }, 20);

try { world.afterEvents.playerLeave.subscribe(e => { const departing = slots.get(e.playerId); if (departing) retiredRecords.add(departing); recovering.delete(e.playerId); system.run(() => { try { syncPlayers(); } catch (e) { console.warn(`[Skin Changer] leave: ${String(e)}`); } }); }); } catch (_) {}

// Integrated experimental chat; requires @minecraft/server beta.
const PREFIX = '[Skin Changer Chat]';
const MAX_LENGTH = 512;



// Shared entity properties, unlike dynamic properties, are readable from another BP.
// The slot + generation pair has to point to exactly one current player.
function resolveAlias(sender, players) {
  // Server-side readiness is set only after the main pack commits its name tag.
  if (sender.getProperty('mimic:chat_ready') !== true) return undefined;
  const target = sender.getProperty('mimic:target');
  const expectedEpoch = sender.getProperty('mimic:target_epoch');
  if (!Number.isInteger(target) || target < 1 || target > MAX_PLAYERS ||
      !Number.isInteger(expectedEpoch) || expectedEpoch < 1) return undefined;
  const candidates = players.filter(p =>
    p.getProperty('mimic:slot') === target &&
    p.getProperty('mimic:epoch') === expectedEpoch && p.id !== sender.id
  );
  if (candidates.length !== 1) return undefined;
  const targetPlayer = candidates[0];
  if (typeof targetPlayer.name !== 'string' || !targetPlayer.name || sender.nameTag !== targetPlayer.name) return undefined;
  return { id: targetPlayer.id, name: targetPlayer.name, slot: target, epoch: expectedEpoch };
}

try {
  // This signal is beta and may not exist or match this signature in other versions.
  world.beforeEvents.chatSend.subscribe(event => {
    // Fail open: if the addon cannot resolve all required fields without exceptions,
    // let Minecraft handle the original message normally.
    try {
      const sender = event.sender;
      if (event.cancel !== false) { return; }
      // The documented beta contract uses undefined for broadcasts, whether
      // the optional property is omitted or explicitly set to undefined.
      // Any other value, including an array or null, must not be rebroadcast.
      if (event.targets !== undefined) { return; }
      const message = event.message;
      if (!sender || typeof message !== 'string' || !message ||
          message.length > MAX_LENGTH || message.startsWith('/')) { return; }
      const players = world.getAllPlayers();
      if (!players.some(p => p.id === sender.id)) { return; }
      // Suppress rather than exposing the real name while either side's actor
      // is being reconstructed. The player can resend once synchronization ends.
      const followed = active.get(sender.id);
      if (followed && (recovering.has(sender.id) || recovering.has(followed))) {
        const handle = system.run(() => tell(sender, tr('msg.chat_pending')));
        try { event.cancel = true; }
        catch (error) { system.clearRun(handle); throw error; }
        return;
      }
      const alias = resolveAlias(sender, players);
      if (!alias) { return; }
      const actualName = sender.name;
      const senderId = sender.id;
      // Prepare deferred send before cancelling. If scheduling or cancellation throws,
      // cancel the task and preserve the original where the runtime allows it.
      const handle = system.run(() => {
        let displayName = actualName;
        try {
          const current = world.getAllPlayers();
          const currentSender = current.find(p => p.id === senderId);
          const currentAlias = currentSender ? resolveAlias(currentSender, current) : undefined;
          // A target whose slot was reused, left, or changed no longer qualifies.
          if (currentAlias && currentAlias.id === alias.id && currentAlias.slot === alias.slot && currentAlias.epoch === alias.epoch) {
            displayName = currentAlias.name;
          } else if (active.get(senderId) === alias.id && (recovering.has(senderId) || recovering.has(alias.id))) {
            if (currentSender) tell(currentSender, tr('msg.chat_pending'));
            return;
          }
          world.sendMessage(`<${displayName}> ${message}`);
        } catch (error) {
          // The original may already have been cancelled: never claim guaranteed delivery.
          console.warn(`${PREFIX} delivery failed; original may have been cancelled: ${String(error)}`);
          try {
            const liveSender = world.getAllPlayers().find(p => p.id === senderId);
            liveSender && tell(liveSender, tr('msg.chat_failed'));
          } catch (_) {}
        }
      });
      try { event.cancel = true; }
      catch (error) { system.clearRun(handle); throw error; }
    } catch (error) {
      console.warn(`${PREFIX} preparation failed; original retained when possible: ${String(error)}`);
    }
  });
} catch (error) {
  console.warn(`${PREFIX} unavailable or subscription failed; chat stays unchanged: ${String(error)}`);
}


// The command layer accepts selectors from Minecraft, then re-resolves IDs
// after the restricted callback before touching world state.
function showStatus(p) {
  try { tell(p, tr('msg.status_line', read(p, 'slot'), read(p, 'epoch'), read(p, 'target'), read(p, 'target_epoch'))); }
  catch (e) { tell(p, tr('msg.status_failed', String(e))); }
}
registerSkinCommands(system, world, {
  tr, tell, syncPlayers, logRules, showStatus,
  hasSlot: id => slots.has(id),
  change: (p, target) => {
    // Repeating command blocks shouldn't constantly restart an identical pending
    // or committed selection. Explicit reset always cancels it.
    if (active.get(p.id) === target.id && selectionTokens.has(p.id)) return;
    begin(p, target);
  },
  reset: p => { const success = clearSelection(p); tell(p, tr(success ? 'msg.reset_ok' : 'msg.reset_retry')); },
});
