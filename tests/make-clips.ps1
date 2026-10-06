# Makes the voice clips used by tests/e2e.test.js with Windows' built-in voices.
$dir = Join-Path $env:TEMP 'stuffy-e2e'
New-Item -ItemType Directory -Force $dir | Out-Null
Add-Type -AssemblyName System.Speech
$fmt = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(16000, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)
$lines = @(
  'open_yt|David|0|Stuffy, open YouTube',
  'wake_only|Zira|0|Stuffy',
  'then_notepad|Zira|0|open notepad',
  'search_yt|David|0|Stuffy, search blockbuster Telugu songs on YouTube',
  'enter|Zira|1|Stuffy enter',
  'click_enter|David|0|Stuffy, please click enter',
  'restart|David|0|Stuffy, restart the computer',
  'yes|David|0|Yes',
  'shutdown|Zira|0|Stuffy, shut down the computer',
  'no|Zira|0|No',
  'follow_open|David|0|Stuffy, open Gmail',
  'follow_next|David|0|next tab',
  'neg_stuff|Zira|0|I need to buy some stuff today',
  'neg_study|David|0|Let me study for the exam tomorrow',
  'neg_open|Zira|0|open YouTube',
  'browser_slack|David|0|Hey Stuffy, open the browser and open Slack',
  'wifi|Zira|0|Stuffy, turn off the wifi',
  'type|David|0|Stuffy, type Hello World and press enter',
  'volume|Zira|1|Stuffy, volume up',
  'wallpaper|David|0|Stuffy, change the background of the wallpaper',
  'nexttab|Zira|0|Stuffy, go to the next tab',
  'search_only|David|0|Stuffy, search',
  'search_rest|David|0|cricket scores',
  'chrome_search|Zira|-1|Stuffy, open Chrome and search for weather in Hyderabad',
  'play|David|0|Stuffy, play Believer by Imagine Dragons on YouTube',
  'live_calc|Zira|0|Stuffy, open calculator',
  'live_calc_close|Zira|0|Stuffy, close calculator',
  'live_yt|David|0|Stuffy, search lofi music on YouTube',
  'live_close_tab|David|0|Stuffy, close tab',
  'v2_time|Zira|0|Stuffy, what time is it',
  'v2_timer|David|0|Stuffy, set a timer for five minutes',
  'v2_remind|Zira|0|Stuffy, remind me in twenty minutes to drink water',
  'v2_timers|David|0|Stuffy, what are my timers',
  'v2_dict_start|Zira|0|Stuffy, start dictation',
  'v2_dict_text|David|0|Hello, this is a dictation test.',
  'v2_dict_stop|Zira|0|Stop dictation',
  'v2_click|David|0|Stuffy, click subscribe',
  'v2_numbers|Zira|0|Stuffy, show numbers',
  'v2_pick|David|0|Two',
  'v2_rec_start|Zira|0|Stuffy, start recording',
  'v2_rec_1|David|0|Stuffy, open YouTube',
  'v2_rec_2|Zira|0|Stuffy, volume up',
  'v2_rec_save|David|0|Stuffy, save it as test routine',
  'v2_rec_run|Zira|0|Stuffy, test routine',
  'v2_task|David|0|Stuffy, add a Q1 task finish editing',
  'v2_tasks|Zira|0|Stuffy, what are my tasks',
  'v2_snap|David|0|Stuffy, snap left',
  'v3_hide|Zira|0|Stuffy, hide yourself',
  'v3_show|David|0|Stuffy, come back'
)
foreach ($l in $lines) {
  $name, $voice, $rate, $text = $l.Split('|')
  $s = New-Object System.Speech.Synthesis.SpeechSynthesizer
  $s.SelectVoice("Microsoft $voice Desktop")
  $s.Rate = [int]$rate
  $s.SetOutputToWaveFile((Join-Path $dir "$name.wav"), $fmt)
  $s.Speak($text)
  $s.Dispose()
}
"$($lines.Count) clips in $dir"
