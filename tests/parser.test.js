// Checks that spoken sentences turn into the right actions. Run: node tests/parser.test.js
const { detectWake, parseCommand, isYes } = require('../brain/parser');

// [what Whisper might hear, expected summary]. Summary format: kind:detail, joined by " | ".
const CASES = [
  // wake word variations
  ['Stuffy, open YouTube', 'open:youtube'],
  ['stuffy open YouTube.', 'open:youtube'],
  ['Hey Stuffy, open the browser and open Slack.', 'open:browser | open:slack'],
  ['Stuffie, open notepad', 'open:notepad'],
  ['Stovey open Chrome', 'open:chrome'],
  ['Stuffive Volume Up', 'volume:up'],
  ['Okay stuffy, next tab', 'key:ctrl+tab'],
  ['Stuffy, stuffy, open YouTube', 'open:youtube'],
  ['Stuff he open YouTube', 'open:youtube'],

  // the user's own examples
  ['Stuffy enter', 'key:enter'],
  ['Stuffy please click enter', 'key:enter'],
  ['Stuffy, press enter.', 'key:enter'],
  ['Stuffy hit enter', 'key:enter'],
  ['Stuffy open the browser and open Slack', 'open:browser | open:slack'],
  ['Stuffy open YouTube and search blockbuster Telugu songs', 'open:youtube | search:auto:blockbuster telugu songs'],
  ['Stuffy search blockbuster Telugu songs on YouTube', 'search:youtube:blockbuster telugu songs'],
  ['Stuffy go to the next tab', 'key:ctrl+tab'],
  ['Stuffy turn off the Wi-Fi', 'radio:WiFi:Off'],
  ['Stuffy turn on wifi', 'radio:WiFi:On'],
  ['Stuffy wifi off', 'radio:WiFi:Off'],
  ['Stuffy restart the computer', 'power:restart:confirm'],
  ['Stuffy shut down the computer.', 'power:shutdown:confirm'],
  ['Stuffy shutdown', 'power:shutdown:confirm'],
  ['Stuffy change the background of the wallpaper', 'wallpaper'],
  ['Stuffy change the URL to github.com', 'navigate:github.com'],
  ['Stuffy open Chrome and search for cricket scores', 'open:chrome | search:auto:cricket scores'],

  // apps & windows
  ['Stuffy launch VS Code', 'open:vs code'],
  ['Stuffy open file explorer', 'open:file explorer'],
  ['Stuffy open settings', 'open:settings'],
  ['Stuffy open my downloads', 'open:downloads'],
  ['Stuffy close this', 'window:close'],
  ['Stuffy close the window', 'window:close'],
  ['Stuffy close Chrome', 'closeApp:chrome'],
  ['Stuffy minimize', 'window:minimize'],
  ['Stuffy minimize this window', 'window:minimize'],
  ['Stuffy maximize it', 'window:maximize'],
  ['Stuffy show desktop', 'key:win+d'],
  ['Stuffy go to the home screen', 'key:win+d'],
  ['Stuffy minimize everything', 'key:win+d'],
  ['Stuffy switch to Chrome', 'focus:chrome'],
  ['Stuffy switch windows', 'key:alt+tab'],
  ['Stuffy full screen', 'fullscreen'],

  // browser
  ['Stuffy new tab', 'key:ctrl+t'],
  ['Stuffy open a new tab', 'key:ctrl+t'],
  ['Stuffy close tab', 'key:ctrl+w'],
  ['Stuffy close this tab', 'key:ctrl+w'],
  ['Stuffy previous tab', 'key:ctrl+shift+tab'],
  ['Stuffy tab 3', 'key:ctrl+3'],
  ['Stuffy go to tab three', 'key:ctrl+3'],
  ['Stuffy switch to the second tab', 'key:ctrl+2'],
  ['Stuffy last tab', 'key:ctrl+9'],
  ['Stuffy reopen closed tab', 'key:ctrl+shift+t'],
  ['Stuffy go back', 'key:alt+left'],
  ['Stuffy go forward', 'key:alt+right'],
  ['Stuffy refresh', 'key:f5'],
  ['Stuffy reload the page', 'key:f5'],
  ['Stuffy incognito', 'key:ctrl+shift+n'],
  ['Stuffy go to YouTube', 'navigate:youtube'],
  ['Stuffy go to gmail', 'navigate:gmail'],
  ['Stuffy search for weather in Hyderabad', 'search:auto:weather in hyderabad'],
  ['Stuffy google best laptop under 60000', 'search:google:best laptop under 60000'],
  ['Stuffy YouTube search lofi music', 'search:youtube:lofi music'],
  ['Stuffy search Amazon for wireless mouse', 'search:amazon:wireless mouse'],
  ['Stuffy search tom and jerry on YouTube', 'search:youtube:tom and jerry'],
  ['Stuffy play Naatu Naatu on YouTube', 'play:naatu naatu'],
  ['Stuffy play believer', 'play:believer'],
  ['Stuffy search', 'incomplete'],

  // keyboard & mouse
  ['Stuffy type hello world', 'type:hello world'],
  ['Stuffy type hello world and press enter', 'type:hello world | key:enter'],
  ['Stuffy type good morning and search', 'type:good morning | key:enter'],
  ['Stuffy select all', 'key:ctrl+a'],
  ['Stuffy copy', 'key:ctrl+c'],
  ['Stuffy copy that', 'key:ctrl+c'],
  ['Stuffy paste', 'key:ctrl+v'],
  ['Stuffy undo', 'key:ctrl+z'],
  ['Stuffy save', 'key:ctrl+s'],
  ['Stuffy delete that', 'key:delete'],
  ['Stuffy delete the last word', 'sequence'],
  ['Stuffy clear everything', 'sequence'],
  ['Stuffy press escape', 'key:esc'],
  ['Stuffy press tab', 'key:tab'],
  ['Stuffy press control shift T', 'key:ctrl+shift+t'],
  ['Stuffy press F5', 'key:f5'],
  ['Stuffy scroll down', 'mouse:scroll:-5'],
  ['Stuffy scroll up a lot', 'mouse:scroll:15'],
  ['Stuffy page down', 'key:pagedown'],
  ['Stuffy go to the top', 'key:ctrl+home'],
  ['Stuffy scroll to the bottom', 'key:ctrl+end'],
  ['Stuffy click', 'mouse:left'],
  ['Stuffy double click', 'mouse:double'],
  ['Stuffy right click', 'mouse:right'],
  ['Stuffy zoom in', 'key:ctrl+='],

  // media
  ['Stuffy pause', 'media:playpause'],
  ['Stuffy pause the video', 'media:playpause'],
  ['Stuffy play', 'media:playpause'],
  ['Stuffy resume', 'media:playpause'],
  ['Stuffy stop', 'media:playpause'],
  ['Stuffy next song', 'media:next'],
  ['Stuffy skip', 'media:next'],

  // system
  ['Stuffy volume up', 'volume:up:10'],
  ['Stuffy volume down by 20', 'volume:down:20'],
  ['Stuffy turn up the volume', 'volume:up:10'],
  ['Stuffy increase the volume', 'volume:up:10'],
  ['Stuffy set volume to 50', 'volume:set:50'],
  ['Stuffy volume fifty', 'volume:set:50'],
  ['Stuffy volume 30%', 'volume:set:30'],
  ['Stuffy max volume', 'volume:set:100'],
  ['Stuffy mute', 'volume:mute'],
  ['Stuffy unmute', 'volume:unmute'],
  ['Stuffy louder', 'volume:up:10'],
  ['Stuffy brightness up', 'brightness:up'],
  ['Stuffy turn off bluetooth', 'radio:Bluetooth:Off'],
  ['Stuffy disable bluetooth', 'radio:Bluetooth:Off'],
  ['Stuffy next wallpaper', 'wallpaper'],
  ['Stuffy change wallpaper', 'wallpaper'],
  ['Stuffy take a screenshot', 'screenshot'],
  ['Stuffy lock the computer', 'power:lock'],
  ['Stuffy lock', 'power:lock'],
  ['Stuffy put the computer to sleep', 'power:sleep'],
  ['Stuffy reboot', 'power:restart:confirm'],
  ['Stuffy cancel shutdown', 'power:cancel'],
  ['Stuffy log out', 'power:signout:confirm'],
  ['Stuffy what time is it', 'time'],
  ['Stuffy what can you do', 'help'],
  ['Stuffy never mind', 'cancel'],
  ['Stuffy stop listening', 'stopListening'],
  ['Stuffy can you please open YouTube for me', 'open:youtube'],
  ['Stuffy open YouTube then search songs then press enter', 'open:youtube | search:auto:songs | key:enter'],
  ['Stuffy open notepad and type hello', 'open:notepad | type:hello'],

  // not for Stuffy: no wake word
  ['I need to buy some stuff today', 'NOWAKE'],
  ['Let me study for the exam', 'NOWAKE'],
  ['Steve, can you open the door', 'NOWAKE'],
  ['open YouTube', 'NOWAKE'],
  ['This song is a blockbuster hit', 'NOWAKE'],
  ['The stuffy room needs air', 'NOWAKE'],

  // wake word but nonsense after it
  ['Stuffy banana helicopter', 'UNKNOWN'],

  // v2: dictation
  ['Stuffy dictation', 'dictation'],
  ['Stuffy start dictation', 'dictation'],
  ['Stuffy take dictation', 'dictation'],
  ['Stuffy type what I say', 'dictation'],

  // v2: clicking by name / number
  ['Stuffy click Subscribe', 'clickName:subscribe:left'],
  ['Stuffy click the search box', 'clickName:search:left'],
  ['Stuffy click on sign in', 'clickName:sign in:left'],
  ['Stuffy double click my documents', 'clickName:my documents:double'],
  ['Stuffy right click the file', 'clickName:file:right'],
  ['Stuffy show numbers', 'numbers:show'],
  ['Stuffy hide numbers', 'numbers:hide'],
  ['Stuffy click 7', 'clickNumber:7:left'],
  ['Stuffy click number twelve', 'clickNumber:12:left'],
  ['Stuffy double click 3', 'clickNumber:3:double'],
  ['Stuffy type into 3 hello', 'clickNumber:3:left'],
  ['Stuffy click enter', 'key:enter'],
  ['Stuffy click', 'mouse:left'],

  // v2: timers & reminders
  ['Stuffy set a timer for 5 minutes', 'timer:add:300000'],
  ['Stuffy timer for ten minutes', 'timer:add:600000'],
  ['Stuffy 25 minute timer', 'timer:add:1500000'],
  ['Stuffy set a timer for an hour and a half', 'timer:add:5400000'],
  ['Stuffy set a timer for half an hour', 'timer:add:1800000'],
  ['Stuffy remind me in 20 minutes to drink water', 'timer:remind:drink water'],
  ['Stuffy remind me to call mom in 1 hour', 'timer:remind:call mom'],
  ['Stuffy remind me at 6 pm to go to the gym', 'timer:remind:go to the gym'],
  ['Stuffy remind me at 6:30 p.m. to call mom', 'timer:remind:call mom'],
  ['Stuffy remind me tomorrow at 9 am to submit the form', 'timer:remind:submit the form'],
  ['Stuffy remind me to feed the hamster at 8', 'timer:remind:feed the hamster'],
  ['Stuffy what are my timers', 'timer:list'],
  ['Stuffy cancel the timer', 'timer:cancel:timer'],
  ['Stuffy cancel all reminders', 'timer:cancel:reminder'],
  ['Stuffy stop the timer', 'timer:cancel:timer'],

  // v2: routines & editor
  ['Stuffy start recording', 'record:start'],
  ['Stuffy stop recording', 'record:stop'],
  ['Stuffy save it as morning routine', 'record:save:morning routine'],
  ['Stuffy cancel recording', 'record:cancel'],
  ['Stuffy open my commands', 'editor'],
  ['Stuffy edit my commands', 'editor'],

  // v2: Focus Dot
  ['Stuffy add a Q1 task finish editing', 'focusdot:add:1:finish editing'],
  ['Stuffy add task buy hamster food', 'focusdot:add::buy hamster food'],
  ['Stuffy add an urgent task call the bank', 'focusdot:add:1:call the bank'],
  ['Stuffy new task clean the cage in q three', 'focusdot:add:3:clean the cage'],
  ['Stuffy what are my tasks', 'focusdot:list'],
  ['Stuffy mark finish editing as done', 'focusdot:done:finish editing'],
  ['Stuffy pause the task', 'focusdot:pause'],
  ['Stuffy start task finish editing', 'focusdot:start:finish editing'],
  ['Stuffy add a note buy hamster food', 'focusdot:note:buy hamster food'],

  // v2: snap windows
  ['Stuffy snap left', 'key:win+left'],
  ['Stuffy snap it to the right', 'key:win+right'],
  ['Stuffy move it to the other screen', 'key:win+shift+right'],
  ['Stuffy make it smaller', 'key:win+down'],

  // hide / show Stuffy on screen
  ['Stuffy hide', 'visibility'],
  ['Stuffy hide yourself', 'visibility'],
  ['Stuffy disappear', 'visibility'],
  ['Stuffy show yourself', 'visibility'],
  ['Stuffy come back', 'visibility'],
  ['Stuffy unhide', 'visibility'],
  ['Stuffy hide numbers', 'numbers:hide'],

  // past tense mis-hearings
  ['Stuffy, closed tab', 'key:ctrl+w'],
  ['Stuffy turned off the wifi', 'radio:WiFi:Off'],
  ['Stuffy opened YouTube and searched cats', 'open:youtube | search:auto:cats'],
];

