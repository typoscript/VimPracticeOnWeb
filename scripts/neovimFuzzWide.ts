/**
 * `npm run fuzz:neovim -- --profile wide` 가 기본 생성기에 더하는 명령·텍스트·옵션입니다.
 * 기본 프로필(`--profile basic`)은 이 파일을 쓰지 않으므로 seed 별 결과가 예전과 같습니다.
 */
export interface FuzzRng {
  next(): number;
  pick<T>(arr: readonly T[]): T;
  chance(p: number): boolean;
}

/** 한 케이스 안에서 앞서 나온 명령 (없으면 gv·gi·g; 가 비교할 수 없는 이전 상태를 씀) */
export interface WideContext {
  sawVisual: boolean;
  sawInsert: boolean;
  sawChange: boolean;
}

export const WIDE_TEXTS: readonly string[] = [
  '<ul>\n  <li>one <b>two</b></li>\n  <li class="x">three</li>\n</ul>',
  '<p>a <i>b</i> c</p>\n<a href="#">link</a> <br/>\nx < y > z',
  '\tif (a) {\n\t\tb(1, 2);\n\t}\nend',
  'ab\ncd ef\nghij\nk',
];

/** 엔진과 nvim 에 똑같이 `:set` 으로 적용하는 옵션 묶음 (빈 문자열은 엔진 기본값) */
export const WIDE_OPTION_SETS: readonly string[] = [
  'ai', 'sol', 'ww=h,l', 'ww=b,s,h,l', 'nows', 'sw=4 ts=4', 'noet', 'noet ts=4 sw=4', 'ai sw=4', 'ic', 'ic scs', 'sr', 'sts=2', 'nojs',
];

const WIDE_INSERT_TEXT = ['X', 'ab', 'q r', '<b>'];
// 비주얼 S 는 엔진에서 vim-surround 라 nvim -u NONE 과 비교하지 않습니다.
const BLOCK_MOVES = ['j', 'jj', 'k', 'l', 'll', 'w', 'e', '$', 'jl', 'jw', 'j$', 'G', '2j'];
// 문자·줄 단위 비주얼 I / A (v_visop → 줄 단위 op_insert). `.` 는 같은 명령 안에서만 붙입니다: nvim 의 oparg
// (start_vcol / end_vcol)는 feedkeys 호출마다 새로 시작하고, 엔진 실행기도 명령마다 visualOpVcol 을 비웁니다.
const VISUAL_INSERT_MOVES = ['', 'l', 'h', 'j', 'k', 'jl', '$', 'w', 'b', 'iw', 'ip', 'ap', '0', 'gg', 'G', 'e'];
const VISUAL_INSERT_AFTER = ['', '', '<Esc>j.', '<Esc>w.', '<Esc>0.', '<Esc>k.', '<Esc>u', '<Esc>gi!<Esc>', '<Esc>`^iY<Esc>'];
const WIDE_OBJECTS = ['it', 'at', 'i<', 'a<', 'i>', 'a>', '2it', '2at', 'i)', 'a]', 'i}', 'a`', 'i`'];

function pickText(rng: FuzzRng): string {
  return rng.pick(WIDE_INSERT_TEXT);
}

function count(rng: FuzzRng): string {
  return rng.chance(0.4) ? String(2 + Math.floor(rng.next() * 3)) : '';
}

