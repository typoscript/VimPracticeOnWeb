import { describe, it, expect } from 'vitest';
import { MISSIONS } from '../data/missions';
import {
  getMissionTags,
  filterMissions,
  MISSION_CATEGORY_TAGS,
  getTagLabel,
} from './missionFilters';

describe('missionFilters module', () => {
  it('모든 카테고리 태그 정보와 라벨을 반환한다', () => {
    expect(MISSION_CATEGORY_TAGS.length).toBe(7);
    expect(getTagLabel('all')).toBe('전체');
    expect(getTagLabel('basic')).toBe('기초');
    expect(getTagLabel('motion')).toBe('모션');
    expect(getTagLabel('textobject')).toBe('텍스트객체');
    expect(getTagLabel('ex')).toBe('Ex 커맨드');
    expect(getTagLabel('vimscript')).toBe('Vimscript');
    expect(getTagLabel('netrw')).toBe('Netrw');
  });

  it('각 미션에 적절한 카테고리 태그가 부여된다', () => {
    const lesson1 = MISSIONS.find((m) => m.id === 1)!;
    const lesson14 = MISSIONS.find((m) => m.id === 14)!;
    const lesson17 = MISSIONS.find((m) => m.id === 17)!;
    const lesson56 = MISSIONS.find((m) => m.id === 56)!;
    const lesson64 = MISSIONS.find((m) => m.id === 64)!;

    expect(getMissionTags(lesson1)).toContain('basic');
    expect(getMissionTags(lesson1)).toContain('motion');
    expect(getMissionTags(lesson14)).toContain('textobject');
    expect(getMissionTags(lesson17)).toContain('ex');
    expect(getMissionTags(lesson56)).toContain('vimscript');
    expect(getMissionTags(lesson64)).toContain('netrw');
  });

  it('카테고리 태그로 필터링한다', () => {
    const netrwMissions = filterMissions(MISSIONS, {
      searchQuery: '',
      category: 'netrw',
    });
    expect(netrwMissions.length).toBeGreaterThan(0);
    expect(netrwMissions.some((m) => m.id === 39)).toBe(true);
    expect(netrwMissions.some((m) => m.id === 64)).toBe(true);

    const textObjectMissions = filterMissions(MISSIONS, {
      searchQuery: '',
      category: 'textobject',
    });
    expect(textObjectMissions.some((m) => m.id === 14)).toBe(true);
    expect(textObjectMissions.some((m) => m.id === 54)).toBe(true);
    expect(textObjectMissions.some((m) => m.id === 58)).toBe(true);
  });

  it('검색어로 미션을 검색한다 (ID, 제목, 설명, 단축키)', () => {
    // ID 검색
    const idResult = filterMissions(MISSIONS, {
      searchQuery: '64',
      category: 'all',
    });
    expect(idResult.some((m) => m.id === 64)).toBe(true);

    // 제목 검색
    const titleResult = filterMissions(MISSIONS, {
      searchQuery: 'Netrw',
      category: 'all',
    });
    expect(titleResult.length).toBeGreaterThanOrEqual(2);

    // 단축키 검색
    const keyResult = filterMissions(MISSIONS, {
      searchQuery: 'Ctrl-^',
      category: 'all',
    });
    expect(keyResult.length).toBeGreaterThan(0);
  });

  it('진행 상태(completed / uncompleted) 필터가 올바르게 작동한다', () => {
    const progress = {
      1: { completed: true },
      2: { completed: true },
    };

    const completed = filterMissions(
      MISSIONS,
      {
        searchQuery: '',
        category: 'all',
        statusFilter: 'completed',
      },
      progress
    );
    expect(completed.length).toBe(2);
    expect(completed.map((m) => m.id)).toEqual([1, 2]);

    const uncompleted = filterMissions(
      MISSIONS,
      {
        searchQuery: '',
        category: 'all',
        statusFilter: 'uncompleted',
      },
      progress
    );
    expect(uncompleted.length).toBe(MISSIONS.length - 2);
    expect(uncompleted.some((m) => m.id === 1)).toBe(false);
  });
});
