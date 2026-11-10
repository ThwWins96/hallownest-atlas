// Original synthesized compositions for Hallownest Atlas.
const lanterns = [
  { bass: 38, chord: [50, 57, 60, 64, 65], notes: [[0.5,69],[2.2,76],[4.4,72]] },
  { bass: 34, chord: [46, 53, 57, 60, 62], notes: [[1.1,74],[3.7,69]] },
  { bass: 43, chord: [50, 55, 58, 65, 69], notes: [[0.7,70],[2.6,74],[5.0,77]] },
  { bass: 36, chord: [48, 55, 60, 62, 64], notes: [[1.2,76],[3.2,74],[4.8,67]] },
  { bass: 39, chord: [51, 58, 62, 65, 67], notes: [[0.9,79],[3.5,74]] },
  { bass: 33, chord: [45, 52, 55, 59, 60], notes: [[0.4,72],[2.4,71],[4.7,76]] },
  { bass: 43, chord: [50, 55, 58, 60, 65], notes: [[1.3,77],[3.0,74],[5.1,70]] },
  { bass: 38, chord: [50, 57, 60, 64, 65], notes: [[0.8,69],[2.5,65],[4.1,64]] }
];

const tracks = {
  lanterns: { name: 'Lanterns Below', phraseLength: 6, score: lanterns },
  glasswater: {
    name: 'Glasswater',
    phraseLength: 7.5,
    score: [
      { bass: 36, chord: [48,55,62,64,69], notes: [[0.7,79],[2.05,84],[4.55,81],[6.25,74]] },
      { bass: 40, chord: [52,59,62,67,71], notes: [[1.3,76],[3.3,83],[5.9,79]] },
      { bass: 41, chord: [48,53,60,64,67], notes: [[0.85,81],[2.65,84],[4.9,86],[6.35,79]] },
      { bass: 38, chord: [50,57,60,64,65], notes: [[1.1,77],[3.75,76],[5.7,72]] },
      { bass: 45, chord: [52,57,60,67,71], notes: [[0.5,83],[2.2,79],[4.6,76],[6.1,74]] },
      { bass: 43, chord: [50,55,62,64,69], notes: [[1.55,81],[3.65,76],[5.85,74]] }
    ]
  },
  threshold: {
    name: 'Moss Threshold',
    phraseLength: 5.5,
    score: [
      { bass: 40, chord: [47,52,55,59,66], notes: [[0.2,67],[1.45,66],[3.85,71]] },
      { bass: 36, chord: [48,52,55,62,66], notes: [[0.9,64],[2.1,67],[4.2,74]] },
      { bass: 38, chord: [45,50,54,57,62], notes: [[0.5,69],[2.75,66],[4.6,64]] },
      { bass: 42, chord: [49,54,57,61,64], notes: [[0.3,61],[1.75,64],[3.7,69]] },
      { bass: 35, chord: [47,50,54,57,64], notes: [[1.1,66],[2.8,62],[4.3,71]] },
      { bass: 40, chord: [47,52,55,59,62], notes: [[0.65,67],[2.25,64],[4.05,66]] }
    ]
  }
};

const circle = 2 * Math.PI;

export function renderMusic(sampleRate = 24000, trackId = 'lanterns') {
  const {phraseLength, score} = tracks[trackId];
  const frames = sampleRate * phraseLength * score.length;
  const dry = [new Float32Array(frames), new Float32Array(frames)];
  const addVoice = (pitch, start, duration, level, pan, plucked = false) => {
    const onset = Math.round(start * sampleRate);
    const length = Math.round(duration * sampleRate);
    const angle = circle * 440 * 2 ** ((pitch - 69) / 12) / sampleRate;
    const left = level * Math.sqrt((1 - pan) / 2);
    const right = level * Math.sqrt((1 + pan) / 2);
    for (let i = 0; i < length; i++) {
      const time = i / sampleRate;
      const phase = angle * i;
      const edge = Math.min(1, (duration - time) / (plucked ? 0.25 : 1.25));
      const envelope = plucked
        ? Math.min(1, time / 0.023) * Math.exp(-1.42 * time) * edge
        : Math.min(1, time / 1.55) * (0.87 + 0.13 * Math.sin(time * 1.9 + pitch)) * edge;
      const wave = plucked
        ? Math.sin(phase) + 0.24 * Math.sin(2 * phase) * Math.exp(-3.8 * time)
          + 0.09 * Math.sin(3.01 * phase) * Math.exp(-5.5 * time)
        : 0.77 * Math.sin(phase + 0.15 * Math.sin(time * 1.8))
          + 0.18 * Math.sin(1.003 * phase) + 0.05 * Math.sin(2 * phase);
      const frame = (onset + i) % frames;
      const value = wave * envelope;
      dry[0][frame] += value * left;
      dry[1][frame] += value * right;
    }
  };

  score.forEach(({bass,chord,notes}, index) => {
    const start = index * phraseLength;
    addVoice(bass, start, 7.35, 0.11, 0);
    chord.forEach((pitch, voice) =>
      addVoice(pitch, start + 0.11 * voice, 7.15, 0.064, (voice - 2) * 0.29));
    addVoice(chord[1] + 12, start + 1.65, 2.4, 0.065, -0.39, true);
    notes.forEach(([time,pitch], note) =>
      addVoice(pitch, start + time, 3.1, 0.17, note % 2 ? -0.29 : 0.29, true));
  });

  const reflections = [[0.149,0.19],[0.263,0.15],[0.439,0.12],[0.673,0.084],[0.937,0.048],[1.337,0.027]];
  return dry.map((channel, side) => {
    const wet = channel.slice();
    reflections.forEach(([delay,level], index) => {
      const offset = Math.round((delay + side * 0.021) * sampleRate);
      const reflected = dry[index % 2 ? side : 1 - side];
      for (let i = 0; i < frames; i++) {
        wet[(i + offset) % frames] += reflected[i] * level;
      }
    });
    for (let i = 0; i < frames; i++) wet[i] = Math.tanh(wet[i] * 1.45);
    return wet;
  });
}

