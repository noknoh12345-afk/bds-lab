// Results to the person's phone: LAB_NOTIFY_WEBHOOK in .env (or a CI secret) = a Discord or Slack webhook URL, an ntfy.sh
// topic URL, or any URL that takes a JSON POST. make, maintain and the newest-version check send one message when they end.
//   node lab.mjs notify "text"                         sends a test message
//   node lab.mjs notify "text" --file a.png --file b.mp4   pictures and videos to Discord (the bot's DM or a Discord webhook)
// Best-effort: no URL → nothing; a failure is one W line, never a failed command. files ([{ name, data }]): attached on a
// Discord webhook (an addon's .mcaddon: app notify), not sent to the others (the caller names them in the lines).
export async function notify(title, lines = [], { ok = true, url = process.env.LAB_NOTIFY_WEBHOOK, out = () => {}, files = [] } = {}) {
  if (!url) return false;
  const text = [`${ok ? '✅' : '⚠️'} ${title}`, ...lines].join('\n').slice(0, 1900);
  let body, headers = { 'content-type': 'application/json' };
  if (/discord(app)?\.com\/api\/webhooks/.test(url) && files.length) {
    body = new FormData(); headers = {};
    body.append('payload_json', JSON.stringify({ username: 'bds-lab', content: text, allowed_mentions: { parse: [] }, attachments: files.map((f, i) => ({ id: i, filename: f.name })) }));
    files.forEach((f, i) => body.append(`files[${i}]`, new Blob([f.data], { type: 'application/octet-stream' }), f.name));
  } else if (/discord(app)?\.com\/api\/webhooks/.test(url)) body = JSON.stringify({ username: 'bds-lab', content: text, allowed_mentions: { parse: [] } });
  else if (/hooks\.slack\.com/.test(url)) body = JSON.stringify({ text });
  else if (/ntfy\./.test(url)) { body = lines.join('\n') || title; headers = { title: encodeURIComponent(`bds-lab: ${title}`).slice(0, 200), tags: ok ? 'white_check_mark' : 'warning' }; }
  else body = JSON.stringify({ source: 'bds-lab', title, ok, text, lines });
  try {
    const r = await fetch(url, { method: 'POST', headers, body, signal: AbortSignal.timeout(files.length ? 120_000 : 15000) });
    if (!r.ok) { out(`W notify: HTTP ${r.status}`); return false; }
    return true;
  } catch (e) { out(`W notify: ${e.cause?.code ?? e.message}`); return false; }
}
export async function notifyCmd(args, out = console.log) {
  // --file <path> (any number, a shell's glob too): pictures and videos to the person's Discord — their bot's DM, else a
  // Discord webhook (app/lib/feed.mjs: a large picture halved, a long video made to fit with ffmpeg)
  const files = [], words = [];
  for (let i = 0; i < args.length; i++) { if (args[i] === '--file' && args[i + 1]) files.push(args[++i]); else if (args[i].startsWith('--file=')) files.push(args[i].slice(7)); else words.push(args[i]); }
  if (files.length) {
    const F = await import('../app/lib/feed.mjs'), fs = await import('node:fs'), path = await import('node:path');
    // (paths as the person typed them: from where they ran the lab)
    for (let i = 0; i < files.length; i++) files[i] = path.resolve(process.env.LAB_CALLER_CWD ?? process.cwd(), files[i]);
    const dest = F.destination(), post = F.posterFor(dest);
    if (!post) { out('Discord がありません: .env か Secrets に DISCORD_BOT_TOKEN + DISCORD_USER_ID、または Discord の LAB_NOTIFY_WEBHOOK を（Slack・ntfy にはファイルを送れません）'); return false; }
    const missing = files.filter((f) => !fs.existsSync(f));
    if (missing.length) { out(`ファイルがありません: ${missing.join(' ')}`); return false; }
    try {
      const r = await F.sendFiles(post, words.join(' ') || 'bds-lab', files);
      r.skipped.forEach((x) => out(`W ${x}`));
      out(`OK ${dest.kind === 'bot' ? 'Discord の DM' : 'Discord の Webhook'} に ${r.sent} 個送りました`);
      return true;
    } catch (e) { out(`FAIL 送れませんでした: ${String(e?.message ?? e).split('\n')[0]}`); return false; }
  }
  if (!process.env.LAB_NOTIFY_WEBHOOK) { out('LAB_NOTIFY_WEBHOOK がありません: .env に LAB_NOTIFY_WEBHOOK=<Discord / Slack の Webhook URL か https://ntfy.sh/<トピック>> と書いてください'); return false; }
  const ok = await notify(words.join(' ') || 'bds-lab からのテスト通知です', [], { out });
  out(ok ? 'OK 送りました' : 'FAIL 送れませんでした');
  return ok;
}
