import { UserCommand, VimEditorState } from '../types/vim';

/**
 * 사용자 정의 Ex 명령 엔진 (:command!, :delcommand, :comclear)
 *
 *   :command[!] [-nargs=0|1|*|?|+] [-range[=%]] [-bang] [-bar] [-complete=...] {Name} {replacement}
 *
 * replacement 안의 특수 토큰은 호출 시점에 치환됩니다:
 *   <args>   인자 원문           <q-args>  큰따옴표로 감싼 인자
 *   <f-args> 공백으로 나눈 인자를 함수 인자 목록으로 ("a","b")
 *   <line1>  범위 시작 줄 (1-based) <line2>   범위 끝 줄
 *   <bang>   ! 로 호출했으면 "!"   <lt>      리터럴 "<"
 *
 * 이 모듈은 commandLine.ts에 의존하지 않으며, 치환된 명령의 실행은 호출부가 넘겨주는 runner가 담당합니다.
 */

export type ExRunner = (state: VimEditorState, command: string) => VimEditorState;

/** 사용자 명령이 자기 자신을 계속 호출하는 경우의 최대 깊이 (Vim의 E169) */
const MAX_USER_COMMAND_DEPTH = 50;

const VALID_NARGS = new Set(['0', '1', '*', '?', '+']);

function finish(state: VimEditorState, commandMessage?: string, bell = false): VimEditorState {
  return {
    ...state,
    mode: 'NORMAL',
    visualAnchor: undefined,
    commandBuffer: undefined,
    commandType: undefined,
    commandMessage,
    ...(bell ? { bell: true } : {}),
  };
}

function fail(state: VimEditorState, message: string): VimEditorState {
  return finish(state, message, true);
}

/** :command / :delcommand / :comclear 계열 명령인지 판별하여 실행합니다. 해당하지 않으면 null */
export function executeUserCommandDefinition(state: VimEditorState, exLine: string): VimEditorState | null {
  const line = exLine.replace(/^:\s*/, '').trim();

  if (/^comc(?:l(?:e(?:a(?:r)?)?)?)?$/.test(line)) {
    return finish({ ...state, userCommands: {} }, '[사용자 명령] 모든 사용자 정의 명령을 삭제했습니다.');
  }

  const delMatch = line.match(/^delc(?:o(?:m(?:m(?:a(?:n(?:d)?)?)?)?)?)?\s+(\S+)$/);
  if (delMatch) {
    const name = delMatch[1];
    if (!state.userCommands?.[name]) {
      return fail(state, `E184: 해당 사용자 정의 명령이 없습니다: ${name}`);
    }
    const next = { ...state.userCommands };
    delete next[name];
    return finish({ ...state, userCommands: next }, `[사용자 명령 삭제] :${name}`);
  }

  const comMatch = line.match(/^com(?:m(?:a(?:n(?:d)?)?)?)?(!?)(?:\s+(.*))?$/);
  if (!comMatch) return null;
  const overwrite = comMatch[1] === '!';
  let rest = (comMatch[2] ?? '').trim();

  // 1. 속성 파싱 (-nargs, -range, -bang, -bar, -complete)
  let nargs: UserCommand['nargs'] = '0';
  let range: UserCommand['range'] = 'none';
  let bang = false;
  let attr: RegExpMatchArray | null;
  while ((attr = rest.match(/^-(\S+)\s*/))) {
    const [name, value] = attr[1].split('=', 2);
    if (name === 'nargs') {
      if (!value || !VALID_NARGS.has(value)) return fail(state, `E176: 잘못된 인자 개수 지정입니다: -nargs=${value ?? ''}`);
      nargs = value as UserCommand['nargs'];
    } else if (name === 'range') {
      if (value !== undefined && value !== '%') return fail(state, `E178: 잘못된 범위 기본값입니다: -range=${value}`);
      range = value === '%' ? 'file' : 'line';
    } else if (name === 'bang') {
      bang = true;
    } else if (name !== 'bar' && name !== 'complete') {
      return fail(state, `E181: 잘못된 속성입니다: -${attr[1]}`);
    }
    rest = rest.slice(attr[0].length);
  }

  // 2. 이름만 있거나 비어 있으면 목록 조회 (:command, :command W)
  const nameMatch = rest.match(/^(\S+)(?:\s+(.*))?$/);
  if (!nameMatch || nameMatch[2] === undefined || nameMatch[2].trim() === '') {
    return finish(state, formatUserCommandList(state, nameMatch?.[1] ?? ''));
  }

  const name = nameMatch[1];
  const replacement = nameMatch[2].trim();
  if (!/^[A-Z][A-Za-z0-9]*$/.test(name)) {
    return fail(state, `E183: 사용자 정의 명령은 대문자로 시작하고 영문자·숫자만 쓸 수 있습니다: ${name}`);
  }
  if (state.userCommands?.[name] && !overwrite) {
    return fail(state, `E174: 이미 존재하는 명령입니다. 덮어쓰려면 ! 를 붙이세요: ${name}`);
  }

  const command: UserCommand = { name, nargs, range, bang, replacement };
  return finish(
    { ...state, userCommands: { ...(state.userCommands ?? {}), [name]: command } },
    `[사용자 명령 등록] :${name} -> ${replacement}`
  );
}

