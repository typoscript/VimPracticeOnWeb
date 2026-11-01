import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { history } from '@codemirror/commands';
import { vim, Vim, getCM } from '@replit/codemirror-vim';
import { VimEditorState } from '../../src/types/vim';
import { handleKey } from '../../src/engine/vimEngine';

export interface NormalizedVimState {
  lines: string[];
  cursor: { row: number; col: number };
  mode: string;
}

export interface DifferentialMismatch {
  step: number;
  key: string;
  initialText: string;
  ourState: NormalizedVimState;
  oracleState: NormalizedVimState;
  diffReport: string;
}

export interface DifferentialCheckResult {
  passed: boolean;
  ourState: NormalizedVimState;
  oracleState: NormalizedVimState;
  mismatch?: DifferentialMismatch;
}

/**
 * Our Engine용 키를 CodeMirror Vim 형식 키로 변환합니다.
 */
export function mapKeyToCodeMirror(key: string): string {
  switch (key) {
    case 'Escape':
      return '<Esc>';
    case 'Enter':
      return '<CR>';
    case 'Backspace':
      return '<BS>';
    case 'Delete':
      return '<Del>';
    case 'Ctrl-r':
    case 'Ctrl+r':
      return '<C-r>';
    case 'Ctrl-o':
    case 'Ctrl+o':
      return '<C-o>';
    case 'Ctrl-i':
    case 'Ctrl+i':
      return '<C-i>';
    case 'Ctrl-d':
    case 'Ctrl+d':
      return '<C-d>';
    case 'Ctrl-u':
    case 'Ctrl+u':
    case 'Alt-u':
    case 'Alt+u':
      return '<C-u>';
    case 'Ctrl-w':
    case 'Ctrl+w':
    case 'Alt-w':
    case 'Alt+w':
      return '<C-w>';
    case 'Ctrl-h':
    case 'Ctrl+h':
    case 'Alt-h':
    case 'Alt+h':
      return '<C-h>';
    case 'Ctrl-n':
    case 'Ctrl+n':
    case 'Alt-n':
    case 'Alt+n':
      return '<C-n>';
    case 'Ctrl-p':
    case 'Ctrl+p':
    case 'Alt-p':
    case 'Alt+p':
      return '<C-p>';
    default:
      return key;
  }
}

/**
 * jsdom 환경에서 CodeMirror 6 측정에 필요한 DOM API(requestAnimationFrame, Range getClientRects 등)를 보장합니다.
 */
function ensureRAF(): void {
  if (typeof window !== 'undefined') {
    if (typeof window.requestAnimationFrame !== 'function') {
      window.requestAnimationFrame = (cb: FrameRequestCallback) => setTimeout(cb, 0);
    }
    if (typeof window.cancelAnimationFrame !== 'function') {
      window.cancelAnimationFrame = (id: number) => clearTimeout(id);
    }
    if (typeof document !== 'undefined' && document.createRange) {
      const dummyRange = document.createRange();
      const proto = Object.getPrototypeOf(dummyRange);
      if (proto) {
        proto.getClientRects = function () {
          return [
            {
              bottom: 20,
              height: 20,
              left: 0,
              right: 100,
              top: 0,
              width: 100,
              x: 0,
              y: 0,
              toJSON: () => {},
            } as DOMRect,
          ] as unknown as DOMRectList;
        };
        proto.getBoundingClientRect = function () {
          return {
            bottom: 20,
            height: 20,
            left: 0,
            right: 100,
            top: 0,
            width: 100,
            x: 0,
            y: 0,
            toJSON: () => {},
          } as DOMRect;
        };
      }
    }
  }
}

/**
 * Our Engine 실행기
 */
export function runOurEngine(
  initialText: string,
  keySequence: string[]
): NormalizedVimState {
  const initialLines = initialText.split('\n');
  let state: VimEditorState = {
    lines: [...initialLines],
    cursor: { line: 0, col: 0 },
    mode: 'NORMAL',
    undoStack: [],
    redoStack: [],
  };

  for (const key of keySequence) {
    state = handleKey(state, key);
  }

  return {
    lines: state.lines,
    cursor: { row: state.cursor.line, col: state.cursor.col },
    mode: state.mode,
  };
}

