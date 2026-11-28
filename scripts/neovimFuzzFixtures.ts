/**
 * Neovim 비교 퍼저로 찾아 고친 차이를 실제 Neovim 결과로 고정합니다.
 *
 *   npx tsx scripts/neovimFuzzFixtures.ts
 *
 * 아래 CASES 를 `nvim --headless -u NONE` (엔진 기본 옵션: ts=2 sw=2 et noai nosol) 에서 실행해
 * test/fixtures/neovim-fuzz-findings.json 으로 저장합니다. test/neovimFuzzFindings.test.ts 가 nvim 없이 이 값과 비교합니다.
 */
import { runNeovimIsolated } from './neovimRunner';
import fs from 'fs';
import path from 'path';

interface Case {
  id: string;
  text: string;
  cursor: { row: number; col: number };
  keys: string;
}

const T1 = 'const total = sum(a, b) + 42;\nif (total > 10) {\n  log("big", total);\n}\nreturn total;';
const T2 = 'alpha beta gamma\nfoo.bar(baz, "qux")\n{ key: \'value\', n: 7 }\n';
const T3 = '  indented line one\n    deeper (nested) item\n  back to one\nlast_word_here end';
const T4 = 'ab cd\nef\n\ngh';
const T5 = '  ab cd\nef\n\ngh';
const T6 = 'a\n  \nb\n\nc';
const T7 = 'a b\nc d\ne f\ng h';

