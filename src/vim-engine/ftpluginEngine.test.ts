import { describe, it, expect } from 'vitest';
import {
  getFiletypeIndentPreset,
  applyFiletypeIndent,
  executeFiletypeCommand,
  FILETYPE_INDENT_PRESETS,
} from './ftpluginEngine';
import { getOptions } from './setEngine';
import { handleKey } from './vimEngine';
import { VimEditorState } from './types';

describe('ftpluginEngine & Filetype Indent System', () => {
  const createBaseState = (filename?: string): VimEditorState => ({
    lines: ['def hello():', 'pass'],
    cursor: { line: 1, col: 0 },
    mode: 'NORMAL',
    primaryFilename: filename,
    currentBufferId: 1,
  });

  describe('getFiletypeIndentPreset', () => {
    it('언어별 표준 들여쓰기 프리셋을 정확하게 조회한다', () => {
      const py = getFiletypeIndentPreset('python');
      expect(py).toEqual({ shiftwidth: 4, tabstop: 4, expandtab: true });

      const go = getFiletypeIndentPreset('go');
      expect(go).toEqual({ shiftwidth: 8, tabstop: 8, expandtab: false });

      const ts = getFiletypeIndentPreset('typescript');
      expect(ts).toEqual({ shiftwidth: 2, tabstop: 2, expandtab: true });

      const rust = getFiletypeIndentPreset('rust');
      expect(rust).toEqual({ shiftwidth: 4, tabstop: 4, expandtab: true });
    });

    it('대소문자 및 공백을 정규화하여 프리셋을 조회한다', () => {
      expect(getFiletypeIndentPreset('  PYTHON  ')).toEqual(FILETYPE_INDENT_PRESETS.python);
      expect(getFiletypeIndentPreset('GO')).toEqual(FILETYPE_INDENT_PRESETS.go);
    });

    it('알 수 없거나 빈 파일타입에 대해 undefined를 반환한다', () => {
      expect(getFiletypeIndentPreset('')).toBeUndefined();
      expect(getFiletypeIndentPreset('unknown_lang')).toBeUndefined();
    });
  });

  describe('applyFiletypeIndent', () => {
    it('파일타입에 맞는 들여쓰기를 현재 버퍼 로컬 옵션으로 적용한다', () => {
      const state = createBaseState('main.py');
      const next = applyFiletypeIndent(state, 'python');

      const opts = getOptions(next);
      expect(opts.shiftwidth).toBe(4);
      expect(opts.tabstop).toBe(4);
      expect(opts.expandtab).toBe(true);
      expect(opts.filetype).toBe('python');
      expect(next.bufferLocalOptions?.[1]?.shiftwidth).toBe(4);
    });

    it('state.filetypeSettings.indent가 false이면 들여쓰기를 적용하지 않는다', () => {
      let state = createBaseState('main.py');
      state = {
        ...state,
        filetypeSettings: { detect: true, plugin: true, indent: false },
      };

      const next = applyFiletypeIndent(state, 'python');
      const opts = getOptions(next);
      expect(opts.shiftwidth).toBe(2); // 기본값 유지
    });
  });

  describe('executeFiletypeCommand (:filetype)', () => {
    it(':filetype 명령으로 감지/플러그인/들여쓰기 상태를 조회한다', () => {
      const state = createBaseState();
      const res = executeFiletypeCommand(state, '');
      expect(res.commandMessage).toContain('파일타입 감지:ON');
      expect(res.commandMessage).toContain('플러그인:ON');
      expect(res.commandMessage).toContain('들여쓰기:ON');
    });

    it(':filetype off 로 모든 파일타입 기능을 비활성화한다', () => {
      const state = createBaseState();
      const res = executeFiletypeCommand(state, 'off');
      expect(res.filetypeSettings?.detect).toBe(false);
      expect(res.filetypeSettings?.plugin).toBe(false);
      expect(res.filetypeSettings?.indent).toBe(false);
      expect(res.commandMessage).toContain('비활성화');
    });

    it(':filetype plugin indent on 으로 모든 설정을 활성화하고 들여쓰기를 적용한다', () => {
      const state = createBaseState('script.py');
      const res = executeFiletypeCommand(state, 'plugin indent on');
      expect(res.filetypeSettings?.detect).toBe(true);
      expect(res.filetypeSettings?.plugin).toBe(true);
      expect(res.filetypeSettings?.indent).toBe(true);
      expect(getOptions(res).shiftwidth).toBe(4);
    });

    it(':filetype indent off 로 들여쓰기만 비활성화한다', () => {
      const state = createBaseState();
      const res = executeFiletypeCommand(state, 'indent off');
      expect(res.filetypeSettings?.indent).toBe(false);
      expect(res.filetypeSettings?.detect).toBe(true);
    });

    it(':filetype detect 로 현재 파일명 기반 파일타입을 감지한다', () => {
      const state = createBaseState('test.go');
      const res = executeFiletypeCommand(state, 'detect');
      expect(getOptions(res).filetype).toBe('go');
      expect(getOptions(res).shiftwidth).toBe(8);
      expect(getOptions(res).expandtab).toBe(false);
    });

    it('잘못된 인수 전달 시 bell: true 와 E475 오류를 반환한다', () => {
      const state = createBaseState();
      const res = executeFiletypeCommand(state, 'invalid_arg');
      expect(res.bell).toBe(true);
      expect(res.commandMessage).toContain('E475');
    });
  });

  describe('Dynamic Indent Integration (>> / <<)', () => {
    it('python 파일에서는 >> 시 4칸 공백으로 들여쓰기된다', () => {
      let state = createBaseState('main.py');
      state = applyFiletypeIndent(state, 'python');

      // pass 라인(1번 줄)에서 >>
      state = handleKey(state, '>');
      state = handleKey(state, '>');

      expect(state.lines[1]).toBe('    pass');

      // << 시 4칸 공백이 제거됨
      state = handleKey(state, '<');
      state = handleKey(state, '<');

      expect(state.lines[1]).toBe('pass');
    });

    it('go 파일(expandtab: false)에서는 >> 시 탭(\\t)으로 들여쓰기된다', () => {
      let state = createBaseState('main.go');
      state = applyFiletypeIndent(state, 'go');

      // pass 라인에서 >>
      state = handleKey(state, '>');
      state = handleKey(state, '>');

      expect(state.lines[1]).toBe('\tpass');

      // << 시 탭이 제거됨
      state = handleKey(state, '<');
      state = handleKey(state, '<');

      expect(state.lines[1]).toBe('pass');
    });
  });

  describe('Insert Mode <Tab> Dynamic Indentation', () => {
    it('python(ts=4, expandtab=true) 상태에서 Tab 입력 시 4칸 공백이 삽입된다', () => {
      let state = createBaseState('app.py');
      state = applyFiletypeIndent(state, 'python');

      // INSERT 모드 진입
      state = handleKey(state, 'i');
      expect(state.mode).toBe('INSERT');

      // Tab 입력
      state = handleKey(state, 'Tab');

      expect(state.lines[1]).toBe('    pass');
      expect(state.cursor.col).toBe(4);
    });

    it('go(ts=8, expandtab=false) 상태에서 Tab 입력 시 \\t 문자가 삽입된다', () => {
      let state = createBaseState('server.go');
      state = applyFiletypeIndent(state, 'go');

      // INSERT 모드 진입
      state = handleKey(state, 'i');
      expect(state.mode).toBe('INSERT');

      // Tab 입력
      state = handleKey(state, 'Tab');

      expect(state.lines[1]).toBe('\tpass');
      expect(state.cursor.col).toBe(1);
    });
  });

  describe('Ex Command Integration via handleKey', () => {
    it(':setlocal ft=python 실행 시 들여쓰기가 4칸으로 자동 조정되고 >> 가 4칸 동작한다', () => {
      let state = createBaseState();

      // :setlocal ft=python Enter
      state = handleKey(state, ':');
      for (const ch of 'setlocal ft=python') {
        state = handleKey(state, ch);
      }
      state = handleKey(state, 'Enter');

      expect(getOptions(state).filetype).toBe('python');
      expect(getOptions(state).shiftwidth).toBe(4);

      // >>
      state = handleKey(state, '>');
      state = handleKey(state, '>');
      expect(state.lines[1]).toBe('    pass');
    });

    it(':filetype plugin indent on 실행 시 설정이 갱신된다', () => {
      let state = createBaseState('calc.py');

      // :filetype plugin indent on Enter
      state = handleKey(state, ':');
      for (const ch of 'filetype plugin indent on') {
        state = handleKey(state, ch);
      }
      state = handleKey(state, 'Enter');

      expect(state.filetypeSettings?.indent).toBe(true);
      expect(state.commandMessage).toContain('활성화');
      expect(getOptions(state).shiftwidth).toBe(4);
    });
  });
});
