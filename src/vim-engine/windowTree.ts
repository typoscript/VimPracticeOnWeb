import {
  SplitDirection,
  SplitPaneState,
  SplitPlacement,
  StateSnapshot,
  VimEditorState,
  VimScriptValue,
  WindowLayoutNode,
} from './types';
import { DEFAULT_VIM_OPTIONS } from './setOptionsCore';
import { clampCursor } from './cursor';

export interface PaneRect {
  paneIndex: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

const EPS = 1e-6;
const MIN_WEIGHT = 10;

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

function normalizeWeights(weights: number[], count: number): number[] {
  const safe = Array.from({ length: count }, (_, i) => {
    const w = weights[i];
    return typeof w === 'number' && Number.isFinite(w) && w > 0 ? w : 100 / count;
  });
  const sum = safe.reduce((acc, v) => acc + v, 0);
  if (sum <= 0) return Array.from({ length: count }, () => 100 / count);
  return safe.map((v) => (v / sum) * 100);
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
 * 지정한 리프 노드를 가로/세로로 분할하고 placement 모디파이어에 따라 배치합니다.
 */
export function splitLeafInTree(
  node: WindowLayoutNode,
  targetPaneIndex: number,
  newPaneIndex: number,
  direction: 'horizontal' | 'vertical',
  placement: SplitPlacement = 'default'
): WindowLayoutNode {
  if (placement === 'topleft') {
    return {
      kind: 'split',
      direction,
      children: [{ kind: 'leaf', paneIndex: newPaneIndex }, node],
      weights: [50, 50],
    };
  }
  if (placement === 'botright') {
    return {
      kind: 'split',
      direction,
      children: [node, { kind: 'leaf', paneIndex: newPaneIndex }],
      weights: [50, 50],
    };
  }

  const placeBefore = placement === 'aboveleft';
  if (node.kind === 'leaf') {
    if (node.paneIndex !== targetPaneIndex) return node;
    const targetLeaf: WindowLayoutNode = { kind: 'leaf', paneIndex: targetPaneIndex };
    const newLeaf: WindowLayoutNode = { kind: 'leaf', paneIndex: newPaneIndex };
    return {
      kind: 'split',
      direction,
      children: placeBefore ? [newLeaf, targetLeaf] : [targetLeaf, newLeaf],
      weights: [50, 50],
    };
  }
  return {
    kind: 'split',
    direction: node.direction,
    children: node.children.map((c) =>
      splitLeafInTree(c, targetPaneIndex, newPaneIndex, direction, placement)
    ),
    weights: [...node.weights],
  };
}

/**
 * 지정한 리프 노드를 트리에서 제거합니다.
 */
export function removeLeafFromTree(
  node: WindowLayoutNode,
  targetPaneIndex: number
): WindowLayoutNode | null {
  if (node.kind === 'leaf') {
    return node.paneIndex === targetPaneIndex ? null : node;
  }

  const nextChildren: WindowLayoutNode[] = [];
  const nextWeights: number[] = [];
  for (let i = 0; i < node.children.length; i++) {
    const res = removeLeafFromTree(node.children[i], targetPaneIndex);
    if (res !== null) {
      nextChildren.push(res);
      nextWeights.push(node.weights[i] ?? 100 / node.children.length);
    }
  }

  if (nextChildren.length === 0) return null;
  if (nextChildren.length === 1) return nextChildren[0];
  return {
    kind: 'split',
    direction: node.direction,
    children: nextChildren,
    weights: normalizeWeights(nextWeights, nextChildren.length),
  };
}

/**
 * 각 리프 창의 정규화 좌표 [0, 1] x [0, 1] 바운딩 박스를 계산합니다.
 */
export function computePaneRects(
  node: WindowLayoutNode,
  x = 0,
  y = 0,
  w = 1,
  h = 1
): PaneRect[] {
  if (node.kind === 'leaf') {
    return [{ paneIndex: node.paneIndex, x, y, w, h }];
  }

  const weights = normalizeWeights(node.weights, node.children.length);
  const rects: PaneRect[] = [];
  let offset = 0;

  for (let i = 0; i < node.children.length; i++) {
    const frac = weights[i] / 100;
    if (node.direction === 'vertical') {
      const cw = w * frac;
      rects.push(...computePaneRects(node.children[i], x + offset, y, cw, h));
      offset += cw;
    } else {
      const ch = h * frac;
      rects.push(...computePaneRects(node.children[i], x, y + offset, w, ch));
      offset += ch;
    }
  }

  return rects;
}

/**
 * 기하학적 인접성을 바탕으로 h/j/k/l 방향의 이웃 창 인덱스를 찾습니다.
 */
export function findNeighborPane(
  tree: WindowLayoutNode,
  activePaneIndex: number,
  dir: 'h' | 'j' | 'k' | 'l'
): number | null {
  const rects = computePaneRects(tree);
  const cur = rects.find((r) => r.paneIndex === activePaneIndex);
  if (!cur) return null;

  const candidates: Array<{ paneIndex: number; gap: number; secondary: number }> = [];

  for (const r of rects) {
    if (r.paneIndex === activePaneIndex) continue;

    if (dir === 'h') {
      const overlap = Math.min(cur.y + cur.h, r.y + r.h) - Math.max(cur.y, r.y);
      const gap = cur.x - (r.x + r.w);
      if (overlap > EPS && gap >= -EPS) {
        candidates.push({ paneIndex: r.paneIndex, gap: Math.max(0, gap), secondary: r.y });
      }
    } else if (dir === 'l') {
      const overlap = Math.min(cur.y + cur.h, r.y + r.h) - Math.max(cur.y, r.y);
      const gap = r.x - (cur.x + cur.w);
      if (overlap > EPS && gap >= -EPS) {
        candidates.push({ paneIndex: r.paneIndex, gap: Math.max(0, gap), secondary: r.y });
      }
    } else if (dir === 'k') {
      const overlap = Math.min(cur.x + cur.w, r.x + r.w) - Math.max(cur.x, r.x);
      const gap = cur.y - (r.y + r.h);
      if (overlap > EPS && gap >= -EPS) {
        candidates.push({ paneIndex: r.paneIndex, gap: Math.max(0, gap), secondary: r.x });
      }
    } else if (dir === 'j') {
      const overlap = Math.min(cur.x + cur.w, r.x + r.w) - Math.max(cur.x, r.x);
      const gap = r.y - (cur.y + cur.h);
      if (overlap > EPS && gap >= -EPS) {
        candidates.push({ paneIndex: r.paneIndex, gap: Math.max(0, gap), secondary: r.x });
      }
    }
  }

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => {
    if (Math.abs(a.gap - b.gap) > EPS) return a.gap - b.gap;
    return a.secondary - b.secondary;
  });

  return candidates[0].paneIndex;
}

function containsLeaf(node: WindowLayoutNode, target: number): boolean {
  if (node.kind === 'leaf') return node.paneIndex === target;
  return node.children.some((c) => containsLeaf(c, target));
}

function findPathToLeaf(node: WindowLayoutNode, target: number): number[] | null {
  if (node.kind === 'leaf') {
    return node.paneIndex === target ? [] : null;
  }
  for (let i = 0; i < node.children.length; i++) {
    const sub = findPathToLeaf(node.children[i], target);
    if (sub !== null) return [i, ...sub];
  }
  return null;
}

function updateNodeAtPath(
  node: WindowLayoutNode,
  path: number[],
  updater: (target: Extract<WindowLayoutNode, { kind: 'split' }>) => WindowLayoutNode
): WindowLayoutNode {
  if (path.length === 0) {
    if (node.kind === 'split') return updater(node);
    return node;
  }
  if (node.kind === 'leaf') return node;
  const [head, ...rest] = path;
  return {
    kind: 'split',
    direction: node.direction,
    children: node.children.map((c, i) => (i === head ? updateNodeAtPath(c, rest, updater) : c)),
    weights: [...node.weights],
  };
}

/**
 * Ctrl-w x: 같은 분할 컨테이너의 인접 형제 창과 위치를 맞바꿉니다.
 */
export function exchangeLeafInTree(
  tree: WindowLayoutNode,
  activePaneIndex: number,
  count?: number
): WindowLayoutNode {
  const path = findPathToLeaf(tree, activePaneIndex);
  if (!path || path.length === 0) return tree;
  const parentPath = path.slice(0, -1);
  const childIdx = path[path.length - 1];

  return updateNodeAtPath(tree, parentPath, (parent) => {
    const n = parent.children.length;
    if (n < 2) return parent;
    let swapIdx: number;
    if (count !== undefined && count >= 1) {
      swapIdx = (childIdx + count) % n;
      if (swapIdx === childIdx) swapIdx = childIdx + 1 < n ? childIdx + 1 : childIdx - 1;
    } else {
      swapIdx = childIdx + 1 < n ? childIdx + 1 : childIdx - 1;
    }
    const nextChildren = [...parent.children];
    const tmp = nextChildren[childIdx];
    nextChildren[childIdx] = nextChildren[swapIdx];
    nextChildren[swapIdx] = tmp;
    return { ...parent, children: nextChildren };
  });
}

/**
 * Ctrl-w r / R: 현재 창이 속한 분할 컨테이너의 형제들을 시계/반시계 방향으로 회전합니다.
 */
export function rotateSiblingsInTree(
  tree: WindowLayoutNode,
  activePaneIndex: number,
  counterClockwise: boolean
): WindowLayoutNode {
  const path = findPathToLeaf(tree, activePaneIndex);
  if (!path || path.length === 0) return tree;
  const parentPath = path.slice(0, -1);

  return updateNodeAtPath(tree, parentPath, (parent) => {
    const n = parent.children.length;
    if (n < 2) return parent;
    const children = [...parent.children];
    const weights = [...parent.weights];
    if (counterClockwise) {
      children.push(children.shift()!);
      weights.push(weights.shift()!);
    } else {
      children.unshift(children.pop()!);
      weights.unshift(weights.pop()!);
    }
    return { ...parent, children, weights };
  });
}

/**
 * Ctrl-w H / J / K / L: 현재 창을 트리에서 분리해 루트 가장자리(좌/하/상/우)로 이동합니다.
 */
export function moveLeafToEdgeInTree(
  tree: WindowLayoutNode,
  activePaneIndex: number,
  dir: 'H' | 'J' | 'K' | 'L'
): WindowLayoutNode {
  const remaining = removeLeafFromTree(tree, activePaneIndex);
  if (!remaining) return tree;
  const splitDir: 'horizontal' | 'vertical' = dir === 'H' || dir === 'L' ? 'vertical' : 'horizontal';
  const putFirst = dir === 'H' || dir === 'K';
  const leaf: WindowLayoutNode = { kind: 'leaf', paneIndex: activePaneIndex };
  return {
    kind: 'split',
    direction: splitDir,
    children: putFirst ? [leaf, remaining] : [remaining, leaf],
    weights: [50, 50],
  };
}

function equalizeTree(node: WindowLayoutNode): WindowLayoutNode {
  if (node.kind === 'leaf') return node;
  const eq = 100 / node.children.length;
  return {
    kind: 'split',
    direction: node.direction,
    children: node.children.map(equalizeTree),
    weights: node.children.map(() => eq),
  };
}

/**
 * 지정한 창을 기준으로 트리 가중치(크기)를 균등화·최대화·증감 조절합니다.
 */
export function resizeLeafInTree(
  tree: WindowLayoutNode,
  targetPaneIndex: number,
  axis: 'horizontal' | 'vertical' | 'any',
  mode: 'equal' | 'max' | 'delta',
  delta = 5
): { tree: WindowLayoutNode; resizedPercent: number } {
  if (mode === 'equal') {
    return { tree: equalizeTree(tree), resizedPercent: 50 };
  }

  const path = findPathToLeaf(tree, targetPaneIndex);
  if (!path || path.length === 0) {
    return { tree, resizedPercent: 50 };
  }

  // 조상 중 axis 와 일치하는 가장 가까운 split 노드 탐색; 없으면 가장 가까운 부모 split 으로 폴백
  const ancestors: Array<{
    splitPath: number[];
    childIndex: number;
    direction: 'horizontal' | 'vertical';
  }> = [];

  let cursor: WindowLayoutNode = tree;
  for (let depth = 0; depth < path.length; depth++) {
    if (cursor.kind === 'split') {
      ancestors.push({
        splitPath: path.slice(0, depth),
        childIndex: path[depth],
        direction: cursor.direction,
      });
      cursor = cursor.children[path[depth]];
    }
  }

  let chosen =
    axis === 'any'
      ? ancestors[ancestors.length - 1]
      : [...ancestors].reverse().find((a) => a.direction === axis) ?? ancestors[ancestors.length - 1];

  if (!chosen) return { tree, resizedPercent: 50 };

  let resizedPercent = 50;
  const nextTree = updateNodeAtPath(tree, chosen.splitPath, (splitNode) => {
    const n = splitNode.children.length;
    if (n < 2) return splitNode;
    const weights = normalizeWeights(splitNode.weights, n);
    const idx = chosen.childIndex;

    if (mode === 'max') {
      const maxW = Math.min(80, 100 - MIN_WEIGHT * (n - 1));
      const remEach = (100 - maxW) / (n - 1);
      const nextWeights = weights.map((_, i) => (i === idx ? maxW : remEach));
      resizedPercent = Math.round(nextWeights[0]);
      return { ...splitNode, weights: nextWeights };
    }

    // delta 증감
    const minW = n === 2 ? 20 : MIN_WEIGHT;
    const maxW = n === 2 ? 80 : 100 - MIN_WEIGHT * (n - 1);
    const curW = weights[idx];
    const targetW = Math.max(minW, Math.min(maxW, curW + delta));
    const otherSum = 100 - curW;
    const nextOtherSum = 100 - targetW;

    const nextWeights = weights.map((w, i) => {
      if (i === idx) return targetW;
      if (otherSum <= 0) return nextOtherSum / (n - 1);
      return (w / otherSum) * nextOtherSum;
    });

    resizedPercent = Math.round(n === 2 ? nextWeights[0] : targetW);
    return { ...splitNode, weights: nextWeights };
  });

  return { tree: nextTree, resizedPercent };
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
    filename: prevCurPane?.filename || fallbackName,
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

  const nextOptions =
    targetPane.scrollbind === undefined && !state.options
      ? state.options
      : {
          ...DEFAULT_VIM_OPTIONS,
          ...(state.globalOptions ?? {}),
          ...(state.options ?? {}),
          scrollbind: targetPane.scrollbind ?? state.options?.scrollbind ?? false,
        };

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
    splitPanes: newPanes,
    locationList: targetPane.locationList,
    options: nextOptions,
  };
}

export function treeContainsLeaf(node: WindowLayoutNode, targetPaneIndex: number): boolean {
  return containsLeaf(node, targetPaneIndex);
}
