import { createRequire } from 'module';
const require = createRequire(import.meta.url);

import { fileURLToPath } from 'url';
import { dirname } from 'path';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const Service = require('node-windows').Service;

const svc = new Service({
  name: 'A1 - Github Releaser',
  description: 'Automatic release builder for Github',
  script: __dirname + '\\src\\index.js',
  nodeOptions: [
    '--harmony',
    '--max_old_space_size=4096',
  ],
});

svc.on('install', () => {
  console.log('Service installed');
  svc.start();
});
svc.on('start', () => {
  console.log('Service started');
});
svc.on('uninstall', () => {
  console.log('Service uninstalled');
});

if (process.argv.length === 3 && process.argv[2] === 'uninstall') {
  svc.uninstall();
} else {
  svc.install();
}

