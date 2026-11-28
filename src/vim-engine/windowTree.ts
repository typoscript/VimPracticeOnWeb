import {
  SplitDirection,
  SplitPaneState,
  StateSnapshot,
  VimEditorState,
  VimScriptValue,
  WindowLayoutNode,
} from './types';
import { DEFAULT_VIM_OPTIONS } from './setOptionsCore';
import { clampCursor } from './cursor';
import { normalizeWeights } from './windowTreeLayout';

// 상태를 모르는 트리 변형·기하 함수는 windowTreeLayout.ts 에 있으며, 기존 import 경로를 위해 다시 export 합니다.
export {
  splitLeafInTree,
  removeLeafFromTree,
  computePaneRects,
  findNeighborPane,
  exchangeLeafInTree,
  rotateSiblingsInTree,
  moveLeafToEdgeInTree,
  resizeLeafInTree,
  treeContainsLeaf,
} from './windowTreeLayout';
export type { PaneRect } from './windowTreeLayout';

export function getPaneWinId(
  panes: SplitPaneState[] | undefined,
  index: number
): number {
  return panes?.[index]?.winId ?? 1000 + index;
}

export function allocateNextWinId(
  panes: SplitPaneState[] | undefined,
  nextWindowId?: number
): number {
  let maxExisting = 999;
  if (panes) {
    for (let i = 0; i < panes.length; i++) {
      const id = panes[i].winId ?? 1000 + i;
      if (id > maxExisting) maxExisting = id;
    }
  }
  return Math.max(nextWindowId ?? 1000, maxExisting + 1);
}

export function cloneWindowTree(node: WindowLayoutNode): WindowLayoutNode {
  if (node.kind === 'leaf') {
    return { kind: 'leaf', paneIndex: node.paneIndex };
  }
  return {
    kind: 'split',
    direction: node.direction,
    children: node.children.map(cloneWindowTree),
    weights: [...node.weights],
  };
}

export function collectLeafIndices(node: WindowLayoutNode): number[] {
  if (node.kind === 'leaf') return [node.paneIndex];
  const out: number[] = [];
  for (const child of node.children) {
    out.push(...collectLeafIndices(child));
  }
  return out;
}

/**
 * 현재 상태에서 유효한 윈도우 분할 트리를 반환합니다.
 * 레거시 2분할 상태(windowLayout 없음)인 경우 splitDirection/splitRatio 로부터 트리를 합성합니다.
 */
export function getEffectiveWindowTree(state: VimEditorState): WindowLayoutNode | null {
  if (
    !state.splitPanes ||
    state.splitPanes.length < 2 ||
    !state.splitDirection ||
    state.splitDirection === 'none'
  ) {
    return null;
  }

  const paneCount = state.splitPanes.length;
  if (state.windowLayout) {
    const leaves = collectLeafIndices(state.windowLayout);
    if (
      leaves.length === paneCount &&
      leaves.every((idx) => idx >= 0 && idx < paneCount) &&
      new Set(leaves).size === paneCount
    ) {
      return state.windowLayout;
    }
  }

  const dir: 'horizontal' | 'vertical' =
    state.splitDirection === 'horizontal' ? 'horizontal' : 'vertical';
  const weights =
    paneCount === 2
      ? [state.splitRatio ?? 50, 100 - (state.splitRatio ?? 50)]
      : state.splitPanes.map(() => 100 / paneCount);

  return {
    kind: 'split',
    direction: dir,
    children: state.splitPanes.map((_, i) => ({ kind: 'leaf', paneIndex: i })),
    weights,
  };
}

/**
 * 단일 자식 분할 노드를 축약하고, 같은 방향의 중첩 분할 노드를 평탄화(flatten)합니다.
 */
export function collapseAndFlattenTree(node: WindowLayoutNode): WindowLayoutNode {
  if (node.kind === 'leaf') return node;

  const processedChildren: WindowLayoutNode[] = [];
  const processedWeights: number[] = [];
  const normWeights = normalizeWeights(node.weights, node.children.length);

  for (let i = 0; i < node.children.length; i++) {
    const child = collapseAndFlattenTree(node.children[i]);
    const w = normWeights[i];
    if (child.kind === 'split' && child.direction === node.direction) {
      const childNorm = normalizeWeights(child.weights, child.children.length);
      for (let j = 0; j < child.children.length; j++) {
        processedChildren.push(child.children[j]);
        processedWeights.push((w * childNorm[j]) / 100);
      }
    } else {
      processedChildren.push(child);
      processedWeights.push(w);
    }
  }

  if (processedChildren.length === 1) {
    return processedChildren[0];
  }

  return {
    kind: 'split',
    direction: node.direction,
    children: processedChildren,
    weights: normalizeWeights(processedWeights, processedChildren.length),
  };
}

