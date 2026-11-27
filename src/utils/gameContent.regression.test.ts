import { describe, it, expect } from 'vitest';
import { VimEditorState, handleKey } from '../vim-engine';
import { ARCADE_MISSIONS } from '../components/ArcadeSurvival/arcadeMissions';
import { generateDailyChallenge } from './dailyChallenge';
import { generateFTSniperProblem, generateWordJumpProblem } from '../components/HardcoreDojo/drillGenerators';

/** 'abc<Esc>d' → ['a','b','c','Escape','d'] */
function parseKeys(text: string): string[] {
  const keys: string[] = [];
  for (let i = 0; i < text.length; i++) {
    if (text.startsWith('<Esc>', i)) {
      keys.push('Escape');
      i += 4;
    } else {
      keys.push(text[i]);
    }
  }
  return keys;
}

function solve(
  puzzle: { initialLines: string[]; initialCursor: { line: number; col: number } },
  keys: string[]
): VimEditorState {
  let state: VimEditorState = {
    lines: [...puzzle.initialLines],
    cursor: { ...puzzle.initialCursor },
    mode: 'NORMAL',
  };
  for (const key of keys) state = handleKey(state, key);
  return state;
}

/** 아케이드·데일리 모두 NORMAL 모드에서 버퍼가 목표와 같으면 성공입니다. */
function expectSolved(
  puzzle: { initialLines: string[]; initialCursor: { line: number; col: number }; targetLines: string[]; par: number },
  keyText: string
) {
  const keys = parseKeys(keyText);
  const state = solve(puzzle, keys);
  expect(state.mode).toBe('NORMAL');
  expect(state.lines).toEqual(puzzle.targetLines);
  expect(keys.length).toBeLessThanOrEqual(puzzle.par);
}

describe('아케이드 웨이브', () => {
  it.each([
    [1, 'f/d%'],
    [1, 'f/D'],
    [8, 'ci"SUCCESS<Esc>'],
  ])('웨이브 %i 은 안내된 명령(%s)으로 par 이내에 풀린다', (id, keyText) => {
    expectSolved(ARCADE_MISSIONS.find((m) => m.id === id)!, keyText);
  });

  it('시작 상태에서 이미 풀려 있는 웨이브가 없다', () => {
    for (const m of ARCADE_MISSIONS) expect(m.initialLines).not.toEqual(m.targetLines);
  });
});

describe('데일리 챌린지 템플릿', () => {
  const templates = new Map<string, ReturnType<typeof generateDailyChallenge>>();
  for (let day = 0; day < 400 && templates.size < 6; day++) {
    const date = new Date(Date.UTC(2026, 0, 1 + day)).toISOString().slice(0, 10);
    const puzzle = generateDailyChallenge(date);
    templates.set(puzzle.templateTitle ?? puzzle.title, puzzle);
  }

  const SOLUTIONS: Record<string, string> = {
    'React Hook 종속성 배열 및 화살표 함수 리팩토링': 'dwla =><Esc>Ghi, [id]<Esc>',
    'TypeScript Interface 타이핑 & 선택적 속성 변환': 'wC?: string;<Esc>',
    '디버그 console.log 일괄 정리 및 세미콜론 정렬': '*ddcgndata<Esc>.',
    '배열 파이프라인 filter & map 체이닝 변환': 'i.filter(Boolean)<Esc>',
    'JSON 키-값 쌍 포맷팅 및 따옴표 제거': 'ds"+.-f1r3',
    'CSS-in-JS 색상값 교체 및 px 문자열 단위 추가': 'l3r0jipx"<Esc>bi"<Esc>',
  };

  it('모든 템플릿을 모았고 각각 풀이가 있다', () => {
    expect([...templates.keys()].sort()).toEqual(Object.keys(SOLUTIONS).sort());
  });

  it.each(Object.entries(SOLUTIONS))('%s 는 par 이내로 풀린다', (title, keyText) => {
    expectSolved(templates.get(title)!, keyText);
  });
});

describe('하드코어 도장 문제 데이터', () => {
  it('f/t 저격 목표 열은 실제로 그 문자를 가리킨다', () => {
    for (let i = 0; i < 300; i++) {
      const p = generateFTSniperProblem();
      expect(p.line[p.targetCol]).toBe(p.targetChar);
    }
  });

  it('WORD 점프 목표 범위는 목표 토큰에서 시작하고 {n}W 로 착지할 수 있다', () => {
    for (let i = 0; i < 300; i++) {
      const p = generateWordJumpProblem();
      expect(p.targetStartCol).toBe(p.line.indexOf(p.targetToken));
      const landed = [1, 2, 3, 4, 5, 6].some((n) => {
        const { cursor } = solve({ initialLines: [p.line], initialCursor: p.initialCursor }, [String(n), 'W']);
        return cursor.col >= p.targetStartCol && cursor.col <= p.targetEndCol;
      });
      expect(landed).toBe(true);
    }
  });
});
