#!/usr/bin/env node
const { resolve, dirname } = require('path');
const { spawn } = require('child_process');

const root = resolve(dirname(__filename), '..');
const configPath = resolve(root, 'config.yaml');

let verdaccioBin;
try {
  const verdaccioPkgPath = require.resolve('verdaccio/package.json');
  const verdaccioDir = dirname(verdaccioPkgPath);
  verdaccioBin = resolve(verdaccioDir, 'bin/verdaccio'); // actual file name without .js
} catch (e) {
  console.error('[verdaccio-poc] Failed to resolve verdaccio bin:', e.message);
  process.exit(1);
}

const child = spawn(process.execPath, [verdaccioBin, '-c', configPath], {
  cwd: root,
  stdio: 'inherit'
});
child.on('exit', (code) => process.exit(code || 0));
