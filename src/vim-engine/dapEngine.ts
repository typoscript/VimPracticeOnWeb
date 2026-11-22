import {
  DapSessionState,
  DapStackFrame,
  DapTraceStep,
  DapVariable,
  DapWatchResult,
  VimEditorState,
} from './types';
import { clampCursor } from './cursor';
import { editBuffer, syncCurrentBuffer } from './bufferEngine';
import { msg } from './messages';
import { ringBell } from './engineHelpers';

function getCurrentDapFilename(state: VimEditorState): string {
  return state.primaryFilename || 'main.ts';
}

function formatRuntimeValue(val: unknown): { value: string; type: string } {
  if (typeof val === 'number') {
    return { value: Number.isFinite(val) ? String(val) : 'NaN', type: 'number' };
  }
  if (typeof val === 'boolean') {
    return { value: String(val), type: 'boolean' };
  }
  if (typeof val === 'string') {
    return { value: JSON.stringify(val), type: 'string' };
  }
  if (val === null) return { value: 'null', type: 'null' };
  if (val === undefined) return { value: 'undefined', type: 'undefined' };
  if (Array.isArray(val)) return { value: JSON.stringify(val), type: 'array' };
  return { value: JSON.stringify(val), type: 'object' };
}

/**
 * eval 없이 안전한 경량 표현식 평가기 (변수 참조, 숫자/문자열/불리언 리터럴, 산술·비교 연산 지원)
 */
function evalSimpleExpr(
  rawExpr: string,
  env: Map<string, unknown>
): { ok: true; value: unknown } | { ok: false } {
  const expr = rawExpr.trim().replace(/;$/, '').trim();
  if (!expr) return { ok: false };

  // 괄호 벗기기
  if (expr.startsWith('(') && expr.endsWith(')')) {
    let depth = 0;
    let wrapsWhole = true;
    for (let i = 0; i < expr.length; i++) {
      if (expr[i] === '(') depth++;
      else if (expr[i] === ')') depth--;
      if (depth === 0 && i < expr.length - 1) {
        wrapsWhole = false;
        break;
      }
    }
    if (wrapsWhole) return evalSimpleExpr(expr.slice(1, -1), env);
  }

  // 리터럴
  if (/^-?\d+(?:\.\d+)?$/.test(expr)) {
    return { ok: true, value: Number(expr) };
  }
  if (expr === 'true') return { ok: true, value: true };
  if (expr === 'false') return { ok: true, value: false };
  if (expr === 'null') return { ok: true, value: null };
  if (
    (expr.startsWith('"') && expr.endsWith('"')) ||
    (expr.startsWith("'") && expr.endsWith("'"))
  ) {
    return { ok: true, value: expr.slice(1, -1) };
  }

  // 식별자 또는 점(.) 프로퍼티 참조
  if (/^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*$/.test(expr)) {
    if (env.has(expr)) return { ok: true, value: env.get(expr) };
    const parts = expr.split('.');
    if (parts.length > 1 && env.has(parts[0])) {
      let cur: unknown = env.get(parts[0]);
      for (let i = 1; i < parts.length; i++) {
        if (cur && typeof cur === 'object' && parts[i] in (cur as Record<string, unknown>)) {
          cur = (cur as Record<string, unknown>)[parts[i]];
        } else {
          return { ok: false };
        }
      }
      return { ok: true, value: cur };
    }
    return { ok: false };
  }

  // 이항 연산자 우선순위 (낮은 순: 비교 -> 가감 -> 승제)
  const operatorGroups: readonly (readonly string[])[] = [
    ['===', '!==', '==', '!=', '>=', '<=', '>', '<'],
    ['+', '-'],
    ['*', '/', '%'],
  ];

  for (const ops of operatorGroups) {
    let depth = 0;
    let inQuote: string | null = null;
    for (let i = expr.length - 1; i >= 1; i--) {
      const ch = expr[i];
      if (inQuote) {
        if (ch === inQuote && expr[i - 1] !== '\\') inQuote = null;
        continue;
      }
      if (ch === '"' || ch === "'") {
        inQuote = ch;
        continue;
      }
      if (ch === ')') {
        depth++;
        continue;
      }
      if (ch === '(') {
        depth--;
        continue;
      }
      if (depth !== 0) continue;

      for (const op of ops) {
        if (expr.slice(i - op.length + 1, i + 1) === op) {
          const leftStr = expr.slice(0, i - op.length + 1).trim();
          const rightStr = expr.slice(i + 1).trim();
          if (!leftStr || !rightStr) continue;
          const l = evalSimpleExpr(leftStr, env);
          const r = evalSimpleExpr(rightStr, env);
          if (!l.ok || !r.ok) return { ok: false };
          switch (op) {
            case '+':
              if (typeof l.value === 'string' || typeof r.value === 'string') {
                return { ok: true, value: `${String(l.value)}${String(r.value)}` };
              }
              return { ok: true, value: Number(l.value) + Number(r.value) };
            case '-':
              return { ok: true, value: Number(l.value) - Number(r.value) };
            case '*':
              return { ok: true, value: Number(l.value) * Number(r.value) };
            case '/':
              return {
                ok: true,
                value: Number(r.value) === 0 ? NaN : Number(l.value) / Number(r.value),
              };
            case '%':
              return { ok: true, value: Number(l.value) % Number(r.value) };
            case '===':
            case '==':
              return { ok: true, value: l.value === r.value };
            case '!==':
            case '!=':
              return { ok: true, value: l.value !== r.value };
            case '>':
              return { ok: true, value: Number(l.value) > Number(r.value) };
            case '<':
              return { ok: true, value: Number(l.value) < Number(r.value) };
            case '>=':
              return { ok: true, value: Number(l.value) >= Number(r.value) };
            case '<=':
              return { ok: true, value: Number(l.value) <= Number(r.value) };
          }
        }
      }
    }
  }

  return { ok: false };
}

