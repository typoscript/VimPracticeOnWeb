import { useState, useCallback } from 'react';
import { VimMode } from '../types/vim';

export type SoundEffectType = 'click' | 'thock' | 'mode' | 'success';

const MUTE_STORAGE_KEY = 'vim_sound_muted';

export function loadMuteSetting(): boolean {
  try {
    return localStorage.getItem(MUTE_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function saveMuteSetting(muted: boolean): void {
  try {
    localStorage.setItem(MUTE_STORAGE_KEY, muted ? 'true' : 'false');
  } catch {
    // Ignore storage errors
  }
}

let audioContext: AudioContext | null = null;

export function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return null;

  if (!audioContext) {
    try {
      audioContext = new AudioCtx();
    } catch {
      return null;
    }
  }

  if (audioContext.state === 'suspended') {
    audioContext.resume().catch(() => {});
  }

  return audioContext;
}

/**
 * 일반 이동 키(hjkl, w, b 등): 경쾌하고 짧은 기계식 스위치 클릭음 (약 25ms)
 */
export function playClickSound(): void {
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(1600, now);
    osc.frequency.exponentialRampToValueAtTime(600, now + 0.02);

    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.025);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.025);
  } catch {
    // Ignore audio synthesis errors
  }
}

/**
 * 연산자 및 편집/실행 키(d, c, y, p, Enter 등): 묵직한 도각거림(Thock) 사운드 (약 50ms)
 */
export function playThockSound(): void {
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(220, now);
    osc.frequency.exponentialRampToValueAtTime(65, now + 0.045);

    gain.gain.setValueAtTime(0.22, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.05);
  } catch {
    // Ignore audio synthesis errors
  }
}

/**
 * 모드 전환 키(Esc, i, v 등): 부드러운 상태 전환 알림음 (약 120ms)
 */
export function playModeChime(): void {
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(523.25, now);
    osc.frequency.exponentialRampToValueAtTime(659.25, now + 0.08);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.15, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.12);
  } catch {
    // Ignore audio synthesis errors
  }
}

/**
 * 미션 클리어: 레트로 8비트 아르페지오 성공 효과음 (C5 -> E5 -> G5 -> C6)
 */
export function playRetroArpeggio(): void {
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const now = ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.50];
    const noteDuration = 0.07;

    notes.forEach((freq, idx) => {
      const startTime = now + idx * noteDuration;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, startTime);

      gain.gain.setValueAtTime(0.18, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + noteDuration * 0.95);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(startTime);
      osc.stop(startTime + noteDuration);
    });
  } catch {
    // Ignore audio synthesis errors
  }
}

/**
 * 키 입력과 현재 Vim 모드에 따라 알맞은 사운드 타입을 결정합니다.
 */
export function getSoundTypeForKey(key: string, mode: VimMode): 'click' | 'thock' | 'mode' {
  // 모드 전환 키 (Esc, i, v 등)
  if (
    key === 'Escape' ||
    key === 'Esc' ||
    (mode === 'NORMAL' && ['i', 'I', 'a', 'A', 'o', 'O', 'v', 'V', 'Ctrl-v', ':', '/'].includes(key))
  ) {
    return 'mode';
  }

  // 연산자 및 편집/실행 키 (d, c, y, p, Enter 등)
  if (
    [
      'd', 'c', 'y', 'p', 'P', 'x', 'X', 'r', 'R', 's', 'S', 'C', 'D',
      'Enter', 'Backspace', 'Delete', 'u', 'Ctrl-r',
    ].includes(key)
  ) {
    return 'thock';
  }

  // 일반 이동 키(hjkl, w, b 등) 및 일반 타이핑
  return 'click';
}

/**
 * Web Audio 기계식 키보드 타건음 및 효과음 React 훅
 */
export function useSoundEffects() {
  const [isMuted, setIsMuted] = useState<boolean>(() => loadMuteSetting());

  const toggleMute = useCallback(() => {
    setIsMuted((prev) => {
      const next = !prev;
      saveMuteSetting(next);
      return next;
    });
  }, []);

  const playKeySound = useCallback(
    (key: string, mode: VimMode) => {
      if (isMuted) return;
      const type = getSoundTypeForKey(key, mode);
      if (type === 'mode') {
        playModeChime();
      } else if (type === 'thock') {
        playThockSound();
      } else {
        playClickSound();
      }
    },
    [isMuted]
  );

  const playSuccessSound = useCallback(() => {
    if (isMuted) return;
    playRetroArpeggio();
  }, [isMuted]);

  return {
    isMuted,
    toggleMute,
    playKeySound,
    playSuccessSound,
  };
}
