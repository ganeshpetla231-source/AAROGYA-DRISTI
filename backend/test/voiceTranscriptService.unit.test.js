const test = require('node:test');
const assert = require('node:assert/strict');
const voice = require('../src/services/voiceTranscriptService');

function wav(samples) {
  const buffer = Buffer.alloc(44 + samples.length * 2);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + samples.length * 2, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(16000, 24);
  buffer.writeUInt32LE(32000, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(samples.length * 2, 40);
  samples.forEach((sample, index) => buffer.writeInt16LE(sample, 44 + index * 2));
  return buffer;
}

test('PCM WAV speech-energy check rejects silence and accepts audible audio', () => {
  assert.equal(voice.containsPcmSpeech({ buffer: wav(new Array(160).fill(0)) }), false);
  assert.equal(voice.containsPcmSpeech({ buffer: wav(new Array(160).fill(1000)) }), true);
});

test('Gemini transcription rejects silent recordings and unsupported WebM before contacting a provider', async () => {
  await assert.rejects(
    voice.transcribeAudioWithGemini({ buffer: wav(new Array(160).fill(0)), mimetype: 'audio/wav' }, 'en-IN'),
    error => error.statusCode === 422 && /no speech was detected/i.test(error.message)
  );
  await assert.rejects(
    voice.transcribeAudioWithGemini({ buffer: Buffer.from('audio'), mimetype: 'audio/webm' }, 'en-IN'),
    error => error.statusCode === 415 && /cannot be transcribed directly/i.test(error.message)
  );
});
