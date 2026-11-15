import { describe, it, expect, beforeEach } from 'vitest';
import {
  encodeCustomMission,
  decodeCustomMission,
  createCustomMissionObject,
  CustomMissionData,
  buildChallengeUrl,
  parseCustomMissionInput,
  exportCustomMissionJson,
  loadSavedCustomMissions,
  saveCustomMission,
  deleteSavedCustomMission,
  mergeSavedCustomMissions,
  CUSTOM_MISSION_PRESETS,
  CUSTOM_MISSIONS_STORAGE_KEY,
} from './customMission';
import { VimEditorState } from '../vim-engine';

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

  describe('import/export & library storage', () => {
    beforeEach(() => {
      localStorage.removeItem(CUSTOM_MISSIONS_STORAGE_KEY);
    });

    it('parses challenge URLs, raw tokens, and JSON payloads', () => {
      const url = buildChallengeUrl(sampleMission);
      const token = encodeCustomMission(sampleMission);
      const json = exportCustomMissionJson(sampleMission);

      expect(parseCustomMissionInput(url)).toEqual(sampleMission);
      expect(parseCustomMissionInput(`?challenge=${token}`)).toEqual(sampleMission);
      expect(parseCustomMissionInput(token)).toEqual(sampleMission);
      expect(parseCustomMissionInput(json)).toEqual(sampleMission);

      expect(parseCustomMissionInput('')).toBeNull();
      expect(parseCustomMissionInput('{invalid json')).toBeNull();
      expect(parseCustomMissionInput('?challenge=bad-token')).toBeNull();
    });

    it('saves, updates, lists, and deletes custom missions in localStorage', () => {
      expect(loadSavedCustomMissions()).toEqual([]);

      const afterAdd = saveCustomMission(sampleMission);
      expect(afterAdd).toHaveLength(1);
      expect(afterAdd[0].data).toEqual(sampleMission);

      const savedId = afterAdd[0].id;
      const updatedData: CustomMissionData = { ...sampleMission, par: 9 };
      const afterUpdate = saveCustomMission(updatedData, savedId);
      expect(afterUpdate).toHaveLength(1);
      expect(afterUpdate[0].data.par).toBe(9);

      const afterDelete = deleteSavedCustomMission(savedId);
      expect(afterDelete).toEqual([]);
      expect(loadSavedCustomMissions()).toEqual([]);
    });

    it('exposes curated presets and deduplicates merged mission lists', () => {
      expect(CUSTOM_MISSION_PRESETS.length).toBeGreaterThanOrEqual(4);
      for (const preset of CUSTOM_MISSION_PRESETS) {
        expect(preset.data.title.length).toBeGreaterThan(0);
        expect(preset.data.par).toBeGreaterThan(0);
      }

      const existing = [
        { id: 'a1', savedAt: '2026-01-01T00:00:00Z', data: sampleMission },
      ];
      const incoming = [
        { id: 'dup-by-content', savedAt: '2026-01-02T00:00:00Z', data: sampleMission },
        {
          id: 'b2',
          savedAt: '2026-01-02T00:00:00Z',
          data: { ...sampleMission, title: '다른 미션' },
        },
      ];
      const merged = mergeSavedCustomMissions(existing, incoming);
      expect(merged).toHaveLength(2);
      expect(merged.map((m) => m.id)).toEqual(['a1', 'b2']);
    });
  });
});
