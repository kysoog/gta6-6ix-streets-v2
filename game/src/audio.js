// Vice Meridian — procedural audio. No files, no autoplay: the first user gesture starts the
// AudioContext; after that everything plays freely. Engine drone pitch tracks car speed.

export function createAudio() {
  let ctx = null;
  let started = false;
  let engine = null;
  let siren = null;

  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext ?? window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') return false;
    started = true;
    return true;
  }

  function start() { ensure(); }

  function engineLoop(speed) {
    if (!ensure()) return;
    if (!engine) {
      const noise = ctx.createBufferSource();
      const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
      noise.buffer = buffer; noise.loop = true;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass'; filter.frequency.value = 700;
      const gain = ctx.createGain(); gain.gain.value = 0.04;
      const osc1 = ctx.createOscillator(); osc1.type = 'sawtooth';
      const osc2 = ctx.createOscillator(); osc2.type = 'sawtooth';
      osc1.detune.value = 6; osc2.detune.value = -6;
      const mix = ctx.createGain(); mix.gain.value = 0.03;
      noise.connect(filter); filter.connect(gain);
      osc1.connect(mix); osc2.connect(mix); mix.connect(gain);
      gain.connect(ctx.destination);
      noise.start(); osc1.start(); osc2.start();
      engine = { noise, filter, gain, osc1, osc2, mix };
    }
    const active = speed > 1.5;
    engine.gain.gain.setTargetAtTime(active ? 0.12 : 0.025, ctx.currentTime, 0.1);
    const rate = 20 + speed * 2.6;
    engine.filter.frequency.setTargetAtTime(600 + speed * 35, ctx.currentTime, 0.08);
    engine.osc1.frequency.setTargetAtTime(90 + rate * 1.5, ctx.currentTime, 0.08);
    engine.osc2.frequency.setTargetAtTime(90 + rate * 1.55, ctx.currentTime, 0.08);
  }

  function sirenLoop(active) {
    if (!ensure()) return;
    if (!siren) {
      const osc = ctx.createOscillator(); osc.type = 'square';
      const gain = ctx.createGain(); gain.gain.value = 0;
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start();
      siren = { osc, gain };
    }
    siren.gain.gain.setTargetAtTime(active ? 0.16 : 0, ctx.currentTime, 0.05);
    const freq = 720 + 480 * Math.sin(ctx.currentTime * 7);
    siren.osc.frequency.setTargetAtTime(freq, ctx.currentTime, 0.03);
  }

  function wantedSiren() {
    if (!ensure()) return;
    const osc = ctx.createOscillator(); osc.type = 'square';
    const gain = ctx.createGain(); gain.gain.value = 0;
    osc.connect(gain); gain.connect(ctx.destination);
    osc.start();
    const t = ctx.currentTime;
    osc.frequency.setValueAtTime(950, t);
    osc.frequency.exponentialRampToValueAtTime(1700, t + 0.25);
    gain.gain.setValueAtTime(0.18, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    setTimeout(() => { try { osc.stop(); } catch {}; }, 300);
  }

  function horn() {
    if (!ensure()) return;
    const osc = ctx.createOscillator(); osc.type = 'sawtooth';
    const gain = ctx.createGain(); gain.gain.value = 0;
    osc.connect(gain); gain.connect(ctx.destination);
    osc.start();
    const t = ctx.currentTime;
    osc.frequency.setValueAtTime(200, t);
    osc.frequency.exponentialRampToValueAtTime(100, t + 0.4);
    gain.gain.setValueAtTime(0.14, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
    setTimeout(() => { try { osc.stop(); } catch {}; }, 450);
  }

  function crash() {
    if (!ensure()) return;
    const buffer = ctx.createBuffer(2, ctx.sampleRate * 0.6, ctx.sampleRate);
    for (let c = 0; c < 2; c += 1) {
      const data = buffer.getChannelData(c);
      for (let i = 0; i < data.length; i += 1) data[i] = (Math.random() * 2 - 1) * Math.exp(-i * 8);
    }
    const noise = ctx.createBufferSource(); noise.buffer = buffer;
    const gain = ctx.createGain(); gain.gain.value = 0.5;
    noise.connect(gain); gain.connect(ctx.destination);
    noise.start();
  }

  return { start, engineLoop, sirenLoop, wantedSiren, horn, crash, get started() { return started; } };
}
