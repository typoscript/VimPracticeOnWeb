import { describe, it, expect } from 'vitest';
import {
  createVimState,
  handleKey,
  executeCommandLine,
  configureVimEngine,
  getOptions,
} from './index';

function runEx(state: ReturnType<typeof createVimState>, cmd: string) {
  return executeCommandLine(state, cmd, handleKey);
}

function runKeys(state: ReturnType<typeof createVimState>, keys: string[]) {
  let s = state;
  for (const k of keys) s = handleKey(s, k);
  return s;
}

describe('Neovim Lua 미니 레이어 (:lua, :=expr, :luafile, :source init.lua)', () => {
  it('vim.opt / vim.o / vim.bo 로 옵션을 설정·조회하고 :append/:remove/:get 메서드를 지원한다', () => {
    let s = createVimState(['hello world'], { line: 0, col: 0 });
    s = runEx(s, ':lua vim.opt.relativenumber = true; vim.opt.shiftwidth = 4; vim.opt.wrap = false');
    expect(getOptions(s).relativenumber).toBe(true);
    expect(getOptions(s).shiftwidth).toBe(4);
    expect(getOptions(s).wrap).toBe(false);

    // local opt = vim.opt 별칭 및 :append / :remove / :get
    s = runEx(s, ':lua local opt = vim.opt; opt.formatoptions:remove("o"); print(opt.shiftwidth:get())');
    expect(getOptions(s).formatoptions).not.toContain('o');
    expect(s.commandMessage).toBe('4');

    // := 표현식 즉시 출력
    s = runEx(s, ':= vim.o.shiftwidth');
    expect(s.commandMessage).toBe('4');
  });

  it('vim.g / vim.b 변수와 vim.g.mapleader 및 vim.keymap.set / vim.keymap.del 을 지원한다', () => {
    let s = createVimState(['hello world'], { line: 0, col: 0 });
    s = runEx(s, ':lua vim.g.mapleader = ","; vim.g.my_flag = 42; vim.b.buf_tag = "ok"');
    expect(s.leaderKey).toBe(',');
    expect(s.globalVars?.my_flag).toBe(42);
    expect(s.bufferVars?.[1]?.buf_tag).toBe('ok');

    // 단일 모드 + 다중 모드 테이블 + opts
    s = runEx(
      s,
      ':lua vim.keymap.set("n", "<leader>x", "dd", { silent = true }); vim.keymap.set({"n", "v"}, "H", "^")'
    );
    expect(s.userKeymaps?.['n:,x']).toBe('dd');
    expect(s.userKeymaps?.['n:H']).toBe('^');
    expect(s.userKeymaps?.['v:H']).toBe('^');

    // 실제 키 실행
    s = runKeys(s, [',', 'x']);
    expect(s.lines).toEqual(['']);

    // vim.keymap.del 로 해제
    s = runEx(s, ':lua vim.keymap.del("n", "<leader>x")');
    expect(s.userKeymaps?.['n:,x']).toBeUndefined();
  });

  it('vim.api.* 버퍼·커서 API 와 vim.cmd / vim.fn.* 브릿지가 동작한다', () => {
    let s = createVimState(['alpha', 'beta', 'gamma'], { line: 1, col: 2 }, { primaryFilename: 'demo.ts' });

    s = runEx(s, ':= vim.api.nvim_get_current_line()');
    expect(s.commandMessage).toBe('"beta"');

    s = runEx(s, ':lua vim.api.nvim_set_current_line("BETA_EDITED")');
    expect(s.lines[1]).toBe('BETA_EDITED');

    // Undo(u) 로 Lua 버퍼 수정도 되돌리기 가능
    s = handleKey(s, 'u');
    expect(s.lines[1]).toBe('beta');

    // nvim_buf_set_lines / nvim_buf_get_lines / nvim_win_set_cursor
    s = runEx(s, ':lua vim.api.nvim_buf_set_lines(0, 1, 2, false, {"one", "two"})');
    expect(s.lines).toEqual(['alpha', 'one', 'two', 'gamma']);

    s = runEx(s, ':lua vim.api.nvim_win_set_cursor(0, {3, 1})');
    expect(s.cursor).toEqual({ line: 2, col: 1 });

    // vim.fn.* 호출 + vim.cmd
    s = runEx(s, ':= vim.fn.toupper(vim.api.nvim_get_current_line())');
    expect(s.commandMessage).toBe('"TWO"');

    s = runEx(s, ':lua vim.cmd("%s/alpha/ALPHA/g")');
    expect(s.lines[0]).toBe('ALPHA');
  });

  it(':source init.lua 와 :luafile 로 전체 init.lua 스크립트(제어문·주석·테이블·반복문 포함)를 실행한다', () => {
    const initLua = [
      '-- Neovim init.lua 설정',
      'local opt = vim.opt',
      'opt.number = true',
      'opt.tabstop = 4',
      'vim.g.mapleader = " "',
      'local items = { "a", "b", "c" }',
      'local joined = ""',
      'for i, v in ipairs(items) do',
      '  if i > 1 then',
      '    joined = joined .. "-"',
      '  end',
      '  joined = joined .. v',
      'end',
      'vim.g.result = joined',
      'vim.keymap.set("i", "jk", "<Esc>", { silent = true })',
    ];

    let s = createVimState(initLua, { line: 0, col: 0 }, { primaryFilename: 'init.lua' });
    s = runEx(s, ':source %');
    expect(s.bell).toBeFalsy();
    expect(getOptions(s).tabstop).toBe(4);
    expect(s.globalVars?.result).toBe('a-b-c');
    expect(s.userKeymaps?.['i:jk']).toBe('<Esc>');

    // VFS 에서 :luafile 실행
    let s2 = createVimState(['hello'], { line: 0, col: 0 }, { virtualFiles: { 'config/setup.lua': ['vim.g.from_vfs = 777'] } });
    s2 = runEx(s2, ':luafile config/setup.lua');
    expect(s2.globalVars?.from_vfs).toBe(777);
  });

  it('Lua 구문/런타임 오류 시 bell 과 영어 로케일 에러 메시지를 반환한다', () => {
    configureVimEngine({ locale: 'en' });
    try {
      const s = createVimState(['']);
      const bad = runEx(s, ':lua local x = "unclosed');
      expect(bad.bell).toBe(true);
      expect(bad.commandMessage).toContain('Lua error');
    } finally {
      configureVimEngine({ locale: 'ko' });
    }
  });
});
