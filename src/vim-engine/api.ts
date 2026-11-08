import { CursorPosition, VimEditorState, VimScriptValue } from './types';
import { handleKey } from './vimEngine';
import { executeCommandLine } from './commandLine';
import { parseKeySequence } from './keymapEngine';
import { callUserFunction } from './vimscriptEngine';
import { EvalContext, VimScriptError, evaluateVimScript } from './vimscriptEval';

/**
 * 다른 프로젝트에서 엔진을 쓰기 쉽게 만든 편의 함수들
 */

/** 새 에디터 상태를 만듭니다. (NORMAL 모드, 커서는 지정하지 않으면 첫 줄 첫 칸) */
export function createVimState(
  lines: string[] | string = [''],
  cursor: CursorPosition = { line: 0, col: 0 },
  extra: Partial<VimEditorState> = {}
): VimEditorState {
  const bufferLines = typeof lines === 'string' ? lines.split('\n') : lines.length > 0 ? [...lines] : [''];
  return { lines: bufferLines, cursor: { ...cursor }, mode: 'NORMAL', ...extra };
}

/**
 * 여러 키를 차례로 입력합니다.
 * 문자열은 Vim 매핑 표기법으로 해석합니다: "dw", "ciwfoo<Esc>", "<C-a>", ":%s/a/b/g<CR>"
 * 배열은 엔진 키 이름 그대로 사용합니다: ['d', 'w'], ['i', 'x', 'Escape']
 */
export function sendKeys(state: VimEditorState, keys: string | string[]): VimEditorState {
  const list = typeof keys === 'string' ? parseKeySequence(keys) : keys;
  return list.reduce((s, k) => handleKey(s, k), state);
}

/** Ex 명령을 실행합니다. (앞의 ':' 는 있어도 없어도 됩니다) 예: runExCommand(state, '%s/foo/bar/g') */
export function runExCommand(state: VimEditorState, command: string): VimEditorState {
  return executeCommandLine(state, command.replace(/^:/, ''), handleKey);
}

/**
 * Vim script 표현식을 평가합니다. 예: evalVimExpression(state, "toupper(getline(1))")
 * setline() 등으로 버퍼가 바뀌면 바뀐 상태를 함께 돌려줍니다. 에러는 VimScriptError 로 던집니다.
 */
export function evalVimExpression(state: VimEditorState, expression: string): { value: VimScriptValue; state: VimEditorState } {
  const runEx = (s: VimEditorState, cmd: string) => executeCommandLine(s, cmd, handleKey);
  const ctx: EvalContext = {
    state,
    callUserFunction: (c, name, args) => {
      const r = callUserFunction(c.state, name, args, runEx);
      c.state = r.state;
      if (r.error) throw new VimScriptError(r.error);
      return r.value;
    },
  };
  const value = evaluateVimScript(expression, ctx);
  return { value, state: ctx.state };
}
