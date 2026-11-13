import { VimEditorState, CursorPosition, HelpSession } from './types';
import { HELP_TOPICS, resolveHelpTag } from './helpData';

/**
 * 순정 Vim 도움말 창 열기 (:help [topic], F1, K)
 */
export function openHelp(state: VimEditorState, query?: string): VimEditorState {
  const match = resolveHelpTag(query || 'help.txt');
  const doc = HELP_TOPICS[match.topicKey] || HELP_TOPICS['help.txt'];

  const prevSession = state.helpSession;
  const tagStack = prevSession?.tagStack ? [...prevSession.tagStack] : [];

  // 만약 이미 다른 토픽이 열려 있는 상태에서 새로 :help topic 을 열면 기존 위치를 스택에 보존
  if (prevSession?.isOpen && prevSession.topic !== doc.filename) {
    tagStack.push({
      topic: prevSession.topic,
      cursor: { ...prevSession.cursor },
    });
  }

  const newSession: HelpSession = {
    isOpen: true,
    topic: doc.filename,
    title: doc.title,
    lines: [...doc.content],
    cursor: {
      line: Math.min(Math.max(0, match.lineIndex), Math.max(0, doc.content.length - 1)),
      col: 0,
    },
    tagStack,
  };

  return {
    ...state,
    helpSession: newSession,
    commandMessage: '',
  };
}

/**
 * 순정 Vim 도움말 창 닫기 (:helpclose, :hclose, :q, q)
 */
export function closeHelp(state: VimEditorState): VimEditorState {
  if (!state.helpSession?.isOpen) {
    return state;
  }
  return {
    ...state,
    helpSession: null,
    commandMessage: '',
  };
}

/**
 * 커서 위치에서 |tag| 추출 또는 주어진 tag로 점프 (<CR>, <Ctrl-]>, 클릭)
 */
export function jumpHelpTag(state: VimEditorState, explicitTag?: string): VimEditorState {
  const session = state.helpSession;
  if (!session || !session.isOpen) {
    return state;
  }

  let targetTag = explicitTag?.trim();

  if (!targetTag) {
    const currentLine = session.lines[session.cursor.line] || '';
    const col = session.cursor.col;

    // 1. |tag| 패턴 매칭 확인
    const tagRegex = /\|([^|]+)\|/g;
    let match: RegExpExecArray | null;
    while ((match = tagRegex.exec(currentLine)) !== null) {
      const start = match.index;
      const end = start + match[0].length;
      if (col >= start && col <= end) {
        targetTag = match[1];
        break;
      }
    }

    // 2. |tag| 패턴이 아니면 커서 위치의 단어 추출
    if (!targetTag) {
      targetTag = extractWordAtCol(currentLine, col);
    }
  }

  if (!targetTag) {
    return {
      ...state,
      bell: true,
      commandMessage: 'E433: No tags file',
    };
  }

  const match = resolveHelpTag(targetTag);
  const doc = HELP_TOPICS[match.topicKey] || HELP_TOPICS['help.txt'];

  const updatedStack = [
    ...session.tagStack,
    {
      topic: session.topic,
      cursor: { ...session.cursor },
    },
  ];

  return {
    ...state,
    helpSession: {
      isOpen: true,
      topic: doc.filename,
      title: doc.title,
      lines: [...doc.content],
      cursor: {
        line: Math.min(Math.max(0, match.lineIndex), Math.max(0, doc.content.length - 1)),
        col: 0,
      },
      tagStack: updatedStack,
    },
    commandMessage: '',
  };
}

/**
 * 이전 도움말 태그 위치로 복귀 (<Ctrl-t>)
 */
export function popHelpTag(state: VimEditorState): VimEditorState {
  const session = state.helpSession;
  if (!session || !session.isOpen) {
    return state;
  }

  if (!session.tagStack || session.tagStack.length === 0) {
    return {
      ...state,
      bell: true,
      commandMessage: 'E555: at bottom of tag stack',
    };
  }

  const newStack = [...session.tagStack];
  const prevEntry = newStack.pop()!;

  const doc = HELP_TOPICS[prevEntry.topic] || HELP_TOPICS['help.txt'];

  return {
    ...state,
    helpSession: {
      isOpen: true,
      topic: doc.filename,
      title: doc.title,
      lines: [...doc.content],
      cursor: {
        line: Math.min(Math.max(0, prevEntry.cursor.line), Math.max(0, doc.content.length - 1)),
        col: Math.max(0, prevEntry.cursor.col),
      },
      tagStack: newStack,
    },
    commandMessage: '',
  };
}

