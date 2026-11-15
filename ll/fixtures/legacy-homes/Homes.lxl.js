// A LiteLoader-era plugin as people still hand them out (one file in plugins/, its data folder beside it), written for the lab:
// CI imports it with `ll import` and runs the draft tests on a real LeviLamina server (verify.yml, job ll). Not a sample to copy.
ll.registerPlugin("Homes", "Homes, for the lab's import test", [1, 0, 0], {});

const lang = JSON.parse(File.readFrom("./plugins/Homes/lang.json") || '{"welcome":"?"}');
const conf = new JsonConfigFile("./plugins/Homes/homes.json", "{}");

const cmd = mc.newCommand("sethome", "Set your home", PermType.Any);
cmd.mandatory("name", ParamType.String);
cmd.overload(["name"]);
cmd.setCallback((_c, origin, out, r) => {
  const pl = origin.player;
  if (!pl) return out.error("players only");
  const p = pl.blockPos;
  conf.set(r.name, [p.x, p.y, p.z]);
  return out.success(`home ${r.name} set`);
});
cmd.setup();

mc.listen("onJoin", (pl) => { pl.tell(`${lang.welcome} (from lang.json)`); });
