import { describe, it, expect } from 'vitest';
import { VimEditorState } from './types';
import { handleKey } from './vimEngine';
import {
  openNetrw,
  generateNetrwLines,
  getDirectoryListing,
  BANNER_LINES_COUNT,
  getWorkspaceFiles,
} from './netrwEngine';

describe('netrwEngine module (Pure Vim Netrw File Explorer)', () => {
  const createBaseState = (): VimEditorState => ({
    lines: ['console.log("hello world");'],
    cursor: { line: 0, col: 0 },
    mode: 'NORMAL',
    primaryFilename: 'app.ts',
  });

  describe('directory listing & banner generation', () => {
    it('가상 파일 맵에서 디렉터리와 파일을 정확하게 분류한다', () => {
      const listing = getDirectoryListing(getWorkspaceFiles(), '');
      expect(listing.dirs).toContain('src');
      expect(listing.files).toContain('package.json');
      expect(listing.files).toContain('README.md');

      const srcListing = getDirectoryListing(getWorkspaceFiles(), 'src');
      expect(srcListing.files).toContain('main.ts');
      expect(srcListing.files).toContain('utils.ts');
    });

    it('순정 Vim Netrw 배너와 ../ 및 ./ 라인을 포함하여 생성한다', () => {
      const lines = generateNetrwLines(getWorkspaceFiles(), '');
      expect(lines[1]).toContain('Netrw Directory Listing');
      expect(lines[BANNER_LINES_COUNT]).toBe('../');
      expect(lines[BANNER_LINES_COUNT + 1]).toBe('./');
      expect(lines).toContain('src/');
      expect(lines).toContain('package.json');
    });
  });

  describe('openNetrw & closeNetrw', () => {
    it(':Explore 또는 openNetrw 호출 시 Netrw 버퍼가 열리고 커서가 ../ 에 위치한다', () => {
      let state = createBaseState();
      state = openNetrw(state);

      expect(state.netrw?.isOpen).toBe(true);
      expect(state.cursor.line).toBe(BANNER_LINES_COUNT);
      expect(state.lines[BANNER_LINES_COUNT]).toBe('../');
      expect(state.primaryFilename).toContain('Netrw');
    });

    it('q 키를 누르면 Netrw가 닫히고 이전 파일로 복귀한다', () => {
      let state = createBaseState();
      state = openNetrw(state);
      expect(state.netrw?.isOpen).toBe(true);

      state = handleKey(state, 'q');
      expect(state.netrw).toBeNull();
      expect(state.lines[0]).toBe('console.log("hello world");');
    });
  });

  describe('Netrw navigation & file opening', () => {
    it('j로 파일로 이동한 뒤 Enter를 누르면 해당 파일이 열린다', () => {
      let state = createBaseState();
      state = openNetrw(state);

      // lines: [banner 0..4, '../', './', 'src/', 'package.json', 'README.md']
      // cursor starts at line 5 ('../')
      // 이동하여 'package.json' 위치로
      const targetLineIdx = state.lines.findIndex((l) => l.trim() === 'package.json');
      expect(targetLineIdx).toBeGreaterThan(BANNER_LINES_COUNT);

      state = {
        ...state,
        cursor: { line: targetLineIdx, col: 0 },
      };

      // Enter 실행
      state = handleKey(state, 'Enter');

      expect(state.netrw).toBeNull();
      expect(state.primaryFilename).toBe('package.json');
      expect(state.lines[0]).toBe('{');
    });

    it('디렉터리(src/) 위에서 Enter를 누르면 해당 디렉터리 내부로 진입한다', () => {
      let state = createBaseState();
      state = openNetrw(state);

      const srcLineIdx = state.lines.findIndex((l) => l.trim() === 'src/');
      state = {
        ...state,
        cursor: { line: srcLineIdx, col: 0 },
      };

      state = handleKey(state, 'Enter');

      expect(state.netrw?.isOpen).toBe(true);
      expect(state.netrw?.currentPath).toBe('src');
      expect(state.lines).toContain('main.ts');
      expect(state.lines).toContain('utils.ts');

      // '-' 키를 누르면 다시 상위 디렉터리로 복귀한다
      state = handleKey(state, '-');
      expect(state.netrw?.currentPath).toBe('');
      expect(state.lines).toContain('src/');
    });

    it('파일 위에서 v를 누르면 세로 분할 창에서 파일이 열린다', () => {
      let state = createBaseState();
      state = openNetrw(state);

      const readmeIdx = state.lines.findIndex((l) => l.trim() === 'README.md');
      state = {
        ...state,
        cursor: { line: readmeIdx, col: 0 },
      };

      state = handleKey(state, 'v');
      expect(state.splitPanes).toBeDefined();
      expect(state.splitDirection).toBe('vertical');
    });

    it('파일 위에서 t를 누르면 새 탭에서 파일이 열린다', () => {
      let state = createBaseState();
      state = openNetrw(state);

      const readmeIdx = state.lines.findIndex((l) => l.trim() === 'README.md');
      state = {
        ...state,
        cursor: { line: readmeIdx, col: 0 },
      };

      state = handleKey(state, 't');
      expect(state.tabPages?.length).toBeGreaterThan(1);
    });
  });

  describe('file and directory creation/deletion in Netrw', () => {
    it('% 키로 새 파일을 생성하고 목록에 추가한다', () => {
      let state = createBaseState();
      state = openNetrw(state);

      state = handleKey(state, '%');
      expect(state.lines).toContain('new_file.txt');
    });

    it('d 키로 새 디렉터리를 생성하고 목록에 추가한다', () => {
      let state = createBaseState();
      state = openNetrw(state);

      state = handleKey(state, 'd');
      expect(state.lines).toContain('new_dir/');
    });
  });

  describe('handleKey Ex commands (:Explore, :E, :e .)', () => {
    it(':E 및 :Explore 명령어로 Netrw를 연다', () => {
      let state = createBaseState();

      const cmd = ':E\n';
      for (const char of cmd) {
        state = handleKey(state, char === '\n' ? 'Enter' : char);
      }
      expect(state.netrw?.isOpen).toBe(true);
    });

    it(':e . 명령어로 현재 디렉터리 Netrw를 연다', () => {
      let state = createBaseState();

      const cmd = ':e .\n';
      for (const char of cmd) {
        state = handleKey(state, char === '\n' ? 'Enter' : char);
      }
      expect(state.netrw?.isOpen).toBe(true);
    });

    it(':Ve 명령어로 세로 분할과 함께 Netrw를 연다', () => {
      let state = createBaseState();

      const cmd = ':Ve\n';
      for (const char of cmd) {
        state = handleKey(state, char === '\n' ? 'Enter' : char);
      }
      expect(state.splitPanes).toBeDefined();
      expect(state.splitDirection).toBe('vertical');
    });
  });
});
