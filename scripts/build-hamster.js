// Copies habitat.svg into habitat.js so the overlay can put it inline in the page
// (inline SVG is what lets CSS animate each part). Runs before start/dist.
const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, '..', 'renderer', 'hamster');
const svg = fs.readFileSync(path.join(dir, 'habitat.svg'), 'utf8');
fs.writeFileSync(path.join(dir, 'habitat.js'), `// Generated from habitat.svg by scripts/build-hamster.js — edit the .svg, not this file.\nwindow.HABITAT_SVG = ${JSON.stringify(svg)};\n`);
console.log('renderer/hamster/habitat.js written');
