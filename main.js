// Stuffy — local voice control for Windows. Say "Stuffy" and a command.
// main.js wires the pieces together: mic (overlay window) → speech engine
// (utility process) → assistant (brain/) → executor (system/) → overlay feedback.
const { app, BrowserWindow, ipcMain, screen, globalShortcut, Tray, Menu, nativeImage, utilityProcess, session, shell, Notification } = require('electron');
const fs = require('fs');
const path = require('path');
const { WinHelper } = require('./system/helper');
const { Executor } = require('./system/executor');
const { setAutoStart } = require('./system/autostart');
const { Assistant } = require('./brain/assistant');
const { parseCommand } = require('./brain/parser');
const { Timers, describeDuration, describeTime } = require('./brain/timers');

const HOTKEYS = ['Control+Alt+S', 'Control+Shift+Alt+S', 'F9'];
const LANGUAGES = [
  ['en', 'English'],
  ['auto', 'Auto-detect (English / Hindi / Telugu)'],
  ['hi', 'Hindi'],
  ['te', 'Telugu'],
];
const DEFAULT_CUSTOM = {
  'work mode': ['open chrome', 'open slack', 'open gmail'],
  'music time': ['open youtube music', 'volume 40'],
};

const TEST = {
  clips: process.env.STUFFY_TEST_CLIPS, // JSON list of { file } played through the engine
  out: process.env.STUFFY_TEST_OUT,
  dryRun: process.env.STUFFY_DRY_RUN === '1',
};

let overlay = null;
let tray = null;
let engine = null;
let engineReady = false;
let hotkey = null;
let helper = null;
let executor = null;
let assistant = null;
let voice = null;
let voiceReady = false;
let timers = null;
let numbersWin = null;
let editorWin = null;
let settings = { language: 'en', sound: true, browser: 'chrome', wallpaperFolder: '', voice: 'chatty', openAtLogin: true, hidden: false };
let custom = {};
const refineWaiters = new Map();
const testLog = [];

const dataFile = (name) => path.join(app.getPath('userData'), name);

// Files edited by hand (e.g. in Notepad) may start with a byte-order mark.
const readJson = (name) => JSON.parse(fs.readFileSync(dataFile(name), 'utf8').replace(/^﻿/, ''));

function loadSettings() {
  try { settings = { ...settings, ...readJson('settings.json') }; } catch { /* first run */ }
  if (fs.existsSync(dataFile('custom-commands.json'))) {
    try { custom = readJson('custom-commands.json'); } catch (err) { custom = {}; log(`custom-commands.json has a mistake: ${err.message}`); }
  } else {
    custom = DEFAULT_CUSTOM;
    fs.mkdirSync(app.getPath('userData'), { recursive: true });
    fs.writeFileSync(dataFile('custom-commands.json'), JSON.stringify(DEFAULT_CUSTOM, null, 2));
  }
  custom = Object.fromEntries(Object.entries(custom).map(([k, v]) => [k.toLowerCase().trim(), v]));
}

function saveSettings() {
  fs.mkdirSync(app.getPath('userData'), { recursive: true });
  fs.writeFileSync(dataFile('settings.json'), JSON.stringify(settings, null, 2));
}

function log(line) {
  const stamp = new Date().toISOString().replace('T', ' ').slice(0, 19);
  fs.appendFile(dataFile('stuffy.log'), `${stamp}  ${line}\n`, () => {});
  if (!app.isPackaged) console.log(line);
}

function show(display) {
  if (overlay && !overlay.isDestroyed()) overlay.webContents.send('display', { soundOn: settings.sound, ...display });
  if (display.keep) return; // just a sound, nothing else changes
  const trayState = { listening: 'listening', speaking: 'listening', confirm: 'listening', thinking: 'thinking', error: 'error', paused: 'paused' }[display.dot] || 'idle';
  setTray(trayState);
}

