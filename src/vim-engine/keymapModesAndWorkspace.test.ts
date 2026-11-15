import { describe, it, expect } from 'vitest';
import {
  createVimState,
  executeCommandLine,
  handleKey,
  VimEditorState,
} from './index';

function runKeys(state: VimEditorState, keys: string[]): VimEditorState {
  let s = state;
  for (const k of keys) {
    s = handleKey(s, k);
  }
  return s;
}

describe('Keymap modes (x/o/c), recursive *map vs *noremap, marks in line()/col(), :tcd, :runtime', () => {
  describe(':xmap / :xnoremap / :xunmap (Visual-only mappings)', () => {
    it(':xnoremap 은 비주얼 모드에서만 동작하고 일반 모드에는 영향을 주지 않는다', () => {
      let s = createVimState(['   hello world'], { line: 0, col: 0 });
      s = executeCommandLine(s, 'xnoremap H $');
      expect(s.userKeymaps?.['x:H']).toBe('$');
      expect(s.userKeymaps?.['H']).toBeUndefined();

      // 일반 모드에서는 H 가 기본 동작(첫 비공백 col=3)을 유지
      s = handleKey(s, 'H');
      expect(s.cursor.col).toBe(3);

      // 비주얼 모드에서는 H 가 매핑된 $ (줄 끝 col=13) 로 이동
      s = runKeys(s, ['v', 'H']);
      expect(s.mode).toBe('VISUAL');
      expect(s.cursor.col).toBe(13);

      // :xmap 목록 조회 및 :xunmap 해제 확인
      const listed = executeCommandLine(s, 'xmap');
      expect(listed.commandMessage).toContain('x ');
      expect(listed.commandMessage).toContain('H');

      s = handleKey(s, 'Escape');
      s = executeCommandLine(s, 'xunmap H');
      expect(s.userKeymaps?.['x:H']).toBeUndefined();
    });

    it('비주얼 다중 키 매핑(:xnoremap <leader>x x)이 동작한다', () => {
      let s = createVimState(['hello world'], { line: 0, col: 0 });
      s = executeCommandLine(s, 'xnoremap <leader>x x');
      s = runKeys(s, ['v', 'e', ' ', 'x']);
      expect(s.mode).toBe('NORMAL');
      expect(s.lines[0]).toBe(' world');
    });
  });

  describe(':omap / :onoremap / :ounmap (Operator-pending mappings)', () => {
    it(':onoremap p i( 로 dp 는 괄호 안을 삭제하고 일반 모드 p 붙여넣기는 유지된다', () => {
      let s = createVimState(['call(arg1, arg2)'], { line: 0, col: 6 });
      s = executeCommandLine(s, 'onoremap p i(');
      expect(s.userKeymaps?.['o:p']).toBe('i(');
      expect(s.userKeymaps?.['p']).toBeUndefined();

      s = runKeys(s, ['d', 'p']);
      expect(s.lines[0]).toBe('call()');
      expect(s.mode).toBe('NORMAL');

      // 일반 모드 P 로 삭제했던 arg1, arg2 커서 앞(괄호 안)에 붙여넣기 정상 동작
      s = handleKey(s, 'P');
      expect(s.lines[0]).toBe('call(arg1, arg2)');

      // :ounmap p 로 해제
      s = executeCommandLine(s, 'ounmap p');
      expect(s.userKeymaps?.['o:p']).toBeUndefined();
    });

    it('연산자 대기 다중 키 접두 매핑(:onoremap al a()과 미일치 폴백(daw)이 모두 동작한다', () => {
      let s = createVimState(['fn(foo bar)'], { line: 0, col: 4 });
      s = executeCommandLine(s, 'onoremap al a(');

      // d + a + w -> 접두 a 불일치로 daw 정상 동작
      s = runKeys(s, ['d', 'a', 'w']);
      expect(s.lines[0]).toBe('fn(bar)');

      // d + a + l -> o:al 매칭으로 a( 실행
      s = runKeys(s, ['d', 'a', 'l']);
      expect(s.lines[0]).toBe('fn');
    });
  });

  describe(':cmap / :cnoremap / :cunmap (Command-line mappings)', () => {
    it(':cnoremap <C-a> <Home> 과 다중 키 %% 확장 및 폴백(:%s)이 동작한다', () => {
      let s = createVimState(['alpha', 'alpha'], { line: 0, col: 0 });
      s = executeCommandLine(s, 'cnoremap <C-a> <Home>');
      s = executeCommandLine(s, 'cnoremap %% src/app.ts');

      // : 에서 Ctrl-a -> Home 으로 커서 맨 앞으로 이동해 echo 삽입
      s = runKeys(s, [':', ' ', '1', 'Ctrl-a', 'e', 'c', 'h', 'o', 'Enter']);
      expect(s.commandMessage).toBe('1');

      // : 에서 %% -> src/app.ts 확장
      s = runKeys(s, [':', 'f', ' ', '%', '%']);
      expect(s.commandBuffer).toBe('f src/app.ts');
      s = handleKey(s, 'Escape');

      // : 에서 %s 는 미일치 폴백으로 :%s/alpha/beta/g 정상 실행
      s = runKeys(s, [':', '%', 's', '/', 'a', 'l', 'p', 'h', 'a', '/', 'b', 'e', 't', 'a', '/', 'g', 'Enter']);
      expect(s.lines).toEqual(['beta', 'beta']);

      // :cunmap %% 해제 확인
      s = executeCommandLine(s, 'cunmap %%');
      expect(s.userKeymaps?.['c:%%']).toBeUndefined();
    });

    it(':cnoremap <expr> 매핑으로 동적 커맨드라인 문자열을 삽입한다', () => {
      let s = createVimState(['line1'], { line: 0, col: 0 });
      s = executeCommandLine(s, 'let g:cmd_tag = "ok"');
      s = executeCommandLine(s, 'cnoremap <expr> <C-t> g:cmd_tag');
      s = runKeys(s, [':', 'e', 'c', 'h', 'o', ' ', '"', 'Ctrl-t', '"', 'Enter']);
      expect(s.commandMessage).toBe('ok');
    });
  });

  describe('재귀 *map vs 비재귀 *noremap 구분 및 무한 루프 가드', () => {
    it(':nmap 은 체인을 재귀 확장하고 :nnoremap 은 1단계만 실행한다', () => {
      // 1) 재귀 nmap: a -> b, b -> x (글자 삭제)
      let rec = createVimState(['hello world'], { line: 0, col: 0 });
      rec = executeCommandLine(rec, 'nmap a b');
      rec = executeCommandLine(rec, 'nmap b x');
      rec = handleKey(rec, 'a');
      expect(rec.lines[0]).toBe('ello world');

      // 2) 비재귀 nnoremap: a -> b (단어 뒤로 이동), b -> x -> a 누르면 b(뒤로 이동)만 실행되고 x로 재매핑 안 됨
      let nonRec = createVimState(['one two three'], { line: 0, col: 8 });
      nonRec = executeCommandLine(nonRec, 'nnoremap a b');
      nonRec = executeCommandLine(nonRec, 'nnoremap b x');
      nonRec = handleKey(nonRec, 'a');
      expect(nonRec.lines[0]).toBe('one two three');
      expect(nonRec.cursor.col).toBe(4);
    });

    it('자기 재귀 루프(:nmap a a)는 최대 깊이에서 E223 에러와 bell 로 안전 종료한다', () => {
      let s = createVimState(['hello'], { line: 0, col: 0 });
      s = executeCommandLine(s, 'nmap a a');
      s = handleKey(s, 'a');
      expect(s.bell).toBe(true);
      expect(s.commandMessage).toContain('E223');
    });

    it(':imap 및 :omap 재귀 매핑이 정상 작동한다', () => {
      let s = createVimState(['foo(bar)'], { line: 0, col: 5 });
      s = executeCommandLine(s, 'omap Q P');
      s = executeCommandLine(s, 'onoremap P i(');
      s = runKeys(s, ['d', 'Q']);
      expect(s.lines[0]).toBe('foo()');

      let ins = createVimState([''], { line: 0, col: 0 });
      ins = executeCommandLine(ins, 'imap zz Z');
      ins = executeCommandLine(ins, 'inoremap Z OK');
      ins = runKeys(ins, ['i', 'z', 'z', 'Escape']);
      expect(ins.lines[0]).toBe('OK');
    });
  });

  describe('line() / col() 특수 마크 및 튜플 인자 지원', () => {
    it("Visual 선택 후 line(\"'<\"), col(\"'<\"), line(\"'>\"), col(\"'>\") 및 'v' 좌표를 반환한다", () => {
      let s = createVimState(['alpha beta', 'gamma delta', 'epsilon'], { line: 0, col: 6 });
      // Visual 모드로 진입 (0, 6) -> (1, 4) 이동 -> 활성 'v' 는 앵커 (line=1, col=7)
      s = runKeys(s, ['v', 'j', 'h', 'h']);
      s = executeCommandLine(s, "let g:vis_pos = [line('v'), col('v')]");
      expect(s.globalVars?.vis_pos).toEqual([1, 7]);

      // Visual 선택 후 Escape 로 '<, '> 기록
      s = createVimState(['alpha beta', 'gamma delta', 'epsilon'], { line: 0, col: 6 });
      s = runKeys(s, ['v', 'j', '0', '4', 'l', 'Escape']);
      s = executeCommandLine(
        s,
        'let g:l1 = line("\'<") | let g:c1 = col("\'<") | let g:l2 = line("\'>") | let g:c2 = col("\'>")'
      );
      expect(s.globalVars?.l1).toBe(1);
      expect(s.globalVars?.c1).toBe(7);
      expect(s.globalVars?.l2).toBe(2);
      expect(s.globalVars?.c2).toBe(5);
    });

    it("'. , '^ , '[ , '] , 'a 마크와 col([lnum, '$']) 튜플을 해석한다", () => {
      let s = createVimState(['first', 'second line', 'third'], { line: 1, col: 3 });
      s = runKeys(s, ['m', 'a']);
      s = runKeys(s, ['i', 'X', 'Escape']);
      s = executeCommandLine(
        s,
        "let g:ma_l = line(\"'a\") | let g:ma_c = col(\"'a\") | let g:ins_l = line(\"'.\") | let g:end_c = col([2, '$'])"
      );
      expect(s.globalVars?.ma_l).toBe(2);
      expect(s.globalVars?.ma_c).toBe(4);
      expect(s.globalVars?.ins_l).toBe(2);
      expect(s.globalVars?.end_c).toBe('second Xline'.length + 1);
    });
  });

  describe(':tcd (탭 로컬 작업 디렉터리) & :runtime[!] {pattern}', () => {
    it(':tcd 는 현재 탭의 작업 디렉터리만 변경하고 탭 전환/닫기 시 각 탭의 cwd 를 복원한다', () => {
      let s: VimEditorState = createVimState(['root'], { line: 0, col: 0 }, {
        virtualFiles: {
          'src/main.ts': ['export const main = 1;'],
          'tests/app.test.ts': ['test("ok", () => {});'],
        },
      });

      s = executeCommandLine(s, 'cd /workspace/src');
      expect(s.cwd).toBe('/workspace/src');

      s = executeCommandLine(s, 'tabnew tests/app.test.ts');
      expect(s.cwd).toBe('/workspace/src');

      // 2번 탭에만 :tcd /workspace/tests 적용
      s = executeCommandLine(s, 'tcd /workspace/tests');
      expect(s.cwd).toBe('/workspace/tests');

      // 1번 탭으로 전환 -> 전역 cwd (/workspace/src) 복원
      s = runKeys(s, ['g', 'T']);
      expect(s.cwd).toBe('/workspace/src');

      // 다시 2번 탭으로 전환 -> 탭 로컬 cwd (/workspace/tests) 복원
      s = runKeys(s, ['g', 't']);
      expect(s.cwd).toBe('/workspace/tests');

      // 존재하지 않는 디렉터리는 E344 벨
      const bad = executeCommandLine(s, 'tcd nonexistent_dir');
      expect(bad.bell).toBe(true);
      expect(bad.commandMessage).toContain('E344');

      // 2번 탭 닫기 -> 1번 탭의 cwd (/workspace/src) 로 복귀
      s = executeCommandLine(s, 'tabclose');
      expect(s.cwd).toBe('/workspace/src');
    });

    it(':runtime 은 첫 일치 파일만, :runtime! 는 일치하는 모든 파일을 순서대로 소싱한다', () => {
      let s: VimEditorState = createVimState(['code'], { line: 0, col: 0 }, {
        virtualFiles: {
          'plugin/01_first.vim': ['let g:order = "one"'],
          'plugin/02_second.vim': ['let g:order = g:order . ",two"'],
        },
      });

      // :runtime plugin/*.vim -> 01_first.vim 만 실행
      s = executeCommandLine(s, 'runtime plugin/*.vim');
      expect(s.globalVars?.order).toBe('one');

      // :runtime! plugin/*.vim -> 01_first.vim, 02_second.vim 모두 실행
      s = executeCommandLine(s, 'runtime! plugin/*.vim');
      expect(s.globalVars?.order).toBe('one,two');

      // 없는 패턴은 에러/벨 없이 조용히 통과 (Vim 스펙)
      const missing = executeCommandLine(s, 'runtime does_not_exist/*.vim');
      expect(missing.bell).toBeFalsy();
    });
  });
});