/**
 * JS/TS/Python 버퍼를 안전하게 정적-동적 트레이스로 변환해 실제 실행 흐름·변수 변화를 추적합니다.
 */
export function buildAutoDapTrace(lines: string[], filename: string): DapTraceStep[] {
  const steps: DapTraceStep[] = [];
  const env = new Map<string, unknown>();
  const prevFormatted = new Map<string, string>();
  let currentFn = '<module>';
  let braceDepth = 0;
  let fnStartDepth = -1;

  const snapshotVars = (): DapVariable[] => {
    const vars: DapVariable[] = [];
    for (const [name, val] of env.entries()) {
      const fmt = formatRuntimeValue(val);
      const changed = prevFormatted.has(name)
        ? prevFormatted.get(name) !== fmt.value
        : true;
      vars.push({ name, value: fmt.value, type: fmt.type, changed });
    }
    for (const v of vars) {
      prevFormatted.set(v.name, v.value);
    }
    return vars;
  };

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i] ?? '';
    const trimmed = raw.trim();

    if (
      !trimmed ||
      trimmed.startsWith('//') ||
      trimmed.startsWith('#') ||
      trimmed.startsWith('/*') ||
      trimmed.startsWith('*') ||
      trimmed === '}' ||
      trimmed === '};' ||
      trimmed.startsWith('import ') ||
      trimmed.startsWith('interface ') ||
      trimmed.startsWith('type ')
    ) {
      for (const ch of raw) {
        if (ch === '{') braceDepth++;
        else if (ch === '}') {
          braceDepth = Math.max(0, braceDepth - 1);
          if (fnStartDepth !== -1 && braceDepth <= fnStartDepth) {
            currentFn = '<module>';
            fnStartDepth = -1;
          }
        }
      }
      continue;
    }

    // 함수 선언 감지
    const fnMatch =
      trimmed.match(/^(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(([^)]*)\)/) ??
      trimmed.match(/^def\s+([A-Za-z_]\w*)\s*\(([^)]*)\)/);
    if (fnMatch) {
      currentFn = fnMatch[1];
      fnStartDepth = braceDepth;
      // 기본값 매개변수 초기화 (예: price = 100)
      const params = fnMatch[2]
        .split(',')
        .map((p) => p.trim())
        .filter(Boolean);
      for (const p of params) {
        const eqIdx = p.indexOf('=');
        if (eqIdx > 0) {
          const pName = p.slice(0, eqIdx).split(':')[0].trim();
          const pVal = evalSimpleExpr(p.slice(eqIdx + 1), env);
          if (pName && pVal.ok) env.set(pName, pVal.value);
        }
      }
      for (const ch of raw) {
        if (ch === '{') braceDepth++;
        else if (ch === '}') braceDepth = Math.max(0, braceDepth - 1);
      }
      continue;
    }

    // 변수 선언 / 대입 평가
    const declMatch = trimmed.match(
      /^(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)(?:\s*:\s*[^=]+)?\s*=\s*(.+)$/
    );
    const assignMatch =
      !declMatch &&
      !trimmed.startsWith('return ') &&
      !trimmed.startsWith('if') &&
      trimmed.match(/^([A-Za-z_$][\w$]*)\s*=\s*(.+)$/);
    const logMatch =
      trimmed.match(/^console\.log\((.+)\);?$/) ?? trimmed.match(/^print\((.+)\)$/);
    const returnMatch = trimmed.match(/^return\s+(.+);?$/);

    let output: string | undefined;

    const bindMatch = declMatch || assignMatch;
    if (bindMatch) {
      const varName = bindMatch[1];
      const rhs = bindMatch[2].replace(/;$/, '').trim();
      const evaluated = evalSimpleExpr(rhs, env);
      if (evaluated.ok) {
        env.set(varName, evaluated.value);
      } else {
        // 객체 리터럴 간단 추출: { id: 1, name: "Vim" }
        if (rhs.startsWith('{') && rhs.endsWith('}')) {
          const obj: Record<string, unknown> = {};
          const inner = rhs.slice(1, -1);
          for (const entry of inner.split(',')) {
            const colon = entry.indexOf(':');
            if (colon > 0) {
              const k = entry.slice(0, colon).trim().replace(/^['"]|['"]$/g, '');
              const v = evalSimpleExpr(entry.slice(colon + 1), env);
              if (k && v.ok) obj[k] = v.value;
            }
          }
          env.set(varName, Object.keys(obj).length > 0 ? obj : rhs);
        } else {
          env.set(varName, rhs);
        }
      }
    } else if (returnMatch) {
      const evaluated = evalSimpleExpr(returnMatch[1], env);
      if (evaluated.ok) {
        env.set('<return>', evaluated.value);
      }
    } else if (logMatch) {
      const evaluated = evalSimpleExpr(logMatch[1], env);
      output = evaluated.ok ? String(evaluated.value) : logMatch[1].trim();
    }

    const callStack =
      currentFn === '<module>'
        ? [{ name: '<module>', filename, line: i }]
        : [
            { name: currentFn, filename, line: i },
            { name: '<module>', filename, line: Math.max(0, lines.length - 1) },
          ];

    steps.push({
      filename,
      line: i,
      functionName: currentFn,
      variables: snapshotVars(),
      callStack,
      output,
    });

    for (const ch of raw) {
      if (ch === '{') braceDepth++;
      else if (ch === '}') {
        braceDepth = Math.max(0, braceDepth - 1);
        if (fnStartDepth !== -1 && braceDepth <= fnStartDepth) {
          currentFn = '<module>';
          fnStartDepth = -1;
        }
      }
    }
  }

  if (steps.length === 0) {
    steps.push({
      filename,
      line: 0,
      functionName: '<module>',
      variables: [],
      callStack: [{ name: '<module>', filename, line: 0 }],
    });
  }

  return steps;
}

