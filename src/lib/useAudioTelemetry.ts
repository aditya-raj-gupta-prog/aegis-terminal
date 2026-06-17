'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

const STORAGE_KEY = 'aegis_audio_muted';

// Lightweight tactical audio engine built entirely on the Web Audio API — no
// asset files. Synthesizes two cues:
//   click() — ultra-short crisp mechanical blip (command success / sheet open)
//   warn()  — low-frequency warning drone (high-risk op / health drop)
// A master mute toggle is persisted to localStorage and mirrored in a ref so the
// playback callbacks stay stable yet always read the current state.
export function useAudioTelemetry() {
  const ctxRef = useRef<AudioContext | null>(null);
  const mutedRef = useRef(false);
  const [muted, setMutedState] = useState(false);

  // Hydrate persisted preference on mount (client only).
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY) === '1';
      mutedRef.current = saved;
      setMutedState(saved);
    } catch {
      /* storage unavailable — default to unmuted */
    }
  }, []);

  const getCtx = useCallback((): AudioContext | null => {
    if (typeof window === 'undefined') return null;
    if (!ctxRef.current) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      ctxRef.current = new AC();
    }
    // Resume if the browser suspended it under the autoplay policy.
    if (ctxRef.current.state === 'suspended') void ctxRef.current.resume();
    return ctxRef.current;
  }, []);

  // Crisp mechanical click: a fast downward pitch blip with a sharp envelope.
  const click = useCallback(() => {
    if (mutedRef.current) return;
    const ctx = getCtx();
    if (!ctx) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(880, t);
    osc.frequency.exponentialRampToValueAtTime(220, t + 0.04);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.07, t + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.07);
  }, [getCtx]);

  // Low warning drone: a detuned saw pair gliding downward over ~0.55s.
  const warn = useCallback(() => {
    if (mutedRef.current) return;
    const ctx = getCtx();
    if (!ctx) return;
    const t = ctx.currentTime;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.11, t + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
    gain.connect(ctx.destination);

    [0, 4].forEach((detune) => {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.detune.setValueAtTime(detune, t);
      osc.frequency.setValueAtTime(150, t);
      osc.frequency.linearRampToValueAtTime(85, t + 0.5);
      osc.connect(gain);
      osc.start(t);
      osc.stop(t + 0.6);
    });
  }, [getCtx]);

  const toggleMuted = useCallback(() => {
    const next = !mutedRef.current;
    mutedRef.current = next;
    setMutedState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
    } catch {
      /* non-fatal */
    }
  }, []);

  return { click, warn, muted, toggleMuted };
}
