// Saves a screenshot of a local HTML page (design previews). Usage: electron scripts/render-page.js page.html out.png width height
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');
const [page, output, w = '940', h = '720'] = process.argv.slice(2);
setTimeout(() => { console.error('timed out'); app.exit(2); }, 25000);
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: Number(w), height: Number(h), show: false, useContentSize: true });
  await win.loadFile(path.resolve(page));
  await new Promise((r) => setTimeout(r, 800));
  const img = await win.webContents.capturePage();
  fs.writeFileSync(output, img.toPNG());
  console.log('saved', output, img.getSize());
  app.exit(0);
});
