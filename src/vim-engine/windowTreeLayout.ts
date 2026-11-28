/**
 * 창 레이아웃 트리의 순수 변형·기하 함수 (분할·제거·좌표·이웃 찾기·교환·회전·이동·크기 조절).
 * 상태(VimEditorState)를 모르는 트리 연산만 두며 `windowTree.ts` 가 다시 export 합니다.
 */
import { SplitPlacement, WindowLayoutNode } from './types';

export interface PaneRect {
  paneIndex: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

const EPS = 1e-6;
const MIN_WEIGHT = 10;

/** 분할 노드 가중치를 양수로 보정해 합이 100 이 되게 맞춥니다. */
export function normalizeWeights(weights: number[], count: number): number[] {
  const safe = Array.from({ length: count }, (_, i) => {
    const w = weights[i];
    return typeof w === 'number' && Number.isFinite(w) && w > 0 ? w : 100 / count;
  });
  const sum = safe.reduce((acc, v) => acc + v, 0);
  if (sum <= 0) return Array.from({ length: count }, () => 100 / count);
  return safe.map((v) => (v / sum) * 100);
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

export function treeContainsLeaf(node: WindowLayoutNode, targetPaneIndex: number): boolean {
  return containsLeaf(node, targetPaneIndex);
}