// ------------------------------------------------------------------ tray
function circleIcon(rgb, hollow = false) {
  const size = 32;
  const buf = Buffer.alloc(size * size * 4);
  const c = size / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x + 0.5 - c, y + 0.5 - c);
      let a = Math.max(0, Math.min(1, 13 - d));
      if (hollow) a *= Math.max(0, Math.min(1, d - 8));
      const i = (y * size + x) * 4;
      buf[i] = rgb[2]; buf[i + 1] = rgb[1]; buf[i + 2] = rgb[0]; buf[i + 3] = Math.round(a * 255);
    }
  }
  return nativeImage.createFromBitmap(buf, { width: size, height: size });
}

const ICONS = {};
const TRAY_TIPS = { idle: 'say "Stuffy" + a command', listening: 'listening', thinking: 'working', error: 'problem', paused: 'paused' };
function setTray(state) {
  if (!tray || tray.isDestroyed()) return;
  tray.setImage(ICONS[state] || ICONS.idle);
  tray.setToolTip(`Stuffy — ${TRAY_TIPS[state] || state}${settings.hidden ? ' (hidden)' : ''}`);
}

const prettyHotkey = () => (hotkey || '').replace('Control', 'Ctrl').replace(/\+/g, ' + ');

function buildTrayMenu() {
  const paused = assistant && assistant.paused;
  return Menu.buildFromTemplate([
    { label: `Listen for a command now (${prettyHotkey()})`, click: () => assistant && assistant.wake() },
    { label: settings.hidden ? 'Show Stuffy on screen' : 'Hide Stuffy from screen', click: () => setHidden(!settings.hidden) },
    { label: paused ? 'Resume listening for "Stuffy"' : 'Pause listening', click: () => { assistant.setPaused(!paused); tray.setContextMenu(buildTrayMenu()); } },
    { type: 'separator' },
    {
      label: 'Language for typing & searches',
      submenu: LANGUAGES.map(([code, name]) => ({
        label: name,
        type: 'radio',
        checked: settings.language === code,
        click: () => {
          settings.language = code;
          saveSettings();
          engine.postMessage({ type: 'language', language: code });
        },
      })),
    },
    {
      label: 'Open websites in',
      submenu: [['chrome', 'Google Chrome'], ['default', 'Default browser']].map(([v, name]) => ({
        label: name, type: 'radio', checked: settings.browser === v,
        click: () => { settings.browser = v; saveSettings(); },
      })),
    },
    {
      label: "Stuffy's voice",
      submenu: [['chatty', 'Chatty — talks every time'], ['short', 'Short — answers and questions only'], ['silent', 'Silent — squeaks only']].map(([v, name]) => ({
        label: name, type: 'radio', checked: settings.voice === v,
        click: () => { settings.voice = v; saveSettings(); },
      })),
    },
    { label: 'Sounds', type: 'checkbox', checked: settings.sound, click: (i) => { settings.sound = i.checked; saveSettings(); } },
    {
      label: 'Start with Windows',
      type: 'checkbox',
      checked: settings.openAtLogin !== false,
      enabled: app.isPackaged,
      click: (i) => { settings.openAtLogin = i.checked; saveSettings(); setAutoStart(app, i.checked, log); },
    },
    {
      label: 'Move Stuffy back to the corner',
      click: () => { settings.overlayPos = null; saveSettings(); const p = overlayPosition(); overlay.setBounds({ ...p, width: OVERLAY_W, height: OVERLAY_H }); },
    },
    { type: 'separator' },
    { label: 'What can I say?', click: () => assistant && assistant.handleCommand('help', 0, {}) },
    { label: 'My commands & routines…', click: openEditor },
    { label: 'Open activity log', click: () => shell.openPath(dataFile('stuffy.log')) },
    { type: 'separator' },
    { label: 'Quit Stuffy (comes back at next sign-in)', click: quitByUser },
  ]);
}

function quitByUser() {
  // Stay closed until the next sign-in instead of the keep-alive task reopening it.
  settings.quitByUser = true;
  saveSettings();
  app.quit();
}

// ------------------------------------------------------------------ voice
// Stuffy's spoken replies. Chatty = everything, Short = answers & questions, Silent = none.
// The microphone is ignored while Stuffy talks so it doesn't hear itself.
let speakId = 0;
let micMutedUntil = 0;
const speakQueue = [];
let speaking = false;