/**
 * 도움말 창 활성 상태에서의 전용 키 입력 처리
 */
export function handleHelpKey(state: VimEditorState, key: string): VimEditorState | null {
  const session = state.helpSession;
  if (!session || !session.isOpen) {
    return null;
  }

  const lines = session.lines;
  const cursor = session.cursor;
  const maxLine = Math.max(0, lines.length - 1);
  const currentLine = lines[cursor.line] || '';
  const maxCol = Math.max(0, currentLine.length - 1);

  switch (key) {
    case 'q':
    case '<Esc>':
    case 'Escape':
      return closeHelp(state);

    case '<CR>':
    case 'Enter':
    case '<Return>':
    case 'Ctrl-]':
      return jumpHelpTag(state);

    case 'Ctrl-t':
      return popHelpTag(state);

    case 'j':
    case '<Down>':
    case 'ArrowDown': {
      const nextLine = Math.min(maxLine, cursor.line + 1);
      const nextCol = Math.min(cursor.col, Math.max(0, (lines[nextLine] || '').length - 1));
      return updateHelpCursor(state, { line: nextLine, col: nextCol });
    }

    case 'k':
    case '<Up>':
    case 'ArrowUp': {
      const prevLine = Math.max(0, cursor.line - 1);
      const nextCol = Math.min(cursor.col, Math.max(0, (lines[prevLine] || '').length - 1));
      return updateHelpCursor(state, { line: prevLine, col: nextCol });
    }

    case 'h':
    case '<Left>':
    case 'ArrowLeft':
      return updateHelpCursor(state, { line: cursor.line, col: Math.max(0, cursor.col - 1) });

    case 'l':
    case '<Right>':
    case 'ArrowRight':
      return updateHelpCursor(state, { line: cursor.line, col: Math.min(maxCol, cursor.col + 1) });

    case '0':
    case '^':
      return updateHelpCursor(state, { line: cursor.line, col: 0 });

    case '$':
      return updateHelpCursor(state, { line: cursor.line, col: maxCol });

    case 'g':
    case 'gg':
      return updateHelpCursor(state, { line: 0, col: 0 });

    case 'G':
      return updateHelpCursor(state, { line: maxLine, col: 0 });

    case 'Ctrl-f':
    case '<PageDown>': {
      const nextLine = Math.min(maxLine, cursor.line + 15);
      return updateHelpCursor(state, { line: nextLine, col: 0 });
    }

    case 'Ctrl-b':
    case '<PageUp>': {
      const prevLine = Math.max(0, cursor.line - 15);
      return updateHelpCursor(state, { line: prevLine, col: 0 });
    }

    case 'Ctrl-d': {
      const nextLine = Math.min(maxLine, cursor.line + 8);
      return updateHelpCursor(state, { line: nextLine, col: 0 });
    }

    case 'Ctrl-u': {
      const prevLine = Math.max(0, cursor.line - 8);
      return updateHelpCursor(state, { line: prevLine, col: 0 });
    }

    // 커맨드라인 진입(:)은 상위 엔진에서 정상 처리할 수 있도록 null 반환
    case ':':
    case '/':
    case '?':
      return null;

    default:
      // 읽기 전용 버퍼이므로 텍스트 수정 키는 무시
      return state;
  }
}

function updateHelpCursor(state: VimEditorState, cursor: CursorPosition): VimEditorState {
  if (!state.helpSession) return state;
  return {
    ...state,
    helpSession: {
      ...state.helpSession,
      cursor,
    },
  };
}

function extractWordAtCol(line: string, col: number): string {
  if (!line || col < 0 || col >= line.length) return '';
  const isWordChar = (c: string) => /[a-zA-Z0-9_\-:]/.test(c);
  if (!isWordChar(line[col])) return '';

  let start = col;
  while (start > 0 && isWordChar(line[start - 1])) {
    start--;
  }
  let end = col;
  while (end < line.length - 1 && isWordChar(line[end + 1])) {
    end++;
  }
  return line.slice(start, end + 1);
}
