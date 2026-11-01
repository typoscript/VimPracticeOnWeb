import { describe, it, expect } from 'vitest';
import {
  encodeCustomMission,
  decodeCustomMission,
  createCustomMissionObject,
  CustomMissionData,
  buildChallengeUrl,
} from './customMission';
import { VimEditorState } from '../types/vim';

describe('customMission utility', () => {
  const sampleMission: CustomMissionData = {
    title: '테스트 미션 (한국어 & Symbols !@#$%)',
    description: 'Vim Golf 도전 미션입니다.',
    initialText: 'const a = 1;\nconst b = 2;',
    targetText: 'const sum = a + b;',
    par: 12,
  };

  it('correctly encodes and decodes mission data with Unicode support', () => {
    const encoded = encodeCustomMission(sampleMission);
    expect(typeof encoded).toBe('string');
    expect(encoded.length).toBeGreaterThan(0);
    // Should be URL-safe (no +, /, or = padding)
    expect(encoded).not.toContain('+');
    expect(encoded).not.toContain('/');
    expect(encoded).not.toContain('=');

    const decoded = decodeCustomMission(encoded);
    expect(decoded).toEqual(sampleMission);
  });

  it('handles invalid or corrupted encoded strings gracefully', () => {
    expect(decodeCustomMission('')).toBeNull();
    expect(decodeCustomMission('not-valid-base-64-json!')).toBeNull();
    expect(decodeCustomMission('e30')).toBeNull(); // {} without required fields
  });

  it('creates a valid Mission object from CustomMissionData', () => {
    const mission = createCustomMissionObject(sampleMission);
    expect(mission.id).toBe(999999);
    expect(mission.title).toBe(sampleMission.title);
    expect(mission.par).toBe(12);
    expect(mission.initialLines).toEqual(['const a = 1;', 'const b = 2;']);
    expect(mission.targetLines).toEqual(['const sum = a + b;']);

    // Check completion logic
    const incompleteState: VimEditorState = {
      lines: ['const a = 1;', 'const b = 2;'],
      cursor: { line: 0, col: 0 },
      mode: 'NORMAL',
    };
    expect(mission.checkComplete(incompleteState)).toBe(false);

    const completedState: VimEditorState = {
      lines: ['const sum = a + b;'],
      cursor: { line: 0, col: 0 },
      mode: 'NORMAL',
    };
    expect(mission.checkComplete(completedState)).toBe(true);
  });

  it('builds a full challenge URL with the encoded query param', () => {
    const url = buildChallengeUrl(sampleMission);
    expect(url).toContain('?challenge=');
    const param = url.split('?challenge=')[1];
    expect(decodeCustomMission(param)).toEqual(sampleMission);
  });
});
