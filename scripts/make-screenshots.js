// Renders the README / user-guide pictures from Stuffy's own pages into docs/screenshots.
// Usage: npx electron scripts/make-screenshots.js
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'docs', 'screenshots');
const SAMPLE_COMMANDS = {
  'work mode': ['open chrome', 'open slack', 'open gmail'],
  'music time': ['open youtube music', 'volume 40'],
  'morning routine': ['open gmail', 'what are my tasks', 'new wallpaper'],
};

const SHOTS = [
  { page: 'scripts/screenshot-hero.html', file: 'stuffy.png', width: 960, height: 460 },
  { page: 'renderer/hamster/states.html', file: 'hamster-moods.png', width: 1060, height: 1150, zoom: 0.8 },
  { page: 'scripts/screenshot-desktop.html', file: 'on-your-desktop.png', width: 960, height: 540 },
  { page: 'renderer/editor.html', file: 'commands-editor.png', width: 760, height: 620, preload: true },
];

// The editor normally talks to the running app; here it gets sample commands and the real parser.
function writeEditorPreload() {
  const file = path.join(app.getPath('temp'), 'stuffy-editor-demo-preload.js');
  fs.writeFileSync(file, `
    const { contextBridge } = require('electron');
    const { parseCommand } = require(${JSON.stringify(path.join(ROOT, 'brain', 'parser.js'))});
    const commands = ${JSON.stringify(SAMPLE_COMMANDS)};
    contextBridge.exposeInMainWorld('stuffyEditor', {
      load: async () => commands,
      save: async () => true,
      run: async () => true,
      test: async (line) => {
        const { actions, unknown } = parseCommand(line);
        return actions.length && !unknown.length ? { ok: true, say: actions.map((a) => a.say).join(', ') } : { ok: false };
      },
    });`);
  return file;
}

setTimeout(() => { console.error('timed out'); app.exit(2); }, 60000);
app.on('window-all-closed', () => {}); // windows are closed one by one between shots; don't quit early
app.whenReady().then(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const preload = writeEditorPreload();
  for (const shot of SHOTS) {
    const win = new BrowserWindow({
      width: shot.width, height: shot.height, show: false, useContentSize: true,
      webPreferences: shot.preload ? { preload, sandbox: false } : {},
    });
    await win.loadFile(path.join(ROOT, shot.page));
    await win.webContents.insertCSS('::-webkit-scrollbar { display: none; }');
    if (shot.zoom) {
      win.webContents.setZoomFactor(shot.zoom);
      win.setContentSize(Math.round(shot.width * shot.zoom), Math.round(shot.height * shot.zoom));
    }
    await new Promise((r) => setTimeout(r, 1200));
    const img = await win.webContents.capturePage();
    fs.writeFileSync(path.join(OUT, shot.file), img.toPNG());
    console.log('saved', shot.file, img.getSize());
    win.destroy();
  }
  app.exit(0);
});