function summarize(action) {
  switch (action.kind) {
    case 'key': return `key:${action.keys.join('+')}`;
    case 'open': case 'navigate': case 'focus': case 'closeApp': return `${action.kind}:${action.target}`;
    case 'search': return `search:${action.engine}:${action.query}`;
    case 'play': return `play:${action.query}`;
    case 'type': return `type:${action.text}`;
    case 'window': return `window:${action.op}`;
    case 'radio': return `radio:${action.radio}:${action.state}`;
    case 'volume': return `volume:${action.op}${action.value != null && action.op !== 'mute' && action.op !== 'unmute' ? ':' + action.value : ''}`;
    case 'brightness': return `brightness:${action.op}`;
    case 'power': return `power:${action.op}${action.confirm ? ':confirm' : ''}`;
    case 'mouse': return `mouse:${action.what}${action.what === 'scroll' ? ':' + action.amount : ''}`;
    case 'media': return `media:${action.op}`;
    case 'clickName': return `clickName:${action.target}:${action.button}`;
    case 'clickNumber': return `clickNumber:${action.n}:${action.button}`;
    case 'numbers': return `numbers:${action.op}`;
    case 'timer':
      if (action.op === 'add') return `timer:add:${action.durationMs}`;
      if (action.op === 'remind') return `timer:remind:${action.label}`;
      if (action.op === 'cancel') return `timer:cancel:${action.which}`;
      return `timer:${action.op}`;
    case 'record': return `record:${action.op}${action.name ? ':' + action.name : ''}`;
    case 'focusdot':
      if (action.op === 'add') return `focusdot:add:${action.q || ''}:${action.title}`;
      if (action.op === 'note') return `focusdot:note:${action.text}`;
      return `focusdot:${action.op}${action.title ? ':' + action.title : ''}`;
    default: return action.kind;
  }
}

