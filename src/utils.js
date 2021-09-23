import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const axios = require('axios').default;
const fs = require('fs');

export async function downloadFile(url, savePath, options) {
  const requestOptions = Object.assign({}, options);
  requestOptions.responseType = 'stream';
  const response = await axios.get(url, requestOptions);
  const stream = fs.createWriteStream(savePath);
  response.data.pipe(stream);
  await new Promise((resolve, reject) => {
    stream.on('finish', resolve);
  });
}

export async function uploadFile(url, filePath, options) {
  const buffer = fs.readFileSync(filePath);

  const requestOptions = Object.assign({}, options);
  if (requestOptions.headers === undefined) requestOptions.headers = {};
  else requestOptions.headers = Object.assign({}, options.headers);
  requestOptions.headers['Content-Type'] = 'application/zip';
  requestOptions.headers['Content-Length'] = buffer.byteLength;

  await axios.post(url, buffer, requestOptions);
}

export function requiredSettings(path) {
  let settingsString;
  try {
    settingsString = fs.readFileSync(path, 'utf8');
  } catch (err) {
    console.log('Unable to read settings file at ' + path);
    console.log(err);
    process.exit(1);
  }
  let settingsObject;
  try {
    settingsObject = JSON.parse(settingsString);
  } catch (err) {
    console.log('Settings file at ' + path + ' is not JSON (it should be)!');
    console.log(err);
    process.exit(1);
  }
  return settingsObject;
}
