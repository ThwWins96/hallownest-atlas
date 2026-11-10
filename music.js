// "Lanterns Below", an original synthesized composition for Hallownest Atlas.
const phraseLength = 6;
const score = [
  { bass: 38, chord: [50, 57, 60, 64, 65], notes: [[0.5,69],[2.2,76],[4.4,72]] },
  { bass: 34, chord: [46, 53, 57, 60, 62], notes: [[1.1,74],[3.7,69]] },
  { bass: 43, chord: [50, 55, 58, 65, 69], notes: [[0.7,70],[2.6,74],[5.0,77]] },
  { bass: 36, chord: [48, 55, 60, 62, 64], notes: [[1.2,76],[3.2,74],[4.8,67]] },
  { bass: 39, chord: [51, 58, 62, 65, 67], notes: [[0.9,79],[3.5,74]] },
  { bass: 33, chord: [45, 52, 55, 59, 60], notes: [[0.4,72],[2.4,71],[4.7,76]] },
  { bass: 43, chord: [50, 55, 58, 60, 65], notes: [[1.3,77],[3.0,74],[5.1,70]] },
  { bass: 38, chord: [50, 57, 60, 64, 65], notes: [[0.8,69],[2.5,65],[4.1,64]] }
];
const circle = 2 * Math.PI;

export function renderMusic(sampleRate = 24000) {
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
  const volume = document.querySelector('#music-volume');
  const status = document.querySelector('#music-status');
  const settings = document.querySelector('.music-control');
  const key = 'hallownest-music-volume';
  let context;
  let buffer;
  let active;
  let offset = 0;

  const saved = localStorage.getItem(key);
  if (saved !== null && /^\d{1,3}$/.test(saved)) volume.value = Math.min(100, Number(saved));

  const translate = (ru,en) => document.querySelector('#language-switch').value === 'ru' ? ru : en;
  const update = () => {
    button.setAttribute('aria-pressed', String(Boolean(active)));
    button.title = active ? translate('Поставить музыку на паузу','Pause music')
      : translate('Включить музыку','Play music');
    button.querySelector('.music-icon').textContent = active ? 'Ⅱ' : '♪';
    button.querySelector('.music-label').textContent = translate('Музыка','Music');
    volume.setAttribute('aria-label', translate('Громкость музыки','Music volume'));
    volume.title = translate('Громкость музыки','Music volume');
  };
  const level = () => (Number(volume.value) / 100) ** 1.5;

  button.onclick = async () => {
    status.textContent = '';
    if (active) {
      const now = context.currentTime;
      offset = (offset + now - active.startedAt) % buffer.duration;
      active.gain.gain.setTargetAtTime(0, now, 0.021);
      active.source.stop(now + 0.12);
      active = undefined;
      update();
      return;
    }

    button.disabled = true;
    try {
      context ??= new AudioContext();
      await context.resume();
      if (!buffer) {
        const channels = renderMusic();
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
      update();
    }
  };

  volume.oninput = () => {
    localStorage.setItem(key, volume.value);
    active?.gain.gain.setTargetAtTime(level(), context.currentTime, 0.035);
  };
  document.querySelector('#language-switch').addEventListener('change', update);
  settings.hidden = false;
  update();
}

if (typeof document !== 'undefined') mountMusic();
