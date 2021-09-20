const Service = require('node-windows').Service;

const svc = new Service({
  name: 'A1 - Github Releaser',
  description: 'Automatic release builder for Github',
  // eslint-disable-next-line no-undef
  script: __dirname + '\\index.js',
  nodeOptions: [
    '--harmony',
    '--max_old_space_size=4096',
  ],
  // , workingDirectory: '...'
  // , allowServiceLogon: true
});

svc.on('install', () => {
  svc.start();
  console.log('Service started');
});

svc.install();
console.log('Service installed');
