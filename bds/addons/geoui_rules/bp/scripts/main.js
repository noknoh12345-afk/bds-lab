// GeoUI rules probe (bds-lab: bds/geoui/screen/rules.mjs makes this file — change that, not this).
// /scriptevent grl:show <bits> · grl:scale <s> (the player's scale in the UI) · grl:sneak 0|1 · grl:anim <animation>|stop · grl:small 0|1
// (minecraft:scale 0.5 by an event, as another add-on would) · grl:state
import { world, system, Player } from '@minecraft/server';
const log = (s) => console.warn('GRL ' + s);
system.afterEvents.scriptEventReceive.subscribe((e) => {
  const verb = e.id.slice(4), args = String(e.message).trim().split(/\s+/).filter(Boolean);
  const players = e.sourceEntity instanceof Player ? [e.sourceEntity] : world.getAllPlayers();
  for (const p of players) {
    try {
      if (verb === 'show') { p.setProperty('grl:show', Math.max(0, Math.min(255, parseInt(args[0], 10) || 0))); log('show ' + p.getProperty('grl:show')); }
      else if (verb === 'scale') { const s = Number(args[0]); if (!(s >= 0.1 && s <= 4)) { log('scale <0.1…4>'); continue; } p.setProperty('grl:sc', Math.round(s * 10000)); log('scale ' + s); }
      else if (verb === 'sneak') { p.isSneaking = args[0] === '1'; log('sneak ' + p.isSneaking); }
      else if (verb === 'anim') {
        // (one controller of our own: the next animation on it replaces the last; stop = the plain pose)
        p.playAnimation(args[0] === 'stop' ? 'animation.humanoid.base_pose' : args[0], { controller: 'grl_pose', blendOutTime: 0 });
        log('anim ' + args[0]);
      } else if (verb === 'small') { p.triggerEvent(args[0] === '1' ? 'grl:small' : 'grl:normal'); log('small ' + args[0]); }
      else if (verb === 'state') { const sc = p.getComponent('minecraft:scale'); log('state ' + JSON.stringify({ show: p.getProperty('grl:show'), sc: p.getProperty('grl:sc'), sneaking: p.isSneaking, scale: sc ? sc.value : 1 })); }
      else log('unknown ' + verb);
    } catch (err) { log(verb + ' error ' + err); }
  }
}, { namespaces: ['grl'] });
