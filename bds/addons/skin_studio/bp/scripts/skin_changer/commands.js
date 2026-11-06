import { CommandPermissionLevel, CustomCommandParamType, CustomCommandStatus, ItemStack } from '@minecraft/server';

// No script-event listener is installed. Custom commands are registered only
// during startup and the engine enforces GameDirectors for both OP and blocks.
export function registerSkinCommands(system, world, api) {
  const P = CustomCommandParamType;
  // Older compatible API builds may accept only a string for this field.
  // Keep command-result feedback bilingual; all ordinary UI and player
  // notifications use locale-aware RawMessage keys in the resource pack.
  const feedback = {
    'msg.command_queued': '処理を受け付けました（完了は別途確認） / Queued (completion is not yet confirmed)',
    'msg.invalid_action': '不明な操作です / Unknown action',
    'msg.invalid_selector': '対象の指定が不正です / Invalid player selector',
    'msg.unexpected_selector': 'この操作では対象を指定できません / Unexpected selector',
    'msg.no_targets': '対象プレイヤーを指定してください / Specify target players',
    'msg.invalid_source': 'スキンの取得元は1人だけ選択してください / Select exactly one skin source',
    'msg.command_error': 'コマンドの準備に失敗しました / Could not prepare command',
  };
  const ok = () => ({ status: CustomCommandStatus.Success, message: feedback['msg.command_queued'] });
  const fail = (key, ...args) => ({ status: CustomCommandStatus.Failure, message: (feedback[key] || feedback['msg.command_error']) + (args.length ? ': ' + args.join('; ') : '') });
  const playersParam = { name: 'players', type: P.PlayerSelector };
  const sourceParam = { name: 'source', type: P.PlayerSelector };
  const actionParam = { name: 'skinchanger:action', type: P.Enum };
  const flagParam = { name: 'exclude_self', type: P.Boolean };
  const actions = ['item', 'change', 'random', 'random_other', 'reset', 'status', 'rules_status', 'rules_restore', 'rules_suppress'];

  function capture(list) {
    if (!Array.isArray(list)) return undefined;
    const ids = [], seen = new Set();
    for (const p of list) {
      if (!p || p.typeId !== 'minecraft:player' || typeof p.id !== 'string') return undefined;
      if (!seen.has(p.id)) { seen.add(p.id); ids.push(p.id); }
    }
    return ids;
  }
  function originPlayer(origin) {
    try { const p = origin?.sourceEntity; return p?.typeId === 'minecraft:player' && typeof p.id === 'string' ? p.id : undefined; }
    catch (_) { return undefined; }
  }
  function prepare(origin, action, targets, sources, excludeSelf) {
    try {
      if (!actions.includes(action)) return fail('msg.invalid_action');
      const issuerId = originPlayer(origin);
      let targetIds = capture(targets), sourceIds = capture(sources);
      if (targets !== undefined && !targetIds) return fail('msg.invalid_selector');
      if (sources !== undefined && !sourceIds) return fail('msg.invalid_selector');
      if (action.startsWith('rules_') || action === 'status') {
        if ((targetIds && targetIds.length) || (sourceIds && sourceIds.length)) return fail('msg.unexpected_selector');
      } else {
        if (action === 'item' && targetIds === undefined && issuerId) targetIds = [issuerId];
        if (!targetIds || !targetIds.length) return fail('msg.no_targets');
        if (action === 'change' && (!sourceIds || sourceIds.length !== 1)) return fail('msg.invalid_source');
        if (action !== 'change' && sourceIds !== undefined) return fail('msg.unexpected_selector');
      }
      const config = { action, targetIds, sourceId: sourceIds?.[0], excludeSelf: action === 'random_other' || excludeSelf === true, issuerId };
      // Snapshot entity identifiers before leaving the command execution scope.
      // Command handlers are restricted; world mutation is deferred.
      system.run(() => {
        // The world may suppress normal command feedback. If an operator acts on
        // other players, provide a localized receipt via direct message instead.
        // Target players already receive their own result notifications.
        if (issuerId && targetIds && !targetIds.includes(issuerId)) inform(issuerId, 'msg.admin_queued', targetIds.length);
        execute(config);
      });
      return ok(); // Accepted for processing, not an atomic guarantee of delivery.
    } catch (e) { return fail('msg.command_error', String(e)); }
  }
  function resolve(id, list) { return list.find(p => p.id === id); }
  function inform(issuerId, key, ...args) {
    if (!issuerId) { if (['msg.target_unavailable', 'msg.command_error', 'msg.rules_failed', 'msg.rules_conflict'].includes(key)) console.warn(`[Skin Changer] ${key}: ${args.join('; ')}`); return; }
    try { const issuer = resolve(issuerId, world.getAllPlayers()); if (issuer) api.tell(issuer, api.tr(key, ...args)); } catch (_) {}
  }
  function execute({ action, targetIds, sourceId, excludeSelf, issuerId }) {
    try {
      if (action.startsWith('rules_')) {
        if (action === 'rules_restore') {
          const out = api.logRules.restore();
          inform(issuerId, 'msg.rules_restored', out.done.join(', ') || '-');
          if (out.conflicts.length) inform(issuerId, 'msg.rules_conflict', out.conflicts.join(', '));
          if (out.errors.length) { console.warn('[Skin Changer] Rule restore: ' + out.errors.join('; ')); inform(issuerId, 'msg.rules_failed', out.errors.join('; ')); }
        } else if (action === 'rules_suppress') {
          const out = api.logRules.suppress(true);
          inform(issuerId, 'msg.rules_applied');
          if (out.errors.length) { console.warn('[Skin Changer] Rule suppression: ' + out.errors.join('; ')); inform(issuerId, 'msg.rules_failed', out.errors.join('; ')); }
        }
        const state = api.logRules.status();
        if (!state.enabled) inform(issuerId, 'msg.rules_disabled');
        for (const row of state.entries) inform(issuerId, 'msg.rule_status', row.name, row.current === undefined ? '?' : row.current, row.original === undefined ? '-' : row.original);
        return;
      }
      if (action === 'status') {
        const p = issuerId && resolve(issuerId, world.getAllPlayers());
        if (p) api.showStatus(p);
        return;
      }
      const online = world.getAllPlayers(), selected = targetIds.map(id => resolve(id, online));
      if (selected.some(p => !p)) { inform(issuerId, 'msg.target_unavailable'); return; }
      if (action === 'item') {
        for (const p of selected) {
          try {
            const container = p.getComponent('minecraft:inventory')?.container;
            if (!container) throw Error('Inventory unavailable');
            const remainder = container.addItem(new ItemStack('mimic:selector', 1));
            api.tell(p, api.tr(remainder ? 'msg.item_full' : 'msg.item_success'));
            if (remainder && !issuerId) console.warn('[Skin Changer] Item not given: inventory full');
          } catch (e) { api.tell(p, api.tr('msg.item_error', String(e))); if (!issuerId) console.warn(`[Skin Changer] Item not given: ${String(e)}`); }
        }
        return;
      }
      api.syncPlayers();
      const fresh = world.getAllPlayers();
      const validatedTargets = targetIds.map(id => resolve(id, fresh));
      if (validatedTargets.some(p => !p)) { inform(issuerId, 'msg.target_unavailable'); return; }
      const source = sourceId && resolve(sourceId, fresh);
      if (action === 'change' && !source) { inform(issuerId, 'msg.target_unavailable'); return; }
      const eligible = fresh.filter(p => api.hasSlot(p.id));
      for (const p of validatedTargets) {
        try {
          if (action === 'reset') { api.reset(p); continue; }
          let chosen = source;
          if (action === 'random' || action === 'random_other') {
            const candidates = excludeSelf ? eligible.filter(x => x.id !== p.id) : eligible;
            if (!candidates.length) { api.tell(p, api.tr('msg.no_other')); if (!issuerId) console.warn('[Skin Changer] No eligible random source'); continue; }
            chosen = candidates[Math.floor(Math.random() * candidates.length)];
          }
          if (chosen?.id === p.id) api.reset(p); // includes random-self when already changed
          else if (chosen) {
            if (!api.hasSlot(p.id) || !api.hasSlot(chosen.id)) {
              api.tell(p, api.tr('msg.capacity'));
              if (!issuerId) console.warn('[Skin Changer] No slot available for change');
            } else api.change(p, chosen);
          }
        } catch (error) { api.tell(p, api.tr('msg.command_error', String(error))); if (!issuerId) console.warn(`[Skin Changer] Command target failed: ${String(error)}`); }
      }
    } catch (error) {
      console.warn(`[Skin Changer] Command failed: ${String(error)}`);
      inform(issuerId, 'msg.command_error', String(error));
    }
  }
  system.beforeEvents.startup.subscribe(({ customCommandRegistry: registry }) => {
    registry.registerEnum('skinchanger:action', actions);
    const base = { permissionLevel: CommandPermissionLevel.GameDirectors, cheatsRequired: true };
    registry.registerCommand({ ...base, name: 'skinchanger:skin', description: 'Skin Changer actions / スキン変更', mandatoryParameters: [actionParam], optionalParameters: [playersParam, sourceParam] },
      (origin, action, targets, sources) => prepare(origin, action, targets, sources, undefined));
    // [Skin Studio] Minecraft 1.26.6x refuses a second command namespace beside the 'skinchanger' enum
    // (CustomCommandError: Enum namespaces must match): /skinchanger:skin stays, the /skin:* aliases are tried.
    try {
    registry.registerCommand({ ...base, name: 'skin:item', description: 'Give the skin changer item / アイテム取得', optionalParameters: [playersParam] },
      (origin, targets) => prepare(origin, 'item', targets));
    registry.registerCommand({ ...base, name: 'skin:change', description: 'Change to a player skin / スキン変更', mandatoryParameters: [playersParam, sourceParam] },
      (origin, targets, sources) => prepare(origin, 'change', targets, sources));
    registry.registerCommand({ ...base, name: 'skin:random', description: 'Choose a random player skin / ランダム変更', mandatoryParameters: [playersParam], optionalParameters: [flagParam] },
      (origin, targets, excludeSelf) => prepare(origin, 'random', targets, undefined, excludeSelf));
    registry.registerCommand({ ...base, name: 'skin:reset', description: 'Restore original skin / 元に戻す', mandatoryParameters: [playersParam] },
      (origin, targets) => prepare(origin, 'reset', targets));
    } catch (e) { console.warn(`[Skin Changer] /skin:* aliases unavailable: ${e}`); }
  });
}
