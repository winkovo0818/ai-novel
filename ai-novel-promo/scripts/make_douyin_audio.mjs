import { writeFileSync } from "node:fs";

const sampleRate = 48000;
const duration = 24;
const total = sampleRate * duration;
const left = new Float32Array(total);
const right = new Float32Array(total);

function env(t, start, dur, attack = 0.01, release = 0.08) {
  const x = t - start;
  if (x < 0 || x > dur) return 0;
  if (x < attack) return x / attack;
  if (x > dur - release) return Math.max(0, (dur - x) / release);
  return 1;
}

function addTone({ start, dur, freq, gain, pan = 0, wave = "sine", attack = 0.01, release = 0.08 }) {
  const startI = Math.max(0, Math.floor(start * sampleRate));
  const endI = Math.min(total, Math.floor((start + dur) * sampleRate));
  const lGain = gain * Math.cos((pan + 1) * Math.PI / 4);
  const rGain = gain * Math.sin((pan + 1) * Math.PI / 4);
  for (let i = startI; i < endI; i++) {
    const t = i / sampleRate;
    const local = t - start;
    const phase = 2 * Math.PI * freq * local;
    let s;
    if (wave === "triangle") s = (2 / Math.PI) * Math.asin(Math.sin(phase));
    else if (wave === "square") s = Math.sign(Math.sin(phase));
    else if (wave === "saw") s = 2 * (local * freq - Math.floor(0.5 + local * freq));
    else s = Math.sin(phase);
    s *= env(t, start, dur, attack, release);
    left[i] += s * lGain;
    right[i] += s * rGain;
  }
}

function addNoiseHit({ start, dur, gain, pan = 0, tone = 1800 }) {
  const startI = Math.max(0, Math.floor(start * sampleRate));
  const endI = Math.min(total, Math.floor((start + dur) * sampleRate));
  let seed = 123456 + Math.floor(start * 1000);
  const lGain = gain * Math.cos((pan + 1) * Math.PI / 4);
  const rGain = gain * Math.sin((pan + 1) * Math.PI / 4);
  for (let i = startI; i < endI; i++) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const noise = (seed / 4294967295) * 2 - 1;
    const t = i / sampleRate;
    const local = t - start;
    const ring = Math.sin(2 * Math.PI * tone * local);
    const e = Math.exp(-local * 10) * env(t, start, dur, 0.002, 0.12);
    const s = (noise * 0.45 + ring * 0.55) * e;
    left[i] += s * lGain;
    right[i] += s * rGain;
  }
}

const bpm = 104;
const beat = 60 / bpm;
const notes = {
  c3: 130.81, d3: 146.83, e3: 164.81, g3: 196.0, a3: 220.0,
  c4: 261.63, d4: 293.66, e4: 329.63, g4: 392.0, a4: 440.0,
  c5: 523.25, d5: 587.33, e5: 659.25, g5: 783.99, a5: 880.0,
};
const progression = [notes.c3, notes.a3, notes.e3, notes.g3];
const melody = [notes.e4, notes.g4, notes.a4, notes.g4, notes.e5, notes.d5, notes.c5, notes.a4];

// Bass and harmonic bed.
for (let bar = 0; bar < 11; bar++) {
  const t = bar * beat * 4;
  const root = progression[bar % progression.length];
  addTone({ start: t, dur: beat * 3.7, freq: root, gain: 0.16, pan: -0.05, wave: "triangle", attack: 0.04, release: 0.18 });
  addTone({ start: t, dur: beat * 3.7, freq: root * 2, gain: 0.055, pan: 0.08, wave: "sine", attack: 0.08, release: 0.22 });
}

// Short-video friendly pulse: audible on phone speakers.
for (let b = 0; b < duration / beat; b++) {
  const t = b * beat;
  addTone({ start: t, dur: 0.09, freq: 84, gain: b % 4 === 0 ? 0.36 : 0.22, pan: 0, wave: "sine", attack: 0.001, release: 0.07 });
  if (b % 2 === 1) addNoiseHit({ start: t + 0.01, dur: 0.12, gain: 0.16, pan: 0.03, tone: 2400 });
  addNoiseHit({ start: t + beat * 0.5, dur: 0.045, gain: 0.055, pan: b % 2 ? 0.35 : -0.35, tone: 6200 });
}

// Arpeggio shimmer.
for (let i = 0; i < 96; i++) {
  const t = i * beat * 0.5 + 0.15;
  const n = melody[i % melody.length] * (i % 16 > 11 ? 1.5 : 1);
  addTone({ start: t, dur: 0.18, freq: n, gain: 0.055, pan: i % 2 ? 0.42 : -0.42, wave: "triangle", attack: 0.006, release: 0.07 });
}

// Lead motif on feature reveals.
[0.55, 4.8, 9.4, 14.1, 18.75].forEach((start, idx) => {
  [0, 0.36, 0.72, 1.08].forEach((offset, j) => {
    addTone({
      start: start + offset,
      dur: 0.28,
      freq: melody[(idx * 2 + j) % melody.length],
      gain: 0.12,
      pan: j % 2 ? 0.18 : -0.18,
      wave: "triangle",
      attack: 0.012,
      release: 0.1,
    });
  });
});

// Transition hits aligned to the video.
[4.45, 9.05, 13.7, 18.4].forEach((t, idx) => {
  addNoiseHit({ start: t, dur: 0.42, gain: 0.38, pan: 0, tone: idx % 2 ? 3100 : 1900 });
  addTone({ start: t, dur: 0.5, freq: idx % 2 ? 523.25 : 392, gain: 0.13, pan: 0, wave: "sine", attack: 0.004, release: 0.25 });
});

// Master fade, soft saturation, and normalize.
let peak = 0;
for (let i = 0; i < total; i++) {
  const t = i / sampleRate;
  const fadeIn = Math.min(1, t / 0.45);
  const fadeOut = Math.min(1, (duration - t) / 0.75);
  const f = Math.max(0, Math.min(fadeIn, fadeOut));
  left[i] = Math.tanh(left[i] * 1.55) * f;
  right[i] = Math.tanh(right[i] * 1.55) * f;
  peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]));
}
const target = 0.88 / Math.max(peak, 0.001);
for (let i = 0; i < total; i++) {
  left[i] *= target;
  right[i] *= target;
}

function wavBuffer() {
  const dataBytes = total * 2 * 2;
  const buffer = Buffer.alloc(44 + dataBytes);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataBytes, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(2, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2 * 2, 28);
  buffer.writeUInt16LE(4, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataBytes, 40);
  let offset = 44;
  for (let i = 0; i < total; i++) {
    buffer.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(left[i] * 32767))), offset);
    buffer.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(right[i] * 32767))), offset + 2);
    offset += 4;
  }
  return buffer;
}

writeFileSync("assets/douyin-promo-audio.wav", wavBuffer());
