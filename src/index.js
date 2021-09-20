const express = require('express');
const app = express();
app.use(express.json());
const port = 11000;

const fs = require('fs-extra');
const axios = require('axios').default;

const extract = require('extract-zip');
const xmljs = require('xml-js');
const oktokit = require('octokit');

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

const env = requiredSettings('conf/env.json');

const { Octokit } = require('octokit');
const octokit = new Octokit({ auth: env.githubToken });

app.post('/githubwebhook', (req, res) => {
  console.log(req.body.repository);
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

app.get('/test', (req, res) => {
  res.status(200).send('It works!');
});
app.listen(port, () => {
  console.log(`Releaser ready at http://localhost:${port}`);
});

async function execShellCommand(cmd) {
  const exec = require('child_process').exec;
  return new Promise((resolve, reject) => {
    exec(cmd, (error, stdout, stderr) => {
      if (error) {
        console.warn(error);
      }
      resolve(stdout ? stdout : stderr);
    });
  });
}

setInterval(() => {
  Object.keys(repositories).forEach(release1CRepository);
}, 300000);

async function release1CRepository(fullName) {
  const repository = repositories[fullName];
  if (!repository.needUpdate) return;
  const fullPath = env.workDir + '\\' + fullName.replaceAll('/', '\\');
  try {
    await fs.emptyDir(fullPath);
    const zipPath = fullPath + '\\archive.zip';
    await downloadFile('https://api.github.com/repos/' + fullName + '/zipball', zipPath, {
      headers: {
        Authorization: 'Bearer ' + env.githubToken,
      },
    });
    await extract(zipPath, { dir: fullPath });
    // Finding the name of extracted directory.
    const files = await fs.readdir(fullPath, {
      withFileTypes: true,
    });
    let directory;
    for (const file of files) {
      if (file.isDirectory()) {
        directory = file;
        break;
      }
    }
    const sourcePath = fullPath + '\\' + directory.name;
    const ConfigurationPath = sourcePath + '\\Configuration.xml';
    if (!await fs.pathExists(ConfigurationPath)) {
      console.log('Can\'t find Configuration.xml file');
      return;
    }
    const xmlText = await fs.promises.readFile(ConfigurationPath, { encoding: 'utf8' });
    const Configuration = xmljs.xml2js(xmlText, { compact: true });
    const ExtensionName = Configuration.MetaDataObject.Configuration.Properties.Name._text;
    const ExtensionVersion = Configuration.MetaDataObject.Configuration.Properties.Version._text;
    await uploadExtensionFromFiles(sourcePath, ExtensionName);
    const pathToCFE = fullPath + '\\extension.cfe';
    await saveExtensionToFile(pathToCFE, ExtensionName);
    await createRelease(fullName, pathToCFE, ExtensionVersion);
    repository.needUpdate = false;
    console.log('Test complete!');
  } catch (err) {
    console.log(err);
  }
}

async function saveExtensionToFile(path, extensionName) {
  await exec1CDesigner('DumpCfg', [
    '"' + path + '"',
    '-Extension ' + extensionName,
  ]);
}
async function uploadExtensionFromFiles(path, extensionName) {
  await exec1CDesigner('LoadConfigFromFiles', [
    '"' + path + '"',
    '-Extension ' + extensionName,
  ]);
}
async function exec1CDesigner(commandName, commandParams) {
  await execShellCommand('"' + env.ApplicationPath1C + '\\1cv8.exe" DESIGNER /DisableStartupMessages /DisableStartupDialogs /IBConnectionString ' +
    '"File=""' + env.InfoBasePath1C + '""" /' + commandName + ' ' + commandParams.join(' '));
}

async function downloadFile(url, savePath, options) {
  const requestOptions = Object.assign({}, options);
  requestOptions.responseType = 'stream';
  const response = await axios.get(url, requestOptions);
  const stream = fs.createWriteStream(savePath);
  response.data.pipe(stream);
  await new Promise((resolve, reject) => {
    stream.on('finish', resolve);
  });
}

async function uploadFile(url, filePath, options) {
  const buffer = fs.readFileSync(filePath);

  const requestOptions = Object.assign({}, options);
  if (requestOptions.headers === undefined) requestOptions.headers = {};
  else requestOptions.headers = Object.assign({}, options.headers);
  requestOptions.headers['Content-Type'] = 'application/zip';
  requestOptions.headers['Content-Length'] = buffer.byteLength;

  await axios.post(url, buffer, requestOptions);
}

async function createRelease(fullName, pathToCFE, version) {
  try {
    let response;
    response = await requestGithub('GET /repos/{owner}/{repo}/commits/master', fullName);
    const shaMaster = response.data.sha;
    response = await requestGithub('POST /repos/{owner}/{repo}/git/tags', fullName, {
      tag: version,
      message: 'New release - ' + version,
      object: shaMaster,
      type: 'commit',
    });
    response = await requestGithub('POST /repos/{owner}/{repo}/releases', fullName, {
      tag_name: version,
    });
    if (response.status !== 201) throw new Error('Unable to create release');

    let uploadURL = response.data.upload_url;
    uploadURL = uploadURL.split('{', 1)[0] + '?name=extension.cfe';
    response = await uploadFile(uploadURL, pathToCFE, {
      headers: {
        'Authorization': 'Bearer ' + env.githubToken,
      },
    });
  } catch (err) {
    throw err;
  }
}

async function requestGithub(description, repoFullName, params = {}) {
  const requestParams = Object.assign({}, params);
  const parts = repoFullName.split('/');
  requestParams.owner = parts[0];
  requestParams.repo = parts[1];
  return await octokit.request(description, requestParams);
}

function requiredSettings(path) {
  let settingsString;
  try {
    settingsString = fs.readFileSync(path, 'utf8');
  } catch (err) {
    console.log('Unable to read settings file at ' + path);
    console.log(err);
    // eslint-disable-next-line no-undef
    process.exit(1);
  }
  let settingsObject;
  try {
    settingsObject = JSON.parse(settingsString);
  } catch (err) {
    console.log('Settings file at ' + path + ' is not JSON (it should be)');
    console.log(err);
    // eslint-disable-next-line no-undef
    process.exit(1);
  }
  return settingsObject;
}
repositories['Shadawn/Test'].needUpdate = true;
release1CRepository('Shadawn/Test');