function buildFramesForStep(step: DapTraceStep): DapStackFrame[] {
  const stack = step.callStack ?? [
    { name: step.functionName, filename: step.filename, line: step.line },
  ];
  return stack.map((entry, idx) => ({
    id: idx + 1,
    name: entry.name,
    filename: entry.filename,
    line: entry.line,
    variables: idx === 0 ? step.variables.map((v) => ({ ...v })) : [],
  }));
}

function hasBreakpointAt(
  breakpoints: Record<string, number[]> | undefined,
  filename: string,
  line: number
): boolean {
  const list = breakpoints?.[filename];
  return Boolean(list && list.includes(line));
}

function focusDapStep(
  state: VimEditorState,
  session: DapSessionState,
  stepIdx: number,
  message: string
): VimEditorState {
  const step = session.steps[stepIdx];
  if (!step) return state;

  let nextState = state;
  if (step.filename && step.filename !== getCurrentDapFilename(state)) {
    const synced = syncCurrentBuffer(state);
    const hasFile =
      Boolean(synced.virtualFiles?.[step.filename]) ||
      Boolean(synced.buffers?.some((b) => b.name === step.filename));
    if (hasFile) {
      nextState = editBuffer(synced, step.filename);
    }
  }

  const nextOutput = step.output
    ? [...session.consoleOutput, step.output]
    : session.consoleOutput;

  const nextSession: DapSessionState = {
    ...session,
    isActive: true,
    isPaused: true,
    uiOpen: true,
    filename: step.filename,
    currentLine: step.line,
    stepIndex: stepIdx,
    selectedFrameIndex: 0,
    frames: buildFramesForStep(step),
    consoleOutput: nextOutput,
    terminatedReason: undefined,
  };

  return {
    ...nextState,
    cursor: clampCursor(nextState.lines, { line: step.line, col: 0 }, 'NORMAL'),
    mode: 'NORMAL',
    pendingKeys: undefined,
    dapSession: nextSession,
    commandMessage: message,
  };
}