const CASES: Case[] = [
  // >> / << / >{motion}: nostartofline 이면 열을 유지
  { id: 'shift-keeps-col', text: T1, cursor: { row: 2, col: 7 }, keys: '>>' },
  { id: 'shift-left-keeps-col', text: T3, cursor: { row: 1, col: 18 }, keys: '<<' },
  { id: 'shift-motion-keeps-col', text: T1, cursor: { row: 0, col: 16 }, keys: '>}' },
  { id: 'shift-up-top-line', text: T1, cursor: { row: 2, col: 0 }, keys: '>k' },
  { id: 'shift-left-clamps', text: T3, cursor: { row: 2, col: 11 }, keys: '<0' },
  // { } : count 초과는 실패, 공백만 있는 줄은 경계가 아님
  { id: 'para-count-overflow-back', text: T3, cursor: { row: 2, col: 8 }, keys: '3{' },
  { id: 'para-count-overflow-fwd', text: T7, cursor: { row: 1, col: 0 }, keys: '4}' },
  { id: 'para-whitespace-not-boundary', text: T6, cursor: { row: 0, col: 0 }, keys: '}' },
  { id: 'para-back-whitespace', text: T6, cursor: { row: 2, col: 0 }, keys: '{' },
  // d} / y} / c} : 배타적 모션이 다음 줄 첫 칸에서 끝나는 규칙
  { id: 'd-para-charwise', text: T4, cursor: { row: 0, col: 3 }, keys: 'd}' },
  { id: 'd-para-linewise-at-indent', text: T5, cursor: { row: 0, col: 2 }, keys: 'd}' },
  { id: 'y-para-charwise', text: T4, cursor: { row: 0, col: 3 }, keys: 'y}' },
  { id: 'c-para-charwise', text: T4, cursor: { row: 0, col: 3 }, keys: 'c}X<Esc>' },
  { id: 'd-para-to-end', text: 'ab\ncd', cursor: { row: 0, col: 0 }, keys: 'd}' },
  { id: 'd-para-back-mid', text: 'ab\n\ncd ef\ngh', cursor: { row: 3, col: 1 }, keys: 'd{' },
  { id: 'd-para-end-not-col0', text: T2, cursor: { row: 2, col: 19 }, keys: 'd}' },
  // :help ]] — 연산자와 함께면 열 0 의 } 아래에서 멈춤, 줄 단위 삭제 규칙(op_delete)
  { id: 'd-section-stops-below-brace', text: '{\n  a\n}\n\n{\n  b\n}', cursor: { row: 0, col: 0 }, keys: 'd]]' },
  { id: 'd-para-whole-lines-linewise', text: 'ab\ncd', cursor: { row: 0, col: 0 }, keys: 'd}' },
  // 줄 단위 삭제 후 열 유지 (nostartofline)
  { id: 'dG-keeps-col', text: T3, cursor: { row: 1, col: 9 }, keys: 'dG' },
  { id: 'dk-keeps-col', text: T3, cursor: { row: 1, col: 9 }, keys: 'dk' },
  { id: 'dgg-keeps-col', text: T3, cursor: { row: 1, col: 9 }, keys: 'dgg' },
  // 대소문자 연산자: 범위·실패
  { id: 'gU-caret-exclusive', text: 'Another paragraph here.', cursor: { row: 0, col: 1 }, keys: 'gU^' },
  { id: 'gU-find-fails', text: 'abc def', cursor: { row: 0, col: 1 }, keys: 'gUfx' },
  { id: 'gu-till-back-fails', text: 'abc def', cursor: { row: 0, col: 5 }, keys: 'guTo' },
  { id: 'gU-find', text: 'abc def', cursor: { row: 0, col: 0 }, keys: 'gUfe' },
  { id: 'gu-brace-to-start', text: T3, cursor: { row: 3, col: 6 }, keys: 'gu{' },
  { id: 'gU-percent', text: T2, cursor: { row: 1, col: 7 }, keys: 'gU%' },
  // 없는 텍스트 객체는 실패 (INSERT 로 들어가지 않음), 빈 줄의 ciw 는 성공
  { id: 'ca-paren-missing', text: 'plain 0x1f 007', cursor: { row: 0, col: 4 }, keys: 'ca(new<Esc>' },
  { id: 'ci-quote-missing', text: 'plain 0x1f 007', cursor: { row: 0, col: 4 }, keys: 'ci"new<Esc>' },
  { id: 'ciw-empty-line', text: '', cursor: { row: 0, col: 0 }, keys: 'ciwbar<Esc>' },
  // {count}d$ / c$ / y$, 마지막 줄의 {count}dd / yy
  { id: 'count-d-dollar', text: T7, cursor: { row: 0, col: 2 }, keys: '3d$' },
  { id: 'count-c-dollar', text: T7, cursor: { row: 0, col: 2 }, keys: '3c$X<Esc>' },
  { id: 'count-y-dollar', text: T7, cursor: { row: 0, col: 2 }, keys: '2y$' },
  { id: 'count-dd-last-line', text: 'a b\nc d', cursor: { row: 1, col: 0 }, keys: '2dd' },
  { id: 'count-yy-last-line', text: 'a b\nc d', cursor: { row: 1, col: 0 }, keys: '4yy' },
  // Insert Ctrl-r 로 줄 단위 레지스터를 넣으면 줄바꿈까지 들어감
  { id: 'insert-ctrl-r-linewise-O', text: 'one\ntwo', cursor: { row: 0, col: 0 }, keys: '"ayyO<C-r>a<Esc>' },
  { id: 'insert-ctrl-r-linewise-A', text: 'one\ntwo', cursor: { row: 1, col: 1 }, keys: '"ayyjA <C-r>a<Esc>' },
  { id: 'insert-ctrl-r-linewise-then-type', text: 'one\ntwo', cursor: { row: 0, col: 0 }, keys: 'yyjO<C-r>"X<Esc>' },
  // 커서 규칙: 비주얼 연산·줄 단위 대소문자·복사·Ex 명령 뒤
  { id: 'visual-u-cursor-start', text: 'alpha beta gamma\n  foo bar baz\nThe end\nthe start', cursor: { row: 0, col: 12 }, keys: 'VjU' },
  { id: 'visual-shift-keeps-col', text: 'alpha beta gamma\n  foo bar baz\nThe end\nthe start', cursor: { row: 1, col: 1 }, keys: 'Vw>' },
  { id: 'visual-yank-col0', text: 'alpha beta gamma\n  foo bar baz\nThe end\nthe start', cursor: { row: 1, col: 7 }, keys: 'Vjy' },
  { id: 'guu-first-nonblank', text: 'alpha beta gamma\n  foo bar baz\nThe end\nthe start', cursor: { row: 1, col: 6 }, keys: 'guu' },
  { id: 'count-guu-keeps-col', text: 'alpha beta gamma\n  foo bar baz\nThe end\nthe start', cursor: { row: 1, col: 6 }, keys: '2guu' },
  { id: 'case-op-undo-cursor', text: 'alpha beta gamma\n  foo bar baz\nThe end\nthe start', cursor: { row: 0, col: 8 }, keys: 'vt g~u' },
  { id: 'yiw-cursor-start', text: 'alpha beta gamma\n  foo bar baz\nThe end\nthe start', cursor: { row: 0, col: 12 }, keys: 'yiw' },
  { id: 'yaw-cursor-start', text: 'alpha beta gamma\n  foo bar baz\nThe end\nthe start', cursor: { row: 0, col: 12 }, keys: 'yaw' },
  // [count]J, 문장 count 초과
  { id: 'count-J-joins-count-lines', text: 'a\nb\nc\nd\ne', cursor: { row: 0, col: 0 }, keys: '3J' },
  { id: 'count-J-past-end', text: 'a\nb\nc', cursor: { row: 0, col: 0 }, keys: '5J' },
  { id: 'sentence-count-overflow', text: 'One. Two. Three.', cursor: { row: 0, col: 5 }, keys: '5)' },
  { id: 'sentence-count-ok', text: 'One. Two. Three.', cursor: { row: 0, col: 10 }, keys: '2(' },
  // Ex 명령
  { id: 'g-delete-register', text: 'alpha beta gamma\n  foo bar baz\nThe end\nthe start', cursor: { row: 0, col: 5 }, keys: ':g/a/d<CR>' },
  { id: 'v-delete-register', text: 'alpha beta gamma\n  foo bar baz\nThe end\nthe start', cursor: { row: 0, col: 5 }, keys: ':v/e/d<CR>' },
  { id: 'sort-byte-order', text: 'alpha beta gamma\n  foo bar baz\nThe end\nthe start', cursor: { row: 0, col: 0 }, keys: ':sort<CR>gg' },
  { id: 's-cursor-first-nonblank', text: 'alpha beta gamma\n  foo bar baz\nThe end\nthe start', cursor: { row: 1, col: 9 }, keys: ':s/a/X/<CR>' },
  { id: 'percent-s-cursor-last-line', text: 'alpha beta gamma\n  foo bar baz\nThe end\nthe start', cursor: { row: 1, col: 9 }, keys: ':%s/e/E/g<CR>' },
  { id: 't-keeps-col', text: 'alpha beta gamma\n  foo bar baz\nThe end\nthe start', cursor: { row: 1, col: 9 }, keys: ':t.<CR>' },
  { id: 'm-keeps-col', text: 'alpha beta gamma\n  foo bar baz\nThe end\nthe start', cursor: { row: 0, col: 3 }, keys: ':m$<CR>' },
  // 입력 모드 Ctrl-u / Ctrl-w 는 입력 시작에서 한 번 멈춤
  { id: 'insert-ctrl-u-stops-at-start', text: 'alpha beta gamma\n  foo bar baz\nThe end\nthe start', cursor: { row: 1, col: 4 }, keys: 'A one two<C-u><Esc>' },
  { id: 'insert-ctrl-u-twice', text: 'alpha beta gamma\n  foo bar baz\nThe end\nthe start', cursor: { row: 1, col: 4 }, keys: 'A one two<C-u><C-u><Esc>' },
  { id: 'insert-ctrl-w-twice', text: 'alpha beta gamma\n  foo bar baz\nThe end\nthe start', cursor: { row: 0, col: 10 }, keys: 'afoo<C-w><C-w><Esc>' },
  // 검색: 커서 다음부터, [count]
  { id: 'search-skips-cursor-match', text: 'alpha beta gamma\n  foo bar baz\nThe end\nthe start', cursor: { row: 0, col: 0 }, keys: '/a<CR>' },
  { id: 'search-count', text: 'alpha beta gamma\n  foo bar baz\nThe end\nthe start', cursor: { row: 0, col: 0 }, keys: '2/a<CR>' },
  { id: 'search-count-lines', text: 'alpha beta gamma\n  foo bar baz\nThe end\nthe start', cursor: { row: 0, col: 0 }, keys: '3/e<CR>' },
  // curswant: 세로 이동은 처음 열을 기억, $ 는 줄 끝을 기억, 다른 명령은 다시 정함
  { id: 'curswant-jjj', text: 'a long line of text here\nshort\n\nanother quite long line!!\n  ind\ntail end of the file here', cursor: { row: 0, col: 15 }, keys: 'jjj' },
  { id: 'curswant-jjjk', text: 'a long line of text here\nshort\n\nanother quite long line!!\n  ind\ntail end of the file here', cursor: { row: 0, col: 15 }, keys: 'jjjk' },
  { id: 'curswant-dollar', text: 'a long line of text here\nshort\n\nanother quite long line!!\n  ind\ntail end of the file here', cursor: { row: 0, col: 15 }, keys: '$jjj' },
  { id: 'curswant-G', text: 'a long line of text here\nshort\n\nanother quite long line!!\n  ind\ntail end of the file here', cursor: { row: 0, col: 15 }, keys: 'jG' },
  { id: 'curswant-gg', text: 'a long line of text here\nshort\n\nanother quite long line!!\n  ind\ntail end of the file here', cursor: { row: 5, col: 12 }, keys: 'kkkgg' },
  { id: 'curswant-failed-l-keeps', text: 'a long line of text here\nshort\n\nanother quite long line!!\n  ind\ntail end of the file here', cursor: { row: 0, col: 15 }, keys: 'jljjj' },
  { id: 'curswant-x-resets', text: 'a long line of text here\nshort\n\nanother quite long line!!\n  ind\ntail end of the file here', cursor: { row: 0, col: 15 }, keys: 'jxjj' },
  { id: 'curswant-zz-keeps', text: 'a long line of text here\nshort\n\nanother quite long line!!\n  ind\ntail end of the file here', cursor: { row: 0, col: 15 }, keys: 'jzzjj' },
  // 카운트가 붙은 줄 명령, 레지스터, P
  { id: 'count-dd-partial', text: 'a1 b1\n  a2 b2\na3 b3\na4 b4\na5 b5', cursor: { row: 3, col: 0 }, keys: '3dd' },
  { id: 'count-D-linewise', text: 'a1 b1\n  a2 b2\na3 b3\na4 b4\na5 b5', cursor: { row: 0, col: 0 }, keys: '3D' },
  { id: 'count-D-charwise', text: 'a1 b1\n  a2 b2\na3 b3\na4 b4\na5 b5', cursor: { row: 0, col: 3 }, keys: '3D' },
  { id: 'count-C-last-line-fails', text: 'a1 b1\n  a2 b2\na3 b3\na4 b4\na5 b5', cursor: { row: 4, col: 0 }, keys: '3CX<Esc>' },
  { id: 'count-cc-last-line-fails', text: 'a1 b1\n  a2 b2\na3 b3\na4 b4\na5 b5', cursor: { row: 4, col: 0 }, keys: '2ccX<Esc>' },
  { id: 'register-append-unnamed', text: 'a1 b1\n  a2 b2\na3 b3\na4 b4\na5 b5', cursor: { row: 0, col: 0 }, keys: '"ayiw"Ayiw' },
  { id: 'P-cursor-last-char', text: 'ab cd ef', cursor: { row: 0, col: 0 }, keys: 'yiwP' },
  { id: 'P-count-cursor', text: 'ab cd ef', cursor: { row: 0, col: 0 }, keys: 'yiw2P' },
  // F / T 는 배타적, y 후 커서는 범위 시작
  { id: 'yF-exclusive', text: '  log("big", total);', cursor: { row: 0, col: 13 }, keys: 'yF(' },
  { id: 'yT-exclusive', text: '  log("big", total);', cursor: { row: 0, col: 13 }, keys: 'yTo' },
  { id: 'dF-exclusive', text: '  log("big", total);', cursor: { row: 0, col: 13 }, keys: 'dF(' },
  { id: 'dT-exclusive', text: '  log("big", total);', cursor: { row: 0, col: 13 }, keys: 'dTg' },
  { id: 'y0-cursor', text: '  log("big", total);', cursor: { row: 0, col: 13 }, keys: 'y0' },
  { id: 'gU-g-underscore', text: '  log("big", total);', cursor: { row: 0, col: 13 }, keys: 'gUg_' },
  { id: 'gU-ge', text: '  log("big", total);', cursor: { row: 0, col: 13 }, keys: 'gUge' },
  { id: 'g-delete-cursor-first-nonblank', text: '  keep\nzap a\n    stay here', cursor: { row: 0, col: 3 }, keys: ':g/a/d<CR>' },
  // gJ 는 들여쓰기를 지우지 않음, 0 이 붙은 수는 자릿수 유지, * # 는 커서 뒤 키워드/비공백 사용
  { id: 'gJ-keeps-indent', text: 'if (x) {\n  log(1);', cursor: { row: 0, col: 0 }, keys: 'gJ' },
  { id: 'ctrl-x-zero-pad', text: 'a 007 b', cursor: { row: 0, col: 0 }, keys: '<C-x>' },
  { id: 'ctrl-a-zero-pad-grow', text: 'a 099 b', cursor: { row: 0, col: 0 }, keys: '<C-a>' },
  { id: 'ctrl-a-negative-zero-pad', text: 'a -007 b', cursor: { row: 0, col: 0 }, keys: '<C-a>' },
  { id: 'star-next-keyword', text: 'x  foo bar\nfoo', cursor: { row: 0, col: 1 }, keys: '*' },
  { id: 'hash-next-keyword', text: 'x  foo bar\nfoo', cursor: { row: 0, col: 1 }, keys: '#' },
  { id: 'gstar-non-keyword-run', text: '  ;; x\n;; y', cursor: { row: 0, col: 0 }, keys: 'g*' },
  // u: 바뀐 첫 줄로 (변경 전 커서가 그 줄이면 그 열)
  { id: 'undo-g-delete-top-line', text: 'keep\n  zap a\nkeep2\nzap b', cursor: { row: 3, col: 2 }, keys: ':g/zap/d<CR>u' },
  { id: 'undo-same-line-col', text: 'a1 b1\n  a2 b2\na3 b3', cursor: { row: 1, col: 4 }, keys: 'jdd2ku' },
  // :help visual-repeat — 비주얼 연산 뒤 . 는 커서에서 같은 양의 텍스트에 다시 적용
  { id: 'visual-repeat-1', text: 'alpha beta gamma delta\none two three four five\naaaa bbbb cccc dddd\nx y z w v u\nlast line here ok', cursor: { row: 0, col: 0 }, keys: 'vll~w.' },
  { id: 'visual-repeat-2', text: 'alpha beta gamma delta\none two three four five\naaaa bbbb cccc dddd\nx y z w v u\nlast line here ok', cursor: { row: 0, col: 0 }, keys: 'vllUw.' },
  { id: 'visual-repeat-3', text: 'alpha beta gamma delta\none two three four five\naaaa bbbb cccc dddd\nx y z w v u\nlast line here ok', cursor: { row: 0, col: 0 }, keys: 'vlldw.' },
  { id: 'visual-repeat-4', text: 'alpha beta gamma delta\none two three four five\naaaa bbbb cccc dddd\nx y z w v u\nlast line here ok', cursor: { row: 0, col: 0 }, keys: 'Vj>j.' },
  { id: 'visual-repeat-5', text: 'alpha beta gamma delta\none two three four five\naaaa bbbb cccc dddd\nx y z w v u\nlast line here ok', cursor: { row: 0, col: 0 }, keys: 'Vjdj.' },
  { id: 'visual-repeat-6', text: 'alpha beta gamma delta\none two three four five\naaaa bbbb cccc dddd\nx y z w v u\nlast line here ok', cursor: { row: 0, col: 0 }, keys: 'VjUjj.' },
  { id: 'visual-repeat-7', text: 'alpha beta gamma delta\none two three four five\naaaa bbbb cccc dddd\nx y z w v u\nlast line here ok', cursor: { row: 0, col: 0 }, keys: 'vjl~jj.' },
  { id: 'visual-repeat-8', text: 'alpha beta gamma delta\none two three four five\naaaa bbbb cccc dddd\nx y z w v u\nlast line here ok', cursor: { row: 0, col: 0 }, keys: 'vjldj.' },
  { id: 'visual-repeat-9', text: 'alpha beta gamma delta\none two three four five\naaaa bbbb cccc dddd\nx y z w v u\nlast line here ok', cursor: { row: 0, col: 0 }, keys: '<C-v>jlUw.' },
  { id: 'visual-repeat-10', text: 'alpha beta gamma delta\none two three four five\naaaa bbbb cccc dddd\nx y z w v u\nlast line here ok', cursor: { row: 0, col: 0 }, keys: '<C-v>jldw.' },
  { id: 'visual-repeat-11', text: 'alpha beta gamma delta\none two three four five\naaaa bbbb cccc dddd\nx y z w v u\nlast line here ok', cursor: { row: 0, col: 0 }, keys: 'vllr#w.' },
  { id: 'visual-repeat-12', text: 'alpha beta gamma delta\none two three four five\naaaa bbbb cccc dddd\nx y z w v u\nlast line here ok', cursor: { row: 0, col: 0 }, keys: 'Vj~j.' },
  { id: 'visual-repeat-13', text: 'alpha beta gamma delta\none two three four five\naaaa bbbb cccc dddd\nx y z w v u\nlast line here ok', cursor: { row: 0, col: 0 }, keys: 'vee~W.' },
  { id: 'visual-repeat-14', text: 'alpha beta gamma delta\none two three four five\naaaa bbbb cccc dddd\nx y z w v u\nlast line here ok', cursor: { row: 0, col: 0 }, keys: 'VjJj.' },
  { id: 'visual-repeat-15', text: 'alpha beta gamma delta\none two three four five\naaaa bbbb cccc dddd\nx y z w v u\nlast line here ok', cursor: { row: 0, col: 0 }, keys: 'vlllcX<Esc>w.' },
  { id: 'visual-repeat-16', text: 'alpha beta gamma delta\none two three four five\naaaa bbbb cccc dddd\nx y z w v u\nlast line here ok', cursor: { row: 0, col: 0 }, keys: 'Vj>.' },
  { id: 'visual-repeat-count-1', text: 'alpha beta gamma delta', cursor: { row: 0, col: 0 }, keys: 'vll~w3.' },
  { id: 'visual-repeat-count-2', text: 'abcdefghijklmnop', cursor: { row: 0, col: 0 }, keys: 'vlld2.' },
  { id: 'visual-repeat-count-3', text: 'a\nb\nc\nd\ne\nf', cursor: { row: 0, col: 0 }, keys: 'Vj>3.' },
  { id: 'visual-repeat-count-4', text: 'a\nb\nc\nd\ne\nf\ng', cursor: { row: 0, col: 0 }, keys: 'Vjdj2.' },
  { id: 'visual-repeat-count-5', text: 'abcdef\nghijkl\nmnopqr\nstuvwx\nyzabcd', cursor: { row: 0, col: 0 }, keys: 'vjlUj2.' },
  { id: 'visual-repeat-count-6', text: 'abcdef\nghijkl\nmnopqr\nstuvwx\nyzabcd\nefghij', cursor: { row: 0, col: 0 }, keys: '<C-v>jlUjj3.' },
  { id: 'visual-repeat-count-7', text: 'alpha beta gamma delta', cursor: { row: 0, col: 0 }, keys: 'vllcX<Esc>w2.' },
  { id: 'visual-repeat-count-8', text: 'alpha beta gamma delta', cursor: { row: 0, col: 0 }, keys: 'vlrxw2.' },
  { id: 'visual-repeat-count-9', text: 'alpha beta gamma delta epsilon', cursor: { row: 0, col: 0 }, keys: 'vll~w3.w.' },
  { id: 'dot-count-1', text: 'a b c d e f g h', cursor: { row: 0, col: 0 }, keys: 'dw2.' },
  { id: 'dot-count-2', text: 'a b c d e f g h', cursor: { row: 0, col: 0 }, keys: 'dw2..' },
  { id: 'dot-count-3', text: 'a b c d e f g h', cursor: { row: 0, col: 0 }, keys: '3dw2.' },
  { id: 'dot-count-4', text: 'a b c d e f g h i j', cursor: { row: 0, col: 0 }, keys: 'd3w2.' },
  { id: 'dot-count-5', text: 'abcdefghij', cursor: { row: 0, col: 0 }, keys: 'xx3.' },
  { id: 'dot-count-6', text: 'abc', cursor: { row: 0, col: 0 }, keys: 'ix<Esc>3.' },
  { id: 'dot-count-7', text: '1\n2\n3\n4\n5', cursor: { row: 0, col: 0 }, keys: '\"add2.\"ap' },
  { id: 'dot-count-8', text: '1\n2\n3', cursor: { row: 0, col: 0 }, keys: 'dd10.' },
  { id: 'dot-count-9', text: 'aa bb cc dd ee', cursor: { row: 0, col: 0 }, keys: 'cwX<Esc>w2.' },
  { id: 'dot-count-10', text: 'a\nb\nc\nd\ne', cursor: { row: 0, col: 0 }, keys: '>>j3.' },
  { id: 'dot-register-1', text: '1\n2\n3\n4\n5', cursor: { row: 0, col: 0 }, keys: '\"add.\"ap' },
  { id: 'dot-register-2', text: 'aa bb cc', cursor: { row: 0, col: 0 }, keys: '\"acwX<Esc>w.\"ap' },
  { id: 'dot-register-3', text: '1\n2\n3\n4\n5', cursor: { row: 0, col: 0 }, keys: '\"qdd\"Qdd.\"qp' },
  { id: 'dot-register-4', text: '1\n2\n3\n4', cursor: { row: 0, col: 0 }, keys: 'yy\"_dd.p' },
  { id: 'count-register-1', text: '1\n2\n3\n4\n5', cursor: { row: 0, col: 0 }, keys: '2\"zdd\"zp' },
  { id: 'count-register-2', text: '1\n2\n3', cursor: { row: 0, col: 0 }, keys: '2\"zyy\"zP' },
  { id: 'count-register-3', text: 'ab cd', cursor: { row: 0, col: 0 }, keys: '\"xyw2\"xp' },
  { id: 'count-register-4', text: 'abcdef', cursor: { row: 0, col: 0 }, keys: '3\"_x' },
  { id: 'count-register-5', text: 'a b c d e f g', cursor: { row: 0, col: 0 }, keys: '2\"zdw.\"zp' },
  { id: 'count-register-6', text: '1\n2\n3\n4\n5\n6\n7\n8', cursor: { row: 0, col: 0 }, keys: '2\"y3dd\"yp' },
  { id: 'undo-insert-start-1', text: '  indented line one\n    deeper (nested) item', cursor: { row: 0, col: 0 }, keys: 'Axyz<BS><BS><Esc>Wu' },
  { id: 'undo-insert-start-2', text: 'The quick brown fox. It jumps over\nthe lazy dog!', cursor: { row: 0, col: 3 }, keys: 'Aend;<Esc>u' },
  { id: 'undo-insert-start-3', text: '  hello world\nnext', cursor: { row: 0, col: 7 }, keys: 'Inew<Esc>u' },
  { id: 'undo-insert-start-4', text: 'alpha beta gamma\nfoo bar', cursor: { row: 0, col: 8 }, keys: 'ccnew<Esc>u' },
  { id: 'undo-insert-start-5', text: 'alpha beta gamma\nfoo bar', cursor: { row: 0, col: 4 }, keys: 'anew<Esc>wu' },
  { id: 'undo-saved-cursor-1', text: 'a\n    deeper item\nc', cursor: { row: 1, col: 9 }, keys: ':t.<CR>u' },
  { id: 'undo-saved-cursor-2', text: 'one two three\nfour five', cursor: { row: 0, col: 4 }, keys: 'dwjjuu' },
  { id: 'ex-range-past-end-1', text: 'plain 0x1f 007 -3 words\nsecond', cursor: { row: 0, col: 0 }, keys: 'W:2,3d<CR>' },
  { id: 'ex-range-past-end-2', text: 'a\nb\nc', cursor: { row: 0, col: 0 }, keys: ':5d<CR>' },
  { id: 'ex-range-past-end-3', text: 'a\nb\nc', cursor: { row: 0, col: 0 }, keys: ':2,9<CR>' },
  { id: 'append-to-macro-register', text: 'aa bb\ncc dd\nee ff', cursor: { row: 0, col: 0 }, keys: 'qkdwjq\"Kyiw' },
  { id: 'dot-after-ex-or-failure-1', text: 'aaa\naaa', cursor: { row: 0, col: 0 }, keys: 'i<Esc>:s/a/X/<CR>j.' },
  { id: 'dot-after-ex-or-failure-2', text: '1\n2\n3', cursor: { row: 0, col: 0 }, keys: 'i<Esc>:d<CR>.' },
  { id: 'dot-after-ex-or-failure-3', text: 'abc\nz\ndef', cursor: { row: 0, col: 0 }, keys: 'xj:g/z/d<CR>.' },
  { id: 'dot-after-ex-or-failure-4', text: '1\n2', cursor: { row: 0, col: 0 }, keys: 'i<Esc>:norm Ia<CR>j.' },
  { id: 'dot-after-ex-or-failure-5', text: 'abc\ndef', cursor: { row: 0, col: 0 }, keys: 'i<Esc>:%norm I# <CR>.' },
  { id: 'dot-after-ex-or-failure-6', text: 'abc\nx 1', cursor: { row: 0, col: 0 }, keys: '4<C-a>j.' },
  { id: 'dot-after-ex-or-failure-7', text: 'abc\ndef', cursor: { row: 0, col: 0 }, keys: 'xgUi[j.' },
  { id: 'dot-after-ex-or-failure-8', text: 'abc\ndef', cursor: { row: 0, col: 0 }, keys: 'xca{j.' },
  { id: 'dot-after-ex-or-failure-9', text: '1\n2', cursor: { row: 0, col: 0 }, keys: 'i<Esc>:t.<CR>.' },
  { id: 'dot-after-ex-or-failure-10', text: 'one\ntwo\nthree\nxe', cursor: { row: 0, col: 0 }, keys: 'Vj>:v/e/d<CR>.' },
  { id: 'norm-undo-one-step', text: 'a\nb\nc', cursor: { row: 0, col: 0 }, keys: ':%norm Ix<CR>u' },
  { id: 'norm-while-recording', text: 'a\nb\nc', cursor: { row: 0, col: 0 }, keys: 'qm:norm Ix<CR>jq@m' },
  { id: 'sentence-buffer-start-1', text: '  indented line one\n    deeper item\n  back to one', cursor: { row: 0, col: 0 }, keys: 'G$(' },
  { id: 'sentence-buffer-start-2', text: '  abc. def\n  ghi.', cursor: { row: 0, col: 0 }, keys: 'G$((' },
  { id: 'sentence-buffer-start-3', text: '\n  abc', cursor: { row: 0, col: 0 }, keys: 'G$(' },
  { id: 'sentence-buffer-start-4', text: 'x.\n\n  abc def', cursor: { row: 0, col: 0 }, keys: 'jj$((' },
  { id: 'sentence-buffer-start-5', text: '    only line', cursor: { row: 0, col: 0 }, keys: '$(' },
  { id: 'sentence-buffer-start-6', text: '  abc. def\n  ghi.', cursor: { row: 0, col: 0 }, keys: '))' },
  { id: 'sentence-buffer-start-7', text: '  abc\n\n  def', cursor: { row: 0, col: 0 }, keys: ')' },
  { id: 'sentence-buffer-start-8', text: '  abc. def\n  ghi.', cursor: { row: 0, col: 0 }, keys: 'G$d(' },
  { id: 'sentence-buffer-start-9', text: '  abc. def\n  ghi.', cursor: { row: 0, col: 0 }, keys: 'y)' },
  { id: 'sentence-to-buffer-end-1', text: 'one. two\nthree', cursor: { row: 0, col: 0 }, keys: 'y)' },
  { id: 'sentence-to-buffer-end-2', text: 'a b\nc d', cursor: { row: 0, col: 0 }, keys: 'c)X<Esc>' },
  { id: 'sentence-to-buffer-end-3', text: 'x.\nlast one', cursor: { row: 0, col: 0 }, keys: 'jd)' },
  { id: 'sentence-to-buffer-end-4', text: 'a. b. c', cursor: { row: 0, col: 0 }, keys: 'wy2)' },
  { id: 'undo-backward-delete-1', text: 'abcdef\nxyz', cursor: { row: 0, col: 0 }, keys: 'llXu' },
  { id: 'undo-backward-delete-2', text: 'one two three', cursor: { row: 0, col: 0 }, keys: '$dbu' },
  { id: 'undo-backward-delete-3', text: '  one two', cursor: { row: 0, col: 0 }, keys: '$d0u' },
  { id: 'undo-backward-delete-4', text: 'banana split', cursor: { row: 0, col: 0 }, keys: '3ldFau' },
  { id: 'count-overflow-1', text: 'aa bb\ncc dd\nee ff', cursor: { row: 0, col: 0 }, keys: 'jj4>>' },
  { id: 'count-overflow-2', text: '  aa\n  cc\n  ee', cursor: { row: 0, col: 0 }, keys: 'jj4<<' },
  { id: 'count-overflow-3', text: 'aa bb\ncc dd\nee ff', cursor: { row: 0, col: 0 }, keys: 'jj4dd' },
  { id: 'count-overflow-4', text: 'aa bb\ncc dd\nee ff', cursor: { row: 0, col: 0 }, keys: 'jj4yy' },
  { id: 'count-overflow-5', text: 'aa bb\ncc dd\nee ff', cursor: { row: 0, col: 0 }, keys: 'jj4ccX<Esc>' },
  { id: 'count-overflow-6', text: 'aa bb\ncc dd\nee ff', cursor: { row: 0, col: 0 }, keys: 'jj4g~~' },
  { id: 'count-overflow-7', text: 'aa bb\ncc dd\nee ff', cursor: { row: 0, col: 0 }, keys: 'jj4gUU' },
  { id: 'count-overflow-8', text: 'AA\nBB\nCC', cursor: { row: 0, col: 0 }, keys: 'jj4guu' },
  { id: 'count-overflow-9', text: 'aa bb\ncc dd\nee ff', cursor: { row: 0, col: 0 }, keys: 'jj4==' },
  { id: 'count-overflow-10', text: 'aa bb\ncc dd\nee ff', cursor: { row: 0, col: 0 }, keys: 'jj4g??' },
  { id: 'count-overflow-11', text: 'aa bb\ncc dd\nee ff', cursor: { row: 0, col: 0 }, keys: 'jj4gqq' },
  { id: 'count-overflow-12', text: 'aa bb\ncc dd\nee ff', cursor: { row: 0, col: 0 }, keys: 'jj4J' },
  { id: 'count-overflow-13', text: 'aa bb\ncc dd\nee ff', cursor: { row: 0, col: 0 }, keys: 'jj4gcc' },
  { id: 'count-overflow-14', text: 'aa bb\ncc dd\nee ff', cursor: { row: 0, col: 0 }, keys: 'j4g_' },
  { id: 'count-overflow-15', text: 'aa bb\ncc dd\nee ff', cursor: { row: 0, col: 0 }, keys: 'jw4ge' },
  { id: 'count-overflow-16', text: 'aa bb\ncc dd\nee ff', cursor: { row: 0, col: 0 }, keys: 'w4ge' },
  { id: 'count-overflow-17', text: 'aa bb\ncc dd\nee ff', cursor: { row: 0, col: 0 }, keys: 'jl3-' },
  { id: 'count-overflow-18', text: 'aa bb\ncc dd\nee ff', cursor: { row: 0, col: 0 }, keys: 'j5+' },
  { id: 'count-overflow-19', text: '<a><b>x</b></a>', cursor: { row: 0, col: 0 }, keys: 'f>l4g~it' },
  { id: 'count-overflow-20', text: 'f(a, (x))', cursor: { row: 0, col: 0 }, keys: 'fxl2yib' },
  { id: 'count-overflow-21', text: 'f(a, (x))', cursor: { row: 0, col: 0 }, keys: 'fxl3dib' },
  { id: 'count-overflow-22', text: 'f(a, (x))', cursor: { row: 0, col: 0 }, keys: 'fx2di(' },
  { id: 'nested-pair-count-1', text: 'f(a, (x)) z', cursor: { row: 0, col: 0 }, keys: 'fxd2a(' },
  { id: 'nested-pair-count-2', text: '<a> <b>bb</b> </a>', cursor: { row: 0, col: 0 }, keys: 'fbc2itX<Esc>' },
  { id: 'nested-pair-count-3', text: 'x {\n  b { c }\n}', cursor: { row: 0, col: 0 }, keys: 'jfcy2a{' },
  { id: 'nested-pair-count-4', text: '[1, [2, x]]', cursor: { row: 0, col: 0 }, keys: 'fx2yi[' },
  { id: 'nested-pair-count-5', text: '[1, [2, x]]', cursor: { row: 0, col: 0 }, keys: 'fx3yi[' },
  { id: 'macro-unnamed-and-empty-word-1', text: 'x\nword\nz', cursor: { row: 0, col: 0 }, keys: 'j\"kyiwqkjq' },
  { id: 'macro-unnamed-and-empty-word-2', text: 'abc def', cursor: { row: 0, col: 0 }, keys: '\"kyiwqkxq' },
  { id: 'macro-unnamed-and-empty-word-3', text: 'a\n\nb', cursor: { row: 0, col: 0 }, keys: 'jdw' },
  { id: 'macro-unnamed-and-empty-word-4', text: 'a\n\nb', cursor: { row: 0, col: 0 }, keys: 'jyw' },
  { id: 'macro-unnamed-and-empty-word-5', text: 'a\n\nb', cursor: { row: 0, col: 0 }, keys: 'jcwX<Esc>' },
  { id: 'macro-unnamed-and-empty-word-6', text: 'a\n  \nb', cursor: { row: 0, col: 0 }, keys: 'jdw' },
  { id: 'macro-unnamed-and-empty-word-7', text: 'a\n\n', cursor: { row: 0, col: 0 }, keys: 'jjdw' },
  { id: 'dot-split-keys-1', text: 'Another Para\nx', cursor: { row: 0, col: 0 }, keys: 'i<Esc>guu.' },
  { id: 'dot-split-keys-2', text: 'abc\nRETURN X\nyy', cursor: { row: 0, col: 0 }, keys: 'i<Esc>2g~~j.' },
  { id: 'dot-split-keys-3', text: 'abc\n(\nDef\nghi', cursor: { row: 0, col: 0 }, keys: 'i<Esc>j4gUUk.' },
  { id: 'dot-split-keys-4', text: 'ABC DEF\nGHI', cursor: { row: 0, col: 0 }, keys: 'i<Esc>guiwj.' },
  { id: 'dot-split-keys-5', text: '1\n2\n3\n4\n5\n6\n7\n8\n9\n10\n11\n12\n13\n14\n15\n16\n17\n18\n19\n20\n21\n22\n23\n24\n25', cursor: { row: 0, col: 0 }, keys: 'i<Esc>12ddu.' },
];