function startVoice() {
  voice = utilityProcess.fork(path.join(__dirname, 'voice.js'), [], {
    serviceName: 'Stuffy voice',
    stdio: 'pipe',
    env: { ...process.env, STUFFY_MODELS: modelsDir() },
  });
  voice.stderr.on('data', (d) => log(`[voice] ${String(d).trim()}`));
  voice.on('message', (msg) => {
    if (msg.type === 'ready') {
      voiceReady = true;
      log(`voice ready in ${msg.ms} ms`);
      if (process.env.STUFFY_SAY) speak(process.env.STUFFY_SAY, { level: 'answer' }); // voice self-test
      nextSpeech();
    }
    else if (msg.type === 'audio') playSpeech(msg);
    else if (msg.type === 'error') { log(`voice error: ${msg.message}`); speaking = false; nextSpeech(); }
  });
  voice.on('exit', (code) => {
    voiceReady = false;
    if (!app.isQuitting) { log(`voice stopped (${code}), restarting`); setTimeout(startVoice, 3000); }
  });
}

function speak(text, { level = 'chat' } = {}) {
  if (!text || !voice || TEST.clips) return;
  if (settings.voice === 'silent' || (settings.voice === 'short' && level !== 'answer')) return;
  speakQueue.push({ id: ++speakId, text });
  if (speakQueue.length > 3) speakQueue.splice(0, speakQueue.length - 3); // don't fall far behind
  nextSpeech();
}

function nextSpeech() {
  if (speaking || !speakQueue.length || !voiceReady) return;
  speaking = true;
  const { id, text } = speakQueue.shift();
  voice.postMessage({ type: 'say', id, text });
}

function playSpeech({ id, samples, sampleRate }) {
  // Played 1.2x faster = the higher "hamster" pitch (it was generated slower to keep the pace).
  const rate = Math.round(sampleRate * 1.2);
  micMutedUntil = Date.now() + (samples.length / rate) * 1000 + 600;
  if (overlay && !overlay.isDestroyed()) overlay.webContents.send('speak', { id, samples, sampleRate: rate });
  else { speaking = false; nextSpeech(); }
}

// ------------------------------------------------------------------ numbers on screen
function showNumbers(items) {
  if (!items.length) return hideNumbers();
  // UI Automation gives real pixels; Electron windows use scaled (DIP) coordinates.
  const first = screen.screenToDipPoint({ x: items[0].x, y: items[0].y });
  const display = screen.getDisplayNearestPoint(first);
  const b = display.bounds;
  if (!numbersWin || numbersWin.isDestroyed()) {
    numbersWin = new BrowserWindow({
      ...b, frame: false, transparent: true, resizable: false, skipTaskbar: true, focusable: false,
      alwaysOnTop: true, hasShadow: false, show: false,
      webPreferences: { preload: path.join(__dirname, 'preload-small.js') },
    });
    numbersWin.setAlwaysOnTop(true, 'screen-saver');
    numbersWin.setIgnoreMouseEvents(true);
    numbersWin.loadFile(path.join(__dirname, 'renderer', 'numbers.html'));
  } else {
    numbersWin.setBounds(b);
  }
  const placed = items.map((it) => {
    const p = screen.screenToDipPoint({ x: it.x, y: it.y });
    return { n: it.n, x: p.x - b.x, y: p.y - b.y };
  });
  const send = () => { numbersWin.webContents.send('numbers', placed); numbersWin.showInactive(); };
  if (numbersWin.webContents.isLoading()) numbersWin.webContents.once('did-finish-load', send);
  else send();
}

function hideNumbers() {
  if (numbersWin && !numbersWin.isDestroyed()) numbersWin.hide();
}

// ------------------------------------------------------------------ my commands & routines editor
function saveCustom(commands) {
  const copy = { ...commands }; // may be the same object as `custom`
  for (const k of Object.keys(custom)) delete custom[k];
  Object.assign(custom, copy);
  if (TEST.clips) return; // self-tests never change your saved commands
  fs.writeFileSync(dataFile('custom-commands.json'), JSON.stringify(custom, null, 2));
}