/**
 * 지정 파일의 중단점 줄 목록(0-based)을 반환합니다.
 */
export function getBreakpointsForFile(
  state: VimEditorState,
  filename?: string
): number[] {
  const target = filename ?? getCurrentDapFilename(state);
  return state.dapBreakpoints?.[target] ?? [];
}

/**
 * 현재 줄(또는 지정 줄)에 중단점을 토글합니다 (`:DapToggleBreakpoint` / `:DapBp`).
 */
export function toggleDapBreakpoint(
  state: VimEditorState,
  lineIdx?: number
): VimEditorState {
  const filename = getCurrentDapFilename(state);
  const line = Math.max(
    0,
    Math.min(state.lines.length - 1, lineIdx ?? state.cursor.line)
  );
  const existing = state.dapBreakpoints?.[filename] ?? [];
  const hasBp = existing.includes(line);
  const nextList = hasBp
    ? existing.filter((l) => l !== line)
    : [...existing, line].sort((a, b) => a - b);

  const nextMap: Record<string, number[]> = {
    ...(state.dapBreakpoints ?? {}),
    [filename]: nextList,
  };
  if (nextList.length === 0) {
    delete nextMap[filename];
  }

  return {
    ...state,
    pendingKeys: undefined,
    dapBreakpoints: nextMap,
    commandMessage: hasBp
      ? msg('[DAP] 중단점 해제: {file}:{line}', { file: filename, line: line + 1 })
      : msg('[DAP] 중단점 설정: {file}:{line}', { file: filename, line: line + 1 }),
  };
}

/**
 * 모든 파일의 중단점을 일괄 해제합니다 (`:DapClearBreakpoints`).
 */
export function clearDapBreakpoints(state: VimEditorState): VimEditorState {
  return {
    ...state,
    pendingKeys: undefined,
    dapBreakpoints: {},
    commandMessage: msg('[DAP] 모든 중단점을 해제했습니다'),
  };
}

/**
 * 디버그 세션을 시작하거나 다음 중단점까지 실행을 계속합니다 (`:DapContinue` / `:DapStart`).
 */