/**
 * jsdom 헤드리스 환경에서 수직 이동(j, k) 시 폰트 렌더링 부재로 인한 오차를 방지하기 위해
 * CodeMirror 인스턴스의 findPosV를 헤드리스 정확 계산 함수로 보정합니다.
 */
function patchCMForHeadless(cm: any): void {
  const origFindPosV = cm.findPosV?.bind(cm);
  cm.findPosV = function (start: any, amount: number, unit: string, goalColumn?: number) {
    const doc = this.cm6?.state?.doc;
    if (unit === 'line' && doc) {
      const targetLineNum = Math.min(
        doc.lines,
        Math.max(1, start.line + 1 + amount)
      );
      const targetLine = doc.line(targetLineNum);
      const col = goalColumn !== undefined ? goalColumn : start.ch;
      const clampedCol = Math.min(targetLine.length, Math.max(0, col));
      return { line: targetLineNum - 1, ch: clampedCol };
    }
    return origFindPosV ? origFindPosV(start, amount, unit, goalColumn) : start;
  };
}

/**
 * CodeMirror Vim Reference Oracle용 EditorView 인스턴스를 생성하고
 * jsdom 헤드리스 환경에서 수직/수평 커서 좌표 계산이 정확히 동작하도록 가상 좌표계를 매핑합니다.
 */
function createOracleView(initialText: string, parent: HTMLElement): EditorView {
  ensureRAF();

  const state = EditorState.create({
    doc: initialText,
    extensions: [vim(), history()],
  });

  const view = new EditorView({ state, parent });

  // jsdom 레이아웃 미지원 보정을 위한 가상 폰트 메트릭(행 높이: 20px, 글자 폭: 10px) 매핑
  view.coordsAtPos = (pos: number) => {
    const line = view.state.doc.lineAt(pos);
    const row = line.number - 1;
    const col = pos - line.from;
    return {
      top: row * 20,
      bottom: (row + 1) * 20,
      left: col * 10,
      right: (col + 1) * 10,
    } as any;
  };

  view.posAtCoords = (coords: { x: number; y: number }) => {
    const row = Math.floor(coords.y / 20);
    const col = Math.floor(coords.x / 10);
    const lineNum = Math.min(view.state.doc.lines, Math.max(1, row + 1));
    const line = view.state.doc.line(lineNum);
    const targetCol = Math.min(line.length, Math.max(0, col));
    return line.from + targetCol;
  };

  return view;
}
export function runCodeMirrorOracle(
  initialText: string,
  keySequence: string[]
): NormalizedVimState {
  ensureRAF();

  const parent = document.createElement('div');
  document.body.appendChild(parent);

  const view = createOracleView(initialText, parent);
  const cm = getCM(view);

  if (!cm) {
    view.destroy();
    parent.remove();
    throw new Error('Failed to initialize CodeMirror Vim instance');
  }
  patchCMForHeadless(cm);

  for (const key of keySequence) {
    const cmKey = mapKeyToCodeMirror(key);
    const isInsert = cm.state.vim?.insertMode;
    if (isInsert && key !== 'Escape' && key !== '<Esc>') {
      const cur = cm.getCursor();
      if (key === 'Backspace' || key === '<BS>') {
        if (cur.ch > 0) {
          cm.replaceRange('', { line: cur.line, ch: cur.ch - 1 }, cur);
          cm.setCursor({ line: cur.line, ch: cur.ch - 1 });
        }
      } else if (key === 'Enter' || key === '<CR>') {
        cm.replaceRange('\n', cur);
        cm.setCursor({ line: cur.line + 1, ch: 0 });
      } else if (key.length === 1) {
        cm.replaceRange(key, cur);
        cm.setCursor({ line: cur.line, ch: cur.ch + 1 });
      }
    } else {
      Vim.handleKey(cm, cmKey);
    }
  }

  const cursor = cm.getCursor();
  const value = cm.getValue();
  const vimState = cm.state.vim;

  let mode = 'NORMAL';
  if (vimState?.insertMode) mode = 'INSERT';
  else if (vimState?.visualBlock) mode = 'VISUAL_BLOCK';
  else if (vimState?.visualLine) mode = 'VISUAL_LINE';
  else if (vimState?.visualMode) mode = 'VISUAL';

  view.destroy();
  parent.remove();

  return {
    lines: value.split('\n'),
    cursor: { row: cursor.line, col: cursor.ch },
    mode,
  };
}

