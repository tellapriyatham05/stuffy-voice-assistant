// Overlay: draws Stuffy + speech bubble, owns the microphone, plays Stuffy's voice,
// and lets you drag / click / right-click the hamster.
const home = document.getElementById('home');
const bubble = document.getElementById('bubble');
const label = document.getElementById('label');
const text = document.getElementById('text');

home.innerHTML = window.HABITAT_SVG;
const hamster = new window.Stuffy(home.querySelector('svg'));

let hideTimer = null;
let audioCtx = null;
const ctx = () => {
  if (!audioCtx || audioCtx.state === 'closed') {
    audioCtx = new AudioContext();
    // e.g. headphones unplugged: make a fresh one next time
    audioCtx.onerror = () => { audioCtx = null; };
  }
  return audioCtx;
};

// ------------------------------------------------------------------ sounds
function tone(freq, ms, delay = 0, vol = 0.07) {
  const c = ctx();
  const t = c.currentTime + delay;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(vol, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + ms / 1000);
  osc.connect(gain).connect(c.destination);
  osc.start(t);
  osc.stop(t + ms / 1000);
}

// A hamster squeak: a quick rising chirp.
function squeak(delay = 0) {
  const c = ctx();
  const t = c.currentTime + delay;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(1900, t);
  osc.frequency.exponentialRampToValueAtTime(3300, t + 0.08);
  osc.frequency.exponentialRampToValueAtTime(2400, t + 0.16);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(0.09, t + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
  osc.connect(gain).connect(c.destination);
  osc.start(t);
  osc.stop(t + 0.2);
}

const SOUNDS = {
  wake: () => squeak(),
  ok: () => { squeak(); squeak(0.14); },
  squeak: () => squeak(),
  error: () => { tone(330, 140); tone(220, 180, 0.13); },
  bell: () => { for (let i = 0; i < 4; i++) tone(1760, 220, i * 0.28, 0.06); },
};

// ------------------------------------------------------------------ what main asks us to show
function modeFor(d) {
  switch (d.dot) {
    case 'loading': return ['home'];
    case 'listening': return ['listen'];
    case 'speaking': return ['hearing'];
    case 'thinking': return d.activity ? ['work', d.activity] : ['think'];
    case 'confirm': return ['confirm'];
    case 'done': return ['happy'];
    case 'error': return ['confused'];
    case 'paused': return ['paused'];
    case 'dictate': return ['dictate'];
    case 'reminder': return ['work', 'bell'];
    case 'sleeping': return ['idle'];
    default: return ['idle'];
  }
}

window.stuffy.onDisplay((d) => {
  if (d.sound && d.soundOn && SOUNDS[d.sound]) SOUNDS[d.sound]();
  if (d.keep) return; // sound only
  const [mode, activity] = modeFor(d);
  hamster.show(mode, activity);

  label.textContent = d.label || '';
  text.textContent = d.text || '';
  bubble.classList.toggle('hidden', !d.label && !d.text);
  clearTimeout(hideTimer);
  if (d.hideAfter) {
    hideTimer = setTimeout(() => {
      bubble.classList.add('hidden');
      if (mode !== 'paused') hamster.settle();
    }, d.hideAfter);
  }
  if (d.dot === 'sleeping' && !d.hideAfter) hamster.settle(1500);
});

// ------------------------------------------------------------------ Stuffy's voice
// Main sends the audio of a sentence; we play it and move the mouth with the loudness.
window.stuffy.onSpeak(async ({ id, samples, sampleRate }) => {
  try {
    const c = ctx();
    const buffer = c.createBuffer(1, samples.length, sampleRate);
    buffer.copyToChannel(samples instanceof Float32Array ? samples : Float32Array.from(samples), 0);
    const src = c.createBufferSource();
    src.buffer = buffer;
    const analyser = c.createAnalyser();
    analyser.fftSize = 512;
    src.connect(analyser).connect(c.destination);
    const data = new Float32Array(analyser.fftSize);
    let playing = true;
    const lip = () => {
      if (!playing) return hamster.setTalking(false);
      analyser.getFloatTimeDomainData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
      hamster.setTalking(Math.sqrt(sum / data.length) > 0.035);
      setTimeout(lip, 70);
    };
    src.onended = () => { playing = false; hamster.setTalking(false); window.stuffy.spoke(id); };
    src.start();
    lip();
  } catch (err) {
    window.stuffy.spoke(id, String(err));
  }
});

// ------------------------------------------------------------------ drag, click, right-click
// The window ignores the mouse except over the habitat, so clicks pass through to your apps.
home.addEventListener('mouseenter', () => window.stuffy.pointerOver(true));
home.addEventListener('mouseleave', () => { if (!drag) window.stuffy.pointerOver(false); });

let drag = null;
home.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  home.setPointerCapture(e.pointerId);
  drag = { sx: e.screenX, sy: e.screenY, ox: e.clientX, oy: e.clientY, moved: false };
});
home.addEventListener('pointermove', (e) => {
  if (!drag) return;
  if (!drag.moved && Math.hypot(e.screenX - drag.sx, e.screenY - drag.sy) < 4) return;
  drag.moved = true;
  home.classList.add('dragging');
  window.stuffy.dragTo(Math.round(e.screenX - drag.ox), Math.round(e.screenY - drag.oy));
});
home.addEventListener('pointerup', (e) => {
  if (!drag) return;
  const wasDrag = drag.moved;
  drag = null;
  home.classList.remove('dragging');
  home.releasePointerCapture(e.pointerId);
  if (wasDrag) window.stuffy.dragEnd();
  else window.stuffy.clicked();
});
home.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  window.stuffy.menu();
});

// ------------------------------------------------------------------ microphone
let micLevelTimer = null;
async function startMic() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    const micCtx = new AudioContext({ sampleRate: 16000 });
    // e.g. the mic or headset was unplugged: start over in a moment
    micCtx.onerror = () => { micCtx.close().catch(() => {}); stream.getTracks().forEach((t) => t.stop()); setTimeout(startMic, 2000); };
    await micCtx.audioWorklet.addModule('mic-worklet.js');
    const source = micCtx.createMediaStreamSource(stream);
    const collector = new AudioWorkletNode(micCtx, 'mic-collector');
    let peak = 0;
    collector.port.onmessage = (e) => {
      window.stuffy.sendAudio(e.data);
      for (let i = 0; i < e.data.length; i += 16) peak = Math.max(peak, Math.abs(e.data[i]));
    };
    // Chromium only pulls audio through nodes that reach the speakers; a muted
    // gain keeps the collector running without playing the mic back.
    const mute = micCtx.createGain();
    mute.gain.value = 0;
    source.connect(collector).connect(mute).connect(micCtx.destination);
    window.stuffy.micStatus({ ok: true, device: stream.getAudioTracks()[0].label });
    // A mic level line in the log once a minute helps diagnose "it doesn't hear me".
    clearInterval(micLevelTimer);
    micLevelTimer = setInterval(() => { window.stuffy.micLevel(peak.toFixed(3)); peak = 0; }, 60000);
  } catch (err) {
    window.stuffy.micStatus({ ok: false, message: String(err) });
    setTimeout(startMic, 10000); // try again (mic plugged in later, permission fixed…)
  }
}

startMic();