/** :command 목록 (prefix로 시작하는 명령만) */
export function formatUserCommandList(state: VimEditorState, prefix = ''): string {
  const commands = Object.values(state.userCommands ?? {})
    .filter((c) => c.name.startsWith(prefix))
    .sort((a, b) => a.name.localeCompare(b.name));
  if (commands.length === 0) {
    return '사용자 정의 명령이 없습니다.';
  }
  const rangeLabel = (c: UserCommand) => (c.range === 'file' ? '%' : c.range === 'line' ? '.' : '');
  return [
    '--- 사용자 정의 명령 (:command) ---',
    '    Name        Args Range Definition',
    ...commands.map(
      (c) => `${c.bang ? '!' : ' '}   ${c.name.padEnd(12)}${c.nargs.padEnd(5)}${rangeLabel(c).padEnd(6)}${c.replacement}`
    ),
  ].join('\n');
}

export type UserCommandLookup =
  | { kind: 'found'; command: UserCommand }
  | { kind: 'ambiguous'; candidates: string[] }
  | { kind: 'none' };

/** 이름으로 사용자 명령을 찾습니다. 정확히 일치하는 이름이 우선이며, 아니면 유일한 접두어 일치를 허용합니다. (:Fo → :Format) */
export function lookupUserCommand(state: VimEditorState, name: string): UserCommandLookup {
  const commands = state.userCommands ?? {};
  if (commands[name]) return { kind: 'found', command: commands[name] };
  const candidates = Object.keys(commands).filter((n) => n.startsWith(name)).sort();
  if (candidates.length === 1) return { kind: 'found', command: commands[candidates[0]] };
  if (candidates.length > 1) return { kind: 'ambiguous', candidates };
  return { kind: 'none' };
}

export interface UserCommandInvocation {
  bang: boolean;
  args: string;
  /** 0-based 범위 (명시하지 않았으면 null) */
  range: { startLine: number; endLine: number } | null;
}

/** <q-args>: 인자를 큰따옴표 문자열로 감쌉니다. */
function quoteArgs(args: string): string {
  return `"${args.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/** <f-args>: 공백으로 인자를 나눕니다. (\ 로 이스케이프한 공백은 유지) */
function splitFunctionArgs(args: string): string[] {
  const out: string[] = [];
  let cur = '';
  for (let i = 0; i < args.length; i++) {
    const ch = args[i];
    if (ch === '\\' && (args[i + 1] === ' ' || args[i + 1] === '\\')) {
      cur += args[++i];
    } else if (/\s/.test(ch)) {
      if (cur.length > 0) out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  if (cur.length > 0) out.push(cur);
  return out;
}

/** replacement의 특수 토큰을 치환합니다. */
export function expandUserCommand(
  command: UserCommand,
  invocation: UserCommandInvocation,
  line1: number,
  line2: number
): string {
  return command.replacement.replace(/<(args|q-args|f-args|line1|line2|bang|lt)>/gi, (_, token: string) => {
    switch (token.toLowerCase()) {
      case 'args': return invocation.args;
      case 'q-args': return quoteArgs(invocation.args);
      case 'f-args': return splitFunctionArgs(invocation.args).map(quoteArgs).join(',');
      case 'line1': return String(line1);
      case 'line2': return String(line2);
      case 'bang': return invocation.bang ? '!' : '';
      default: return '<';
    }
  });
}

/**
 * 사용자 명령을 검증·치환한 뒤 runner로 실행합니다.
 * @param depth 사용자 명령 중첩 깊이 (자기 자신을 호출하는 명령의 무한 재귀 방지)
 */
export function executeUserCommand(
  state: VimEditorState,
  command: UserCommand,
  invocation: UserCommandInvocation,
  runner: ExRunner,
  depth = 0
): VimEditorState {
  const { args, bang, range } = invocation;

  if (depth >= MAX_USER_COMMAND_DEPTH) {
    return fail(state, `E169: 명령이 너무 깊게 재귀 호출되었습니다: ${command.name}`);
  }
  if (bang && !command.bang) {
    return fail(state, `E477: ! 를 사용할 수 없는 명령입니다: ${command.name}`);
  }
  if (range && command.range === 'none') {
    return fail(state, `E481: 범위를 지정할 수 없는 명령입니다: ${command.name}`);
  }
  if (command.nargs === '0' && args.length > 0) {
    return fail(state, `E488: 불필요한 인자가 있습니다: ${args}`);
  }
  if ((command.nargs === '1' || command.nargs === '+') && args.length === 0) {
    return fail(state, `E471: 인자가 필요합니다: ${command.name}`);
  }

  const lastLine = Math.max(1, state.lines.length);
  const defaultRange =
    command.range === 'file'
      ? { startLine: 0, endLine: lastLine - 1 }
      : { startLine: state.cursor.line, endLine: state.cursor.line };
  const effective = range ?? defaultRange;

  const expanded = expandUserCommand(command, invocation, effective.startLine + 1, effective.endLine + 1);
  return runner(state, expanded.replace(/^:\s*/, ''));
}