function openEditor() {
  if (editorWin && !editorWin.isDestroyed()) { editorWin.show(); editorWin.focus(); return; }
  editorWin = new BrowserWindow({
    width: 620, height: 680, minWidth: 460, minHeight: 400, title: 'Stuffy — my commands & routines',
    autoHideMenuBar: true, icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload-small.js') },
  });
  editorWin.loadFile(path.join(__dirname, 'renderer', 'editor.html'));
}

function wireEditor() {
  ipcMain.handle('editor-load', () => custom);
  ipcMain.handle('editor-save', (_e, commands) => { saveCustom(commands); return true; });
  ipcMain.handle('editor-test', (_e, line) => {
    const { actions, unknown } = parseCommand(line, { custom: {} });
    return { ok: !unknown.length && actions.length > 0 && !actions.some((a) => a.kind === 'incomplete'), say: actions.map((a) => a.say).join(', ') };
  });
  ipcMain.handle('editor-run', (_e, name) => assistant.handleCommand(name, 0, { heard: name }));
}

// ------------------------------------------------------------------ timers & reminders
function timerAction(a) {
  if (a.op === 'add' || a.op === 'remind') {
    const at = a.at || Date.now() + a.durationMs;
    const label = a.op === 'add' ? `${describeDuration(a.durationMs)} timer` : a.label;
    if (!TEST.dryRun) timers.add({ kind: a.op === 'add' ? 'timer' : 'reminder', at, label, durationMs: a.durationMs });
    const when = a.at ? describeTime(new Date(at)) : `in ${describeDuration(a.durationMs)}`;
    return a.op === 'add'
      ? { detail: `⏱ ${describeDuration(a.durationMs)} — rings at ${describeTime(new Date(at))}`, speak: `Timer set for ${describeDuration(a.durationMs)}.` }
      : { detail: `⏰ "${a.label}" — ${when}`, speak: `Okay, I'll remind you ${when}.` };
  }
  if (a.op === 'list') {
    const items = timers.list();
    if (!items.length) return { detail: 'No timers or reminders', speak: 'You have no timers or reminders.' };
    const lines = items.map((t) => `${t.kind === 'timer' ? '⏱' : '⏰'} ${t.label} — ${describeTime(new Date(t.at))} (${describeDuration(t.at - Date.now())} left)`);
    const first = items[0];
    return { detail: lines.join('\n'), speak: `You have ${items.length}. Next: ${first.label}, in ${describeDuration(first.at - Date.now())}.` };
  }
  if (a.op === 'cancel') {
    const gone = TEST.dryRun ? [] : timers.cancel({ kind: a.which, name: a.name });
    if (!gone.length && !TEST.dryRun) throw new Error(`There's no ${a.which} to cancel`);
    return { detail: `Cancelled ${gone.length || ''} ${a.which}${gone.length === 1 ? '' : 's'}`, speak: 'Cancelled.' };
  }
  throw new Error('Unknown timer command');
}

function onTimerDue(item) {
  log(`due: ${item.kind} ${item.label}`);
  if (assistant) assistant.announce(item);
  if (Notification.isSupported()) {
    new Notification({ title: item.kind === 'timer' ? "⏰ Stuffy: time's up" : '⏰ Stuffy reminder', body: item.label, silent: true }).show();
  }
}

function createTray() {
  ICONS.idle = circleIcon([90, 98, 110]);
  ICONS.listening = circleIcon([34, 197, 94]);
  ICONS.thinking = circleIcon([59, 130, 246]);
  ICONS.error = circleIcon([239, 68, 68]);
  ICONS.paused = circleIcon([120, 120, 120], true);
  tray = new Tray(ICONS.idle);
  setTray('idle');
  tray.setContextMenu(buildTrayMenu());
  tray.on('click', () => assistant && assistant.wake());
}

// ------------------------------------------------------------------ overlay (also owns the mic)
const OVERLAY_W = 320;
const OVERLAY_H = 310; // habitat (146 px) at the bottom + room for the speech bubble above

