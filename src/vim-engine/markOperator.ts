import { VimEditorState } from './types';
import { executeMarkOperator, resolveMarkPosition } from './marks';
import { applyOperatorToMotionRange } from './operatorMotion';

/**
 * 연산자 + 마크 모션 (d'a, c`a, y`a, v`a). `{mark} 는 배타적 문자 단위 모션이라
 * (`d`a` 는 마크 글자를 지우지 않음) d / c / y 는 applyOperatorToMotionRange 로 처리하고,
 * 줄 단위 '{mark}·비주얼 v·없는 마크(E20)는 executeMarkOperator 에 맡깁니다.
 */
export function executeMarkMotionOperator(
  state: VimEditorState,
  op: 'd' | 'c' | 'y' | 'v',
  markChar: string,
  isLineWise: boolean
): VimEditorState {
  const mark = isLineWise || op === 'v' ? null : resolveMarkPosition(state, markChar);
  if (!mark) return executeMarkOperator(state, op, markChar, isLineWise);
  const line = Math.max(0, Math.min(mark.row, state.lines.length - 1));
  const col = Math.max(0, Math.min(mark.col, (state.lines[line] ?? '').length));
  return applyOperatorToMotionRange(state, op as 'd' | 'c' | 'y', state.cursor, { line, col }, false);
}