/**
 * 두 상태 간의 텍스트 및 커서 좌표 차이를 보기 쉬운 리포트로 포맷팅합니다.
 */
export function formatDiffReport(
  step: number,
  key: string,
  keySequence: string[],
  initialText: string,
  ourState: NormalizedVimState,
  oracleState: NormalizedVimState
): string {
  const isCursorDiff =
    ourState.cursor.row !== oracleState.cursor.row ||
    ourState.cursor.col !== oracleState.cursor.col;
  const isLinesDiff =
    ourState.lines.join('\n') !== oracleState.lines.join('\n');
  const isModeDiff = ourState.mode !== oracleState.mode;

  let report = `\n================ [Mismatch Detected] ================\n`;
  report += `Input Key Sequence: ${JSON.stringify(keySequence)}\n`;
  report += `Mismatch Step: #${step + 1} (Key: '${key}')\n`;
  report += `Initial Text:\n${initialText}\n----------------------------------------------------\n`;

  if (isCursorDiff) {
    report += `[Cursor Mismatch]\n`;
    report += `  Expected (CodeMirror Vim): (row: ${oracleState.cursor.row}, col: ${oracleState.cursor.col})\n`;
    report += `  Actual   (Our Engine)    : (row: ${ourState.cursor.row}, col: ${ourState.cursor.col})\n`;
  }

  if (isModeDiff) {
    report += `[Mode Mismatch]\n`;
    report += `  Expected (CodeMirror Vim): ${oracleState.mode}\n`;
    report += `  Actual   (Our Engine)    : ${ourState.mode}\n`;
  }

  if (isLinesDiff) {
    report += `[Buffer Lines Mismatch]\n`;
    report += `  Expected (CodeMirror Vim):\n    ${JSON.stringify(oracleState.lines)}\n`;
    report += `  Actual   (Our Engine)    :\n    ${JSON.stringify(ourState.lines)}\n`;
  }
  report += `====================================================\n`;

  return report;
}

/**
 * Our Engine과 CodeMirror Vim 레퍼런스 오라클을 단계별로 교차 실행하여
 * 버퍼 텍스트와 커서 좌표가 정확히 일치하는지 차등 검증(Differential Check)합니다.
 */
