// Stuffy's voice: turns text into speech with the Kokoro "Sky" voice, fully offline.
// Runs in its own process so speaking never slows down listening.
// The hamster pitch is added when the audio is played (renderer plays it 1.2x faster;
// we generate it at 0.85 speed so the pace still sounds normal).
const path = require('path');
const sherpa = require('sherpa-onnx-node');

const DIR = path.join(process.env.STUFFY_MODELS || path.join(__dirname, 'models'), 'kokoro');
const SPEAKER = 10; // af_sky
const SPEED = 0.85;
const CACHE_MAX = 60;
const WARM_UP = ['Yes?', 'Okay!', 'Done!', 'Hmm? Say that again?', 'Okay, cancelled.'];

let tts = null;
const cache = new Map(); // text -> Float32Array
const queue = [];
let busy = false;

function send(msg) {
  process.parentPort.postMessage(msg);
}

async function generate(text) {
  if (cache.has(text)) return cache.get(text);
  const audio = await tts.generateAsync({ text, sid: SPEAKER, speed: SPEED, enableExternalBuffer: false });
  const samples = Float32Array.from(audio.samples);
  cache.set(text, samples);
  if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
  return samples;
}

async function pump() {
  if (busy || !tts) return;
  busy = true;
  while (queue.length) {
    const { id, text } = queue.shift();
    const started = Date.now();
    try {
      const samples = await generate(text);
      send({ type: 'audio', id, samples, sampleRate: tts.sampleRate, ms: Date.now() - started });
    } catch (err) {
      send({ type: 'error', id, message: String(err) });
    }
  }
  busy = false;
}

async function init() {
  const started = Date.now();
  tts = await sherpa.OfflineTts.createAsync({
    model: {
      kokoro: {
        model: path.join(DIR, 'model.onnx'),
        voices: path.join(DIR, 'voices.bin'),
        tokens: path.join(DIR, 'tokens.txt'),
        dataDir: path.join(DIR, 'espeak-ng-data'),
        lexicon: path.join(DIR, 'lexicon-us-en.txt'),
        lang: 'en-us',
      },
      numThreads: 4,
    },
    maxNumSentences: 1,
  });
  send({ type: 'ready', ms: Date.now() - started });
  pump();
  for (const text of WARM_UP) await generate(text).catch(() => {});
}

process.parentPort.on('message', ({ data }) => {
  if (data.type === 'say') {
    queue.push({ id: data.id, text: data.text });
    pump();
  }
});

init().catch((err) => send({ type: 'error', message: `Voice failed to start: ${err}` }));
