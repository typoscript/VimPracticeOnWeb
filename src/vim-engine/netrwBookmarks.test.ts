import { describe, it, expect } from 'vitest';
import {
  createVimState,
  handleKey,
  openNetrw,
  addNetrwBookmark,
} from './index';
import { executeCommandLine } from './commandLine';

function execEx(state: any, cmd: string) {
  return executeCommandLine(state, cmd, (s, k) => handleKey(s, k));
}

describe('Netrw Bookmarks System (mb, mB, gb, :Bookmark, :Bookmarks)', () => {
  it('Netrw 탐색기에서 mb 키로 디렉터리를 북마크에 추가할 수 있다', () => {
    let state = createVimState(['// source.ts']);
    state = {
      ...state,
      virtualFiles: {
        'src/components/Header.tsx': ['export const Header = () => null;'],
        'src/utils/math.ts': ['export const add = () => 1;'],
        'package.json': ['{}'],
      },
    };

    // Netrw 열기
    state = openNetrw(state);
    expect(state.netrw?.isOpen).toBe(true);

    // 'm' 누르고 'b' 누르면 현재 루트('/') 디렉터리 북마크
    state = handleKey(state, 'm');
    expect(state.netrw?.pendingKey).toBe('m');

    state = handleKey(state, 'b');
    expect(state.netrwBookmarks).toContain('');
    expect(state.commandMessage).toContain('[Netrw 북마크 추가] /');
    expect(state.netrw?.pendingKey).toBeUndefined();
  });

  it('커서가 하위 디렉터리(src/) 위에 있을 때 mb 로 해당 하위 디렉터리를 북마크에 추가한다', () => {
    let state = createVimState(['// source.ts']);
    state = {
      ...state,
      virtualFiles: {
        'src/app.ts': ['console.log(1);'],
      },
    };

    state = openNetrw(state);
    const srcLineIdx = state.lines.findIndex((l) => l === 'src/');
    expect(srcLineIdx).toBeGreaterThan(0);
    state = { ...state, cursor: { line: srcLineIdx, col: 0 } };

    state = handleKey(state, 'm');
    state = handleKey(state, 'b');

    expect(state.netrwBookmarks).toContain('src');
    expect(state.commandMessage).toContain('[Netrw 북마크 추가] /src');
  });

  it('gb 키로 북마크된 디렉터리들 사이를 순환하며 고속 이동할 수 있다', () => {
    let state = createVimState(['// source.ts']);
    state = {
      ...state,
      virtualFiles: {
        'src/index.ts': [''],
        'docs/readme.md': [''],
      },
    };

    // 북마크 2개 추가
    state = addNetrwBookmark(state, 'src');
    state = addNetrwBookmark(state, 'docs');
    expect(state.netrwBookmarks).toEqual(['src', 'docs']);

    // Netrw 열기
    state = openNetrw(state);
    expect(state.netrw?.currentPath).toBe('');

    // gb 첫 번째 실행: src 로 이동
    state = handleKey(state, 'g');
    expect(state.netrw?.pendingKey).toBe('g');
    state = handleKey(state, 'b');

    expect(state.netrw?.currentPath).toBe('src');
    expect(state.commandMessage).toContain('[Netrw 북마크 이동] /workspace/src');

    // gb 두 번째 실행: docs 로 이동
    state = handleKey(state, 'g');
    state = handleKey(state, 'b');

    expect(state.netrw?.currentPath).toBe('docs');
    expect(state.commandMessage).toContain('[Netrw 북마크 이동] /workspace/docs');

    // gb 세 번째 실행: 다시 src 로 순환(cycle)
    state = handleKey(state, 'g');
    state = handleKey(state, 'b');

    expect(state.netrw?.currentPath).toBe('src');
  });

  it('등록된 북마크가 없을 때 gb 를 누르면 안내 메시지와 bell 이 울린다', () => {
    let state = createVimState(['// source.ts']);
    state = openNetrw(state);

    state = handleKey(state, 'g');
    state = handleKey(state, 'b');

    expect(state.bell).toBe(true);
    expect(state.commandMessage).toBe('등록된 Netrw 북마크가 없습니다.');
  });

  it('mB 키로 북마크를 삭제할 수 있다', () => {
    let state = createVimState(['// source.ts']);
    state = addNetrwBookmark(state, 'src');
    state = openNetrw(state, 'src');

    state = handleKey(state, 'm');
    state = handleKey(state, 'B');

    expect(state.netrwBookmarks).not.toContain('src');
    expect(state.commandMessage).toContain('[Netrw 북마크 삭제]');
  });

  it(':Bookmark 및 :Bookmarks 커맨드라인 명령이 정상 동작한다', () => {
    let state = createVimState(['// main.ts']);
    state = { ...state, primaryFilename: 'packages/core/index.ts' };

    // 1. :Bookmark 명령으로 경로 명시 추가
    state = execEx(state, 'Bookmark src/utils');
    expect(state.netrwBookmarks).toContain('src/utils');

    // 2. :Bookmark (인자 없음) -> 현재 파일 부모 디렉터리 추가
    state = execEx(state, 'Bookmark');
    expect(state.netrwBookmarks).toContain('packages/core');

    // 3. :Bookmarks 목록 조회
    state = execEx(state, 'Bookmarks');
    expect(state.commandMessage).toContain('--- Netrw Bookmarks ---');
    expect(state.commandMessage).toContain('1: /workspace/src/utils');
    expect(state.commandMessage).toContain('2: /workspace/packages/core');

    // 4. :gb 1 로 1번 북마크 열기
    state = execEx(state, 'gb 1');
    expect(state.netrw?.isOpen).toBe(true);
    expect(state.netrw?.currentPath).toBe('src/utils');
  });
});
