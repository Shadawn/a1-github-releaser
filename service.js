const Service = require('node-windows').Service;

const svc = new Service({
  name: 'A1 - Github Releaser',
  description: 'Automatic release builder for Github',
  script: __dirname + '\\src\\index.js',
  nodeOptions: [
    '--harmony',
    '--max_old_space_size=4096',
  ],
  // , workingDirectory: '...'
  // , allowServiceLogon: true
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
