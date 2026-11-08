import { StateSnapshot, UndoTreeNode, VimEditorState } from './types';
import { clampCursor } from './cursor';

/**
 * 두 줄 배열이 동일한지 비교합니다.
 */
export function areLinesEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/**
 * Undo Tree가 아직 초기화되지 않은 경우 루트 노드(seq 0)를 생성합니다.
 */
export function ensureUndoTreeInitialized(state: VimEditorState): VimEditorState {
  if (state.undoTreeNodes && Object.keys(state.undoTreeNodes).length > 0) {
    return state;
  }

  const rootNode: UndoTreeNode = {
    seq: 0,
    parentSeq: null,
    timestamp: Date.now(),
    lines: [...state.lines],
    cursor: { ...state.cursor },
    saveNumber: state.saveCounter ?? 0,
  };

  return {
    ...state,
    undoTreeNodes: { 0: rootNode },
    currentUndoSeq: 0,
    maxUndoSeq: 0,
    undoTimeHistory: [0],
    undoTimeIndex: 0,
  };
}

/**
 * 현재 버퍼 줄 내용이 현재 활성 노드(currentUndoSeq)와 다를 경우 새로운 변경 노드를 등록합니다.
 */
export function recordUndoTreeChange(state: VimEditorState): VimEditorState {
  const initialized = ensureUndoTreeInitialized(state);
  const curSeq = initialized.currentUndoSeq ?? 0;
  const nodes = initialized.undoTreeNodes ?? {};
  const curNode = nodes[curSeq];

  // 현재 노드의 텍스트와 정확히 일치한다면 변경 없음
  if (curNode && areLinesEqual(curNode.lines, initialized.lines)) {
    return initialized;
  }

  const newSeq = (initialized.maxUndoSeq ?? 0) + 1;
  const newNode: UndoTreeNode = {
    seq: newSeq,
    parentSeq: curSeq,
    timestamp: Date.now(),
    lines: [...initialized.lines],
    cursor: { ...initialized.cursor },
  };

  const newNodes = {
    ...nodes,
    [newSeq]: newNode,
  };

  const currentHistory = initialized.undoTimeHistory ? [...initialized.undoTimeHistory] : [0];
  currentHistory.push(newSeq);

  // undoStack에 부모 스냅샷이 누락된 경우(직접 lines 변경 등) 자동 보완
  const parentNode = nodes[curSeq];
  let nextUndo = initialized.undoStack ? [...initialized.undoStack] : [];
  if (parentNode) {
    const lastSnap = nextUndo[nextUndo.length - 1];
    if (!lastSnap || !areLinesEqual(lastSnap.lines, parentNode.lines)) {
      nextUndo.push({
        lines: [...parentNode.lines],
        cursor: { ...parentNode.cursor },
      });
    }
  }

  return {
    ...initialized,
    undoStack: nextUndo,
    undoTreeNodes: newNodes,
    currentUndoSeq: newSeq,
    maxUndoSeq: newSeq,
    undoTimeHistory: currentHistory,
    undoTimeIndex: currentHistory.length - 1,
  };
}

/**
 * 특정 변경 번호(seq)로 버퍼 및 커서를 복원하고 부모 경로에 맞춰 undoStack을 재구성합니다. (:undo {seq})
 */