function remapTreeLeaves(
  node: WindowLayoutNode,
  oldToNew: Map<number, number>
): WindowLayoutNode {
  if (node.kind === 'leaf') {
    return { kind: 'leaf', paneIndex: oldToNew.get(node.paneIndex) ?? 0 };
  }
  return {
    kind: 'split',
    direction: node.direction,
    children: node.children.map((c) => remapTreeLeaves(c, oldToNew)),
    weights: [...node.weights],
  };
}

export interface NormalizedLayoutResult {
  splitDirection: SplitDirection;
  splitPanes: SplitPaneState[] | undefined;
  windowLayout: WindowLayoutNode | undefined;
  splitRatio: number | undefined;
  activePaneIndex: number;
  previousPaneIndex: number | undefined;
  windowVars: Record<number, Record<string, VimScriptValue>> | undefined;
}

/**
 * 트리를 평탄화·정규화하고 splitPanes 를 DFS(좌→우, 상→하) 리프 순서로 재정렬하며
 * activePaneIndex / previousPaneIndex / windowVars 를 새 인덱스로 매핑합니다.
 */
export function normalizeWindowLayout(params: {
  tree: WindowLayoutNode | null;
  panes: SplitPaneState[];
  activeOriginalIndex: number;
  prevOriginalIndex?: number;
  windowVars?: Record<number, Record<string, VimScriptValue>>;
}): NormalizedLayoutResult {
  const { tree, panes, activeOriginalIndex, prevOriginalIndex, windowVars } = params;

  if (!tree || panes.length <= 1) {
    const keptVars =
      windowVars && windowVars[activeOriginalIndex]
        ? { 0: windowVars[activeOriginalIndex] }
        : undefined;
    return {
      splitDirection: 'none',
      splitPanes: undefined,
      windowLayout: undefined,
      splitRatio: undefined,
      activePaneIndex: 0,
      previousPaneIndex: undefined,
      windowVars: keptVars,
    };
  }

  const collapsed = collapseAndFlattenTree(tree);
  const leafOrder = collectLeafIndices(collapsed);

  if (leafOrder.length <= 1) {
    const onlyIdx = leafOrder[0] ?? 0;
    const keptVars =
      windowVars && windowVars[onlyIdx] ? { 0: windowVars[onlyIdx] } : undefined;
    return {
      splitDirection: 'none',
      splitPanes: undefined,
      windowLayout: undefined,
      splitRatio: undefined,
      activePaneIndex: 0,
      previousPaneIndex: undefined,
      windowVars: keptVars,
    };
  }

  const oldToNew = new Map<number, number>();
  const nextPanes: SplitPaneState[] = [];
  for (let newIdx = 0; newIdx < leafOrder.length; newIdx++) {
    const oldIdx = leafOrder[newIdx];
    oldToNew.set(oldIdx, newIdx);
    const pane = panes[oldIdx];
    nextPanes.push(pane.winId !== undefined ? pane : { ...pane, winId: 1000 + oldIdx });
  }

  const normalizedTree = remapTreeLeaves(collapsed, oldToNew);
  const nextActive = oldToNew.get(activeOriginalIndex) ?? 0;
  const mappedPrev =
    prevOriginalIndex !== undefined ? oldToNew.get(prevOriginalIndex) : undefined;
  const nextPrev = mappedPrev !== undefined && mappedPrev !== nextActive ? mappedPrev : undefined;

  let nextWindowVars: Record<number, Record<string, VimScriptValue>> | undefined;
  if (windowVars) {
    const remapped: Record<number, Record<string, VimScriptValue>> = {};
    for (const [oldIdx, newIdx] of oldToNew.entries()) {
      if (windowVars[oldIdx]) {
        remapped[newIdx] = windowVars[oldIdx];
      }
    }
    nextWindowVars = Object.keys(remapped).length > 0 ? remapped : undefined;
  }

  const rootDir: SplitDirection =
    normalizedTree.kind === 'split' ? normalizedTree.direction : 'none';
  const splitRatio =
    normalizedTree.kind === 'split' && normalizedTree.children.length === 2
      ? Math.round(normalizedTree.weights[0])
      : undefined;

  return {
    splitDirection: rootDir,
    splitPanes: nextPanes,
    windowLayout: normalizedTree,
    splitRatio,
    activePaneIndex: nextActive,
    previousPaneIndex: nextPrev,
    windowVars: nextWindowVars,
  };
}