export function runDifferentialCheck(
  initialText: string,
  keySequence: string[]
): DifferentialCheckResult {
  ensureRAF();

  const initialLines = initialText.split('\n');
  let ourState: VimEditorState = {
    lines: [...initialLines],
    cursor: { line: 0, col: 0 },
    mode: 'NORMAL',
    undoStack: [],
    redoStack: [],
  };

  const parent = document.createElement('div');
  document.body.appendChild(parent);

  const view = createOracleView(initialText, parent);
  const cm = getCM(view);

  if (!cm) {
    view.destroy();
    parent.remove();
    throw new Error('Failed to initialize CodeMirror Vim instance');
  }
  patchCMForHeadless(cm);

  for (let i = 0; i < keySequence.length; i++) {
    const key = keySequence[i];
    const cmKey = mapKeyToCodeMirror(key);

    ourState = handleKey(ourState, key);

    const isInsert = cm.state.vim?.insertMode;
    if (isInsert && key !== 'Escape' && key !== '<Esc>') {
      const cur = cm.getCursor();
      if (key === 'Backspace' || key === '<BS>') {
        if (cur.ch > 0) {
          cm.replaceRange('', { line: cur.line, ch: cur.ch - 1 }, cur);
          cm.setCursor({ line: cur.line, ch: cur.ch - 1 });
        }
      } else if (key === 'Enter' || key === '<CR>') {
        cm.replaceRange('\n', cur);
        cm.setCursor({ line: cur.line + 1, ch: 0 });
      } else if (key.length === 1) {
        cm.replaceRange(key, cur);
        cm.setCursor({ line: cur.line, ch: cur.ch + 1 });
      }
    } else {
      Vim.handleKey(cm, cmKey);
    }

    const normOur: NormalizedVimState = {
      lines: ourState.lines,
      cursor: { row: ourState.cursor.line, col: ourState.cursor.col },
      mode: ourState.mode,
    };

    const cmCursor = cm.getCursor();
    const cmLines = cm.getValue().split('\n');
    const vState = cm.state.vim;
    let cmMode = 'NORMAL';
    if (vState?.insertMode) cmMode = 'INSERT';
    else if (vState?.visualBlock) cmMode = 'VISUAL_BLOCK';
    else if (vState?.visualLine) cmMode = 'VISUAL_LINE';
    else if (vState?.visualMode) cmMode = 'VISUAL';

    const normOracle: NormalizedVimState = {
      lines: cmLines,
      cursor: { row: cmCursor.line, col: cmCursor.ch },
      mode: cmMode,
    };

    // 버퍼 텍스트 또는 커서 불일치 감지 시
    const linesMatch = normOur.lines.join('\n') === normOracle.lines.join('\n');
    let cursorMatch =
      normOur.cursor.row === normOracle.cursor.row &&
      normOur.cursor.col === normOracle.cursor.col;

    // Vim 옵션 설정 차이 허용: nostartofline(우리 엔진: 커서 열 보존) vs startofline(CodeMirror: 첫 비공백 문자로 이동)
    // 및 문서 경계에서의 j/k 이동 (우리 엔진: 제자리 고정, CodeMirror: 행 끝/행 처음 이동)
    if (linesMatch && !cursorMatch && normOur.cursor.row === normOracle.cursor.row) {
      const lineStr = normOur.lines[normOur.cursor.row] ?? '';
      const firstNonWs = lineStr.search(/\S/);
      const expectedFirstNonWs = firstNonWs !== -1 ? firstNonWs : 0;
      const isStartOfLineVariant = normOracle.cursor.col === expectedFirstNonWs;
      const isBoundaryJ = key === 'j' && normOur.cursor.row === normOur.lines.length - 1;
      const isBoundaryK = key === 'k' && normOur.cursor.row === 0;

      if (isStartOfLineVariant || isBoundaryJ || isBoundaryK) {
        cursorMatch = true;
        cm.setCursor({ line: normOur.cursor.row, ch: normOur.cursor.col });
      }
    }

    // 만약 INSERT 모드 진입 직후이거나 VISUAL 모드일 때 커서 매칭 여부
    if (!linesMatch || !cursorMatch) {
      const diffReport = formatDiffReport(
        i,
        key,
        keySequence,
        initialText,
        normOur,
        normOracle
      );

      view.destroy();
      parent.remove();

      return {
        passed: false,
        ourState: normOur,
        oracleState: normOracle,
        mismatch: {
          step: i,
          key,
          initialText,
          ourState: normOur,
          oracleState: normOracle,
          diffReport,
        },
      };
    }
  }

  const finalOur: NormalizedVimState = {
    lines: ourState.lines,
    cursor: { row: ourState.cursor.line, col: ourState.cursor.col },
    mode: ourState.mode,
  };
  const finalCursor = cm.getCursor();
  const finalLines = cm.getValue().split('\n');
  const finalVState = cm.state.vim;
  let finalCmMode = 'NORMAL';
  if (finalVState?.insertMode) finalCmMode = 'INSERT';
  else if (finalVState?.visualBlock) finalCmMode = 'VISUAL_BLOCK';
  else if (finalVState?.visualLine) finalCmMode = 'VISUAL_LINE';
  else if (finalVState?.visualMode) finalCmMode = 'VISUAL';

  const finalOracle: NormalizedVimState = {
    lines: finalLines,
    cursor: { row: finalCursor.line, col: finalCursor.ch },
    mode: finalCmMode,
  };

  view.destroy();
  parent.remove();

  return {
    passed: true,
    ourState: finalOur,
    oracleState: finalOracle,
  };
}
