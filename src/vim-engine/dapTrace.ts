// nvim-dap 트레이스 빌더 — eval 없이 버퍼를 실행 단계·변수 변화로 바꾸고 Watch 표현식을 평가합니다 (dapEngine.ts 에서 분리)

import { DapTraceStep, DapVariable, DapWatchResult, VimEditorState } from './types';

export function getCurrentDapFilename(state: VimEditorState): string {
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