export function dapContinue(state: VimEditorState): VimEditorState {
  const filename = getCurrentDapFilename(state);
  const existing = state.dapSession;

  if (!existing || !existing.isActive) {
    const steps =
      state.dapScenarioTrace && state.dapScenarioTrace.length > 0
        ? state.dapScenarioTrace.map((s) => ({
            ...s,
            variables: s.variables.map((v) => ({ ...v })),
            callStack: s.callStack?.map((c) => ({ ...c })),
          }))
        : buildAutoDapTrace(state.lines, filename);

    const baseSession: DapSessionState = {
      isActive: true,
      isPaused: true,
      uiOpen: true,
      filename: steps[0].filename,
      currentLine: steps[0].line,
      stepIndex: 0,
      selectedFrameIndex: 0,
      steps,
      frames: buildFramesForStep(steps[0]),
      watches: existing?.watches ? [...existing.watches] : [],
      consoleOutput: [],
    };

    const hasAnyBp = Object.values(state.dapBreakpoints ?? {}).some(
      (arr) => arr.length > 0
    );

    if (hasAnyBp) {
      const hitIdx = steps.findIndex((s) =>
        hasBreakpointAt(state.dapBreakpoints, s.filename, s.line)
      );
      if (hitIdx !== -1) {
        const collectedOutput = steps
          .slice(0, hitIdx)
          .map((s) => s.output)
          .filter((o): o is string => Boolean(o));
        return focusDapStep(
          state,
          { ...baseSession, consoleOutput: collectedOutput },
          hitIdx,
          msg('[DAP] 중단점 도달: {file}:{line} ({fn})', {
            file: steps[hitIdx].filename,
            line: steps[hitIdx].line + 1,
            fn: steps[hitIdx].functionName,
          })
        );
      }
    }

    return focusDapStep(
      state,
      baseSession,
      0,
      msg('[DAP] 디버그 시작 — {file}:{line} 에서 일시정지', {
        file: steps[0].filename,
        line: steps[0].line + 1,
      })
    );
  }

  // 이미 활성 세션 → 다음 중단점 탐색
  const startFrom = existing.stepIndex + 1;
  const hitIdx = existing.steps.findIndex(
    (s, idx) => idx >= startFrom && hasBreakpointAt(state.dapBreakpoints, s.filename, s.line)
  );
  if (hitIdx !== -1) {
    const extraOutput = existing.steps
      .slice(startFrom, hitIdx)
      .map((s) => s.output)
      .filter((o): o is string => Boolean(o));
    return focusDapStep(
      state,
      { ...existing, consoleOutput: [...existing.consoleOutput, ...extraOutput] },
      hitIdx,
      msg('[DAP] 중단점 도달: {file}:{line} ({fn})', {
        file: existing.steps[hitIdx].filename,
        line: existing.steps[hitIdx].line + 1,
        fn: existing.steps[hitIdx].functionName,
      })
    );
  }

  // 남은 중단점이 없으면 끝까지 실행 후 종료
  const tailOutput = existing.steps
    .slice(startFrom)
    .map((s) => s.output)
    .filter((o): o is string => Boolean(o));

  return {
    ...state,
    pendingKeys: undefined,
    dapSession: {
      ...existing,
      isActive: false,
      isPaused: false,
      consoleOutput: [...existing.consoleOutput, ...tailOutput],
      terminatedReason: 'completed',
    },
    commandMessage: msg('[DAP] 프로그램 실행 완료 — 디버그 세션이 종료되었습니다'),
  };
}

/**
 * 한 줄씩 스텝 오버 실행합니다 (`:DapStepOver` / `:DapNext`).
 */