const LUA = `
local cases = vim.json.decode(io.open(_G.arg[1]):read("*a"))
vim.cmd("set tabstop=2 shiftwidth=2 expandtab noautoindent nosmartindent nosmarttab nostartofline nrformats=bin,hex")
local out = {}
for _, c in ipairs(cases) do
  vim.cmd("enew!")
  vim.bo.undolevels = -1
  vim.api.nvim_buf_set_lines(0, 0, -1, false, vim.split(c.text, "\\n", { plain = true }))
  vim.bo.undolevels = 1000
  for _, r in ipairs({ '"', '0', '1', '-' }) do vim.fn.setreg(r, '') end
  vim.api.nvim_win_set_cursor(0, { c.cursor.row + 1, c.cursor.col })
  vim.api.nvim_feedkeys(vim.api.nvim_replace_termcodes(c.keys, true, false, true), "ntx", false)
  local cur = vim.api.nvim_win_get_cursor(0)
  local t = vim.fn.getregtype('"')
  table.insert(out, {
    id = c.id, text = c.text, cursor = c.cursor, keys = c.keys,
    expected = {
      lines = vim.api.nvim_buf_get_lines(0, 0, -1, false),
      cursor = { row = cur[1] - 1, col = cur[2] },
      reg = vim.fn.getreg('"'),
      regType = t == "V" and "line" or (t:sub(1, 1) == "\\22" and "block" or "char"),
      mode = vim.fn.mode(),
    },
  })
end
local f = io.open(_G.arg[2], "w"); f:write(vim.json.encode(out)); f:close()
os.exit(0)
`;