/**
 * 두 분할 창이 동일한 버퍼를 보고 있는지 판정합니다.
 */
export function isSamePaneBuffer(a: SplitPaneState, b: SplitPaneState): boolean {
  if (a.bufferId !== undefined && b.bufferId !== undefined) {
    return a.bufferId === b.bufferId;
  }
  if (a.bufferId !== undefined || b.bufferId !== undefined) {
    return false;
  }
  return Boolean(a.filename && a.filename !== '[No Name]' && a.filename === b.filename);
}

function areStringArraysEqual(a: string[], b: string[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/**
 * 활성 창의 버퍼 내용(lines/undoStack/redoStack)을 같은 버퍼를 보고 있는 다른 분할 창들에 실시간 동기화합니다.
 * 각 창의 커서·뷰포트·모드·scrollbind·locationList 는 독립 유지하되, 줄 수 축소 시 커서 경계만 안전하게 보정합니다.
 */
export function syncSharedBufferPanes(
  panes: SplitPaneState[],
  activeIdx: number,
  activeLines: string[],
  activeUndo?: StateSnapshot[],
  activeRedo?: StateSnapshot[]
): SplitPaneState[] {
  const activePane = panes[activeIdx];
  if (!activePane) return panes;

  let changed = false;
  const next = panes.map((pane, idx) => {
    if (idx === activeIdx) return pane;
    if (!isSamePaneBuffer(activePane, pane)) return pane;
    const sameLines = areStringArraysEqual(pane.lines, activeLines);
    const sameUndo = (pane.undoStack?.length ?? 0) === (activeUndo?.length ?? 0);
    const sameRedo = (pane.redoStack?.length ?? 0) === (activeRedo?.length ?? 0);
    if (sameLines && sameUndo && sameRedo) return pane;
    changed = true;
    const clampedCursor = clampCursor(activeLines, pane.cursor, pane.mode);
    const clampedAnchor = pane.visualAnchor
      ? clampCursor(activeLines, pane.visualAnchor, pane.mode)
      : undefined;
    return {
      ...pane,
      lines: [...activeLines],
      cursor: clampedCursor,
      visualAnchor: clampedAnchor,
      undoStack: activeUndo ? [...activeUndo] : [],
      redoStack: activeRedo ? [...activeRedo] : [],
    };
  });

  return changed ? next : panes;
}

/**
 * 순정 Vim winlayout() 형식(['leaf', id] | ['row', [...]] | ['col', [...]])으로 변환합니다.
 */
export function toVimWinlayout(state: VimEditorState): VimScriptValue {
  const tree = getEffectiveWindowTree(state);
  if (!tree || !state.splitPanes) {
    return ['leaf', getPaneWinId(state.splitPanes, 0)];
  }
  const convert = (node: WindowLayoutNode): VimScriptValue => {
    if (node.kind === 'leaf') {
      return ['leaf', getPaneWinId(state.splitPanes, node.paneIndex)];
    }
    return [
      node.direction === 'vertical' ? 'row' : 'col',
      node.children.map(convert),
    ];
  };
  return convert(tree);
}

/**
 * 지정한 창 인덱스(0-based)로 포커스를 전환하는 순수 코어 함수.
 * splitWindow.ts 의 switchPaneFocus 및 Vimscript win_gotoid() 가 공유합니다.
 */
export function switchPaneFocusCore(
  state: VimEditorState,
  targetPaneIndex: number
): VimEditorState {
  if (!state.splitDirection || state.splitDirection === 'none' || !state.splitPanes) {
    return state;
  }

  const count = state.splitPanes.length;
  if (targetPaneIndex < 0 || targetPaneIndex >= count) {
    return state;
  }

  const curIdx = state.activePaneIndex ?? 0;
  if (curIdx === targetPaneIndex) {
    return state;
  }

  const prevCurPane = state.splitPanes[curIdx];
  const fallbackName =
    curIdx === 0
      ? state.primaryFilename || 'source.ts'
      : curIdx === 1
        ? state.secondaryFilename || 'target.ts'
        : `pane_${curIdx + 1}.ts`;

  const currentPane: SplitPaneState = {
    ...prevCurPane,
    winId: prevCurPane?.winId ?? 1000 + curIdx,
    filename: state.primaryFilename || prevCurPane?.filename || fallbackName,
    bufferId:
      prevCurPane?.bufferId !== undefined ? (state.currentBufferId ?? prevCurPane.bufferId) : prevCurPane?.bufferId,
    lines: [...state.lines],
    cursor: { ...state.cursor },
    mode: state.mode,
    visualAnchor: state.visualAnchor,
    visualBlockEndOfLine: state.visualBlockEndOfLine,
    viewport: state.viewport,
    undoStack: state.undoStack ? [...state.undoStack] : [],
    redoStack: state.redoStack ? [...state.redoStack] : [],
    pendingKeys: state.pendingKeys,
    blockInsertSession: state.blockInsertSession,
    locationList: state.locationList,
    scrollbind: prevCurPane?.scrollbind ?? state.options?.scrollbind ?? false,
    diff: prevCurPane?.diff,
    cwd: prevCurPane?.cwd,
    prevCwd: prevCurPane?.prevCwd,
    localArgList: state.usesLocalArgList ? (state.argList ?? null) : prevCurPane?.localArgList,
  };

  const updatedPanes = state.splitPanes.map((p, i) => (i === curIdx ? currentPane : p));
  const newPanes = syncSharedBufferPanes(
    updatedPanes,
    curIdx,
    currentPane.lines,
    currentPane.undoStack,
    currentPane.redoStack
  );
  const targetPane = newPanes[targetPaneIndex];
  const nextCurrentBufferId =
    targetPane.bufferId !== undefined && state.buffers?.some((b) => b.id === targetPane.bufferId)
      ? targetPane.bufferId
      : state.currentBufferId;

  const targetBufLocal = state.bufferLocalOptions?.[nextCurrentBufferId ?? 1] ?? {};
  const nextOptions =
    targetPane.scrollbind === undefined && !targetPane.localOptions && !state.options
      ? state.options
      : {
          ...DEFAULT_VIM_OPTIONS,
          ...(state.globalOptions ?? state.options ?? {}),
          ...targetBufLocal,
          ...(targetPane.localOptions ?? {}),
          scrollbind:
            targetPane.scrollbind ??
            targetPane.localOptions?.scrollbind ??
            state.globalOptions?.scrollbind ??
            state.options?.scrollbind ??
            false,
        };

  const activeTabCwd = state.tabPages?.find((t) => t.id === (state.currentTabId ?? 1))?.cwd;
  const nextCwd = targetPane.cwd ?? activeTabCwd ?? state.globalCwd ?? state.cwd;
  const nextUsesLocalArgs = targetPane.localArgList !== undefined;
  const nextArgList = nextUsesLocalArgs
    ? targetPane.localArgList
    : (state.globalArgList !== undefined ? state.globalArgList : state.argList);

  return {
    ...state,
    lines: [...targetPane.lines],
    cursor: { ...targetPane.cursor },
    mode: targetPane.mode ?? 'NORMAL',
    visualAnchor: targetPane.visualAnchor,
    visualBlockEndOfLine: targetPane.visualBlockEndOfLine,
    viewport: targetPane.viewport,
    undoStack: targetPane.undoStack ? [...targetPane.undoStack] : [],
    redoStack: targetPane.redoStack ? [...targetPane.redoStack] : [],
    pendingKeys: undefined,
    activePaneIndex: targetPaneIndex,
    previousPaneIndex: curIdx,
    currentBufferId: nextCurrentBufferId,
    // 현재 파일 = 포커스를 받은 창의 파일 (:w 저장 대상, 마크·Git 기준선 등 파일별 상태의 기준)
    primaryFilename: targetPane.filename || state.primaryFilename,
    splitPanes: newPanes,
    locationList: targetPane.locationList,
    options: nextOptions,
    ...(nextCwd !== undefined ? { cwd: nextCwd } : {}),
    argList: nextArgList,
    usesLocalArgList: nextUsesLocalArgs,
  };
}
