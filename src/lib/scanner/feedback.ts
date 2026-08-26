"use client";

/**
 * Two clearly distinguishable sounds (brief: Phase 7.3) via the Web Audio API -
 * no audio asset files to source/license, and the tones are trivial to tell
 * apart: a single confident rising beep for an accepted scan, a lower double
 * buzz for a rejection.
 */
let audioContext: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!audioContext) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    audioContext = new Ctor();
  }
  return audioContext;
}

function playTone(frequency: number, startOffset: number, duration: number, ctx: AudioContext) {
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.type = "sine";
  oscillator.frequency.value = frequency;
  gain.gain.setValueAtTime(0.0001, ctx.currentTime + startOffset);
  gain.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + startOffset + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + startOffset + duration);
  oscillator.connect(gain);
  gain.connect(ctx.destination);
  oscillator.start(ctx.currentTime + startOffset);
  oscillator.stop(ctx.currentTime + startOffset + duration + 0.02);
}

export function playAcceptedSound() {
  const ctx = getAudioContext();
  if (!ctx) return;
  playTone(880, 0, 0.14, ctx);
}

export function playRejectedSound() {
  const ctx = getAudioContext();
  if (!ctx) return;
  playTone(220, 0, 0.12, ctx);
  playTone(220, 0.16, 0.12, ctx);
}

export function vibrateAccepted() {
  navigator.vibrate?.(60);
}

export function vibrateRejected() {
  navigator.vibrate?.([80, 60, 80]);
}
