/* 合成天下 · 音效
 * 全部用 WebAudio 现场合成，不依赖任何音频文件。
 */
window.SH = window.SH || {};

(function (SH) {
  'use strict';

  let ctx = null;
  let master = null;
  let enabled = true;

  function ensure() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.42;
    master.connect(ctx.destination);
    return ctx;
  }

  /** 一个带包络的单音 */
  function tone(opt) {
    if (!enabled) return;
    const c = ensure();
    if (!c) return;
    const t0 = c.currentTime + (opt.delay || 0);
    const dur = opt.dur || 0.18;

    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = opt.type || 'sine';
    osc.frequency.setValueAtTime(opt.freq, t0);
    if (opt.to) osc.frequency.exponentialRampToValueAtTime(Math.max(20, opt.to), t0 + dur * (opt.slide ?? 1));

    const peak = opt.gain ?? 0.14;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(peak, t0 + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

    osc.connect(gain);
    gain.connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  /** 白噪声，用于落地/破碎的质感 */
  function noise(opt) {
    if (!enabled) return;
    const c = ensure();
    if (!c) return;
    const dur = opt.dur || 0.12;
    const t0 = c.currentTime + (opt.delay || 0);
    const len = Math.floor(c.sampleRate * dur);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.4);
    }
    const src = c.createBufferSource();
    src.buffer = buf;

    const filter = c.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = opt.freq || 900;
    filter.Q.value = opt.q || 0.8;

    const gain = c.createGain();
    gain.gain.value = opt.gain ?? 0.12;

    src.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    src.start(t0);
  }

  const Audio = {
    unlock() {
      const c = ensure();
      if (c && c.state === 'suspended') c.resume();
    },

    setEnabled(v) {
      enabled = !!v;
      if (master) master.gain.value = enabled ? 0.42 : 0;
    },

    isEnabled() { return enabled; },

    drop() {
      tone({ freq: 320, to: 170, dur: 0.09, type: 'sine', gain: 0.09 });
      noise({ freq: 1400, dur: 0.05, gain: 0.03 });
    },

    /** 合成音：等级越高越清亮，连锁越高越亮 */
    merge(level, final, chain) {
      const c = Math.max(1, chain || 1);
      const base = 262 * Math.pow(1.1225, level) * (1 + (c - 1) * 0.045);
      tone({ freq: base, to: base * 1.5, dur: 0.16, type: 'triangle', gain: 0.11 });
      tone({ freq: base * 1.5, dur: 0.26, type: 'sine', gain: 0.07, delay: 0.03 });
      if (level >= 5) {
        tone({ freq: base * 2, dur: 0.34, type: 'sine', gain: 0.05, delay: 0.06 });
      }
      if (level >= 8) {
        tone({ freq: base * 2.5, dur: 0.5, type: 'sine', gain: 0.04, delay: 0.1 });
      }
      if (c >= 2) {
        tone({ freq: base * 3, dur: 0.12, type: 'sine', gain: 0.05, delay: 0.02 });
      }
      if (final) {
        [0, 0.12, 0.24, 0.4].forEach((d, i) => {
          tone({ freq: 523 * Math.pow(1.25, i), dur: 0.9, type: 'sine', gain: 0.1, delay: d });
        });
      }
    },

    /** 待用槽：轻巧的两声 */
    hold() {
      tone({ freq: 520, dur: 0.07, type: 'sine', gain: 0.06 });
      tone({ freq: 700, dur: 0.09, type: 'sine', gain: 0.045, delay: 0.06 });
    },

    over() {
      tone({ freq: 300, to: 70, dur: 0.9, type: 'sawtooth', gain: 0.09 });
      tone({ freq: 150, to: 48, dur: 1.1, type: 'sine', gain: 0.09, delay: 0.05 });
    },
  };

  SH.Audio = Audio;
})(window.SH);
