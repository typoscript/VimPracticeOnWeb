import { describe, it, expect } from 'vitest';
import {
  createVimState,
  handleKey,
  sendKeys,
  detectFunctions,
  detectClasses,
} from './index';

describe('Treesitter-style structural text objects (af/if, ac/ic, aa/ia) & function jumps (]f/[f/]F/[F)', () => {
  it('supports af / if on TypeScript functions, arrow functions, and class methods with d/c/y/v/gc/>', () => {
    const code = [
      'const header = 1;',
      'export function greet(name: string) {',
      '  const msg = "hi " + name;',
      '  return msg;',
      '}',
      'const footer = 2;',
    ];

    // daf deletes entire function linewise
    let s = createVimState(code, { line: 2, col: 4 });
    s = sendKeys(s, 'daf');
    expect(s.lines).toEqual(['const header = 1;', 'const footer = 2;']);
    expect(s.clipboard?.type).toBe('line');

    // Undo restores full function
    s = handleKey(s, 'u');
    expect(s.lines).toEqual(code);

    // dif deletes only body lines inside { ... }
    let sInner = createVimState(code, { line: 2, col: 4 });
    sInner = sendKeys(sInner, 'dif');
    expect(sInner.lines).toEqual([
      'const header = 1;',
      'export function greet(name: string) {',
      '}',
      'const footer = 2;',
    ]);

    // cif replaces function body (preserving indent) and enters INSERT
    let sChange = createVimState(code, { line: 3, col: 2 });
    sChange = sendKeys(sChange, 'cifreturn name;<Esc>');
    expect(sChange.lines).toEqual([
      'const header = 1;',
      'export function greet(name: string) {',
      '  return name;',
      '}',
      'const footer = 2;',
    ]);

    // gcaf comments entire function via findShiftRange + vaf
    let sComment = createVimState(code, { line: 2, col: 4 }, { primaryFilename: 'app.ts' });
    sComment = sendKeys(sComment, 'gcaf');
    expect(sComment.lines[1]).toBe('// export function greet(name: string) {');
    expect(sComment.lines[4]).toBe('// }');
    expect(sComment.lines[0]).toBe('const header = 1;');
  });

  it('supports nested functions with [count]af and Python indentation-based functions', () => {
    const nested = [
      'function outer() {',
      '  function inner() {',
      '    return 1;',
      '  }',
      '  return inner();',
      '}',
    ];

    // daf inside inner deletes only inner
    let s1 = createVimState(nested, { line: 2, col: 4 });
    s1 = sendKeys(s1, 'daf');
    expect(s1.lines).toEqual(['function outer() {', '  return inner();', '}']);

    // 2daf inside inner deletes enclosing outer function
    let s2 = createVimState(nested, { line: 2, col: 4 });
    s2 = sendKeys(s2, '2daf');
    expect(s2.lines).toEqual(['']);

    // Python def
    const py = [
      'def compute(x):',
      '    y = x * 2',
      '    return y',
      '',
      'print(compute(3))',
    ];
    let spy = createVimState(py, { line: 1, col: 4 });
    spy = sendKeys(spy, 'dif');
    expect(spy.lines).toEqual(['def compute(x):', '', 'print(compute(3))']);

    let spyAll = createVimState(py, { line: 1, col: 4 });
    spyAll = sendKeys(spyAll, 'daf');
    expect(spyAll.lines).toEqual(['', 'print(compute(3))']);
  });

  it('supports single-line arrow function body (cif / daf)', () => {
    const code = ['const double = (x: number) => x * 2;'];
    let s = createVimState(code, { line: 0, col: 30 });
    s = sendKeys(s, 'cifx * 3<Esc>');
    expect(s.lines).toEqual(['const double = (x: number) => x * 3;']);
  });

  it('supports ac / ic on classes, interfaces, and Python classes', () => {
    const code = [
      'export class UserService {',
      '  private count = 0;',
      '  inc() {',
      '    this.count++;',
      '  }',
      '}',
      'const after = true;',
    ];

    expect(detectClasses(code)).toHaveLength(1);

    let sInner = createVimState(code, { line: 3, col: 4 });
    sInner = sendKeys(sInner, 'dic');
    expect(sInner.lines).toEqual([
      'export class UserService {',
      '}',
      'const after = true;',
    ]);

    let sOuter = createVimState(code, { line: 3, col: 4 });
    sOuter = sendKeys(sOuter, 'dac');
    expect(sOuter.lines).toEqual(['const after = true;']);

    // Python class
    const pyClass = [
      'class Engine:',
      '    def run(self):',
      '        return 1',
      'x = Engine()',
    ];
    let sPy = createVimState(pyClass, { line: 2, col: 8 });
    sPy = sendKeys(sPy, 'dac');
    expect(sPy.lines).toEqual(['x = Engine()']);
  });

  it('supports aa / ia on single-line, multi-line, and nested call arguments without leaving dangling commas', () => {
    const line = ['call(alpha, nested(1, 2), "a, b", gamma);'];

    // First arg: daa removes trailing comma + space
    let s1 = createVimState(line, { line: 0, col: 6 });
    s1 = sendKeys(s1, 'daa');
    expect(s1.lines).toEqual(['call(nested(1, 2), "a, b", gamma);']);

    // Middle nested arg: cia replaces only nested(1, 2) preserving commas
    let s2 = createVimState(line, { line: 0, col: 13 });
    s2 = sendKeys(s2, 'cia42<Esc>');
    expect(s2.lines).toEqual(['call(alpha, 42, "a, b", gamma);']);

    // String with comma inside: ia keeps whole string arg intact
    let s3 = createVimState(line, { line: 0, col: 28 });
    s3 = sendKeys(s3, 'cia"ok"<Esc>');
    expect(s3.lines).toEqual(['call(alpha, nested(1, 2), "ok", gamma);']);

    // Last arg: daa removes preceding comma (no dangling comma!)
    let s4 = createVimState(line, { line: 0, col: 35 });
    s4 = sendKeys(s4, 'daa');
    expect(s4.lines).toEqual(['call(alpha, nested(1, 2), "a, b");']);

    // Single arg: daa removes only the arg
    let sSingle = createVimState(['fn(onlyOne)'], { line: 0, col: 5 });
    sSingle = sendKeys(sSingle, 'daa');
    expect(sSingle.lines).toEqual(['fn()']);

    // Multi-line argument list
    const multi = [
      'createUser(',
      '  firstArg,',
      '  secondArg,',
      '  thirdArg',
      ');',
    ];
    let sm1 = createVimState(multi, { line: 1, col: 3 });
    sm1 = sendKeys(sm1, 'daa');
    expect(sm1.lines).toEqual(['createUser(', '  secondArg,', '  thirdArg', ');']);

    let smLast = createVimState(multi, { line: 3, col: 3 });
    smLast = sendKeys(smLast, 'daa');
    expect(smLast.lines).toEqual(['createUser(', '  firstArg,', '  secondArg', ');']);

    // Dot repeat on daa + gUia uppercase argument
    let sCase = createVimState(['foo(hello, world)'], { line: 0, col: 5 });
    sCase = sendKeys(sCase, 'gUia');
    expect(sCase.lines).toEqual(['foo(HELLO, world)']);
  });

  it('supports ]f / [f / ]F / [F function navigation in NORMAL, VISUAL, and operator-pending modes', () => {
    const code = [
      '// top',
      'function first() {',
      '  return 1;',
      '}',
      '',
      'function second() {',
      '  return 2;',
      '}',
      '',
      'export const third = () => {',
      '  return 3;',
      '};',
    ];

    expect(detectFunctions(code)).toHaveLength(3);

    let s = createVimState(code, { line: 0, col: 0 });
    // ]f -> line 1 (first)
    s = sendKeys(s, ']f');
    expect(s.cursor).toEqual({ line: 1, col: 0 });

    // 2]f -> line 9 (third)
    s = sendKeys(s, '2]f');
    expect(s.cursor).toEqual({ line: 9, col: 0 });

    // [f -> line 5 (second)
    s = sendKeys(s, '[f');
    expect(s.cursor).toEqual({ line: 5, col: 0 });

    // ]F -> line 7 (end of second)
    s = sendKeys(s, ']F');
    expect(s.cursor).toEqual({ line: 7, col: 0 });

    // [F -> line 3 (end of first)
    s = sendKeys(s, '[F');
    expect(s.cursor).toEqual({ line: 3, col: 0 });

    // Bell when no further function exists
    let atEnd = createVimState(code, { line: 11, col: 0 });
    atEnd = sendKeys(atEnd, ']f');
    expect(atEnd.bell).toBe(true);

    // Operator-pending d]f from line 1 deletes up to line 5 (exclusive)
    let opState = createVimState(code, { line: 1, col: 0 });
    opState = sendKeys(opState, 'd]f');
    expect(opState.lines).toContain('function second() {');
    expect(opState.lines).not.toContain('function first() {');

    // Visual v]f extends selection to next function start
    let vis = createVimState(code, { line: 1, col: 0 });
    vis = sendKeys(vis, 'v]f');
    expect(vis.mode).toBe('VISUAL');
    expect(vis.cursor).toEqual({ line: 5, col: 0 });
  });
});
