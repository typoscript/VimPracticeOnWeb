import { describe, it, expect } from 'vitest';
import { VimEditorState } from './types';
import { handleKey } from './vimEngine';
import {
  setArgs,
  addArgs,
  deleteArgs,
  nextArg,
  prevArg,
  firstArg,
  lastArg,
  formatArgs,
  argdo,
} from './argEngine';

describe('argEngine module (Arglist)', () => {
  const createBaseState = (): VimEditorState => ({
    lines: ['content of file A: TODO_1'],
    cursor: { line: 0, col: 0 },
    mode: 'NORMAL',
    primaryFilename: 'fileA.ts',
    buffers: [
      { id: 1, name: 'fileA.ts', lines: ['content of file A: TODO_1'], cursor: { line: 0, col: 0 } },
      { id: 2, name: 'fileB.ts', lines: ['content of file B: TODO_2'], cursor: { line: 0, col: 0 } },
      { id: 3, name: 'fileC.ts', lines: ['content of file C: TODO_3'], cursor: { line: 0, col: 0 } },
    ],
    currentBufferId: 1,
  });

  describe('setArgs & formatArgs', () => {
    it(':args 로 파일 목록을 설정하고 첫 번째 파일로 전환한다', () => {
      let state = createBaseState();
      state = setArgs(state, ['fileA.ts', 'fileB.ts', 'fileC.ts']);

      expect(state.argList).toBeDefined();
      expect(state.argList?.files).toEqual(['fileA.ts', 'fileB.ts', 'fileC.ts']);
      expect(state.argList?.currentIndex).toBe(0);
      expect(state.currentBufferId).toBe(1);
      expect(formatArgs(state)).toBe('[fileA.ts] fileB.ts fileC.ts');
    });

    it('인자가 없는 경우 E471 에러를 반환한다', () => {
      const state = createBaseState();
      const res = setArgs(state, []);
      expect(res.commandMessage).toBe('E471: Argument required');
    });
  });

  describe('addArgs & deleteArgs', () => {
    it(':argadd 로 새 파일을 아규먼트 목록에 추가한다', () => {
      let state = createBaseState();
      state = setArgs(state, ['fileA.ts', 'fileB.ts']);
      state = addArgs(state, ['fileC.ts', 'fileD.ts']);

      expect(state.argList?.files).toEqual(['fileA.ts', 'fileB.ts', 'fileC.ts', 'fileD.ts']);
    });

    it(':argdelete 로 지정된 파일을 아규먼트 목록에서 제거한다', () => {
      let state = createBaseState();
      state = setArgs(state, ['fileA.ts', 'fileB.ts', 'fileC.ts']);
      state = deleteArgs(state, 'fileB.ts');

      expect(state.argList?.files).toEqual(['fileA.ts', 'fileC.ts']);
    });
  });

  describe('nextArg, prevArg, firstArg, lastArg', () => {
    it(':next 및 :prev 로 아규먼트 파일 간 이동하고 경계 도달 시 에러를 반환한다', () => {
      let state = setArgs(createBaseState(), ['fileA.ts', 'fileB.ts', 'fileC.ts']);
      expect(state.currentBufferId).toBe(1);

      // :next
      state = nextArg(state);
      expect(state.argList?.currentIndex).toBe(1);
      expect(state.currentBufferId).toBe(2);

      // :next
      state = nextArg(state);
      expect(state.argList?.currentIndex).toBe(2);
      expect(state.currentBufferId).toBe(3);

      // 더 이상 파일이 없음 -> E99
      state = nextArg(state);
      expect(state.commandMessage).toBe('E99: No more files to edit');

      // :prev
      state = prevArg(state);
      expect(state.argList?.currentIndex).toBe(1);
      expect(state.currentBufferId).toBe(2);

      // :first
      state = firstArg(state);
      expect(state.argList?.currentIndex).toBe(0);
      expect(state.currentBufferId).toBe(1);

      // :first 상태에서 :prev -> E164
      state = prevArg(state);
      expect(state.commandMessage).toBe('E164: Cannot go before first file');

      // :last
      state = lastArg(state);
      expect(state.argList?.currentIndex).toBe(2);
      expect(state.currentBufferId).toBe(3);
    });
  });

  describe('argdo batch execution', () => {
    it(':argdo 로 모든 아규먼트 파일에 대해 일괄 치환을 실행한다', () => {
      let state = setArgs(createBaseState(), ['fileA.ts', 'fileB.ts', 'fileC.ts']);

      // 치환 함수 모의 실행
      const dummyEx = (s: VimEditorState, cmd: string): VimEditorState => {
        if (cmd === '%s/TODO/DONE/g') {
          return {
            ...s,
            lines: s.lines.map((l) => l.replace(/TODO/g, 'DONE')),
          };
        }
        return s;
      };

      state = argdo(state, '%s/TODO/DONE/g', dummyEx);

      // 모든 버퍼의 라인에 DONE이 적용되었는지 검증
      const bufA = state.buffers?.find((b) => b.name === 'fileA.ts');
      const bufB = state.buffers?.find((b) => b.name === 'fileB.ts');
      const bufC = state.buffers?.find((b) => b.name === 'fileC.ts');

      expect(bufA?.lines[0]).toBe('content of file A: DONE_1');
      expect(bufB?.lines[0]).toBe('content of file B: DONE_2');
      expect(bufC?.lines[0]).toBe('content of file C: DONE_3');
      expect(state.commandMessage).toContain('3개 파일에 대해 :argdo');
    });
  });

  describe('handleKey Ex command integration', () => {
    it(':args, :n, :prev, :argdo 명령어가 handleKey를 통해 정상 실행된다', () => {
      let state = createBaseState();

      // 1. :args fileA.ts fileB.ts
      const cmd1 = ':args fileA.ts fileB.ts\n';
      for (const char of cmd1) {
        state = handleKey(state, char === '\n' ? 'Enter' : char);
      }
      expect(state.argList?.files).toEqual(['fileA.ts', 'fileB.ts']);

      // 2. :n (다음 파일 이동)
      const cmd2 = ':n\n';
      for (const char of cmd2) {
        state = handleKey(state, char === '\n' ? 'Enter' : char);
      }
      expect(state.argList?.currentIndex).toBe(1);
      expect(state.currentBufferId).toBe(2);

      // 3. :prev (이전 파일 이동)
      const cmd3 = ':prev\n';
      for (const char of cmd3) {
        state = handleKey(state, char === '\n' ? 'Enter' : char);
      }
      expect(state.argList?.currentIndex).toBe(0);
      expect(state.currentBufferId).toBe(1);

      // 4. :argdo %s/TODO/RESOLVED/g
      const cmdArgdo = ':argdo %s/TODO/RESOLVED/g\n';
      for (const char of cmdArgdo) {
        state = handleKey(state, char === '\n' ? 'Enter' : char);
      }

      const bufA = state.buffers?.find((b) => b.name === 'fileA.ts');
      const bufB = state.buffers?.find((b) => b.name === 'fileB.ts');
      expect(bufA?.lines[0]).toBe('content of file A: RESOLVED_1');
      expect(bufB?.lines[0]).toBe('content of file B: RESOLVED_2');
    });

    it(':bufdo 명령어로 모든 버퍼에 대해 일괄 치환을 실행한다', () => {
      let state = createBaseState();

      const cmd = ':bufdo %s/TODO/COMPLETED/g\n';
      for (const char of cmd) {
        state = handleKey(state, char === '\n' ? 'Enter' : char);
      }

      expect(state.commandMessage).toContain('3개 버퍼에 대해 :bufdo');
      const bufA = state.buffers?.find((b) => b.name === 'fileA.ts');
      const bufB = state.buffers?.find((b) => b.name === 'fileB.ts');
      const bufC = state.buffers?.find((b) => b.name === 'fileC.ts');
      expect(bufA?.lines[0]).toBe('content of file A: COMPLETED_1');
      expect(bufB?.lines[0]).toBe('content of file B: COMPLETED_2');
      expect(bufC?.lines[0]).toBe('content of file C: COMPLETED_3');
    });

    it(':tabdo 명령어로 모든 탭 페이지에 대해 일괄 명령을 실행한다', () => {
      let state: VimEditorState = {
        lines: ['tab 1 TODO'],
        cursor: { line: 0, col: 0 },
        mode: 'NORMAL',
      };

      // 탭 2개 생성 (:tabnew)
      const cmdTabnew = ':tabnew\n';
      for (const char of cmdTabnew) {
        state = handleKey(state, char === '\n' ? 'Enter' : char);
      }
      state.lines = ['tab 2 TODO'];

      // :tabdo s/TODO/FIXED/
      const cmdTabdo = ':tabdo s/TODO/FIXED/\n';
      for (const char of cmdTabdo) {
        state = handleKey(state, char === '\n' ? 'Enter' : char);
      }

      expect(state.commandMessage).toContain('2개 탭에 대해 :tabdo');
      expect(state.tabPages?.[0].lines[0]).toBe('tab 1 FIXED');
      expect(state.tabPages?.[1].lines[0]).toBe('tab 2 FIXED');
    });
  });
});
