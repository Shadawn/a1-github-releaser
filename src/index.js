import { release1CRepository } from './release.js';
import { env } from './env.js';
import { requiredSettings } from './utils.js';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const express = require('express');
const app = express();
app.use(express.json());
const port = env.port || 11000;

const persist = require('persistent-object');
const repositories = persist('repositories.json');

const requiredRepositories = requiredSettings('conf/repositories.json');
console.log(requiredRepositories);

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
  const fullName = req.body.repository.full_name;
  const profile = repositories[fullName];
  if (profile === undefined) {
    res.status(403).send('Unknown repository!');
    return;
  }
  profile.needUpdate = true;
  profile.github = req.body;
  res.status(200).send('Repository ' + fullName + ' scheduled for release!');
});

app.post('/release', (req, res) => {

});

app.get('/test', (req, res) => {
  res.status(200).send('It works!');
});
app.listen(port, () => {
  console.log(`Releaser ready at http://localhost:${port}`);
});

setInterval(() => {
  Object.keys(repositories).forEach(release1CRepositoryIfRequired);
}, 300000);

async function release1CRepositoryIfRequired(fullName) {
  const repository = repositories[fullName];
  if (!repository.needUpdate) return;
  await release1CRepository(fullName);
  repository.needUpdate = false;
}