// Where Stuffy lives on screen: the saved spot if it is still on a monitor, else bottom-right.
function overlayPosition() {
  const saved = settings.overlayPos;
  if (saved) {
    const onScreen = screen.getAllDisplays().some(({ workArea: a }) =>
      saved.x + OVERLAY_W / 2 >= a.x && saved.x + OVERLAY_W / 2 <= a.x + a.width &&
      saved.y + OVERLAY_H - 70 >= a.y && saved.y + OVERLAY_H - 70 <= a.y + a.height);
    if (onScreen) return saved;
  }
  const { workArea } = screen.getPrimaryDisplay();
  return { x: workArea.x + workArea.width - OVERLAY_W - 8, y: workArea.y + workArea.height - OVERLAY_H };
}

function createOverlay() {
  const { x, y } = overlayPosition();
  overlay = new BrowserWindow({
    width: OVERLAY_W, height: OVERLAY_H, x, y,
    frame: false, transparent: true, resizable: false, skipTaskbar: true,
    focusable: false, // never steal focus from the app you're talking to
    alwaysOnTop: true, hasShadow: false, show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), backgroundThrottling: false },
  });
  overlay.setAlwaysOnTop(true, 'screen-saver');
  // Clicks pass through to your apps except when the pointer is over the habitat.
  overlay.setIgnoreMouseEvents(true, { forward: true });
  overlay.loadFile(path.join(__dirname, 'renderer', 'overlay.html'));
  // Page errors go to stuffy.log, which is the only place to see them.
  overlay.webContents.on('console-message', (e) => {
    if ((e.level === 'error' || e.level === 'warning') && !app.isQuitting) log(`[overlay] ${e.message}`);
  });
  overlay.webContents.on('preload-error', (_e, file, err) => log(`[overlay preload] ${file}: ${err}`));
  overlay.once('ready-to-show', () => {
    applyHidden();
    overlay.showInactive();
    show({ dot: 'loading', label: 'Stuffy is waking up…', text: 'Loading the speech engine' });
  });
}

// Hide / show Stuffy. Hidden = fully see-through and click-through, but still listening,
// talking and doing everything; the tray icon menu brings it back.
function applyHidden() {
  if (!overlay || overlay.isDestroyed()) return;
  overlay.setOpacity(settings.hidden ? 0 : 1);
  overlay.setIgnoreMouseEvents(true, { forward: true });
}

function setHidden(hidden) {
  settings.hidden = !!hidden;
  if (!TEST.clips) saveSettings();
  applyHidden();
  log(settings.hidden ? 'Stuffy hidden from screen' : 'Stuffy shown on screen');
  if (tray && !tray.isDestroyed()) { tray.setContextMenu(buildTrayMenu()); setTray('idle'); }
}

function wireOverlay() {
  ipcMain.on('pointer-over', (_e, over) => {
    // A hidden Stuffy must never catch clicks meant for the apps underneath.
    if (overlay && !overlay.isDestroyed()) overlay.setIgnoreMouseEvents(!over || settings.hidden, { forward: true });
  });
  ipcMain.on('drag-to', (_e, { x, y }) => {
    if (overlay && !overlay.isDestroyed()) overlay.setBounds({ x, y, width: OVERLAY_W, height: OVERLAY_H });
  });
  ipcMain.on('drag-end', () => {
    const [x, y] = overlay.getPosition();
    settings.overlayPos = { x, y };
    saveSettings();
  });
  ipcMain.on('hamster-click', () => assistant && assistant.wake());
  ipcMain.on('hamster-menu', () => buildTrayMenu().popup({ window: overlay }));
}

// ------------------------------------------------------------------ speech engine
function startEngine() {
  engine = utilityProcess.fork(path.join(__dirname, 'engine.js'), [], {
    serviceName: 'Stuffy speech engine',
    stdio: 'pipe',
    env: { ...process.env, STUFFY_LANG: settings.language, STUFFY_MODELS: modelsDir() },
  });
  engine.stdout.on('data', (d) => log(`[engine] ${String(d).trim()}`));
  engine.stderr.on('data', (d) => log(`[engine] ${String(d).trim()}`));
  engine.on('message', onEngineMessage);
  engine.on('exit', (code) => {
    engineReady = false;
    if (!app.isQuitting) {
      show({ dot: 'error', label: 'Speech engine stopped', text: `Restarting… (code ${code})` });
      setTimeout(startEngine, 2000);
    }
  });
}