function mountMusic() {
  const button = document.querySelector('#music-toggle');
  if (!button) return;
  const picker = document.querySelector('#music-track');
  const volume = document.querySelector('#music-volume');
  const status = document.querySelector('#music-status');
  const settings = document.querySelector('.music-control');
  const volumeKey = 'hallownest-music-volume';
  const trackKey = 'hallownest-music-track';
  let context;
  let buffer;
  let active;
  let offset = 0;

  const saved = localStorage.getItem(volumeKey);
  if (saved !== null && /^\d{1,3}$/.test(saved)) volume.value = Math.min(100, Number(saved));
  picker.replaceChildren(...Object.entries(tracks).map(([id,track]) => new Option(track.name,id)));
  const savedTrack = localStorage.getItem(trackKey);
  if (Object.hasOwn(tracks,savedTrack)) picker.value = savedTrack;

  const translate = (ru,en) => document.querySelector('#language-switch').value === 'ru' ? ru : en;
  const update = () => {
    settings.dataset.playing = String(Boolean(active));
    button.setAttribute('aria-pressed', settings.dataset.playing);
    button.title = active ? translate('Поставить музыку на паузу','Pause music')
      : translate('Включить музыку','Play music');
    button.setAttribute('aria-label', button.title);
    const label = translate('Музыка Атласа','Atlas soundtrack');
    settings.setAttribute('aria-label', label);
    settings.querySelector('.music-kicker').textContent = label;
    volume.setAttribute('aria-label', translate('Громкость музыки','Music volume'));
    volume.title = translate('Громкость музыки','Music volume');
    picker.setAttribute('aria-label', translate('Выбрать композицию','Choose a track'));
  };
  const level = () => (Number(volume.value) / 100) ** 1.5;

  const pause = () => {
    const now = context.currentTime;
    offset = (offset + now - active.startedAt) % buffer.duration;
    active.gain.gain.setTargetAtTime(0, now, 0.021);
    active.source.stop(now + 0.12);
    active = undefined;
    update();
  };

  const play = async () => {
    status.textContent = '';
    button.disabled = true;
    picker.disabled = true;
    try {
      context ??= new AudioContext();
      await context.resume();
      if (!buffer) {
        const channels = renderMusic(24000, picker.value);
        buffer = context.createBuffer(channels.length, channels[0].length, 24000);
        channels.forEach((samples, channel) => buffer.copyToChannel(samples, channel));
      }
      const source = context.createBufferSource();
      const gain = context.createGain();
      const startedAt = context.currentTime;
      gain.gain.setValueAtTime(0, startedAt);
      gain.gain.setTargetAtTime(level(), startedAt, 0.045);
      source.buffer = buffer;
      source.loop = true;
      source.connect(gain).connect(context.destination);
      source.onended = () => { source.disconnect(); gain.disconnect(); };
      source.start(startedAt, offset);
      active = {source, gain, startedAt};
    } catch {
      status.textContent = translate('Не удалось запустить музыку.','Music could not start.');
    } finally {
      button.disabled = false;
      picker.disabled = false;
      update();
    }
  };

  button.onclick = () => active ? pause() : play();
  picker.onchange = () => {
    const wasPlaying = Boolean(active);
    if (wasPlaying) pause();
    buffer = undefined;
    offset = 0;
    localStorage.setItem(trackKey, picker.value);
    if (wasPlaying) void play();
    else status.textContent = '';
  };
  volume.oninput = () => {
    localStorage.setItem(volumeKey, volume.value);
    active?.gain.gain.setTargetAtTime(level(), context.currentTime, 0.035);
  };
  document.querySelector('#language-switch').addEventListener('change', update);
  settings.hidden = false;
  update();
}

if (typeof document !== 'undefined') mountMusic();