function run(sentence) {
  const wake = detectWake(sentence);
  if (!wake.found) return 'NOWAKE';
  const { actions, unknown } = parseCommand(wake.rest);
  if (unknown.length) return 'UNKNOWN';
  return actions.map(summarize).join(' | ');
}

let failed = 0;
for (const [sentence, expected] of CASES) {
  const got = run(sentence);
  // Allow "volume:up" style expectations to ignore the step value.
  const ok = got.toLowerCase() === expected.toLowerCase() || (expected.split(':').length === 2 && got.startsWith(expected + ':') && !got.includes('|'));
  if (!ok) {
    failed++;
    console.log(`FAIL  "${sentence}"\n      expected: ${expected}\n      got:      ${got}`);
  }
}

// Typed text and search words must keep their capital letters.
const caseChecks = [
  ['Stuffy type Hello World', 'Hello World', (a) => a.text],
  ['Stuffy search Naatu Naatu on YouTube', 'Naatu Naatu', (a) => a.query],
  ['Stuffy, type Good Morning and press enter', 'Good Morning', (a) => a.text],
];
for (const [sentence, want, pick] of caseChecks) {
  const got = pick(parseCommand(detectWake(sentence).rest).actions[0]);
  if (got !== want) { failed++; console.log(`FAIL  case kept for "${sentence}": got "${got}"`); }
}

