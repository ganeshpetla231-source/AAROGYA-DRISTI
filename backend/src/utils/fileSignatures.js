const starts = (buffer, signature) => buffer.length >= signature.length && buffer.subarray(0, signature.length).equals(signature);
const isMp3 = buffer => buffer.length > 1 && buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0;

const signatures = {
  'image/jpeg': buffer => buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff,
  'image/png': buffer => starts(buffer, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  'image/webp': buffer => buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP',
  'application/pdf': buffer => buffer.subarray(0, 5).toString('ascii') === '%PDF-',
  'audio/webm': buffer => starts(buffer, Buffer.from([0x1a, 0x45, 0xdf, 0xa3])),
  'audio/ogg': buffer => buffer.subarray(0, 4).toString('ascii') === 'OggS',
  'audio/wav': buffer => buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WAVE',
  'audio/x-wav': buffer => buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WAVE',
  'audio/flac': buffer => buffer.subarray(0, 4).toString('ascii') === 'fLaC',
  'audio/mpeg': buffer => buffer.subarray(0, 3).toString('ascii') === 'ID3' || isMp3(buffer),
  'audio/mp3': buffer => buffer.subarray(0, 3).toString('ascii') === 'ID3' || isMp3(buffer)
};

function hasValidSignature(buffer, mimeType) { return Buffer.isBuffer(buffer) && Boolean(signatures[mimeType]?.(buffer)); }
module.exports = { hasValidSignature };