export function randomWideCommand(rng: FuzzRng, ctx: WideContext): string {
  const r = rng.next();
  if (rng.chance(0.08)) {
    ctx.sawVisual = true;
    ctx.sawInsert = true;
    const head = `${rng.pick(['v', 'V'])}${rng.pick(VISUAL_INSERT_MOVES)}${count(rng)}${rng.pick(['I', 'A'])}${pickText(rng)}`;
    return `${head}<Esc>${rng.pick(VISUAL_INSERT_AFTER)}`;
  }
  if (ctx.sawChange && rng.chance(0.06)) {
    // 변경 목록: 엔진·nvim 모두 텍스트를 keepjumps 로 넣어 처음에는 비어 있습니다 (E664 부터 시작)
    return rng.pick(['g;', 'g,', '2g;', '3g;', '2g,', '9g;', 'g;g;', 'g;g,', 'g;x', 'g;.', '5g;g,']);
  }
  if (r < 0.16) {
    ctx.sawVisual = true;
    const moves = rng.pick(BLOCK_MOVES);
    const action = rng.pick(['I', 'A', '$A', 'c', 'r', '>', '<', 'd', 'y', 'o', 'C', 'x', 'J']);
    if (action === 'r') return `<C-v>${moves}r${rng.pick(['#', 'z', ' '])}`;
    if (action === 'o') return `<C-v>${moves}o${rng.pick(['d', 'y', 'IX<Esc>'])}`;
    if (['I', 'A', '$A', 'c', 'C'].includes(action)) return `<C-v>${moves}${action}${pickText(rng)}<Esc>`;
    return `<C-v>${moves}${count(rng)}${action}`;
  }
  if (r < 0.3) {
    // 태그·꺾쇠·따옴표 객체 (연산자·비주얼)
    const obj = rng.pick(WIDE_OBJECTS);
    if (rng.chance(0.3)) {
      ctx.sawVisual = true;
      return `v${obj}${rng.pick(['d', 'y', 'U', 'c' + pickText(rng) + '<Esc>', obj.slice(-2) + 'y'])}`;
    }
    const op = rng.pick(['d', 'c', 'y', 'gU', 'gu', 'g~', '>', 'g?']);
    return op + obj + (op === 'c' ? pickText(rng) + '<Esc>' : '');
  }
  if (r < 0.4) {
    const cmds = ['gJ', '3gJ', 'J', '3J', '4J', '~', '3~', '9~', 'xp', 'ddp', 'deep', 'yyp', 'Xp', 'ddP', '2xp'];
    if (ctx.sawVisual) cmds.push('gvd', 'gvy', 'gv>', 'gvU');
    if (ctx.sawInsert) cmds.push('giZ<Esc>', 'gi<C-w><Esc>');
    return rng.pick(cmds);
  }
  if (r < 0.55) {
    // 입력 모드 편집 키
    ctx.sawInsert = true;
    const enter = rng.pick(['i', 'a', 'A', 'o', 'O', 'I', 'S', 'cc']);
    const body = rng.pick([
      '<C-r>"', '<C-r>a', 'x<C-r>"y', '<C-t>', '<C-t><C-t>', '<C-d>', 'X<C-d>', '0<C-d>', '<C-t>Z<C-d>',
      'ab cd<C-w>', 'ab  <C-w>', '<C-w>', '<C-w><C-w>', 'ab<C-u>', '<C-u>', 'foo(bar<C-w>', 'a.b<C-w><C-w>',
    ]);
    return enter + body + '<Esc>';
  }
  if (r < 0.68) {
    return rng.pick([
      ':norm! dw<CR>', ':%norm A;<CR>', ':2,3norm x<CR>', ':g/a/norm $x<CR>', ':norm 2x<CR>', ':%norm 0i- <CR>',
      ':norm cwZ<CR>', ':2,$norm >><CR>', ':norm yyp<CR>', ':g/^$/norm iE<CR>', ':%norm f(D<CR>', ':norm! wD<CR>',
    ]);
  }
  if (r < 0.8) {
    ctx.sawInsert = true;
    return count(rng) + 'R' + rng.pick(['X', 'abc', 'ab<BS><BS>', 'a<BS>b', 'xyzw<BS>', 'abcdefghijklmnop']) + '<Esc>';
  }
  if (r < 0.9) {
    // 줄을 넘는 h/l/space/BS (whichwrap) 와 대소문자 연산자 + 객체
    return count(rng) + rng.pick(['h', 'l', ' ', '<BS>', 'dl', 'dh', 'd ', 'yl', 'x', 'X', '5l', '9h']);
  }
  return rng.pick(['gUiw', 'guaw', 'g~ip', 'gUis', 'gUit', 'guap', 'g~i(', 'gUi"', 'gU2aw', 'g~~', '3gUU', 'g??', 'g?iw']);
}