// Whisper's repeat loops are cleaned, real text is left alone.
const { dropRepeats } = require('../brain/parser');
const repeatChecks = [
  ['Next tab Next tab Next tab Next', 'Next tab'],
  ['Open YouTube Open YouTube Open YouTube Open', 'Open YouTube'],
  ['Stuffy, volume up.', 'Stuffy, volume up.'],
  ['Stuffy play Naatu Naatu', 'Stuffy play Naatu Naatu'],
  ['search tom and jerry', 'search tom and jerry'],
  ['Hello World', 'Hello World'],
];
for (const [input, want] of repeatChecks) {
  const got = dropRepeats(input);
  if (got !== want) { failed++; console.log(`FAIL  dropRepeats("${input}") = "${got}", want "${want}"`); }
}

const yes = ['yes', 'Yes.', 'yeah', 'Yes please', 'confirm', 'do it', 'Okay.'];
const notYes = ['no', 'cancel', 'wait', 'yes and no', 'maybe'];
for (const y of yes) if (!isYes(y)) { failed++; console.log(`FAIL  isYes("${y}") should be true`); }
for (const n of notYes) if (isYes(n)) { failed++; console.log(`FAIL  isYes("${n}") should be false`); }

const total = CASES.length + repeatChecks.length + caseChecks.length + yes.length + notYes.length;
console.log(`\n${total - failed}/${total} parser checks passed`);
process.exit(failed ? 1 : 0);
