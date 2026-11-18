/**
 * Erzeugt Fokus-Klangwelten (Regen, Tiefes Rauschen, Alpha-Binaural)
 * und einen sanften Klangschalen-Gong komplett ohne externe MP3-Dateien.
 */
export class FocusAudioEngine {
  constructor() {
    this.ctx = null;
    this.activeNodes = [];
    this.currentMode = 'off';
  }

  ensureContext() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  stopAll() {
    this.activeNodes.forEach((node) => {
      try {
        if (node.stop) node.stop();
        if (node.disconnect) node.disconnect();
      } catch {}
    });
    this.activeNodes = [];
    this.currentMode = 'off';
  }

  setMode(mode) {
    this.stopAll();
    this.currentMode = mode;
    if (mode === 'off') return;

    this.ensureContext();
    const ctx = this.ctx;

    if (mode === 'rain' || mode === 'brown') {
      const bufferSize = ctx.sampleRate * 3;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);

      let lastOut = 0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        if (mode === 'brown') {
          data[i] = (lastOut + 0.02 * white) / 1.02;
          lastOut = data[i];
          data[i] *= 2.5;
        } else {
          data[i] = white * 0.35;
        }
      }

      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;

      const filter = ctx.createBiquadFilter();
      filter.type = mode === 'rain' ? 'bandpass' : 'lowpass';
      filter.frequency.value = mode === 'rain' ? 950 : 280;

      const gain = ctx.createGain();
      gain.gain.value = 0.25;

      source.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      source.start();

      this.activeNodes.push(source, filter, gain);
    } else if (mode === 'binaural') {
      const merger = ctx.createChannelMerger(2);
      const leftOsc = ctx.createOscillator();
      const rightOsc = ctx.createOscillator();
      const gain = ctx.createGain();

      leftOsc.frequency.value = 200;
      rightOsc.frequency.value = 210;
      gain.gain.value = 0.07;

      leftOsc.connect(merger, 0, 0);
      rightOsc.connect(merger, 0, 1);
      merger.connect(gain);
      gain.connect(ctx.destination);

      leftOsc.start();
      rightOsc.start();

      this.activeNodes.push(leftOsc, rightOsc, merger, gain);
    }
  }

  playGong() {
    this.ensureContext();
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const freqs = Array.of(528, 792, 1056);

    freqs.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now);

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.exponentialRampToValueAtTime(idx === 0 ? 0.22 : 0.09, now + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 2.6);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 2.7);
    });
  }
}