export function jumpUndoSeq(state: VimEditorState, targetSeq: number): VimEditorState {
  const prepared = recordUndoTreeChange(ensureUndoTreeInitialized(state));
  const nodes = prepared.undoTreeNodes ?? {};
  const targetNode = nodes[targetSeq];

  if (!targetNode) {
    return {
      ...prepared,
      commandMessage: `E830: 실행 취소 번호 ${targetSeq}을(를) 찾을 수 없습니다.`,
    };
  }

  // 루트(seq 0)부터 대상 노드의 부모까지의 조상 경로를 따라 undoStack 재구성
  const ancestors: UndoTreeNode[] = [];
  let curr = targetNode.parentSeq;
  while (curr !== null && nodes[curr]) {
    ancestors.unshift(nodes[curr]);
    curr = nodes[curr].parentSeq;
  }

  const reconstructedUndoStack: StateSnapshot[] = ancestors.map((a) => ({
    lines: [...a.lines],
    cursor: { ...a.cursor },
  }));

  const history = prepared.undoTimeHistory ?? [0];
  const timeIdx = history.lastIndexOf(targetSeq);

  return {
    ...prepared,
    lines: [...targetNode.lines],
    cursor: clampCursor(targetNode.lines, targetNode.cursor, 'NORMAL'),
    undoStack: reconstructedUndoStack,
    redoStack: [],
    currentUndoSeq: targetSeq,
    undoTimeIndex: timeIdx >= 0 ? timeIdx : 0,
    commandMessage: `${targetSeq}번째 변경사항으로 이동했습니다.`,
  };
}

/**
 * 벽시계 절대 시간 순서(undoTimeHistory)를 따라 이전(older) 또는 이후(newer) 상태로 이동합니다. (g-, g+)
 */
export function travelUndoTime(
  state: VimEditorState,
  direction: 'older' | 'newer',
  count = 1
): VimEditorState {
  const prepared = recordUndoTreeChange(ensureUndoTreeInitialized(state));
  const history = prepared.undoTimeHistory ?? [0];
  const currentIndex = prepared.undoTimeIndex ?? (history.length - 1);

  if (direction === 'older') {
    if (currentIndex <= 0) {
      return {
        ...prepared,
        pendingKeys: undefined,
        commandMessage: '이미 가장 오래된 변경사항입니다.',
      };
    }
    const targetIndex = Math.max(0, currentIndex - count);
    const targetSeq = history[targetIndex];
    const jumped = jumpUndoSeq(prepared, targetSeq);
    return {
      ...jumped,
      pendingKeys: undefined,
      undoTimeIndex: targetIndex,
      commandMessage: `이전 변경사항으로 이동했습니다 (#${targetSeq})`,
    };
  }

  // direction === 'newer'
  if (currentIndex >= history.length - 1) {
    return {
      ...prepared,
      pendingKeys: undefined,
      commandMessage: '이미 가장 최신 변경사항입니다.',
    };
  }
  const targetIndex = Math.min(history.length - 1, currentIndex + count);
  const targetSeq = history[targetIndex];
  const jumped = jumpUndoSeq(prepared, targetSeq);
  return {
    ...jumped,
    pendingKeys: undefined,
    undoTimeIndex: targetIndex,
    commandMessage: `이후 변경사항으로 이동했습니다 (#${targetSeq})`,
  };
}

/**
 * 인수를 해석하여 이전 상태로 시간 여행합니다. (:earlier [count][s|m|h|d|f])
 */
