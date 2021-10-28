import express from 'express';

import { release1CRepository } from './release.js';
import { env } from './env.js';
import { requiredSettings } from './utils.js';

import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const app = express();
app.use(express.json());
const port = env.port || 11000;

const log = require('simple-node-logger').createSimpleLogger('data\\log.txt');

process.on('SIGINT', () => process.exit(1));

const persist = require('persistent-object');
const repositories = persist('data/repositories.json');

const requiredRepositories = requiredSettings('conf/repositories.json');
for (const key of Object.keys(requiredRepositories)) {
  if (repositories[key] === undefined) {
    repositories[key] = {
      needUpdate: false,
    };
  };
}
for (const key of Object.keys(repositories)) {
  if (requiredRepositories[key] === undefined) {
    repositories[key] = undefined;
  }
}

const { Octokit } = require('octokit');
const octokit = new Octokit({ auth: env.githubToken });

app.post('/githubwebhook', (req, res) => {
  try {
    const fullName = req.body.repository.full_name;
    const profile = repositories[fullName];
    if (profile === undefined) {
      log.info('Rejected request from repository', fullName);
      res.status(403).send('Unknown repository!');
      return;
    }
    profile.needUpdate = true;
    profile.github = req.body;
    res.status(200).send('Repository ' + fullName + ' scheduled for release!');
    log.info('Accepted release request from repository ', fullName);
  } catch (err) {
    log.error('Error with github hook ', err);
  }
});

app.post('/release', (req, res) => {

});

app.get('/test', (req, res) => {
  res.status(200).send('It works!');
});
app.listen(port, () => {
  log.info(`Releaser ready at http://localhost:${port}`);
});

setInterval(() => {
  log.info('Releasing repositories');
  Object.keys(repositories).forEach(release1CRepositoryIfRequired);
}, 60000);

async function release1CRepositoryIfRequired(fullName) {
  const repository = repositories[fullName];
  if (!repository.needUpdate) return;
  let result;
  try {
    result = await release1CRepository(fullName);
  } catch (err) {
    log.error('Error while releasing repository ', fullName, ': ', err);
    return;
  };
  repository.needUpdate = false;
  if (result === true) {
    log.info('Released repository ', fullName);
  } else {
    log.info('Current version already released for repository ', fullName);
  };
}

