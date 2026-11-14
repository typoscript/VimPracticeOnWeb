import { describe, it, expect } from 'vitest';
import {
  createVimState,
  runExCommand,
  DEFAULT_ERRORFORMAT,
  splitErrorformatEntries,
  parseLinesWithErrorformat,
} from './index';

describe('errorformat, :cexpr/:caddexpr, :grep/:lgrep', () => {
  describe(':set errorformat (efm) & grepprg (gp)', () => {
    it('기본 efm/gp 조회 및 +=, ^=, -= 수정 연산을 지원한다', () => {
      let s = createVimState(['hello']);

      s = runExCommand(s, 'set efm?');
      expect(s.commandMessage).toContain('errorformat=');
      expect(s.commandMessage).toContain('%f:%l:%c:%m');

      s = runExCommand(s, 'set efm=%f:%l:%m');
      expect(s.options?.errorformat).toBe('%f:%l:%m');

      s = runExCommand(s, 'set efm+=%f@%l:%m');
      expect(s.options?.errorformat).toBe('%f:%l:%m,%f@%l:%m');

      s = runExCommand(s, 'set efm^=[%t]\\ %f:%l:%m');
      expect(s.options?.errorformat).toBe('[%t] %f:%l:%m,%f:%l:%m,%f@%l:%m');

      s = runExCommand(s, 'set efm-=%f@%l:%m');
      expect(s.options?.errorformat).toBe('[%t] %f:%l:%m,%f:%l:%m');

      s = runExCommand(s, 'set gp=rg\\ --vimgrep');
      expect(s.options?.grepprg).toBe('rg --vimgrep');

      s = runExCommand(s, 'set gp?');
      expect(s.commandMessage).toContain('grepprg=rg --vimgrep');
    });

    it('이스케이프된 쉼표(\\\\)를 분리하지 않고 패턴 엔트리를 나눈다', () => {
      const entries = splitErrorformatEntries(DEFAULT_ERRORFORMAT);
      expect(entries).toEqual(['%f:%l:%c:%m', '%f:%l:%m', '%f(%l,%c):%m']);

      const items = parseLinesWithErrorformat(['app.ts(12,4):Type mismatch']);
      expect(items).toHaveLength(1);
      expect(items[0]).toMatchObject({
        filename: 'app.ts',
        line: 12,
        col: 4,
        text: 'Type mismatch',
      });
    });

    it('사용자 지정 errorformat 으로 다양한 빌드/린트 로그를 파싱한다', () => {
      const items = parseLinesWithErrorformat(
        ['[E] src/core.ts @42:8 - Undefined identifier foo', '[W] src/util.ts @10:1 - Unused import'],
        '[%t] %f @%l:%c - %m'
      );
      expect(items).toHaveLength(2);
      expect(items[0]).toMatchObject({
        filename: 'src/core.ts',
        line: 42,
        col: 8,
        type: 'E',
        text: 'Undefined identifier foo',
      });
      expect(items[1]).toMatchObject({
        filename: 'src/util.ts',
        line: 10,
        col: 1,
        type: 'W',
        text: 'Unused import',
      });
    });

    it(':cfile 은 VFS 파일과 현재 efm 옵션을 사용해 에러를 로드하고 점프한다', () => {
      let s = createVimState(['line 1', 'line 2 target'], { line: 0, col: 0 }, {
        primaryFilename: 'main.ts',
        virtualFiles: {
          'main.ts': ['line 1', 'line 2 target'],
          'build.log': ['LOG main.ts#2#8#Bad token'],
        },
      });
      s = runExCommand(s, 'set efm=LOG\\ %f#%l#%c#%m');
      s = runExCommand(s, 'cfile build.log');

      expect(s.quickfix?.items).toHaveLength(1);
      expect(s.quickfix?.items[0]).toMatchObject({
        filename: 'main.ts',
        line: 2,
        col: 8,
        text: 'Bad token',
      });
      expect(s.cursor).toEqual({ line: 1, col: 7 });
    });
  });

  describe(':cexpr, :cgetexpr, :caddexpr & :lexpr, :lgetexpr, :laddexpr', () => {
    it(':cexpr / :cgetexpr / :caddexpr 로 Vimscript 표현식을 퀵픽스 목록으로 평가한다', () => {
      let s = createVimState(['aaa', 'bbb target', 'ccc'], { line: 0, col: 0 }, {
        primaryFilename: 'index.ts',
        virtualFiles: {
          'index.ts': ['aaa', 'bbb target', 'ccc'],
          'other.ts': ['first', 'second', 'third'],
        },
      });

      // :cgetexpr 는 첫 항목으로 점프하지 않음
      s = runExCommand(s, "cgetexpr ['index.ts:2:5:Warning msg']");
      expect(s.quickfix?.items).toHaveLength(1);
      expect(s.cursor).toEqual({ line: 0, col: 0 });

      // :caddexpr 는 기존 항목 뒤에 추가
      s = runExCommand(s, "cad ['other.ts:3:2:Error msg']");
      expect(s.quickfix?.items).toHaveLength(2);
      expect(s.quickfix?.items[1].filename).toBe('other.ts');

      // 변수와 함께 :cexpr 실행 시 첫 항목으로 점프
      s = runExCommand(s, "let g:errs = 'index.ts:2:4:From var'");
      s = runExCommand(s, 'cexpr g:errs');
      expect(s.quickfix?.items).toHaveLength(1);
      expect(s.quickfix?.items[0].text).toBe('From var');
      expect(s.cursor).toEqual({ line: 1, col: 3 });

      // :cexpr [] 는 목록을 초기화
      s = runExCommand(s, 'cexpr []');
      expect(s.quickfix?.items).toEqual([]);
    });

    it(':lexpr / :lgetexpr / :laddexpr 로 로케이션 리스트를 구성·추가한다', () => {
      let s = createVimState(['one', 'two', 'three'], { line: 0, col: 0 }, { primaryFilename: 'app.ts' });

      s = runExCommand(s, "lgetexpr ['app.ts:3:2:Third line']");
      expect(s.locationList?.items).toHaveLength(1);
      expect(s.cursor).toEqual({ line: 0, col: 0 });

      s = runExCommand(s, "laddexpr ['app.ts:1:1:First line']");
      expect(s.locationList?.items).toHaveLength(2);

      s = runExCommand(s, "lexpr ['app.ts:2:3:Jump here']");
      expect(s.locationList?.items).toHaveLength(1);
      expect(s.cursor).toEqual({ line: 1, col: 2 });
    });

    it('인자가 비어 있는 :caddexpr 또는 잘못된 표현식은 에러를 보고한다', () => {
      const s = createVimState(['x']);
      const emptyErr = runExCommand(s, 'caddexpr');
      expect(emptyErr.bell).toBe(true);
      expect(emptyErr.commandMessage).toContain('E471');

      const syntaxErr = runExCommand(s, 'cexpr unknown_var_xyz');
      expect(syntaxErr.bell).toBe(true);
    });
  });

  describe(':grep, :grepadd, :lgrep, :lgrepadd', () => {
    it(':grep 및 :grep! 으로 VFS 전체를 검색하고 플래그(-i, -w, -F)를 처리한다', () => {
      let s = createVimState(['const todo = 1;', 'const todos = 2;'], { line: 0, col: 0 }, {
        primaryFilename: 'a.ts',
        virtualFiles: {
          'a.ts': ['const todo = 1;', 'const todos = 2;'],
          'b.ts': ['// TODO: fix bug', 'const ok = true;'],
        },
      });

      // -iw 로 단어 단위 대소문자 무시 검색
      s = runExCommand(s, 'grep -iw todo *');
      expect(s.quickfix?.items.map((x) => `${x.filename}:${x.line}`)).toEqual(['a.ts:1', 'b.ts:1']);
      expect(s.primaryFilename).toBe('a.ts');
      expect(s.cursor.line).toBe(0);

      // :grep! 은 점프하지 않고 채움
      const sNoJump = runExCommand(s, 'grep! -F // *');
      expect(sNoJump.quickfix?.items).toHaveLength(1);
      expect(sNoJump.primaryFilename).toBe('a.ts');

      // :grepadd 는 기존 결과 뒤에 추가
      s = runExCommand(s, 'grepadd ok b.ts');
      expect(s.quickfix?.items).toHaveLength(3);
      expect(s.quickfix?.items[2].filename).toBe('b.ts');
    });

    it(':lgrep 및 :lgrepadd 는 창별 로케이션 리스트를 채우며 커스텀 efm 변경에도 안전하다', () => {
      let s = createVimState(['alpha', 'beta match'], { line: 0, col: 0 }, {
        primaryFilename: 'main.ts',
        virtualFiles: {
          'main.ts': ['alpha', 'beta match'],
          'extra.ts': ['gamma match'],
        },
      });
      s = runExCommand(s, 'set efm=%f(%l):%m');
      s = runExCommand(s, 'lgrep match %');
      expect(s.locationList?.items).toHaveLength(1);
      expect(s.cursor).toEqual({ line: 1, col: 5 });

      s = runExCommand(s, 'lgrepadd gamma extra.ts');
      expect(s.locationList?.items).toHaveLength(2);
      expect(s.locationList?.items[1].filename).toBe('extra.ts');
    });

    it('매칭이 없거나 인자가 없으면 E480 / E471 과 bell 을 발생시킨다', () => {
      const s = createVimState(['hello world'], { line: 0, col: 0 }, { primaryFilename: 'a.ts' });
      const noMatch = runExCommand(s, 'grep nonexistent %');
      expect(noMatch.bell).toBe(true);
      expect(noMatch.commandMessage).toContain('E480');

      const missingArg = runExCommand(s, 'lgrep');
      expect(missingArg.bell).toBe(true);
      expect(missingArg.commandMessage).toContain('E471');
    });
  });
});