export function travelEarlier(state: VimEditorState, arg?: string): VimEditorState {
  const prepared = recordUndoTreeChange(ensureUndoTreeInitialized(state));
  const cleanArg = arg?.trim() ?? '';

  let count = 1;
  let unit = 'c'; // 'c': changes, 's': seconds, 'm': minutes, 'h': hours, 'd': days, 'f': file writes

  if (cleanArg.length > 0) {
    const match = cleanArg.match(/^(\d+)?\s*([smhdfc])?$/i);
    if (!match) {
      return {
        ...prepared,
        commandMessage: `E474: 잘못된 인수입니다: :earlier ${arg}`,
      };
    }
    count = match[1] ? parseInt(match[1], 10) : 1;
    unit = (match[2] || 'c').toLowerCase();
  }

  if (unit === 'c') {
    return travelUndoTime(prepared, 'older', count);
  }

  const history = prepared.undoTimeHistory ?? [0];
  const curIdx = prepared.undoTimeIndex ?? (history.length - 1);
  const nodes = prepared.undoTreeNodes ?? {};

  if (unit === 'f') {
    // 저장(file write) 횟수 기준으로 이전 상태 탐색
    let remaining = count;
    let foundIdx = -1;
    for (let i = curIdx - 1; i >= 0; i--) {
      const node = nodes[history[i]];
      if (node && node.saveNumber !== undefined && node.saveNumber > 0) {
        remaining--;
        if (remaining === 0) {
          foundIdx = i;
          break;
        }
      }
    }

    if (foundIdx >= 0) {
      const targetSeq = history[foundIdx];
      const jumped = jumpUndoSeq(prepared, targetSeq);
      return {
        ...jumped,
        undoTimeIndex: foundIdx,
        commandMessage: `${count}회 이전 저장 상태로 복귀했습니다 (#${targetSeq})`,
      };
    }

    if (curIdx === 0) {
      return {
        ...prepared,
        commandMessage: '이미 가장 오래된 저장 상태입니다.',
      };
    }

    const jumped = jumpUndoSeq(prepared, 0);
    return {
      ...jumped,
      undoTimeIndex: 0,
      commandMessage: '가장 처음 상태(Seq 0)로 복귀했습니다.',
    };
  }

  // 단위 시간(s, m, h, d) 기준
  const unitMultipliers: Record<string, number> = {
    s: 1000,
    m: 60 * 1000,
    h: 3600 * 1000,
    d: 86400 * 1000,
  };
  const deltaMs = count * (unitMultipliers[unit] ?? 1000);
  const targetTime = Date.now() - deltaMs;

  let targetIdx = 0;
  for (let i = curIdx - 1; i >= 0; i--) {
    const node = nodes[history[i]];
    if (node && node.timestamp <= targetTime) {
      targetIdx = i;
      break;
    }
  }

  const targetSeq = history[targetIdx];
  const jumped = jumpUndoSeq(prepared, targetSeq);
  return {
    ...jumped,
    undoTimeIndex: targetIdx,
    commandMessage: `${count}${unit} 이전 상태로 이동했습니다 (#${targetSeq})`,
  };
}

/**
 * 인수를 해석하여 이후 상태로 시간 여행합니다. (:later [count][s|m|h|d|f])
 */
export function travelLater(state: VimEditorState, arg?: string): VimEditorState {
  const prepared = recordUndoTreeChange(ensureUndoTreeInitialized(state));
  const cleanArg = arg?.trim() ?? '';

  let count = 1;
  let unit = 'c';

  if (cleanArg.length > 0) {
    const match = cleanArg.match(/^(\d+)?\s*([smhdfc])?$/i);
    if (!match) {
      return {
        ...prepared,
        commandMessage: `E474: 잘못된 인수입니다: :later ${arg}`,
      };
    }
    count = match[1] ? parseInt(match[1], 10) : 1;
    unit = (match[2] || 'c').toLowerCase();
  }

  if (unit === 'c') {
    return travelUndoTime(prepared, 'newer', count);
  }

  const history = prepared.undoTimeHistory ?? [0];
  const curIdx = prepared.undoTimeIndex ?? (history.length - 1);
  const nodes = prepared.undoTreeNodes ?? {};

  if (unit === 'f') {
    let remaining = count;
    let foundIdx = -1;
    for (let i = curIdx + 1; i < history.length; i++) {
      const node = nodes[history[i]];
      if (node && node.saveNumber !== undefined && node.saveNumber > 0) {
        remaining--;
        if (remaining === 0) {
          foundIdx = i;
          break;
        }
      }
    }

    if (foundIdx >= 0) {
      const targetSeq = history[foundIdx];
      const jumped = jumpUndoSeq(prepared, targetSeq);
      return {
        ...jumped,
        undoTimeIndex: foundIdx,
        commandMessage: `${count}회 이후 저장 상태로 이동했습니다 (#${targetSeq})`,
      };
    }

    return {
      ...prepared,
      commandMessage: '이미 가장 최신 저장 상태입니다.',
    };
  }

  // 단위 시간(s, m, h, d) 기준
  const unitMultipliers: Record<string, number> = {
    s: 1000,
    m: 60 * 1000,
    h: 3600 * 1000,
    d: 86400 * 1000,
  };
  const deltaMs = count * (unitMultipliers[unit] ?? 1000);
  const currentNode = nodes[prepared.currentUndoSeq ?? 0];
  const targetTime = (currentNode?.timestamp ?? Date.now()) + deltaMs;

  let targetIdx = history.length - 1;
  for (let i = curIdx + 1; i < history.length; i++) {
    const node = nodes[history[i]];
    if (node && node.timestamp >= targetTime) {
      targetIdx = i;
      break;
    }
  }

  const targetSeq = history[targetIdx];
  const jumped = jumpUndoSeq(prepared, targetSeq);
  return {
    ...jumped,
    undoTimeIndex: targetIdx,
    commandMessage: `${count}${unit} 이후 상태로 이동했습니다 (#${targetSeq})`,
  };
}