function modelsDir() {
  return app.isPackaged ? path.join(process.resourcesPath, 'models') : path.join(__dirname, 'models');
}

function refine(id) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => { refineWaiters.delete(id); resolve(null); }, 10000);
    refineWaiters.set(id, (text) => { clearTimeout(timer); resolve(text); });
    engine.postMessage({ type: 'refine', id });
  });
}

function onEngineMessage(msg) {
  switch (msg.type) {
    case 'ready':
      engineReady = true;
      log(`engine ready in ${msg.ms} ms`);
      show({ dot: 'done', label: 'Stuffy is ready', text: `Say "Stuffy" and a command — or press ${prettyHotkey()}`, hideAfter: 5000 });
      if (TEST.clips) runTestClips();
      break;
    case 'accurate-ready':
      log('accurate model ready');
      break;
    case 'speech-start':
      if (assistant) assistant.onSpeechStart();
      break;
    case 'segment':
      log(`heard (${msg.sec}s, ${msg.ms} ms): ${msg.text}`);
      if (TEST.clips) testLog.push({ heard: msg.text });
      if (assistant) assistant.onSegment(msg).catch((err) => log(`assistant error: ${err.stack || err}`));
      break;
    case 'refined': {
      log(`refined (${msg.ms} ms): ${msg.text}${msg.error ? ' error ' + msg.error : ''}`);
      const waiter = refineWaiters.get(msg.id);
      if (waiter) { refineWaiters.delete(msg.id); waiter(msg.text); }
      break;
    }
    case 'language':
      show({ dot: 'done', label: 'Language changed', text: (LANGUAGES.find(([c]) => c === msg.language) || [])[1] || msg.language, hideAfter: 2500 });
      break;
    case 'error':
      log(`engine error: ${msg.message}`);
      show({ dot: 'error', label: 'Problem', text: msg.message, hideAfter: 10000, sound: 'error' });
      break;
  }
}

// ------------------------------------------------------------------ self-test mode
async function runTestClips() {
  const clips = JSON.parse(fs.readFileSync(TEST.clips, 'utf8'));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const results = [];
  for (const clip of clips) {
    if (clip.waitMs) await sleep(clip.waitMs);
    const before = assistant.history.length;
    const heardBefore = testLog.length;
    engine.postMessage({ type: 'test-wav', file: clip.file });
    // Wait for the utterance to be heard and fully handled.
    const start = Date.now();
    while (Date.now() - start < 15000) {
      await sleep(100);
      if (testLog.length > heardBefore && !assistant.busy && Date.now() - start > 1500) break;
    }
    await sleep(clip.settleMs || 1200);
    const handled = assistant.history.slice(before);
    results.push({
      name: clip.name,
      heard: testLog.slice(heardBefore).map((h) => h.heard),
      mode: assistant.mode,
      hidden: overlay.getOpacity() === 0,
      commands: handled.map((h) => ({
        text: h.text,
        cancelled: !!h.cancelled,
        unknown: h.unknown || [],
        actions: (h.actions || []).map((a) => ({ kind: a.kind, keys: a.keys, target: a.target, query: a.query, text: a.text, op: a.op, state: a.state, engine: a.engine, label: a.label, n: a.n, name: a.name, title: a.title })),
        results: (h.results || []).map((r) => ({ ok: r.ok, error: r.error })),
      })),
    });
  }
  fs.writeFileSync(TEST.out, JSON.stringify(results, null, 2));
  app.quit();
}

// ------------------------------------------------------------------ startup
// Startup trace (synchronous, so it survives crashes): shows how each launch went.
function trace(...parts) {
  try {
    const file = path.join(app.getPath('userData'), 'startup.log');
    if (fs.existsSync(file) && fs.statSync(file).size > 100000) fs.rmSync(file);
    fs.appendFileSync(file, `${new Date().toISOString()} pid ${process.pid} ${parts.join(' ')}
`);
  } catch { /* never block startup on logging */ }
}
trace('launch', JSON.stringify(process.argv.slice(1)));

