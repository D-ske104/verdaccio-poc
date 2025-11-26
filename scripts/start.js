#!/usr/bin/env node
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { spawn } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// プロジェクトルートを算出（scripts/start.js から一つ上）
const root = resolve(__dirname, '..');
const configPath = resolve(root, 'config.yaml');

// verdaccio を `-c` で設定ファイル指定して起動
const child = spawn('npx', ['verdaccio', '-c', configPath], {
  cwd: root,
  stdio: 'inherit',
  shell: false,
});

child.on('exit', (code) => {
  process.exit(code ?? 0);
});
