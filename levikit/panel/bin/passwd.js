#!/usr/bin/env node
'use strict';
// 管理パネルのパスワードを設定する:  levikit-passwd [新しいパスワード]
// 引数なしなら強いパスワードを自動生成して表示する
const crypto = require('node:crypto');
const { loadConfig, saveConfig, CONFIG_PATH } = require('../lib/config');
const { hashPassword } = require('../lib/auth');

(async () => {
  const cfg = await loadConfig();
  let pw = process.argv[2];
  const generated = !pw;
  if (!pw) pw = crypto.randomBytes(12).toString('base64url');
  if (pw.length < 10) {
    console.error('パスワードは10文字以上にしてください');
    process.exit(1);
  }
  cfg.panel.passwordHash = hashPassword(pw);
  await saveConfig(cfg);
  console.log(`パスワードを更新しました (${CONFIG_PATH})`);
  if (generated) console.log(`新しいパスワード: ${pw}`);
  console.log('反映するには: systemctl restart levikit-panel');
})();
