const fs = require('fs/promises');
const path = require('path');
const cloudinary = require('cloudinary').v2;

const driver = () => process.env.FILE_STORAGE_DRIVER || 'local';
const localRoot = () => path.resolve(process.env.FILE_STORAGE_DIR || path.join(__dirname, '../../storage/private'));
function assertKey(key) { if (!/^[a-f0-9-]{36}\.enc$/i.test(String(key))) throw new Error('Invalid private file key'); }
function cloudinaryClient() {
  const config = process.env.CLOUDINARY_URL
    ? cloudinary.config(true)
    : cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET
    });
  if (!config.cloud_name || !config.api_key || !config.api_secret) {
    throw new Error('Configure CLOUDINARY_URL or CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET');
  }
  return cloudinary;
}

function uploadToCloudinary(key, bytes) {
  return new Promise((resolve, reject) => {
    const client = cloudinaryClient();
    const stream = client.uploader.upload_stream({
      public_id: key,
      resource_type: 'raw',
      type: 'authenticated',
      overwrite: false,
      use_filename: false,
      unique_filename: false
    }, (error, result) => {
      if (error) return reject(error);
      if (!result?.public_id) return reject(new Error('Cloudinary returned no uploaded asset'));
      resolve();
    });
    stream.end(bytes);
  });
}

async function put(key, bytes) {
  assertKey(key);
  if (driver() === 'cloudinary') {
    await uploadToCloudinary(key, bytes);
    return;
  }
  if (driver() !== 'local') throw new Error(`Unsupported file storage driver: ${driver()}`);
  const root = localRoot(); await fs.mkdir(root, { recursive: true, mode: 0o700 });
  await fs.writeFile(path.join(root, key), bytes, { mode: 0o600, flag: 'wx' });
}
async function get(key) {
  assertKey(key);
  if (driver() === 'cloudinary') {
    const client = cloudinaryClient();
    const url = client.utils.private_download_url(key, undefined, {
      resource_type: 'raw',
      type: 'authenticated',
      expires_at: Math.floor(Date.now() / 1000) + 60
    });
    const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(`Cloudinary download failed with HTTP ${response.status}`);
    return Buffer.from(await response.arrayBuffer());
  }
  if (driver() !== 'local') throw new Error(`Unsupported file storage driver: ${driver()}`);
  return fs.readFile(path.join(localRoot(), key));
}
async function remove(key) {
  assertKey(key);
  if (driver() === 'cloudinary') {
    const result = await cloudinaryClient().uploader.destroy(key, { resource_type: 'raw', type: 'authenticated', invalidate: true });
    if (!['ok', 'not found'].includes(result?.result)) throw new Error('Cloudinary did not confirm asset deletion');
    return;
  }
  if (driver() !== 'local') throw new Error(`Unsupported file storage driver: ${driver()}`);
  await fs.unlink(path.join(localRoot(), key));
}
module.exports = { put, get, remove };