if (!app.requestSingleInstanceLock()) {
  trace('already running, exiting');
  app.quit();
} else {
  // The keep-alive task starts Stuffy every few minutes with --background: if it is
  // already running that must do nothing. Opening it from the Start menu wakes it.
  app.on('second-instance', (_e, argv) => {
    if (!argv.includes('--background') && assistant) assistant.wake();
  });
  app.whenReady().then(async () => {
    trace('ready');
    app.setAppUserModelId('com.stuffy.voice');
    loadSettings();

    // The keep-alive task must not bring Stuffy back after "Quit Stuffy"; signing in again does.
    const background = process.argv.includes('--background');
    const atLogin = process.argv.includes('--login');
    if (background && !atLogin && settings.quitByUser && !TEST.clips) return app.exit(0);
    if (settings.quitByUser) { settings.quitByUser = false; saveSettings(); }

    // Start with Windows + keep running (re-registered every start, which repairs it if removed).
    if (app.isPackaged && !TEST.clips && settings.openAtLogin !== false) setAutoStart(app, true, log);

    // Only our own overlay asks for the microphone; allow it without a prompt.
    session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => cb(permission === 'media'));

    trace('settings loaded');
    timers = new Timers({ file: dataFile('timers.json'), onDue: onTimerDue, log });
    helper = new WinHelper(app.isPackaged ? path.join(process.resourcesPath, 'system', 'helper.ps1') : undefined);
    executor = new Executor({
      helper, dryRun: TEST.dryRun, settings, custom, parse: parseCommand, log,
      hooks: { timers: timerAction, openEditor, showNumbers, hideNumbers, setHidden },
    });
    assistant = new Assistant({ executor, refine, ui: show, speak, log, custom, saveCustom });
    helper.start().then(() => executor.loadApps()).then((n) => log(`found ${n} Start menu apps`)).catch((e) => log(`helper failed: ${e.message}`));

    trace('helpers created');
    hotkey = HOTKEYS.find((accel) => globalShortcut.register(accel, () => assistant.wake())) || null;
    trace('hotkey', hotkey);
    createTray();
    trace('tray');
    createOverlay();
    wireOverlay();
    wireEditor();
    trace('windows');
    startEngine();
    startVoice();
    trace('engines started');
    if (!TEST.clips) log(`${timers.load()} timers/reminders waiting`);
    trace('started ok');

    ipcMain.on('audio', (_e, samples) => {
      // Ignore the mic while Stuffy itself is talking.
      if (engine && engineReady && !TEST.clips && !assistant.paused && Date.now() > micMutedUntil) engine.postMessage({ type: 'audio', samples });
    });
    ipcMain.on('spoke', (_e, { error }) => {
      log(error ? `speech playback failed: ${error}` : 'spoke');
      micMutedUntil = Math.min(micMutedUntil, Date.now() + 400);
      speaking = false;
      nextSpeech();
    });
    let micProblem = false;
    ipcMain.on('mic-status', (_e, status) => {
      if (!status.ok) {
        log(`mic not available: ${status.message}`);
        if (!micProblem) show({ dot: 'error', label: 'Microphone not available', text: 'I\'ll keep trying — check that a mic is plugged in', hideAfter: 10000, sound: 'error' });
        micProblem = true;
      } else {
        log(`mic: ${status.device}`);
        if (micProblem) show({ dot: 'done', label: 'Microphone is back', text: '', hideAfter: 3000 });
        micProblem = false;
      }
    });
    ipcMain.on('mic-level', (_e, level) => log(`mic level (last minute peak): ${level}`));
  });

  app.on('before-quit', () => { app.isQuitting = true; });
  app.on('will-quit', () => {
    globalShortcut.unregisterAll();
    if (engine) engine.kill();
    if (voice) voice.kill();
    if (helper) helper.stop();
  });
  app.on('window-all-closed', (e) => e.preventDefault());
}
