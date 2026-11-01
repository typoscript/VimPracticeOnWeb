import { describe, it, expect, beforeEach } from 'vitest';
import {
  getSoundTypeForKey,
  loadMuteSetting,
  saveMuteSetting,
  playClickSound,
  playThockSound,
  playModeChime,
  playRetroArpeggio,
} from './soundEffects';

describe('soundEffects utility', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('key classification', () => {
    it('classifies mode switch keys correctly', () => {
      expect(getSoundTypeForKey('Escape', 'NORMAL')).toBe('mode');
      expect(getSoundTypeForKey('Esc', 'INSERT')).toBe('mode');
      expect(getSoundTypeForKey('i', 'NORMAL')).toBe('mode');
      expect(getSoundTypeForKey('v', 'NORMAL')).toBe('mode');
      expect(getSoundTypeForKey('Ctrl-v', 'NORMAL')).toBe('mode');
      expect(getSoundTypeForKey(':', 'NORMAL')).toBe('mode');
    });

    it('classifies operator and edit execution keys as thock', () => {
      expect(getSoundTypeForKey('d', 'NORMAL')).toBe('thock');
      expect(getSoundTypeForKey('c', 'NORMAL')).toBe('thock');
      expect(getSoundTypeForKey('y', 'NORMAL')).toBe('thock');
      expect(getSoundTypeForKey('p', 'NORMAL')).toBe('thock');
      expect(getSoundTypeForKey('x', 'NORMAL')).toBe('thock');
      expect(getSoundTypeForKey('Enter', 'NORMAL')).toBe('thock');
      expect(getSoundTypeForKey('Backspace', 'INSERT')).toBe('thock');
    });

    it('classifies motion keys and regular typing as click', () => {
      expect(getSoundTypeForKey('h', 'NORMAL')).toBe('click');
      expect(getSoundTypeForKey('j', 'NORMAL')).toBe('click');
      expect(getSoundTypeForKey('k', 'NORMAL')).toBe('click');
      expect(getSoundTypeForKey('l', 'NORMAL')).toBe('click');
      expect(getSoundTypeForKey('w', 'NORMAL')).toBe('click');
      expect(getSoundTypeForKey('b', 'NORMAL')).toBe('click');
      expect(getSoundTypeForKey('a', 'INSERT')).toBe('click');
    });
  });

  describe('mute settings storage', () => {
    it('defaults to unmuted (false)', () => {
      expect(loadMuteSetting()).toBe(false);
    });

    it('saves and loads muted state', () => {
      saveMuteSetting(true);
      expect(loadMuteSetting()).toBe(true);
      saveMuteSetting(false);
      expect(loadMuteSetting()).toBe(false);
    });
  });

  describe('safe sound execution in test environment', () => {
    it('does not crash when AudioContext is unavailable', () => {
      expect(() => playClickSound()).not.toThrow();
      expect(() => playThockSound()).not.toThrow();
      expect(() => playModeChime()).not.toThrow();
      expect(() => playRetroArpeggio()).not.toThrow();
    });
  });
});