export function dapStepOver(state: VimEditorState): VimEditorState {
  const session = state.dapSession;
  if (!session || !session.isActive) {
    return {
      ...ringBell(state),
      pendingKeys: undefined,
      commandMessage: msg('[DAP] 활성 디버그 세션이 없습니다 (:DapContinue 로 시작하세요)'),
    };
  }

  const curDepth = session.steps[session.stepIndex]?.callStack?.length ?? 1;
  let nextIdx = -1;
  for (let i = session.stepIndex + 1; i < session.steps.length; i++) {
    const depth = session.steps[i].callStack?.length ?? 1;
    if (depth <= curDepth) {
      nextIdx = i;
      break;
    }
  }
  if (nextIdx === -1 && session.stepIndex + 1 < session.steps.length) {
    nextIdx = session.stepIndex + 1;
  }

  if (nextIdx === -1) {
    return {
      ...state,
      pendingKeys: undefined,
      dapSession: {
        ...session,
        isActive: false,
        isPaused: false,
        terminatedReason: 'completed',
      },
      commandMessage: msg('[DAP] 프로그램 실행 완료 — 디버그 세션이 종료되었습니다'),
    };
  }

  const step = session.steps[nextIdx];
  return focusDapStep(
    state,
    session,
    nextIdx,
    msg('[DAP] Step Over → {file}:{line} ({fn})', {
      file: step.filename,
      line: step.line + 1,
      fn: step.functionName,
    })
  );
}

/**
 * 함수 내부로 스텝 인투 실행합니다 (`:DapStepInto` / `:DapStepIn`).
 */
export function dapStepInto(state: VimEditorState): VimEditorState {
  const session = state.dapSession;
  if (!session || !session.isActive) {
    return {
      ...ringBell(state),
      pendingKeys: undefined,
      commandMessage: msg('[DAP] 활성 디버그 세션이 없습니다 (:DapContinue 로 시작하세요)'),
    };
  }

  const nextIdx = session.stepIndex + 1;
  if (nextIdx >= session.steps.length) {
    return {
      ...state,
      pendingKeys: undefined,
      dapSession: {
        ...session,
        isActive: false,
        isPaused: false,
        terminatedReason: 'completed',
      },
      commandMessage: msg('[DAP] 프로그램 실행 완료 — 디버그 세션이 종료되었습니다'),
    };
  }

  const step = session.steps[nextIdx];
  return focusDapStep(
    state,
    session,
    nextIdx,
    msg('[DAP] Step Into → {file}:{line} ({fn})', {
      file: step.filename,
      line: step.line + 1,
      fn: step.functionName,
    })
  );
}

/**
 * 현재 함수 프레임을 빠져나갑니다 (`:DapStepOut`).
 */
export function dapStepOut(state: VimEditorState): VimEditorState {
  const session = state.dapSession;
  if (!session || !session.isActive) {
    return {
      ...ringBell(state),
      pendingKeys: undefined,
      commandMessage: msg('[DAP] 활성 디버그 세션이 없습니다 (:DapContinue 로 시작하세요)'),
    };
  }

  const curDepth = session.steps[session.stepIndex]?.callStack?.length ?? 1;
  let nextIdx = -1;
  for (let i = session.stepIndex + 1; i < session.steps.length; i++) {
    const depth = session.steps[i].callStack?.length ?? 1;
    if (depth < curDepth) {
      nextIdx = i;
      break;
    }
  }

  if (nextIdx === -1) {
    return {
      ...state,
      pendingKeys: undefined,
      dapSession: {
        ...session,
        isActive: false,
        isPaused: false,
        terminatedReason: 'completed',
      },
      commandMessage: msg('[DAP] 프로그램 실행 완료 — 디버그 세션이 종료되었습니다'),
    };
  }

  const step = session.steps[nextIdx];
  return focusDapStep(
    state,
    session,
    nextIdx,
    msg('[DAP] Step Out → {file}:{line} ({fn})', {
      file: step.filename,
      line: step.line + 1,
      fn: step.functionName,
    })
  );
}

/**
 * 디버그 세션을 중단합니다 (`:DapTerminate` / `:DapStop`).
 */
