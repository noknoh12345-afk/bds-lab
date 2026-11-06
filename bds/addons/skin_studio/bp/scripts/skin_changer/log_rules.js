// World-wide fallback for system messages whose actual player names cannot be
// rewritten by the chat event. Called once by main.js. World dynamic properties
// belong to this behavior pack and survive world restarts; no rule is modified
// before its original boolean value has been recorded.
const JOURNAL_KEY = 'mimic:log_rules_journal';
const KEYS = ['showDeathMessages', 'sendCommandFeedback', 'commandBlockOutput'];
const PREFIX = '[Skin Changer]';

export function installLogRules(world, system) {
  function load() {
    const raw = world.getDynamicProperty(JOURNAL_KEY);
    if (raw === undefined) return { version: 1, enabled: true, entries: {} };
    if (typeof raw !== 'string') throw new Error('Invalid rules journal; settings unchanged');
    let data;
    try { data = JSON.parse(raw); } catch (_) { throw new Error('Unreadable rules journal; settings unchanged'); }
    if (!data || data.version !== 1 || typeof data.enabled !== 'boolean' ||
        !data.entries || typeof data.entries !== 'object' || Array.isArray(data.entries))
      throw new Error('Invalid rules journal; settings unchanged');
    for (const name of Object.keys(data.entries)) {
      if (!KEYS.includes(name) || !data.entries[name] || typeof data.entries[name].original !== 'boolean')
        throw new Error('Invalid rules journal entry; settings unchanged');
    }
    return data;
  }
  function save(data) { world.setDynamicProperty(JOURNAL_KEY, JSON.stringify(data)); }
  function readRule(name) {
    const value = world.gameRules[name];
    if (typeof value !== 'boolean') throw new Error(`Unable to read ${name}`);
    return value;
  }
  function suppress(enableExplicitly = false) {
    const data = load();
    if (enableExplicitly && !data.enabled) { data.enabled = true; save(data); }
    if (!data.enabled) return { disabled: true, errors: [] };
    const errors = [];
    for (const name of KEYS) {
      try {
        const current = readRule(name);
        if (!Object.prototype.hasOwnProperty.call(data.entries, name)) {
          data.entries[name] = { original: current };
          // Journal before mutation. If this fails, do not edit this rule.
          try { save(data); } catch (e) { delete data.entries[name]; throw e; }
        }
        if (current !== false) world.gameRules[name] = false;
        if (readRule(name) !== false) throw new Error('Unable to verify change');
      } catch (e) { errors.push(`${name}: ${String(e)}`); }
    }
    return { disabled: false, errors };
  }
  function restore() {
    const data = load();
    // Durable disable BEFORE restoring. A future restart must not reapply.
    data.enabled = false;
    save(data);
    const errors = [], conflicts = [], done = [];
    for (const name of KEYS) {
      if (!Object.prototype.hasOwnProperty.call(data.entries, name)) continue;
      try {
        const original = data.entries[name].original;
        const current = readRule(name);
        if (current !== false && current !== original) { conflicts.push(name); continue; }
        if (current === false && current !== original) world.gameRules[name] = original;
        if (readRule(name) !== original) throw new Error('Unable to verify restoration');
        const previous = data.entries[name];
        delete data.entries[name];
        try { save(data); } catch (e) { data.entries[name] = previous; throw e; }
        done.push(name);
      } catch (e) { errors.push(`${name}: ${String(e)}`); }
    }
    return { done, conflicts, errors };
  }
  function status() {
    const data = load();
    return { enabled: data.enabled, entries: KEYS.map(name => {
      let current;
      try { current = readRule(name); } catch (_) { current = undefined; }
      return { name, current, original: data.entries[name]?.original };
    }) };
  }
  function onWorldReady() {
    system.run(() => {
      try {
        const result = suppress();
        if (result.errors.length) console.warn(`${PREFIX} Unable to suppress all notifications: ${result.errors.join('; ')}`);
      } catch (e) { console.warn(`${PREFIX} Unable to suppress notifications: ${String(e)}`); }
    });
  }
  // No unrestricted writes during early execution. worldLoad is the public
  // signal for 2.x. If unavailable, schedule once and report failures.
  try { world.afterEvents.worldLoad.subscribe(onWorldReady); }
  catch (_) { onWorldReady(); }
  return { suppress, restore, status }; // exposed for diagnostics / isolated tests
}