/**
 * 가상 파일 저장(:w) 시 현재 Undo 노드에 saveNumber를 부여합니다.
 */
export function recordFileSave(state: VimEditorState): VimEditorState {
  const prepared = recordUndoTreeChange(ensureUndoTreeInitialized(state));
  const nextSaveCount = (prepared.saveCounter ?? 0) + 1;
  const curSeq = prepared.currentUndoSeq ?? 0;
  const nodes = prepared.undoTreeNodes ?? {};
  const node = nodes[curSeq];

  if (!node) {
    return {
      ...prepared,
      saveCounter: nextSaveCount,
    };
  }

  const updatedNode: UndoTreeNode = {
    ...node,
    saveNumber: nextSaveCount,
  };

  return {
    ...prepared,
    saveCounter: nextSaveCount,
    undoTreeNodes: {
      ...nodes,
      [curSeq]: updatedNode,
    },
  };
}

/**
 * Undo Tree의 브랜치 끝(Leaf) 노드 목록을 Vim 표준 포맷 문자열로 서식화합니다. (:undolist)
 */
export function formatUndoList(state: VimEditorState): string {
  const prepared = recordUndoTreeChange(ensureUndoTreeInitialized(state));
  const nodes = prepared.undoTreeNodes ?? {};
  const allSeqs = Object.keys(nodes).map(Number);

  if (allSeqs.length === 0) {
    return '실행 취소 목록이 비어 있습니다.';
  }

  // 자식 노드가 없는 Leaf 노드 탐색
  const parentSeqs = new Set(
    Object.values(nodes)
      .map((n) => n.parentSeq)
      .filter((p): p is number => p !== null)
  );

  let leafSeqs = allSeqs.filter((seq) => !parentSeqs.has(seq)).sort((a, b) => a - b);
  if (leafSeqs.length === 0) {
    leafSeqs = [0];
  }

  const now = Date.now();
  const rows: string[] = ['number changes  when               saved'];

  for (const seq of leafSeqs) {
    const node = nodes[seq];
    if (!node) continue;

    // 루트(0)부터의 깊이(depth) 계산
    let depth = 0;
    let curr = node.parentSeq;
    while (curr !== null && nodes[curr]) {
      depth++;
      curr = nodes[curr].parentSeq;
    }

    const diffSec = Math.max(0, Math.floor((now - node.timestamp) / 1000));
    let whenStr = `${diffSec} seconds ago`;
    if (diffSec >= 86400) {
      whenStr = `${Math.floor(diffSec / 86400)} days ago`;
    } else if (diffSec >= 3600) {
      whenStr = `${Math.floor(diffSec / 3600)} hours ago`;
    } else if (diffSec >= 60) {
      whenStr = `${Math.floor(diffSec / 60)} minutes ago`;
    }

    const savedStr = node.saveNumber ? String(node.saveNumber) : '';

    const seqCol = String(node.seq).padStart(6);
    const changesCol = String(depth).padStart(7);
    const whenCol = whenStr.padEnd(18);
    const saveCol = savedStr.length > 0 ? savedStr.padStart(5) : '';

    rows.push(`${seqCol} ${changesCol}  ${whenCol} ${saveCol}`.trimEnd());
  }

  return rows.join('\n');
}