export function dapTerminate(state: VimEditorState): VimEditorState {
  const prev = state.dapSession;
  return {
    ...state,
    pendingKeys: undefined,
    dapSession: prev
      ? {
          ...prev,
          isActive: false,
          isPaused: false,
          uiOpen: false,
          terminatedReason: 'terminated',
        }
      : null,
    commandMessage: msg('[DAP] 디버그 세션을 종료했습니다'),
  };
}

/**
 * `nvim-dap-ui` 패널을 토글·열기·닫기 합니다.
 */
export function toggleDapUi(
  state: VimEditorState,
  forceOpen?: boolean
): VimEditorState {
  const existing = state.dapSession;
  const nextOpen = forceOpen !== undefined ? forceOpen : !(existing?.uiOpen ?? false);

  if (!existing) {
    if (!nextOpen) return { ...state, pendingKeys: undefined };
    return {
      ...state,
      pendingKeys: undefined,
      dapSession: {
        isActive: false,
        isPaused: false,
        uiOpen: true,
        filename: getCurrentDapFilename(state),
        currentLine: state.cursor.line,
        stepIndex: 0,
        selectedFrameIndex: 0,
        steps: [],
        frames: [],
        watches: [],
        consoleOutput: [],
      },
      commandMessage: msg('[DAP UI] 디버거 패널이 열렸습니다 (:DapBp · :DapContinue)'),
    };
  }

  return {
    ...state,
    pendingKeys: undefined,
    dapSession: { ...existing, uiOpen: nextOpen },
    commandMessage: nextOpen
      ? msg('[DAP UI] 디버거 패널이 열렸습니다 (:DapBp · :DapContinue)')
      : msg('[DAP UI] 디버거 패널을 닫았습니다'),
  };
}

/**
 * 콜스택 프레임을 선택해 해당 위치로 이동합니다.
 */
export function selectDapFrame(
  state: VimEditorState,
  frameIndex: number
): VimEditorState {
  const session = state.dapSession;
  if (!session || frameIndex < 0 || frameIndex >= session.frames.length) {
    return state;
  }
  const frame = session.frames[frameIndex];
  return {
    ...state,
    cursor: clampCursor(state.lines, { line: frame.line, col: 0 }, 'NORMAL'),
    dapSession: {
      ...session,
      selectedFrameIndex: frameIndex,
    },
  };
}

/**
 * 현재 프레임 변수 목록을 바탕으로 Watch / Eval 표현식을 평가합니다.
 */
export function evaluateDapWatch(
  expression: string,
  variables: DapVariable[]
): DapWatchResult {
  const env = new Map<string, unknown>();
  for (const v of variables) {
    if (v.type === 'number') env.set(v.name, Number(v.value));
    else if (v.type === 'boolean') env.set(v.name, v.value === 'true');
    else if (v.type === 'null') env.set(v.name, null);
    else if (v.type === 'string') {
      try {
        env.set(v.name, JSON.parse(v.value));
      } catch {
        env.set(v.name, v.value);
      }
    } else {
      try {
        env.set(v.name, JSON.parse(v.value));
      } catch {
        env.set(v.name, v.value);
      }
    }
  }
  const res = evalSimpleExpr(expression, env);
  if (!res.ok) {
    return { expression, value: '<not available>', error: true };
  }
  return { expression, value: formatRuntimeValue(res.value).value };
}

/**
 * Watch 표현식을 추가합니다 (`:DapWatch {expr}`).
 */
export function addDapWatch(state: VimEditorState, rawExpr: string): VimEditorState {
  const expr = rawExpr.trim();
  if (!expr) {
    return {
      ...ringBell(state),
      pendingKeys: undefined,
      commandMessage: msg('[DAP] 감시할 표현식을 입력하세요 (예: :DapWatch total)'),
    };
  }

  const baseState = state.dapSession ? state : toggleDapUi(state, true);
  const session = baseState.dapSession!;
  const watches = session.watches.includes(expr)
    ? session.watches
    : [...session.watches, expr];
  const activeVars = session.frames[session.selectedFrameIndex]?.variables ?? [];
  const evaluated = evaluateDapWatch(expr, activeVars);

  return {
    ...baseState,
    pendingKeys: undefined,
    dapSession: {
      ...session,
      uiOpen: true,
      watches,
    },
    commandMessage: msg('[DAP Watch] {expr} = {value}', {
      expr,
      value: evaluated.value,
    }),
  };
}

