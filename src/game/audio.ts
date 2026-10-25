/* Tiny WebAudio synth for game sounds – no external files needed. */

class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  enabled = true;

  init() {
    if (!this.ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.6;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
  }

  setEnabled(on: boolean) {
    this.enabled = on;
    if (this.master) this.master.gain.value = on ? 0.6 : 0;
  }

  private ready() {
    return !!(this.ctx && this.master && this.noise && this.enabled);
  }

  private tone(freq: number, to: number, dur: number, gain: number, type: OscillatorType = "sine", delay = 0) {
    const ctx = this.ctx!;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g).connect(this.master!);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private burst(dur: number, freq: number, q: number, gain: number, type: BiquadFilterType = "bandpass") {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise!;
    src.playbackRate.value = 1;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    src.connect(f).connect(g).connect(this.master!);
    src.start(t, Math.random() * 0.5, dur + 0.05);
  }

  hit(power = 0.5) {
    if (!this.ready()) return;
    this.tone(850 + power * 600, 280, 0.07, 0.45 + power * 0.4);
    this.burst(0.035, 2600, 0.8, 0.35 + power * 0.3);
  }

  bounce() {
    if (!this.ready()) return;
    this.tone(520, 190, 0.06, 0.32);
    this.burst(0.02, 1800, 1, 0.18);
  }

  net() {
    if (!this.ready()) return;
    this.burst(0.14, 420, 0.7, 0.45, "lowpass");
  }

  floor() {
    if (!this.ready()) return;
    this.tone(260, 120, 0.08, 0.18);
  }

  point(good: boolean) {
    if (!this.ready()) return;
    if (good) {
      this.tone(523, 523, 0.12, 0.25, "triangle");
      this.tone(784, 784, 0.18, 0.25, "triangle", 0.11);
    } else {
      this.tone(392, 392, 0.12, 0.22, "triangle");
      this.tone(262, 262, 0.22, 0.22, "triangle", 0.11);
    }
  }

  win() {
    if (!this.ready()) return;
    [523, 659, 784, 1047].forEach((f, i) => this.tone(f, f, 0.22, 0.22, "triangle", i * 0.12));
  }

  lose() {
    if (!this.ready()) return;
    [392, 349, 311, 262].forEach((f, i) => this.tone(f, f, 0.25, 0.2, "triangle", i * 0.14));
  }

  ui() {
    if (!this.ready()) return;
    this.tone(900, 700, 0.05, 0.12, "square");
  }

  whoosh() {
    if (!this.ready()) return;
    this.burst(0.16, 900, 0.5, 0.1);
  }
}

export const sfx = new Sfx();
