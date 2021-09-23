import { uploadFile, downloadFile } from './utils.js';
import { env } from './env.js';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const extract = require('extract-zip');
const fs = require('fs-extra');
const xmljs = require('xml-js');

const { Octokit } = require('octokit');
const octokit = new Octokit({ auth: env.githubToken });

export async function release1CRepository(fullName) {
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
    try {
      const response = await requestGithub('GET /repos/{owner}/{repo}/releases/tags/{tag}', fullName, {
        tag: ExtensionVersion,
      });
      if (response.status === 200) {
        console.log('Release already exists!');
        return false;
      }
    } catch (err) {
      // nothing because this SHOULD fail (we only make release if there isn't one)
    }
    const emptyBasePath = fullPath + '\\Emptybase';
    await fs.emptyDir(emptyBasePath);
    await fs.copyFile(env.InfoBasePath1C + '\\1Cv8.1CD', emptyBasePath + '\\1Cv8.1CD');
    await uploadExtensionFromFiles(emptyBasePath, sourcePath, ExtensionName);
    const pathToCFE = fullPath + '\\extension.cfe';
    await saveExtensionToFile(emptyBasePath, pathToCFE, ExtensionName);
    await createRelease(fullName, pathToCFE, ExtensionVersion);
    return true;
  } catch (err) {
    throw err;
  }
}

async function saveExtensionToFile(pathToInfobase, path, extensionName) {
  await exec1CDesigner(pathToInfobase, 'DumpCfg', [
    '"' + path + '"',
    '-Extension ' + extensionName,
  ]);
}
async function uploadExtensionFromFiles(pathToInfobase, path, extensionName) {
  await exec1CDesigner(pathToInfobase, 'LoadConfigFromFiles', [
    '"' + path + '"',
    '-Extension ' + extensionName,
  ]);
}
async function exec1CDesigner(pathToInfobase, commandName, commandParams) {
  await execShellCommand('"' + env.ApplicationPath1C + '\\1cv8.exe" DESIGNER /DisableStartupMessages /DisableStartupDialogs /IBConnectionString ' +
    '"File=""' + pathToInfobase + '""" /' + commandName + ' ' + commandParams.join(' '));
}

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
