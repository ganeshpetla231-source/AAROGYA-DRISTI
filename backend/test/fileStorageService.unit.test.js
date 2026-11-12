const test = require('node:test');
const assert = require('node:assert/strict');
const { Writable } = require('node:stream');
const cloudinary = require('cloudinary').v2;
const fileStorage = require('../src/services/fileStorageService');

test('Cloudinary storage writes authenticated raw assets and retrieves them by short-lived signed URL', async () => {
  const previous = {
    driver: process.env.FILE_STORAGE_DRIVER,
    cloudinaryUrl: process.env.CLOUDINARY_URL,
    cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    apiKey: process.env.CLOUDINARY_API_KEY,
    apiSecret: process.env.CLOUDINARY_API_SECRET,
    fetch: global.fetch,
    uploadStream: cloudinary.uploader.upload_stream,
    destroy: cloudinary.uploader.destroy
  };
  const uploaded = [];
  const assetBytes = Buffer.from('encrypted-test-payload');
  let downloadUrl;
  process.env.FILE_STORAGE_DRIVER = 'cloudinary';
  delete process.env.CLOUDINARY_URL;
  process.env.CLOUDINARY_CLOUD_NAME = 'test-cloud';
  process.env.CLOUDINARY_API_KEY = 'test-key';
  process.env.CLOUDINARY_API_SECRET = 'test-secret';
  cloudinary.uploader.upload_stream = (options, callback) => {
    const stream = new Writable({
      write(chunk, encoding, done) { uploaded.push(Buffer.from(chunk)); done(); },
      final(done) { callback(null, { public_id: options.public_id }); done(); }
    });
    assert.equal(options.resource_type, 'raw');
    assert.equal(options.type, 'authenticated');
    assert.equal(options.overwrite, false);
    return stream;
  };
  cloudinary.uploader.destroy = async (publicId, options) => {
    assert.equal(publicId, 'b1b8c2fa-d1af-4f48-aabb-00455e454321.enc');
    assert.deepEqual(options, { resource_type: 'raw', type: 'authenticated', invalidate: true });
    return { result: 'ok' };
  };
  global.fetch = async (url, options) => {
    downloadUrl = new URL(url);
    assert.equal(downloadUrl.protocol, 'https:');
    assert.equal(options.signal.aborted, false);
    return { ok: true, arrayBuffer: async () => assetBytes };
  };

  try {
    const key = 'b1b8c2fa-d1af-4f48-aabb-00455e454321.enc';
    await fileStorage.put(key, assetBytes);
    assert.deepEqual(Buffer.concat(uploaded), assetBytes);

    const downloaded = await fileStorage.get(key);
    assert.deepEqual(downloaded, assetBytes);
    assert.equal(downloadUrl.searchParams.get('public_id'), key);
    assert.equal(downloadUrl.searchParams.get('type'), 'authenticated');
    assert.ok(Number(downloadUrl.searchParams.get('expires_at')) > Math.floor(Date.now() / 1000));

    await fileStorage.remove(key);
  } finally {
    if (previous.driver === undefined) delete process.env.FILE_STORAGE_DRIVER; else process.env.FILE_STORAGE_DRIVER = previous.driver;
    if (previous.cloudinaryUrl === undefined) delete process.env.CLOUDINARY_URL; else process.env.CLOUDINARY_URL = previous.cloudinaryUrl;
    if (previous.cloudName === undefined) delete process.env.CLOUDINARY_CLOUD_NAME; else process.env.CLOUDINARY_CLOUD_NAME = previous.cloudName;
    if (previous.apiKey === undefined) delete process.env.CLOUDINARY_API_KEY; else process.env.CLOUDINARY_API_KEY = previous.apiKey;
    if (previous.apiSecret === undefined) delete process.env.CLOUDINARY_API_SECRET; else process.env.CLOUDINARY_API_SECRET = previous.apiSecret;
    global.fetch = previous.fetch;
    cloudinary.uploader.upload_stream = previous.uploadStream;
    cloudinary.uploader.destroy = previous.destroy;
  }
});

test('Cloudinary storage rejects invalid keys and failed downloads', async () => {
  const previous = {
    driver: process.env.FILE_STORAGE_DRIVER,
    cloudinaryUrl: process.env.CLOUDINARY_URL,
    cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    apiKey: process.env.CLOUDINARY_API_KEY,
    apiSecret: process.env.CLOUDINARY_API_SECRET,
    fetch: global.fetch
  };
  process.env.FILE_STORAGE_DRIVER = 'cloudinary';
  delete process.env.CLOUDINARY_URL;
  process.env.CLOUDINARY_CLOUD_NAME = 'test-cloud';
  process.env.CLOUDINARY_API_KEY = 'test-key';
  process.env.CLOUDINARY_API_SECRET = 'test-secret';
  global.fetch = async () => ({ ok: false, status: 404 });

  try {
    await assert.rejects(fileStorage.get('not-a-storage-key'), /Invalid private file key/);
    await assert.rejects(fileStorage.get('b1b8c2fa-d1af-4f48-aabb-00455e454321.enc'), /Cloudinary download failed with HTTP 404/);
  } finally {
    if (previous.driver === undefined) delete process.env.FILE_STORAGE_DRIVER; else process.env.FILE_STORAGE_DRIVER = previous.driver;
    if (previous.cloudinaryUrl === undefined) delete process.env.CLOUDINARY_URL; else process.env.CLOUDINARY_URL = previous.cloudinaryUrl;
    if (previous.cloudName === undefined) delete process.env.CLOUDINARY_CLOUD_NAME; else process.env.CLOUDINARY_CLOUD_NAME = previous.cloudName;
    if (previous.apiKey === undefined) delete process.env.CLOUDINARY_API_KEY; else process.env.CLOUDINARY_API_KEY = previous.apiKey;
    if (previous.apiSecret === undefined) delete process.env.CLOUDINARY_API_SECRET; else process.env.CLOUDINARY_API_SECRET = previous.apiSecret;
    global.fetch = previous.fetch;
  }
});