interface FixtureResult {
  id: string;
  text: string;
  cursor: { row: number; col: number };
  keys: string;
  expected: { lines: string[]; cursor: { row: number; col: number }; reg: string; regType: string; mode: string };
}

async function main(): Promise<void> {
  // 케이스마다 새 nvim 프로세스로 실행합니다 (이전 케이스의 레지스터·반복 상태가 새지 않게).
  const raw = await runNeovimIsolated<unknown, FixtureResult>(LUA, CASES);
  // Lua 의 JSON 키 순서는 프로세스마다 달라서, 파일이 매번 같게 나오도록 키 순서를 고정합니다.
  const results = raw.map((r) => ({
    id: r.id,
    text: r.text,
    cursor: { row: r.cursor.row, col: r.cursor.col },
    keys: r.keys,
    expected: {
      lines: r.expected.lines,
      cursor: { row: r.expected.cursor.row, col: r.expected.cursor.col },
      reg: r.expected.reg,
      regType: r.expected.regType,
      mode: r.expected.mode,
    },
  }));
  const target = path.resolve('test/fixtures/neovim-fuzz-findings.json');
  fs.writeFileSync(target, JSON.stringify(results, null, 2) + '\n');
  console.log(`[neovim-fuzz-fixtures] ${results.length} cases -> ${target}`);
}

void main();
