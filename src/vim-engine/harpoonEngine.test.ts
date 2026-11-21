import { describe, it, expect, afterEach } from 'vitest';
import {
  createVimState,
  handleKey,
  executeCommandLine,
  configureVimEngine,
} from './index';

afterEach(() => {
  configureVimEngine({ locale: 'ko' });
});

describe('harpoon.nvim 파일 핀 & 원키 프로젝트 전환 엔진', () => {
  const baseVfs: Record<string, string[]> = {
    'workspace/a.ts': ['export const a = 1;'],
    'workspace/b.ts': ['export const b = 2;'],
    'workspace/c.ts': ['export const c = 3;'],
  };

  it(':HarpoonAdd, :Harpoon [N], :HarpoonNext, :HarpoonPrev 로 핀 파일을 즉시 전환한다', () => {
    let s = createVimState(['export const a = 1;'], { line: 0, col: 0 }, {
      primaryFilename: 'workspace/a.ts',
      virtualFiles: { ...baseVfs },
    });

    s = executeCommandLine(s, ':HarpoonAdd', handleKey);
    s = executeCommandLine(s, ':HarpoonAdd workspace/b.ts', handleKey);
    s = executeCommandLine(s, ':HarpoonAdd workspace/c.ts', handleKey);
    // 중복 등록 시 순서 유지
    s = executeCommandLine(s, ':HarpoonAdd workspace/a.ts', handleKey);
    expect(s.harpoonList).toEqual(['workspace/a.ts', 'workspace/b.ts', 'workspace/c.ts']);

    // :Harpoon 2 로 b.ts 즉시 이동
    s = executeCommandLine(s, ':Harpoon 2', handleKey);
    expect(s.primaryFilename).toBe('workspace/b.ts');
    expect(s.lines).toEqual(['export const b = 2;']);

    // :HarpoonNext -> c.ts -> wrap around -> a.ts
    s = executeCommandLine(s, ':HarpoonNext', handleKey);
    expect(s.primaryFilename).toBe('workspace/c.ts');
    s = executeCommandLine(s, ':HarpoonNext', handleKey);
    expect(s.primaryFilename).toBe('workspace/a.ts');

    // :HarpoonPrev -> wrap around -> c.ts
    s = executeCommandLine(s, ':HarpoonPrev', handleKey);
    expect(s.primaryFilename).toBe('workspace/c.ts');
  });

  it(':HarpoonMenu 에서 j/k 이동, J/K 순서 변경, d 삭제, a 추가, 1-9 즉시 점프, Esc 닫기를 지원한다', () => {
    let s = createVimState(['export const a = 1;'], { line: 0, col: 0 }, {
      primaryFilename: 'workspace/a.ts',
      virtualFiles: { ...baseVfs },
    });

    s = executeCommandLine(s, ':HarpoonAdd workspace/b.ts', handleKey);
    s = executeCommandLine(s, ':HarpoonAdd workspace/c.ts', handleKey);
    s = executeCommandLine(s, ':HarpoonMenu', handleKey);
    expect(s.harpoonMenu?.isOpen).toBe(true);
    expect(s.harpoonMenu?.selectedIndex).toBe(0);

    // a 로 현재 파일(a.ts) 추가
    s = handleKey(s, 'a');
    expect(s.harpoonList).toEqual(['workspace/b.ts', 'workspace/c.ts', 'workspace/a.ts']);
    expect(s.harpoonMenu?.selectedIndex).toBe(2);

    // K 로 위로 순서 이동 (a.ts 가 인덱스 1로)
    s = handleKey(s, 'K');
    expect(s.harpoonList).toEqual(['workspace/b.ts', 'workspace/a.ts', 'workspace/c.ts']);
    expect(s.harpoonMenu?.selectedIndex).toBe(1);

    // j -> 인덱스 2(c.ts) 선택 후 d 로 삭제
    s = handleKey(s, 'j');
    s = handleKey(s, 'd');
    expect(s.harpoonList).toEqual(['workspace/b.ts', 'workspace/a.ts']);

    // 1 키로 첫 번째 슬롯(b.ts) 즉시 전환 & 메뉴 닫힘
    s = handleKey(s, '1');
    expect(s.harpoonMenu).toBeNull();
    expect(s.primaryFilename).toBe('workspace/b.ts');
    expect(s.lines).toEqual(['export const b = 2;']);

    // 메뉴 다시 열어 Esc 로 닫기
    s = executeCommandLine(s, ':Harpoon', handleKey);
    expect(s.harpoonMenu?.isOpen).toBe(true);
    s = handleKey(s, 'Escape');
    expect(s.harpoonMenu).toBeNull();
  });

  it(':HarpoonRemove, :HarpoonClear, 빈 슬롯 bell 및 영어 로캘 메시지를 검증한다', () => {
    configureVimEngine({ locale: 'en' });
    let s = createVimState(['export const a = 1;'], { line: 0, col: 0 }, {
      primaryFilename: 'workspace/a.ts',
      virtualFiles: { ...baseVfs },
    });

    s = executeCommandLine(s, ':HarpoonAdd', handleKey);
    expect(s.commandMessage).toBe('[Harpoon] Pinned at slot #1: workspace/a.ts');

    s = executeCommandLine(s, ':Harpoon 5', handleKey);
    expect(s.bell).toBe(true);
    expect(s.commandMessage).toBe('[Harpoon] Slot #5 is empty');

    s = executeCommandLine(s, ':HarpoonRemove 1', handleKey);
    expect(s.harpoonList).toEqual([]);
    expect(s.commandMessage).toBe('[Harpoon] Unpinned: workspace/a.ts');

    s = executeCommandLine(s, ':HarpoonAdd workspace/b.ts', handleKey);
    s = executeCommandLine(s, ':HarpoonClear', handleKey);
    expect(s.harpoonList).toEqual([]);
    expect(s.commandMessage).toBe('[Harpoon] Cleared all pinned files');
  });

  it('HarpoonMenu 가 열려 있을 때 u 키 입력 시 Undo 불변성 검사가 오탐하지 않는다', () => {
    let s = createVimState(['hello world'], { line: 0, col: 0 }, {
      primaryFilename: 'workspace/a.ts',
      virtualFiles: { ...baseVfs },
    });
    s = handleKey(s, 'x');
    s = executeCommandLine(s, ':HarpoonMenu', handleKey);
    expect(s.harpoonMenu?.isOpen).toBe(true);
    s = handleKey(s, 'u');
    expect(s.harpoonMenu?.isOpen).toBe(true);
  });
});