/**
 * Watch 표현식을 제거합니다.
 */
export function removeDapWatch(state: VimEditorState, expr: string): VimEditorState {
  const session = state.dapSession;
  if (!session) return state;
  return {
    ...state,
    dapSession: {
      ...session,
      watches: session.watches.filter((w) => w !== expr),
    },
  };
}

/**
 * 현재 프레임에서 표현식을 즉시 평가해 출력합니다 (`:DapEval {expr}`).
 */
export function evalDapExpression(
  state: VimEditorState,
  rawExpr: string
): VimEditorState {
  const expr = rawExpr.trim();
  if (!expr) {
    return {
      ...ringBell(state),
      pendingKeys: undefined,
      commandMessage: msg('[DAP] 평가할 표현식을 입력하세요 (예: :DapEval total)'),
    };
  }
  const session = state.dapSession;
  if (!session || !session.isActive) {
    return {
      ...ringBell(state),
      pendingKeys: undefined,
      commandMessage: msg('[DAP] 활성 디버그 세션이 없습니다 (:DapContinue 로 시작하세요)'),
    };
  }
  const activeVars = session.frames[session.selectedFrameIndex]?.variables ?? [];
  const evaluated = evaluateDapWatch(expr, activeVars);
  return {
    ...state,
    pendingKeys: undefined,
    dapSession: {
      ...session,
      consoleOutput: [...session.consoleOutput, `> ${expr} => ${evaluated.value}`],
    },
    commandMessage: msg('[DAP Eval] {expr} = {value}', {
      expr,
      value: evaluated.value,
    }),
  };
}

/**
 * nvim-dap-virtual-text 스타일: 현재 일시정지된 실행 줄 끝에 지역 변수 요약을 반환합니다.
 */
export function getDapLineVirtualText(
  session: DapSessionState | null | undefined,
  filename: string,
  lineIdx: number
): string | null {
  if (!session?.isActive || !session.isPaused) return null;
  if (session.filename !== filename || session.currentLine !== lineIdx) return null;
  const vars = session.frames[session.selectedFrameIndex]?.variables ?? [];
  if (vars.length === 0) return null;
  const preview = vars
    .slice(0, 4)
    .map((v) => `${v.name} = ${v.value}`)
    .join(', ');
  return `  // ${preview}`;
}

/**
 * `:Dap*` Ex 명령 디스패처
 */
export function executeDapCommand(
  state: VimEditorState,
  commandName: string,
  arg = ''
): VimEditorState {
  const cmd = commandName.toLowerCase();
  switch (cmd) {
    case 'daptogglebreakpoint':
    case 'dapbp':
      return toggleDapBreakpoint(state);
    case 'dapclearbreakpoints':
      return clearDapBreakpoints(state);
    case 'dapcontinue':
    case 'dapstart':
      return dapContinue(state);
    case 'dapstepover':
    case 'dapnext':
      return dapStepOver(state);
    case 'dapstepinto':
    case 'dapstepin':
      return dapStepInto(state);
    case 'dapstepout':
      return dapStepOut(state);
    case 'dapterminate':
    case 'dapstop':
      return dapTerminate(state);
    case 'dapuitoggle':
    case 'dapui':
      return toggleDapUi(state);
    case 'dapuiopen':
      return toggleDapUi(state, true);
    case 'dapuiclose':
      return toggleDapUi(state, false);
    case 'dapwatch':
      return addDapWatch(state, arg);
    case 'dapeval':
      return evalDapExpression(state, arg);
    default:
      return state;
  }
}
